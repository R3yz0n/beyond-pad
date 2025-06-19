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

  // Connect MetaMask and setup Safe
  const login = useCallback(async () => {
    if (!window.ethereum) throw new Error("MetaMask not found");
    // Check if already on Base Sepolia
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
    if (!accountAbstractionKit || !safeAddress)
      throw new Error("Account Abstraction Kit or Safe address not initialized");
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
    const response = await accountAbstractionKit.relayTransaction(tx, options);
    console.log("Deploy Safe Response:", response);
    return safeAddress;
  }, [accountAbstractionKit, safeAddress]);

  return {
    isAuthenticated,
    ownerAddress,
    web3Provider,
    safeAddress,
    login,
    relayTransaction,
    deploySafe, // Expose deploySafe
  };
}
