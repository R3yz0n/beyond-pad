import React from "react";
import ModalWrapper from "./ui/ModalWrapper";
import LoadingSpinner from "./ui/LoadingSpinner";

interface DeployingWalletModalProps {
  isOpen: boolean;
}

const DeployingWalletModal = ({ isOpen }: DeployingWalletModalProps) => {
  return (
    <ModalWrapper isOpen={isOpen} bgOpacity="30">
      <LoadingSpinner spinnerColor="#4f46e5" />
      <div className="text-lg font-semibold text-gray-700">
        Deploying your Safe wallet on chain...
      </div>
      <div className="text-sm text-gray-500 mt-2">This may take a minute.</div>
    </ModalWrapper>
  );
};

export default DeployingWalletModal;
