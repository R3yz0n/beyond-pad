import React from "react";
import ModalWrapper from "./ui/ModalWrapper";
import LoadingSpinner from "./ui/LoadingSpinner";

interface WalletConnectionModalProps {
  isOpen: boolean;
}

const WalletConnectionModal = ({ isOpen }: WalletConnectionModalProps) => {
  return (
    <ModalWrapper isOpen={isOpen} bgOpacity="30">
      <LoadingSpinner />
      <div className="text-lg font-semibold text-gray-700">
        Fetching your Safe wallet details...
      </div>
      <div className="text-sm text-gray-500 mt-2">This may take a few seconds.</div>
    </ModalWrapper>
  );
};

export default WalletConnectionModal;
