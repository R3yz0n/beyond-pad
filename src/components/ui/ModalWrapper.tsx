import React, { ReactNode } from "react";

interface ModalProps {
  isOpen: boolean;
  onClose?: () => void;
  children: ReactNode;
  bgOpacity?: string; // Customizable background opacity
}

export const ModalWrapper = ({
  isOpen,
  onClose,
  children,
  bgOpacity = "50", // Default opacity of 30%
}: ModalProps) => {
  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 bg-black/50 flex items-center justify-center z-50`}>
      <div className="bg-white rounded-lg p-8 shadow-lg flex flex-col items-center">{children}</div>
      <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default ModalWrapper;
