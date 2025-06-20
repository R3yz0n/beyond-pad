"use client";
import { useState, useCallback } from "react";
import { ethers, BrowserProvider, parseUnits } from "ethers";
import toast from "react-hot-toast";
import { MetaTransactionData, MetaTransactionOptions } from "@safe-global/safe-core-sdk-types";
import { GelatoRelayPack } from "@safe-global/relay-kit";
import AccountAbstraction from "@safe-global/account-abstraction-kit-poc";

const BASE_SEPOLIA_CHAIN_ID = "0x14a34";

declare global {
  interface Window {
    ethereum?: any;
  }
}

export function useSafeSmartWallet(txServiceUrl: string) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [ownerAddress, setOwnerAddress] = useState<string>();
  const [web3Provider, setWeb3Provider] = useState<BrowserProvider>();
  const [safeAddress, setSafeAddress] = useState<string>();
  const [accountAbstractionKit, setAccountAbstractionKit] = useState<AccountAbstraction>();
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [deploySafeLoading, setDeploySafeLoading] = useState<boolean>(false);
  const [isDeployed, setIsDeployed] = useState<boolean>(false);

  // Function to check if a Safe has been deployed on-chain
  const checkSafeDeploymentStatus = useCallback(
    async (address: string, provider: BrowserProvider) => {
      try {
        // Check if there's code deployed at the Safe address
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

  // Connect MetaMask and setup Safe
  const login = useCallback(async () => {
    if (!window.ethereum) {
      toast.error("MetaMask not found. Please install MetaMask to continue.");
      throw new Error("MetaMask not found");
    }
    // Check if already on Base Sepolia
    setLoading(true);
    setError(null);

    try {
      const currentChainId = await window.ethereum.request({ method: "eth_chainId" });
      if (currentChainId !== BASE_SEPOLIA_CHAIN_ID) {
        toast.loading("Switching to Base Sepolia network...");
        // Switch to Base Sepolia
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: BASE_SEPOLIA_CHAIN_ID }],
        });
        toast.dismiss();
        toast.success("Successfully switched to Base Sepolia");
      }

      // Request accounts
      await window.ethereum.request({ method: "eth_requestAccounts" });
      const provider = new BrowserProvider(window.ethereum);
      setWeb3Provider(provider);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      setOwnerAddress(address);
      setIsAuthenticated(true);

      // Setup Safe
      const aaKit = new AccountAbstraction({ provider: window.ethereum });
      console.log(process.env.NEXT_PUBLIC_GELATO_RELAY_API_KEY);
      await aaKit.init();
      const relayPack = new GelatoRelayPack({
        protocolKit: aaKit.protocolKit,
        apiKey: process.env.NEXT_PUBLIC_GELATO_RELAY_API_KEY,
      });
      aaKit.setRelayKit(relayPack);
      const safeAddr = await aaKit.protocolKit.getAddress();
      setAccountAbstractionKit(aaKit);
      setSafeAddress(safeAddr);

      // Check if the Safe is already deployed
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

  // Relay a gas-free transaction
  const relayTransaction = useCallback(
    async (txData?: any) => {
      if (!accountAbstractionKit || !safeAddress) {
        const errorMsg = "Account Abstraction Kit or Safe address not initialized";
        toast.error(errorMsg);
        throw new Error(errorMsg);
      }

      // If no txData provided, use default transaction (for testing/deployment)
      if (!txData) {
        toast.error("No transaction data provided");
        return;
      }

      // Handle contract calls from Editor.tsx
      if (txData.to && txData.data) {
        let encodedData = "0x";

        // Encode the function call based on method
        if (txData.data.method && txData.data.params) {
          try {
            if (txData.data.method === "addNote") {
              // Encode addNote(string cid, address nftAddr, string encKeyOwner) - matches contract
              const iface = new ethers.Interface([
                "function addNote(string cid, address nftAddr, string encKeyOwner)",
              ]);
              encodedData = iface.encodeFunctionData("addNote", [
                txData.data.params.cid,
                txData.data.params.nftAddr, // Contract expects 'nftAddr', not 'nftGate'
                txData.data.params.encKeyOwner, // Now correctly a string
              ]);
              console.log("Encoded addNote function call");
              toast.success("Note transaction prepared successfully");
            } else if (txData.data.method === "addCollaborator") {
              // Encode addCollaborator(string noteId, address collaborator, string encKeyCollaborator)
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

        // Prepare the transaction
        const tx: MetaTransactionData[] = [
          {
            to: txData.to,
            data: encodedData,
            value: txData.value || "0",
            operation: 0,
          },
        ];

        const options: MetaTransactionOptions = {
          isSponsored: true,
          gasLimit: "600000",
        };

        // Execute with retry logic for rate limiting
        const maxRetries = 3;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            console.log(`Attempting transaction (attempt ${attempt}/${maxRetries})`);
            if (attempt === 1) {
              toast.loading("Submitting transaction...");
            }
            const result: {
              taskId: string;
            } = await accountAbstractionKit.relayTransaction(tx, options);
            console.log("Transaction successful:", result);
            toast.dismiss();

            // Open Gelato task status page if taskId is available
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

            // Check if it's a rate limit error
            if (error.message.includes("Too many requests") || error.message.includes("429")) {
              if (attempt < maxRetries) {
                // Exponential backoff: wait 2^attempt seconds
                const delayMs = Math.pow(2, attempt) * 1000;
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

  // Deploy the Safe account (vault) on-chain by sending a 0 ETH transaction to itself
  const deploySafe = useCallback(async () => {
    setDeploySafeLoading(true);
    if (!accountAbstractionKit || !safeAddress || !web3Provider) {
      const errorMsg = "Account Abstraction Kit or Safe address not initialized";
      toast.error(errorMsg);
      throw new Error(errorMsg);
    }

    // Check if already deployed before attempting to deploy
    const alreadyDeployed = await checkSafeDeploymentStatus(safeAddress, web3Provider);
    if (alreadyDeployed) {
      console.log("Safe already deployed, no need to deploy again");
      toast.success("Safe wallet is already deployed"); // Changed from toast.info
      setDeploySafeLoading(false);
      return safeAddress;
    }

    const tx: MetaTransactionData[] = [
      {
        // sample address, to create a frist transaction
        to: "0xB863fa024C30A26ee744DB91dE16452D98037468",
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

      // Poll for deployment status after transaction
      let isDeployed = false;
      let attempts = 0;
      const maxAttempts = 10;

      while (!isDeployed && attempts < maxAttempts) {
        // Wait a few seconds between checks
        await new Promise((resolve) => setTimeout(resolve, 3000));
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

  // Function to manually check deployment status
  const refreshDeploymentStatus = useCallback(async () => {
    if (!safeAddress || !web3Provider) return false;
    return checkSafeDeploymentStatus(safeAddress, web3Provider);
  }, [safeAddress, web3Provider, checkSafeDeploymentStatus]);

  // Function to disconnect/logout
  const disconnect = useCallback(() => {
    setIsAuthenticated(false);
    setOwnerAddress(undefined);
    setWeb3Provider(undefined);
    setSafeAddress(undefined);
    setAccountAbstractionKit(undefined);
    setIsDeployed(false);
    setError(null);

    // Clear any local storage if needed
    // localStorage.removeItem('walletConnected');

    console.log("Wallet disconnected");
    toast.success("Wallet disconnected successfully");
  }, []);

  // Query contract to get user's notes - Updated to use Safe address
  const getUserNotes = useCallback(
    async (userAddress: string) => {
      if (!web3Provider) {
        throw new Error("Web3 provider not initialized");
      }

      if (!process.env.NEXT_PUBLIC_NOTE_REGISTRY_ADDRESS) {
        throw new Error("Note registry contract address not configured");
      }

      // Create contract interface matching the correct ABI
      const noteRegistryInterface = new ethers.Interface([
        "function getNotes(address user) view returns ((string cid, address nftGate, address owner, string encKeyOwner)[])",
      ]);

      // Create contract instance for reading
      const contract = new ethers.Contract(
        process.env.NEXT_PUBLIC_NOTE_REGISTRY_ADDRESS,
        noteRegistryInterface,
        web3Provider
      );

      // IMPORTANT: Query using Safe address, not owner address
      // Since transactions are sent from Safe wallet, notes are stored under Safe address
      const queryAddress = safeAddress || userAddress;
      console.log(`Querying contract for notes using address: ${queryAddress}`);
      console.log(`Owner address: ${userAddress}, Safe address: ${safeAddress}`);

      const result = await contract.getNotes(queryAddress);

      // Parse the results according to the correct contract structure
      const cids: string[] = [];
      const nftAddrs: string[] = [];
      const encKeys: string[] = [];

      for (const note of result) {
        cids.push(note.cid);
        nftAddrs.push(note.nftGate);
        encKeys.push(note.encKeyOwner);
      }

      return {
        cids,
        nftAddrs,
        encKeys,
      };
    },
    [web3Provider, safeAddress] // Add safeAddress as dependency
  );

  return {
    isAuthenticated,
    ownerAddress,
    web3Provider,
    safeAddress,
    login,
    relayTransaction,
    deploySafe,
    loading,
    error,
    deploySafeLoading,
    accountAbstractionKit,
    isDeployed, // Expose deployment status
    refreshDeploymentStatus, // Expose function to check deployment status
    disconnect, // Expose disconnect function
    getUserNotes, // Add this new function
  };
}
