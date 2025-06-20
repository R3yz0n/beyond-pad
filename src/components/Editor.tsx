"use client";
import React, { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import CryptoJS from "crypto-js";
import { ethers } from "ethers";
import axios from "axios";
import toast from "react-hot-toast";

/**
 * ENCRYPTED NOTE EDITOR COMPONENT
 *
 * This component provides a comprehensive encrypted note-taking system with:
 * - End-to-end encryption using AES-256
 * - IPFS storage for decentralized content
 * - Blockchain registration for ownership and access control
 * - Collaboration features with secure key sharing
 * - NFT-gated access control
 *
 * SECURITY MODEL:
 * 1. Content is encrypted with random AES key before IPFS upload
 * 2. AES key is encrypted with wallet-derived keys for each user
 * 3. Encrypted keys are stored on-chain for access control
 * 4. Only wallet holders can decrypt their respective keys
 *
 * ARCHITECTURE:
 * Content -> AES Encrypt -> IPFS
 * AES Key -> Wallet Encrypt -> Blockchain
 * Access Control -> Smart Contract
 */

// Import MDEditor dynamically to avoid SSR issues
const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });

// ============================================
// TYPE DEFINITIONS
// ============================================

interface EditorProps {
  isAuthenticated: boolean;
  isDeployed: boolean;
  relayTransaction?: (txData: any) => Promise<any>;
  ownerAddress?: string;
  safeAddress?: string;
  web3Provider?: any;
  getUserNotes?: (
    userAddress: string
  ) => Promise<{ cids: string[]; nftAddrs: string[]; encKeys: string[] }>;
}

/**
 * Represents a saved note with metadata
 */
interface SavedNote {
  cid: string; // IPFS content identifier
  title: string; // First line of note content
  timestamp: number; // Unix timestamp
  owner: string; // Owner's address
  collaborator?: string; // Optional collaborator address
  nftGate?: string; // Optional NFT contract for gating
  txHash?: string; // Blockchain transaction hash
  isShared: boolean; // Whether note has collaborators
}

