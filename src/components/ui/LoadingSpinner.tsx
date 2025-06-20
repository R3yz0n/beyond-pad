import React from "react";

interface LoadingSpinnerProps {
  size?: number;
  borderColor?: string;
  spinnerColor?: string;
}

export const LoadingSpinner = ({
  size = 40,
  borderColor = "#e5e7eb",
  spinnerColor = "#6366f1",
}: LoadingSpinnerProps) => {
  return (
    <div
      className="loader mb-4"
      style={{
        width: size,
        height: size,
        border: `4px solid ${borderColor}`,
        borderTop: `4px solid ${spinnerColor}`,
        borderRadius: "50%",
        animation: "spin 1s linear infinite",
      }}
    />
  );
};

export default LoadingSpinner;
