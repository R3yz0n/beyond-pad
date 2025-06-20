// Contract ABI for NoteRegistry
export const NOTE_REGISTRY_ABI = [
  {
    inputs: [
      { name: "cid", type: "string" },
      { name: "nftAddr", type: "address" },
      { name: "encKeyOwner", type: "address" },
    ],
    name: "addNote",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "noteId", type: "uint256" }],
    name: "getNote",
    outputs: [
      { name: "cid", type: "string" },
      { name: "nftAddr", type: "address" },
      { name: "encKeyOwner", type: "address" },
      { name: "timestamp", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
];

// Replace with actual deployed contract address
export const NOTE_REGISTRY_ADDRESS = "0x0000000000000000000000000000000000000000";

// Function to encode addNote function call
export const encodeAddNoteCall = (cid: string, nftAddr: string, encKeyOwner: string): string => {
  // This is a simplified version - in a real app, you'd use ethers.js or web3.js to properly encode
  // For now, we'll return a mock encoded call
  return `0xaddNote${cid}${nftAddr}${encKeyOwner}`;
};

// NFT gate placeholder address (replace with actual NFT contract if needed)
export const DEFAULT_NFT_GATE = "0x0000000000000000000000000000000000000000";
