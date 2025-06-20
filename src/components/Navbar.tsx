import { formatWalletAddress } from "@/utils/formatter";
import React from "react";

interface NavbarProps {
  isAuthenticated: boolean;
  safeAddress?: string;
  onConnect: () => void;
  onDisconnect?: () => void;
  loading?: boolean;
  error?: string;
  deploySafeLoading?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  isAuthenticated,
  safeAddress,
  onConnect,
  onDisconnect,
  loading,
  error,
  deploySafeLoading,
}) => (
  <nav className="sticky top-0 z-50 w-full border-b bg-gradient-to-r from-purple-900/95 via-blue-900/95 to-indigo-900/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
    <div className="container mx-auto px-4 h-16 flex items-center justify-between">
      <div className="flex items-center space-x-4">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-blue-200 bg-clip-text text-transparent">
          Beyond Pad
        </h1>
        <div className="hidden md:flex items-center space-x-6 text-sm text-gray-300 ml-8">
          <a
            href="https://github.com/R3yz0n/beyond-pad"
            target="_blank"
            className="hover:text-white transition-colors"
          >
            View Code
          </a>
          <a href="#" className="hover:text-white transition-colors">
            Editor
          </a>
          <a href="#" className="hover:text-white transition-colors">
            Gallery
          </a>
        </div>
      </div>
      <div className="flex items-center space-x-4">
        {!isAuthenticated ? (
          <button
            onClick={onConnect}
            className="bg-gradient-to-r from-pink-500 to-violet-500 hover:from-pink-600 hover:to-violet-600 text-white font-medium px-6 py-2 rounded-lg transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl"
          >
            Connect Wallet
          </button>
        ) : (
          <div className="flex items-center space-x-3">
            <div className="bg-gradient-to-r bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-lg">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 my-auto bg-green-500 rounded-full animate-pulse-slow bg"></div>
                {loading ? (
                  <span>0x5307825c25CdB...a3029577A9</span>
                ) : (
                  // <span>{formatWalletAddress(safeAddress || "", 15, 10)}</span>
                  <span>{safeAddress || ""}</span>
                )}
              </div>
            </div>
            {onDisconnect && (
              <button
                onClick={onDisconnect}
                className="bg-gradient-to-r cursor-pointer from-red-500 to-pink-500 text-white px-3 py-2 rounded-lg text-sm font-medium shadow-lg hover:from-red-600 hover:to-pink-600 transition-all duration-300 flex items-center"
                title="Disconnect wallet"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  </nav>
);
