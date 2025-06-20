"use client";
import React, { useState } from "react";
import dynamic from "next/dynamic";

// Import MDEditor dynamically to avoid SSR issues
const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });

interface EditorProps {
  isAuthenticated: boolean;
  isDeployed: boolean;
  relayTransaction?: (txData: any) => Promise<any>;
  ownerAddress?: string;
}

const Editor: React.FC<EditorProps> = ({
  isAuthenticated,
  isDeployed,
  relayTransaction,
  ownerAddress,
}) => {
  const [note, setNote] = useState<string>("");
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [savedNotes, setSavedNotes] = useState<
    Array<{ cid: string; title: string; timestamp: number; encryptionKey: string; txHash?: string }>
  >([]);

  //   if (!isAuthenticated || !isDeployed) {
  //     return null; // Don't render anything if not authenticated or not deployed
  //   }

  return (
    <div className="mx-auto px-4 py-6 w-full">
      <div className="bg-white/90 rounded-lg p-6 shadow-md mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-800">Your Notes</h2>
          <div className="flex space-x-2">
            <button
              onClick={() => setNote("")}
              className="px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-md transition-colors"
              title="Clear note"
            >
              Clear
            </button>
            <button
              onClick={() => {
                const blob = new Blob([note], { type: "text/markdown" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "note.md";
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
              title="Download note as Markdown"
            >
              Download
            </button>
            <button
              // onClick={saveNoteToIPFS}
              disabled={isSaving || !note.trim()}
              className="px-4 py-1 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white rounded-md transition-colors flex items-center space-x-2"
              title="Save encrypted note to IPFS and register on-chain"
            >
              {isSaving ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                  <span>Save to IPFS</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div data-color-mode="dark">
          <MDEditor
            value={note}
            onChange={(value) => setNote(value || "")}
            height={400}
            preview="edit"
            className="rounded-md shadow-sm"
          />
        </div>

        <div className="mt-4 text-sm text-gray-500">
          <p>
            <strong>Tip:</strong> This editor supports Markdown formatting. Use{" "}
            <code className="mx-1 px-1 py-0.5 bg-gray-100 rounded">**bold**</code>,{" "}
            <code className="mx-1 px-1 py-0.5 bg-gray-100 rounded">*italic*</code>, and{" "}
            <code className="mx-1 px-1 py-0.5 bg-gray-100 rounded">[links](url)</code>
          </p>
          <p className="mt-2">
            <strong>Privacy:</strong> When you save to IPFS, your note is encrypted with AES-256-GCM
            before upload.
          </p>
        </div>
      </div>

      {/* Saved Notes Section */}
      {savedNotes.length > 0 && (
        <div className="bg-white/90 rounded-lg p-6 shadow-md">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Saved Notes</h3>
          <div className="space-y-3">
            {savedNotes.map((savedNote, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-800">{savedNote.title}</h4>
                    <p className="text-sm text-gray-500 mt-1">
                      Saved: {new Date(savedNote.timestamp).toLocaleString()}
                    </p>
                    <p className="text-sm text-gray-600 mt-1 font-mono">
                      IPFS CID: {savedNote.cid}
                    </p>
                    {savedNote.txHash && (
                      <p className="text-sm text-green-600 mt-1 font-mono">
                        ⛓️ On-chain: {savedNote.txHash}
                      </p>
                    )}
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(savedNote.cid);
                        alert("CID copied to clipboard!");
                      }}
                      className="px-2 py-1 text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 rounded"
                      title="Copy CID"
                    >
                      Copy CID
                    </button>
                    <a
                      href={`https://ipfs.io/ipfs/${savedNote.cid}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded"
                      title="View on IPFS"
                    >
                      View
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Editor;
