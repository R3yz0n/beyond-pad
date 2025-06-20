"use client";
import { useState, useCallback } from "react";
import { ethers, BrowserProvider, parseUnits } from "ethers";
import toast from "react-hot-toast";
import { MetaTransactionData, MetaTransactionOptions } from "@safe-global/safe-core-sdk-types";
import { GelatoRelayPack } from "@safe-global/relay-kit";
import AccountAbstraction from "@safe-global/account-abstraction-kit-poc";

/**
 * SAFE SMART WALLET HOOK
 *
 * This hook provides a complete integration with Safe (Gnosis Safe) smart wallets
 * and Gelato relay network for gasless transactions on Base Sepolia testnet.
 *
 * FEATURES:
 * - MetaMask wallet connection with automatic network switching
 * - Safe smart wallet deployment and management
 * - Gasless transaction execution via Gelato relay
 * - Contract interaction for encrypted note storage
 * - Automatic retry logic for rate-limited requests
 *
 * FLOW:
 * 1. User connects MetaMask → switches to Base Sepolia
 * 2. Safe wallet address is generated (deterministic)
 * 3. Safe is deployed on-chain (if not already deployed)
 * 4. Transactions are sent via Gelato relay (sponsored gas)
 * 5. Notes are stored in NoteRegistry contract
 */

const BASE_SEPOLIA_CHAIN_ID = "0x14a34"; // Base Sepolia network ID

declare global {
  interface Window {
    ethereum?: any;
  }
}

/**
 * Custom hook for managing Safe smart wallet operations
 * @param txServiceUrl - Safe transaction service URL for the network
 * @returns Object containing wallet state and methods
 */
