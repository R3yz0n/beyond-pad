"use client";
import React, { useState } from "react";
import { useSafeSmartWallet } from "@/hooks/useSafeSmartWallet";
import { Navbar } from "@/components/Navbar";
import AboutProject from "@/components/AboutProject";
import WalletConnectionModal from "@/components/WalletConnectionModal";
import DeployingWalletModal from "@/components/DeployingWalletModal";
import Editor from "@/components/Editor";

const TX_SERVICE_URL = "https://safe-transaction-base-sepolia.safe.global";
function App() {
  const {
    isAuthenticated,
    ownerAddress,
    web3Provider,
    safeAddress,
    login,
    relayTransaction,
    deploySafe,
    deploySafeLoading,
    loading,
    error,
    accountAbstractionKit,
    isDeployed,
    refreshDeploymentStatus,
    disconnect,
    getUserNotes, // Add this line
  } = useSafeSmartWallet(TX_SERVICE_URL);

  const [autoDeployAttempted, setAutoDeployAttempted] = useState<boolean>(false);

  // Check if Safe is deployed and trigger deployment if needed
  React.useEffect(() => {
    const checkAndDeploy = async () => {
      if (isAuthenticated && safeAddress && !deploySafeLoading && !autoDeployAttempted) {
        console.log("Checking if Safe wallet needs deployment...");

        const isDeployedStatus = await refreshDeploymentStatus();
        console.log("Safe deployment status:", isDeployedStatus);

        if (!isDeployedStatus) {
          console.log("Auto-deploying Safe wallet...");
          try {
            debugger;
            await deploySafe();
          } catch (err) {
            console.error("Auto-deployment failed:", err);
          }
        } else {
          console.log("Safe already deployed, no need to deploy");
        }
        setAutoDeployAttempted(true);
      }
    };

    checkAndDeploy();
  }, [
    isAuthenticated,
    safeAddress,
    deploySafeLoading,
    autoDeployAttempted,
    deploySafe,
    refreshDeploymentStatus,
  ]);

  return (
    <div>
      <Navbar
        isAuthenticated={isAuthenticated}
        safeAddress={safeAddress}
        loading={loading}
        deploySafeLoading={deploySafeLoading}
        onConnect={login}
        onDisconnect={disconnect}
      />
      <AboutProject />
      <Editor
        isAuthenticated={isAuthenticated}
        isDeployed={isDeployed}
        relayTransaction={relayTransaction}
        ownerAddress={ownerAddress}
        safeAddress={safeAddress}
        web3Provider={web3Provider}
        getUserNotes={getUserNotes}
      />
      <WalletConnectionModal isOpen={loading} />
      <DeployingWalletModal isOpen={deploySafeLoading} />
    </div>
  );
}

export default App;