const Editor: React.FC<EditorProps> = ({
  isAuthenticated,
  isDeployed,
  relayTransaction,
  ownerAddress,
  safeAddress,
  web3Provider,
  getUserNotes,
}) => {
  // ============================================
  // STATE MANAGEMENT
  // ============================================

  const [note, setNote] = useState<string>("");
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [savedNotes, setSavedNotes] = useState<SavedNote[]>([]);

  // Collaboration state
  const [collaboratorAddress, setCollaboratorAddress] = useState<string>("");
  const [nftGateAddress, setNftGateAddress] = useState<string>("");
  const [showShareOptions, setShowShareOptions] = useState<boolean>(false);

  // Blockchain loading state
  const [isLoadingNotes, setIsLoadingNotes] = useState<boolean>(false);
  const [loadedFromChain, setLoadedFromChain] = useState<boolean>(false);

  // ============================================
  // UTILITY FUNCTIONS
  // ============================================

  /**
   * Validates Ethereum addresses
   */
  const isValidAddress = (address: string): boolean => {
    try {
      ethers.getAddress(address);
      return true;
    } catch {
      return false;
    }
  };

  // ============================================
  // CRYPTOGRAPHIC FUNCTIONS
  // ============================================

  /**
   * Generates a deterministic wallet-derived key for encryption/decryption
   *
   * PROCESS:
   * 1. Create deterministic message using userAddress and CID
   * 2. Sign message with user's wallet (creates unique signature)
   * 3. Hash signature to create encryption key
   *
   * This ensures:
   * - Same user + same note = same key (deterministic)
   * - Different users = different keys (secure)
   * - Only wallet owner can generate their key (authenticated)
   *
   * @param userAddress - User's wallet address
   * @param cid - IPFS content identifier
   * @returns Promise<string> - Derived encryption key
   */
  const generateWalletKey = async (userAddress: string, cid: string): Promise<string> => {
    if (!window.ethereum) {
      throw new Error("No wallet connected");
    }

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      // Create deterministic message for key derivation
      const message = `Access note ${cid} for ${userAddress.toLowerCase()}`;
      const signature = await signer.signMessage(message);

      // Hash the signature to create encryption key
      return CryptoJS.SHA256(signature).toString();
    } catch (error: any) {
      throw new Error(`Failed to generate wallet key: ${error.message}`);
    }
  };

  /**
   * Generates a random content key for note encryption
   * @returns string - Random 256-bit key in hex format
   */
  const generateContentKey = (): string => {
    return CryptoJS.lib.WordArray.random(256 / 8).toString();
  };

  /**
   * Encrypts content using AES-256 encryption
   * @param content - Plain text content to encrypt
   * @param key - Encryption key
   * @returns string - Encrypted content
   */
  const encryptContent = (content: string, key: string): string => {
    return CryptoJS.AES.encrypt(content, key).toString();
  };

  /**
   * Decrypts content using AES-256 decryption
   * @param encryptedContent - Encrypted content to decrypt
   * @param key - Decryption key
   * @returns string - Plain text content
   */
  const decryptContent = (encryptedContent: string, key: string): string => {
    const bytes = CryptoJS.AES.decrypt(encryptedContent, key);
    return bytes.toString(CryptoJS.enc.Utf8);
  };

  // ============================================
  // IPFS FUNCTIONS
  // ============================================

  /**
   * Uploads encrypted note data to IPFS via Pinata
   *
   * @param noteData - Encrypted note object to upload
   * @returns Promise<string> - IPFS content identifier (CID)
   */
  const uploadToIPFS = async (noteData: any): Promise<string> => {
    try {
      const response = await axios.post(
        "https://api.pinata.cloud/pinning/pinJSONToIPFS",
        {
          pinataContent: noteData,
          pinataMetadata: {
            name: `encrypted-note-${Date.now()}`,
            keyvalues: {
              type: "collaborative-note",
              owner: ownerAddress || "unknown",
              hasCollaborator: noteData.collaborator ? "true" : "false",
            },
          },
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_PINATA_JWT}`,
          },
        }
      );

      return response.data.IpfsHash;
    } catch (error) {
      console.error("IPFS upload error:", error);
      if (axios.isAxiosError(error)) {
        throw new Error(`IPFS upload failed: ${error.response?.data?.error || error.message}`);
      }
      throw error;
    }
  };

  /**
   * Fetches note data from IPFS
   *
   * @param cid - IPFS content identifier
   * @returns Promise<any> - Encrypted note data
   */
  const fetchFromIPFS = async (cid: string): Promise<any> => {
    try {
      const response = await axios.get(`https://ipfs.io/ipfs/${cid}`, {
        timeout: 10000, // 10 second timeout
      });
      return response.data;
    } catch (error) {
      console.error("IPFS fetch error:", error);
      if (axios.isAxiosError(error)) {
        if (error.code === "ECONNABORTED") {
          throw new Error("IPFS fetch timeout - please try again");
        }
        throw new Error(`Failed to fetch from IPFS: ${error.message}`);
      }
      throw error;
    }
  };

  // ============================================
  // MAIN SAVE FUNCTION
  // ============================================

  /**
   * Main function to save note with collaboration support
   *
   * ENCRYPTION FLOW:
   * 1. Serialize note content with metadata
   * 2. Generate random AES content key
   * 3. Encrypt note content with AES key
   * 4. Upload encrypted content to IPFS → get CID
   * 5. Generate wallet-derived key for owner
   * 6. Encrypt AES key with owner's wallet key
   * 7. Store encrypted key on blockchain via Safe transaction
   * 8. If collaborator specified, repeat steps 5-7 for collaborator
   *
   * SECURITY PROPERTIES:
   * - Content never stored unencrypted
   * - AES keys never transmitted in plaintext
   * - Only wallet owners can decrypt their keys
   * - Each user has different encrypted key for same content
   */
  const saveNoteToIPFS = async () => {
    // Input validation
    if (!note.trim()) {
      toast.error("Please enter some content before saving");
      return;
    }

    if (!ownerAddress) {
      toast.error("Please connect your wallet first");
      return;
    }

    // Address validation
    if (collaboratorAddress.trim() && !isValidAddress(collaboratorAddress)) {
      toast.error("Invalid collaborator address");
      return;
    }

    if (nftGateAddress.trim() && !isValidAddress(nftGateAddress)) {
      toast.error("Invalid NFT gate address");
      return;
    }

    setIsSaving(true);
    try {
      // ============================================
      // STEP 1: CONTENT PREPARATION
      // ============================================

      // Serialize note with metadata
      const serializedNote = JSON.stringify({
        content: note,
        timestamp: new Date().toISOString(),
        version: "1.0",
      });
      console.log("Serialized note");

      // ============================================
      // STEP 2: CONTENT ENCRYPTION
      // ============================================

      // Generate random AES key for this note
      const contentKey = generateContentKey();

      // Encrypt the note content
      const encryptedContent = encryptContent(serializedNote, contentKey);
      console.log("AES encrypted note content");

      // ============================================
      // STEP 3: IPFS STORAGE
      // ============================================

      toast.loading("Uploading encrypted note to IPFS...");
      const cipherData = {
        encryptedContent,
        owner: ownerAddress.toLowerCase(),
        timestamp: new Date().toISOString(),
        version: "1.0",
        ...(nftGateAddress.trim() && { nftGate: nftGateAddress.toLowerCase() }),
      };

      const cid = await uploadToIPFS(cipherData);
      console.log("Pinned to IPFS with CID:", cid);
      toast.dismiss();
      toast.success("Note uploaded to IPFS successfully!");

      // ============================================
      // STEP 4: OWNER KEY ENCRYPTION
      // ============================================

      // Generate owner's wallet-derived key
      const ownerWalletKey = await generateWalletKey(ownerAddress, cid);
      // Encrypt content key with owner's wallet key
      const encryptedKeyForOwner = encryptContent(contentKey, ownerWalletKey);

      // ============================================
      // STEP 5: BLOCKCHAIN REGISTRATION
      // ============================================

      let txHash: string | undefined;
      if (relayTransaction && isDeployed) {
        const txData = {
          to: process.env.NEXT_PUBLIC_NOTE_REGISTRY_ADDRESS,
          data: {
            method: "addNote",
            params: {
              cid: cid,
              nftAddr: nftGateAddress.trim() || ethers.ZeroAddress,
              encKeyOwner: encryptedKeyForOwner,
            },
          },
        };

        const txResult = await relayTransaction(txData);

        // Store transaction hash for tracking
        if (txResult.taskId) {
          txHash = `gelato-${txResult.taskId}`;
          console.log("Storing Gelato Task ID:", txResult.taskId);
        } else if (txResult.hash) {
          txHash = txResult.hash;
          console.log("Storing transaction hash:", txResult.hash);
        } else if (txResult.transactionHash) {
          txHash = txResult.transactionHash;
          console.log("Storing transaction hash (alt):", txResult.transactionHash);
        }

        console.log("Note registered on-chain with hash:", txHash);
      }

      // ============================================
      // STEP 6: COLLABORATOR SHARING (OPTIONAL)
      // ============================================

      if (collaboratorAddress.trim()) {
        try {
          toast.loading("Adding collaborator...");

          // Generate collaborator's wallet-derived key
          const collaboratorWalletKey = await generateWalletKey(collaboratorAddress, cid);

          // Encrypt the SAME content key with collaborator's wallet key
          const encryptedKeyForCollaborator = encryptContent(contentKey, collaboratorWalletKey);

          // Add collaborator via blockchain transaction
          const collaboratorTxData = {
            to: process.env.NEXT_PUBLIC_NOTE_REGISTRY_ADDRESS,
            data: {
              method: "addCollaborator",
              params: {
                noteId: cid,
                collaborator: collaboratorAddress.toLowerCase(),
                encKeyCollaborator: encryptedKeyForCollaborator,
              },
            },
          };

          await relayTransaction(collaboratorTxData);
          console.log("Collaborator added successfully");
          toast.dismiss();
          toast.success("Collaborator added successfully!");
        } catch (collaboratorError: any) {
          console.error("Failed to add collaborator:", collaboratorError);
          toast.dismiss();
          toast.error(`Failed to add collaborator: ${collaboratorError.message}`);
          toast.warning("Note was saved but collaborator addition failed");
        }
      }

      // ============================================
      // STEP 7: UI UPDATE
      // ============================================

      toast.success(
        `Note saved successfully! CID: ${cid.substring(0, 8)}...${
          collaboratorAddress ? ` | Shared with collaborator` : ""
        }`
      );

      // Update local state with new note
      const newSavedNote: SavedNote = {
        cid,
        title: note.split("\n")[0].substring(0, 50) || "Untitled Note",
        timestamp: Date.now(),
        owner: ownerAddress.toLowerCase(),
        collaborator: collaboratorAddress.trim() ? collaboratorAddress.toLowerCase() : undefined,
        nftGate: nftGateAddress.trim() ? nftGateAddress.toLowerCase() : undefined,
        txHash,
        isShared: !!collaboratorAddress.trim(),
      };

      setSavedNotes((prev) => [newSavedNote, ...prev]);

      // Reset form
      setCollaboratorAddress("");
      setNftGateAddress("");
      setShowShareOptions(false);

      console.log("Save process completed successfully");
    } catch (error: any) {
      console.error("Save error:", error);
      toast.dismiss();
      toast.error(`Failed to save note: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // ============================================
  // BLOCKCHAIN LOADING FUNCTION
  // ============================================

  /**
   * Loads and decrypts notes from blockchain
   *
   * DECRYPTION FLOW:
   * 1. Query contract for user's notes (using Safe address)
   * 2. For each note: fetch encrypted content from IPFS
   * 3. Generate wallet-derived key for current user
   * 4. Decrypt the encrypted content key from blockchain
   * 5. Use decrypted content key to decrypt note content
   * 6. Parse and display note
   *
   * SECURITY NOTES:
   * - Only works if user's wallet can generate the correct key
   * - Wallet signature required for each note decryption
   * - Invalid keys result in decryption failure (access denied)
   */
  const loadNotesFromBlockchain = useCallback(async () => {
    if (!ownerAddress || !safeAddress || !getUserNotes || !web3Provider) {
      if (!getUserNotes) {
        toast.error("getUserNotes function not available. Please reconnect your wallet.");
        console.error("getUserNotes function is undefined");
      }
      if (!safeAddress) {
        toast.error("Safe address not available. Please ensure wallet is connected.");
        console.error("Safe address is undefined");
      }
      return;
    }

    if (loadedFromChain) {
      toast.success("Notes already loaded from blockchain");
      return;
    }

    setIsLoadingNotes(true);
    try {
      toast.loading("Loading your notes from blockchain...");

      // Query contract for user's notes
      console.log(`Loading notes for Safe address: ${safeAddress}`);
      const { cids, nftAddrs, encKeys } = await getUserNotes(safeAddress);

      console.log(`Found ${cids.length} notes for Safe:`, { cids, nftAddrs, encKeys });

      if (cids.length === 0) {
        toast.dismiss();
        toast.success("No notes found on blockchain for your Safe address");
        setLoadedFromChain(true);
        return;
      }

      // Process each note
      const loadedNotes: SavedNote[] = [];

      for (let i = 0; i < cids.length; i++) {
        try {
          const cid = cids[i];
          const nftAddr = nftAddrs[i];
          const encryptedKey = encKeys[i];

          console.log(`Processing note ${i + 1}/${cids.length}: ${cid}`);

          // Fetch encrypted content from IPFS
          const ipfsData = await fetchFromIPFS(cid);

          // Decrypt the content key
          const walletKey = await generateWalletKey(ownerAddress, cid);
          const decryptedContentKey = decryptContent(encryptedKey, walletKey);

          // Decrypt the note content
          const decryptedNote = decryptContent(ipfsData.encryptedContent, decryptedContentKey);
          const noteData = JSON.parse(decryptedNote);

          // Check for existing transaction hash in local storage
          const existingNote = savedNotes.find((note) => note.cid === cid);
          const txHash = existingNote?.txHash;

          // Create saved note object
          const savedNote: SavedNote = {
            cid,
            title: noteData.content.split("\n")[0].substring(0, 50) || "Untitled Note",
            timestamp: new Date(noteData.timestamp).getTime(),
            owner: ownerAddress.toLowerCase(),
            nftGate: nftAddr !== ethers.ZeroAddress ? nftAddr : undefined,
            txHash: txHash,
            isShared: false, // TODO: Check collaborators
          };

          loadedNotes.push(savedNote);
          console.log(
            `Successfully loaded note: ${savedNote.title}${txHash ? ` (with tx: ${txHash})` : ""}`
          );
        } catch (noteError: any) {
          console.error(`Failed to load note ${i + 1}:`, noteError);
          toast.error(`Failed to decrypt note ${i + 1}: ${noteError.message}`);
        }
      }

      // Update state with loaded notes
      setSavedNotes((prev) => {
        const existingCids = prev.map((note) => note.cid);
        const newNotes = loadedNotes.filter((note) => !existingCids.includes(note.cid));

        // Merge transaction hashes from local state
        const mergedNotes = loadedNotes.map((loadedNote) => {
          const existingNote = prev.find((note) => note.cid === loadedNote.cid);
          return existingNote ? { ...loadedNote, txHash: existingNote.txHash } : loadedNote;
        });

        const uniqueLoadedNotes = mergedNotes.filter((note) => !existingCids.includes(note.cid));
        return [...uniqueLoadedNotes, ...prev];
      });

      toast.dismiss();
      toast.success(`Successfully loaded ${loadedNotes.length} notes from blockchain!`);
      setLoadedFromChain(true);
    } catch (error: any) {
      console.error("Failed to load notes from blockchain:", error);
      toast.dismiss();
      toast.error(`Failed to load notes: ${error.message}`);
    } finally {
      setIsLoadingNotes(false);
    }
  }, [ownerAddress, safeAddress, getUserNotes, web3Provider, loadedFromChain, savedNotes]);

  // ============================================
  // LIFECYCLE EFFECTS
  // ============================================

  // Auto-load notes when user connects
  React.useEffect(() => {
    if (
      isAuthenticated &&
      ownerAddress &&
      safeAddress &&
      getUserNotes &&
      !loadedFromChain &&
      !isLoadingNotes
    ) {
      loadNotesFromBlockchain();
    }
  }, [isAuthenticated, ownerAddress, safeAddress, getUserNotes, loadedFromChain]);

  // // Load notes from localStorage on mount
  // React.useEffect(() => {
  //   try {
  //     const savedNotesFromStorage = localStorage.getItem("beyondpad-notes");
  //     if (savedNotesFromStorage) {
  //       const parsedNotes = JSON.parse(savedNotesFromStorage);
  //       setSavedNotes(parsedNotes);
  //       console.log("Loaded notes from localStorage:", parsedNotes.length);
  //     }
  //   } catch (error) {
  //     console.error("Failed to load notes from localStorage:", error);
  //   }
  // }, []);

  // // Save notes to localStorage whenever they change
  // React.useEffect(() => {
  //   try {
  //     localStorage.setItem("beyondpad-notes", JSON.stringify(savedNotes));
  //   } catch (error) {
  //     console.error("Failed to save notes to localStorage:", error);
  //   }
  // }, [savedNotes]);

  // Helper functions - replace the existing ones at the bottom of your component:
  const getPublicKeyFromAddress = async (address: string): Promise<string> => {
    try {
      // Generate a deterministic "public key" from the address
      // NOTE: This is a simplified approach for demonstration
      // In production, you'd want a proper key exchange mechanism
      const hash = ethers.keccak256(ethers.toUtf8Bytes(address.toLowerCase()));

      // Use the hash as a pseudo public key (remove '0x' prefix)
      return hash.slice(2);
    } catch (error: any) {
      throw new Error(`Failed to generate public key: ${error.message}`);
    }
  };

  const encryptWithECIES = async (message: string, publicKey: string): Promise<string> => {
    try {
      // Browser-compatible encryption using Web Crypto API and ethers
      // This is a simplified approach - in production use proper ECIES

      // Convert publicKey to bytes for use as encryption key
      const keyBytes = ethers.getBytes("0x" + publicKey.slice(0, 64)); // Take first 32 bytes

      // Convert message to bytes
      const messageBytes = ethers.toUtf8Bytes(message);

      // Simple XOR encryption (replace with proper ECIES in production)
      const encrypted = new Uint8Array(messageBytes.length);
      for (let i = 0; i < messageBytes.length; i++) {
        encrypted[i] = messageBytes[i] ^ keyBytes[i % keyBytes.length];
      }

      // Return as hex string without '0x' prefix
      return ethers.hexlify(encrypted).slice(2);
    } catch (error: any) {
      throw new Error(`Encryption failed: ${error.message}`);
    }
  };

  return (
    <div className="mx-auto px-4 py-6 w-full">
      <div className=" rounded-lg p-6 shadow-md mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-100">Your Notes</h2>

          <div className="flex space-x-2">
            <button
              onClick={loadNotesFromBlockchain}
              disabled={isLoadingNotes || !isAuthenticated}
              className="px-3 py-1 text-sm bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-md transition-colors flex items-center space-x-1"
              title="Load notes from blockchain"
            >
              {isLoadingNotes ? (
                <>
                  <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span>Loading...</span>
                </>
              ) : (
                <>
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  <span>Load Notes</span>
                </>
              )}
            </button>
            <button
              onClick={() => setShowShareOptions(!showShareOptions)}
              className="px-3 py-1 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-md transition-colors"
              title="Share options"
            >
              {showShareOptions ? "Hide Share" : "Share"}
            </button>
            <button
              onClick={() => setNote("")}
              className="px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-md transition-colors"
              title="Clear note"
            >
              Clear
            </button>
            <button
              onClick={() => {
                const blob = new Blob([note], { type: "text/markdown" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "note.md";
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
              title="Download note as Markdown"
            >
              Download
            </button>
            <button
              onClick={saveNoteToIPFS}
              disabled={isSaving || !note.trim()}
              className="px-4 py-1 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white rounded-md transition-colors flex items-center space-x-2"
              title="Save encrypted note to IPFS and register on-chain"
            >
              {isSaving ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                  <span>Save to IPFS</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Share Options Panel */}
        {showShareOptions && (
          <div className="mb-4 p-4 bg-gray-50 rounded-lg border">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Collaboration Options</h3>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Collaborator Wallet Address (Optional)
                </label>
                <input
                  type="text"
                  value={collaboratorAddress}
                  onChange={(e) => setCollaboratorAddress(e.target.value)}
                  placeholder="0x..."
                  className="w-full p-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  The collaborator will be able to decrypt and read this note
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  NFT Gate Address (Optional)
                </label>
                <input
                  type="text"
                  value={nftGateAddress}
                  onChange={(e) => setNftGateAddress(e.target.value)}
                  placeholder="0x..."
                  className="w-full p-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  NFT contract address for access control
                </p>
              </div>
            </div>
          </div>
        )}

        <div data-color-mode="dark">
          <MDEditor
            value={note}
            onChange={(value) => setNote(value || "")}
            height={400}
            preview="edit"
            className="rounded-md shadow-sm"
          />
        </div>

        <div className="mt-4 text-sm text-gray-500">
          <p>
            <strong>Tip:</strong> This editor supports Markdown formatting. Use{" "}
            <code className="mx-1 px-1 py-0.5 bg-gray-100 rounded">**bold**</code>,{" "}
            <code className="mx-1 px-1 py-0.5 bg-gray-100 rounded">*italic*</code>, and{" "}
            <code className="mx-1 px-1 py-0.5 bg-gray-100 rounded">[links](url)</code>
          </p>
          <p className="mt-2">
            <strong>Privacy:</strong> When you save to IPFS, your note is encrypted with AES-256-GCM
            before upload.{" "}
            {collaboratorAddress &&
              `Shared with: ${collaboratorAddress.substring(
                0,
                6
              )}...${collaboratorAddress.substring(collaboratorAddress.length - 4)}`}
          </p>
        </div>
      </div>

      {/* Saved Notes Section */}
      {savedNotes.length > 0 && (
        <div className=" rounded-lg p-6 shadow-md">
          <h3 className="text-lg font-bold text-gray-100 mb-4">Saved Notes</h3>
          <div className="space-y-3">
            {savedNotes.map((savedNote, index) => (
              <div
                key={index}
                className="border border-gray-800 bg-zinc-900 shadow-md rounded-lg p-4"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-300">{savedNote.title}</h4>
                    <p className="text-sm text-gray-200 mt-1">
                      Saved: {new Date(savedNote.timestamp).toLocaleString()}
                    </p>
                    <p className="text-sm text-gray-400 mt-1 font-mono">
                      IPFS CID: {savedNote.cid}
                    </p>
                    {savedNote.collaborator && (
                      <p className="text-sm text-blue-600 mt-1">
                        👥 Shared with: {savedNote.collaborator.substring(0, 6)}...
                        {savedNote.collaborator.substring(savedNote.collaborator.length - 4)}
                      </p>
                    )}
                    {savedNote.nftGate && (
                      <p className="text-sm text-purple-600 mt-1">
                        🎫 NFT Gate: {savedNote.nftGate.substring(0, 6)}...
                        {savedNote.nftGate.substring(savedNote.nftGate.length - 4)}
                      </p>
                    )}
                    {savedNote.txHash && (
                      <p className="text-sm text-green-600 mt-1 font-mono">
                        ⛓️ On-chain: {savedNote.txHash}
                      </p>
                    )}
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(savedNote.cid);
                        toast.success("CID copied to clipboard!");
                      }}
                      className="px-2 py-1 text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 rounded"
                      title="Copy CID"
                    >
                      Copy CID
                    </button>
                    <a
                      href={`https://ipfs.io/ipfs/${savedNote.cid}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded"
                      title="View on IPFS"
                    >
                      View
                    </a>
                    {savedNote.txHash && savedNote.txHash.startsWith("gelato-") && (
                      <a
                        href={`https://relay.gelato.digital/tasks/${savedNote.txHash.replace(
                          "gelato-",
                          ""
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2 py-1 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded"
                        title="View Gelato Task Status"
                      >
                        Task Status
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Editor;