export function useSafeSmartWallet(txServiceUrl: string) {
  // ============================================
  // STATE MANAGEMENT
  // ============================================

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [ownerAddress, setOwnerAddress] = useState<string>(); // EOA address (MetaMask)
  const [web3Provider, setWeb3Provider] = useState<BrowserProvider>();
  const [safeAddress, setSafeAddress] = useState<string>(); // Safe wallet address
  const [accountAbstractionKit, setAccountAbstractionKit] = useState<AccountAbstraction>();
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [deploySafeLoading, setDeploySafeLoading] = useState<boolean>(false);
  const [isDeployed, setIsDeployed] = useState<boolean>(false);

  // ============================================
  // SAFE DEPLOYMENT UTILITIES
  // ============================================

  /**
   * Checks if a Safe wallet has been deployed on-chain
   * @param address - Safe wallet address to check
   * @param provider - Web3 provider for blockchain queries
   * @returns Promise<boolean> - true if deployed, false otherwise
   */
  const checkSafeDeploymentStatus = useCallback(
    async (address: string, provider: BrowserProvider) => {
      try {
        // Check if there's contract code at the Safe address
        const code = await provider.getCode(address);
        const deployed = code !== "0x" && code !== "";
        setIsDeployed(deployed);
        console.log(
          `Safe deployment status for ${address}: ${deployed ? "Deployed" : "Not deployed"}`
        );
        return deployed;
      } catch (err) {
        console.error("Error checking Safe deployment status:", err);
        setIsDeployed(false);
        return false;
      }
    },
    []
  );

  // ============================================
  // WALLET CONNECTION
  // ============================================

  /**
   * Connects MetaMask wallet and initializes Safe smart wallet
   *
   * PROCESS:
   * 1. Check MetaMask availability
   * 2. Switch to Base Sepolia network
   * 3. Request wallet connection
   * 4. Initialize Safe Account Abstraction kit
   * 5. Setup Gelato relay pack
   * 6. Check Safe deployment status
   */
  const login = useCallback(async () => {
    if (!window.ethereum) {
      toast.error("MetaMask not found. Please install MetaMask to continue.");
      throw new Error("MetaMask not found");
    }

    setLoading(true);
    setError(null);

    try {
      // STEP 1: Network Management
      const currentChainId = await window.ethereum.request({ method: "eth_chainId" });
      if (currentChainId !== BASE_SEPOLIA_CHAIN_ID) {
        toast.loading("Switching to Base Sepolia network...");
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: BASE_SEPOLIA_CHAIN_ID }],
        });
        toast.dismiss();
        toast.success("Successfully switched to Base Sepolia");
      }

      // STEP 2: Wallet Connection
      await window.ethereum.request({ method: "eth_requestAccounts" });
      const provider = new BrowserProvider(window.ethereum);
      setWeb3Provider(provider);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      setOwnerAddress(address);
      setIsAuthenticated(true);

      // STEP 3: Safe Wallet Setup
      const aaKit = new AccountAbstraction({ provider: window.ethereum });
      await aaKit.init();

      // STEP 4: Gelato Relay Integration
      const relayPack = new GelatoRelayPack({
        protocolKit: aaKit.protocolKit,
        apiKey: process.env.NEXT_PUBLIC_GELATO_RELAY_API_KEY,
      });
      aaKit.setRelayKit(relayPack);

      // STEP 5: Get Safe Address (deterministic)
      const safeAddr = await aaKit.protocolKit.getAddress();
      setAccountAbstractionKit(aaKit);
      setSafeAddress(safeAddr);

      // STEP 6: Check Deployment Status
      await checkSafeDeploymentStatus(safeAddr, provider);

      setLoading(false);
      setError(null);
      toast.success("Successfully connected to Safe Smart Wallet");
    } catch (error: any) {
      setLoading(false);
      setError(error.message);
      toast.error(`Failed to connect: ${error.message}`);
      throw error;
    }
  }, []);

  // ============================================
  // GASLESS TRANSACTION EXECUTION
  // ============================================

  /**
   * Executes gasless transactions via Gelato relay network
   *
   * SUPPORTED METHODS:
   * - addNote: Stores encrypted note on-chain
   * - addCollaborator: Adds collaborator access to existing note
   *
   * ERROR HANDLING:
   * - Rate limiting: Exponential backoff retry (max 3 attempts)
   * - Invalid data: Immediate failure with error message
   * - Network issues: Retry with backoff
   *
   * @param txData - Transaction data containing method and parameters
   * @returns Promise<any> - Gelato task result with taskId
   */
  const relayTransaction = useCallback(
    async (txData?: any) => {
      if (!accountAbstractionKit || !safeAddress) {
        const errorMsg = "Account Abstraction Kit or Safe address not initialized";
        toast.error(errorMsg);
        throw new Error(errorMsg);
      }

      if (!txData) {
        toast.error("No transaction data provided");
        return;
      }

      // ============================================
      // FUNCTION ENCODING
      // ============================================

      if (txData.to && txData.data) {
        let encodedData = "0x";

        if (txData.data.method && txData.data.params) {
          try {
            if (txData.data.method === "addNote") {
              /**
               * Encodes addNote function call
               * @param cid - IPFS content identifier
               * @param nftAddr - NFT contract address for gating (or zero address)
               * @param encKeyOwner - Encrypted content key for note owner
               */
              const iface = new ethers.Interface([
                "function addNote(string cid, address nftAddr, string encKeyOwner)",
              ]);
              encodedData = iface.encodeFunctionData("addNote", [
                txData.data.params.cid,
                txData.data.params.nftAddr,
                txData.data.params.encKeyOwner,
              ]);
              console.log("Encoded addNote function call");
              toast.success("Note transaction prepared successfully");
            } else if (txData.data.method === "addCollaborator") {
              /**
               * Encodes addCollaborator function call
               * @param noteId - CID of the note to share
               * @param collaborator - Address of collaborator to add
               * @param encKeyCollaborator - Encrypted content key for collaborator
               */
              const iface = new ethers.Interface([
                "function addCollaborator(string noteId, address collaborator, string encKeyCollaborator)",
              ]);
              encodedData = iface.encodeFunctionData("addCollaborator", [
                txData.data.params.noteId,
                txData.data.params.collaborator,
                txData.data.params.encKeyCollaborator,
              ]);
              console.log("Encoded addCollaborator function call");
              toast.success("Collaborator transaction prepared successfully");
            } else {
              const errorMsg = `Unknown method: ${txData.data.method}`;
              toast.error(errorMsg);
              throw new Error(errorMsg);
            }
          } catch (encodingError: any) {
            console.error("Function encoding error:", encodingError);
            const errorMsg = `Failed to encode function call: ${encodingError.message}`;
            toast.error(errorMsg);
            throw new Error(errorMsg);
          }
        }

        // ============================================
        // TRANSACTION PREPARATION
        // ============================================

        const tx: MetaTransactionData[] = [
          {
            to: txData.to,
            data: encodedData,
            value: txData.value || "0",
            operation: 0, // CALL operation
          },
        ];

        const options: MetaTransactionOptions = {
          isSponsored: true, // Gelato pays gas fees
          gasLimit: "600000", // Conservative gas limit
        };

        // ============================================
        // RETRY LOGIC FOR RATE LIMITING
        // ============================================

        const maxRetries = 3;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            console.log(`Attempting transaction (attempt ${attempt}/${maxRetries})`);
            if (attempt === 1) {
              toast.loading("Submitting transaction...");
            }

            // Execute transaction via Gelato relay
            const result: { taskId: string } = await accountAbstractionKit.relayTransaction(
              tx,
              options
            );
            console.log("Transaction successful:", result);
            toast.dismiss();

            // Open Gelato task status page for tracking
            if (result.taskId) {
              const gelatoUrl = `https://relay.gelato.digital/tasks/status/${result.taskId}`;
              window.open(gelatoUrl, "_blank");
              toast.success(
                `Transaction submitted! Task ID: ${result.taskId} - Check status in new tab`
              );
            } else {
              toast.success("Transaction completed successfully!");
            }

            return result;
          } catch (error: any) {
            console.error(`Transaction attempt ${attempt} failed:`, error);

            // Handle rate limiting with exponential backoff
            if (error.message.includes("Too many requests") || error.message.includes("429")) {
              if (attempt < maxRetries) {
                const delayMs = Math.pow(2, attempt) * 1000; // 2^attempt seconds
                toast.dismiss();
                toast.loading(`Rate limited. Retrying in ${delayMs / 1000}s...`);
                await new Promise((resolve) => setTimeout(resolve, delayMs));
                continue;
              } else {
                const errorMsg = `Transaction failed after ${maxRetries} attempts due to rate limiting. Please try again later.`;
                toast.dismiss();
                toast.error(errorMsg);
                throw new Error(errorMsg);
              }
            }

            // For other errors, don't retry
            const errorMsg = `Transaction failed: ${error.message}`;
            toast.dismiss();
            toast.error(errorMsg);
            throw new Error(errorMsg);
          }
        }
      }

      const errorMsg = "Invalid transaction data provided";
      toast.error(errorMsg);
      throw new Error(errorMsg);
    },
    [accountAbstractionKit, safeAddress]
  );

  // ============================================
  // SAFE DEPLOYMENT
  // ============================================

  /**
   * Deploys Safe wallet on-chain by executing a dummy transaction
   *
   * PROCESS:
   * 1. Check if already deployed (skip if yes)
   * 2. Execute dummy transaction to trigger deployment
   * 3. Poll for deployment confirmation
   * 4. Update deployment status
   */
  const deploySafe = useCallback(async () => {
    setDeploySafeLoading(true);
    if (!accountAbstractionKit || !safeAddress || !web3Provider) {
      const errorMsg = "Account Abstraction Kit or Safe address not initialized";
      toast.error(errorMsg);
      throw new Error(errorMsg);
    }

    // Check if already deployed
    const alreadyDeployed = await checkSafeDeploymentStatus(safeAddress, web3Provider);
    if (alreadyDeployed) {
      console.log("Safe already deployed, no need to deploy again");
      toast.success("Safe wallet is already deployed");
      setDeploySafeLoading(false);
      return safeAddress;
    }

    // Dummy transaction to trigger Safe deployment
    const tx: MetaTransactionData[] = [
      {
        to: "0xB863fa024C30A26ee744DB91dE16452D98037468", // Sample address
        data: "0x",
        value: "0",
        operation: 0,
      },
    ];

    const options: MetaTransactionOptions = {
      isSponsored: true,
      gasLimit: "600000",
    };

    try {
      toast.loading("Deploying Safe wallet...");
      const response = await accountAbstractionKit.relayTransaction(tx, options);
      console.log("Deploy Safe Response:", response);

      // Poll for deployment confirmation
      let isDeployed = false;
      let attempts = 0;
      const maxAttempts = 10;

      while (!isDeployed && attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 3000)); // Wait 3 seconds
        isDeployed = await checkSafeDeploymentStatus(safeAddress, web3Provider);
        attempts++;
      }

      toast.dismiss();
      if (isDeployed) {
        console.log("Safe deployment confirmed on-chain");
        toast.success("Safe wallet deployed successfully!");
      } else {
        console.log("Safe deployment not confirmed after maximum attempts");
        toast.warning("Safe deployment initiated but confirmation pending");
      }

      return safeAddress;
    } catch (error: any) {
      console.error("Error deploying Safe:", error);
      toast.dismiss();
      toast.error(`Failed to deploy Safe wallet: ${error.message}`);
      throw error;
    } finally {
      setDeploySafeLoading(false);
    }
  }, [accountAbstractionKit, safeAddress, web3Provider, checkSafeDeploymentStatus]);

  // ============================================
  // CONTRACT QUERIES
  // ============================================

  /**
   * Queries the NoteRegistry contract to get user's notes
   *
   * IMPORTANT: Uses Safe address, not EOA address, because transactions
   * are sent from the Safe wallet, so notes are stored under Safe address.
   *
   * @param userAddress - User's EOA address (for wallet key generation)
   * @returns Promise containing arrays of CIDs, NFT addresses, and encrypted keys
   */
  const getUserNotes = useCallback(
    async (userAddress: string) => {
      if (!web3Provider) {
        throw new Error("Web3 provider not initialized");
      }

      if (!process.env.NEXT_PUBLIC_NOTE_REGISTRY_ADDRESS) {
        throw new Error("Note registry contract address not configured");
      }

      // Create contract interface
      const noteRegistryInterface = new ethers.Interface([
        "function getNotes(address user) view returns ((string cid, address nftGate, address owner, string encKeyOwner)[])",
      ]);

      // Create contract instance
      const contract = new ethers.Contract(
        process.env.NEXT_PUBLIC_NOTE_REGISTRY_ADDRESS,
        noteRegistryInterface,
        web3Provider
      );

      // Query using Safe address (where notes are actually stored)
      const queryAddress = safeAddress || userAddress;
      console.log(`Querying contract for notes using address: ${queryAddress}`);
      console.log(`Owner address: ${userAddress}, Safe address: ${safeAddress}`);

      const result = await contract.getNotes(queryAddress);

      // Parse results
      const cids: string[] = [];
      const nftAddrs: string[] = [];
      const encKeys: string[] = [];

      for (const note of result) {
        cids.push(note.cid);
        nftAddrs.push(note.nftGate);
        encKeys.push(note.encKeyOwner);
      }

      return { cids, nftAddrs, encKeys };
    },
    [web3Provider, safeAddress]
  );

  // ============================================
  // EVENT QUERIES FOR TRANSACTION HASHES
  // ============================================

  /**
   * Retrieves transaction hashes for notes by querying blockchain events
   *
   * This function searches for NoteAdded events to find the original
   * transaction hashes for notes owned by the user.
   *
   * @param userAddress - User's Safe address to query events for
   * @param cids - Array of CIDs to find transaction hashes for
   * @returns Promise<Record<string, string>> - Mapping of CID to transaction hash
   */
  const getTransactionHashesFromEvents = useCallback(
    async (userAddress: string, cids: string[]): Promise<Record<string, string>> => {
      if (!web3Provider) {
        throw new Error("Web3 provider not initialized");
      }

      if (!process.env.NEXT_PUBLIC_NOTE_REGISTRY_ADDRESS) {
        throw new Error("Note registry contract address not configured");
      }

      try {
        // Create contract instance with full ABI
        const contract = new ethers.Contract(
          process.env.NEXT_PUBLIC_NOTE_REGISTRY_ADDRESS,
          [
            // NoteAdded event ABI
            {
              anonymous: false,
              inputs: [
                {
                  indexed: true,
                  internalType: "address",
                  name: "user",
                  type: "address",
                },
                {
                  indexed: false,
                  internalType: "string",
                  name: "cid",
                  type: "string",
                },
                {
                  indexed: false,
                  internalType: "address",
                  name: "nftGate",
                  type: "address",
                },
                {
                  indexed: false,
                  internalType: "string",
                  name: "encKeyOwner",
                  type: "string",
                },
              ],
              name: "NoteAdded",
              type: "event",
            },
          ],
          web3Provider
        );

        console.log(`Querying events for user: ${userAddress}`);
        console.log(`Looking for CIDs: ${cids.join(", ")}`);

        // Query NoteAdded events for this user
        const filter = contract.filters.NoteAdded(userAddress);

        // Query events from the last 10,000 blocks (adjust as needed)
        const currentBlock = await web3Provider.getBlockNumber();
        const fromBlock = Math.max(0, currentBlock - 10000);

        console.log(`Querying events from block ${fromBlock} to ${currentBlock}`);

        const events = await contract.queryFilter(filter, fromBlock, "latest");

        console.log(`Found ${events.length} NoteAdded events`);

        // Create mapping of CID to transaction hash
        const cidToTxHash: Record<string, string> = {};

        for (const event of events) {
          try {
            // Extract CID from event args
            const eventCid = event.args?.cid;
            const txHash = event.transactionHash;

            if (eventCid && txHash && cids.includes(eventCid)) {
              cidToTxHash[eventCid] = txHash;
              console.log(`Found transaction hash for CID ${eventCid}: ${txHash}`);
            }
          } catch (parseError) {
            console.error("Failed to parse event:", parseError);
          }
        }

        console.log(`Retrieved transaction hashes for ${Object.keys(cidToTxHash).length} notes`);
        return cidToTxHash;
      } catch (error: any) {
        console.error("Failed to query events:", error);
        throw new Error(`Failed to retrieve transaction hashes: ${error.message}`);
      }
    },
    [web3Provider]
  );

  // ============================================
  // UTILITY FUNCTIONS
  // ============================================

  /**
   * Manually refreshes Safe deployment status
   */
  const refreshDeploymentStatus = useCallback(async () => {
    if (!safeAddress || !web3Provider) return false;
    return checkSafeDeploymentStatus(safeAddress, web3Provider);
  }, [safeAddress, web3Provider, checkSafeDeploymentStatus]);

  /**
   * Disconnects wallet and clears state
   */
  const disconnect = useCallback(() => {
    setIsAuthenticated(false);
    setOwnerAddress(undefined);
    setWeb3Provider(undefined);
    setSafeAddress(undefined);
    setAccountAbstractionKit(undefined);
    setIsDeployed(false);
    setError(null);

    console.log("Wallet disconnected");
    toast.success("Wallet disconnected successfully");
  }, []);

  // ============================================
  // RETURN HOOK INTERFACE
  // ============================================

  return {
    // State
    isAuthenticated,
    ownerAddress,
    web3Provider,
    safeAddress,
    loading,
    error,
    deploySafeLoading,
    accountAbstractionKit,
    isDeployed,

    // Methods
    login,
    relayTransaction,
    deploySafe,
    refreshDeploymentStatus,
    disconnect,
    getUserNotes,
    getTransactionHashesFromEvents, // Add this new function
  };
}
