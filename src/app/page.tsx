"use client";
import { useSafeSmartWallet } from "@/hooks/useSafeSmartWallet";
import React from "react";

const TX_SERVICE_URL = "https://safe-transaction-base-sepolia.safe.global";
function App() {
  const { isAuthenticated, ownerAddress, safeAddress, login, relayTransaction, deploySafe } =
    useSafeSmartWallet(TX_SERVICE_URL);

  return (
    <div>
      {!isAuthenticated ? (
        <button onClick={login}>Connect MetaMask & Create Safe</button>
      ) : (
        <>
          <div>Owner: {ownerAddress}</div>
          <div>Safe Address: {safeAddress}</div>
          <button onClick={deploySafe}>Deploy Safe (Vault)</button>
          {/* <button onClick={relayTransaction}>Send Gas-Free Transaction</button> */}
        </>
      )}
    </div>
  );
}

export default App;
