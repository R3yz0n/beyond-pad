"use client";
import { useState, useCallback } from "react";
import { ethers, BrowserProvider, parseUnits } from "ethers";
import AccountAbstraction from "@safe-global/account-abstraction-kit-poc";
// import { EthersAdapter } from "@safe-global/protocol-kit";
import { MetaTransactionData, MetaTransactionOptions } from "@safe-global/safe-core-sdk-types";
import { GelatoRelayPack } from "@safe-global/relay-kit";
// import { RelayResponse as GelatoRelayResponse } from "@gelatonetwork/relay-sdk";

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
    if (!window.ethereum) throw new Error("MetaMask not found");
    // Check if already on Base Sepolia
    setLoading(true);
    setError(null);
    const currentChainId = await window.ethereum.request({ method: "eth_chainId" });
    if (currentChainId !== BASE_SEPOLIA_CHAIN_ID) {
      // Switch to Base Sepolia
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: BASE_SEPOLIA_CHAIN_ID }],
      });
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
  }, []);

  // Relay a gas-free transaction
  const relayTransaction = useCallback(async () => {
    if (!accountAbstractionKit || !safeAddress) return;
    const tx: MetaTransactionData[] = [
      {
        to: "0xB863fa024C30A26ee744DB91dE16452D98037468",
        data: "0x",
        value: parseUnits("0.01", "ether").toString(),
        operation: 0,
      },
    ];
    const options: MetaTransactionOptions = {
      isSponsored: true,
      gasLimit: "600000",
    };
    return accountAbstractionKit.relayTransaction(tx, options);
  }, [accountAbstractionKit, safeAddress]);

  // Deploy the Safe account (vault) on-chain by sending a 0 ETH transaction to itself
  const deploySafe = useCallback(async () => {
    setDeploySafeLoading(true);
    if (!accountAbstractionKit || !safeAddress || !web3Provider)
      throw new Error("Account Abstraction Kit or Safe address not initialized");

    // Check if already deployed before attempting to deploy
    const alreadyDeployed = await checkSafeDeploymentStatus(safeAddress, web3Provider);
    if (alreadyDeployed) {
      console.log("Safe already deployed, no need to deploy again");
      setDeploySafeLoading(false);
      return safeAddress;
    }

    const tx: MetaTransactionData[] = [
      {
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

      if (isDeployed) {
        console.log("Safe deployment confirmed on-chain");
      } else {
        console.log("Safe deployment not confirmed after maximum attempts");
      }

      return safeAddress;
    } catch (error) {
      console.error("Error deploying Safe:", error);
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
  }, []);

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
  };
}
