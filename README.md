# Beyond Pad - Encrypted Collaborative Note-Taking DApp

A decentralized, end-to-end encrypted note-taking application built on Base Sepolia with Safe smart wallets and gasless transactions.

## 🏗️ Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Blockchain    │    │      IPFS       │
│   (Next.js)     │    │ (Base Sepolia)  │    │   (Pinata)      │
├─────────────────┤    ├─────────────────┤    ├─────────────────┤
│ • Note Editor   │    │ • Safe Wallet   │    │ • Encrypted     │
│ • Encryption    │◄──►│ • Note Registry │◄──►│   Content       │
│ • Collaboration │    │ • Access Control│    │ • Metadata      │
│ • Key Management│    │ • Gelato Relay  │    │ • CID Storage   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🔐 Security Model

### Encryption Flow

1. **Content Encryption**: Notes encrypted with random AES-256 keys
2. **Key Encryption**: AES keys encrypted with wallet-derived keys
3. **Access Control**: Encrypted keys stored on-chain per user
4. **Wallet Authentication**: Only wallet owners can decrypt their keys

### Key Derivation

```
Wallet Signature + Note CID → SHA256 → User-Specific Key
```

## 🚀 Features

- **End-to-End Encryption**: Military-grade AES-256 encryption
- **Gasless Transactions**: Sponsored by Gelato relay network
- **Collaborative Editing**: Secure key sharing with collaborators (Not implemented)
- **IPFS Storage**: Decentralized content storage
- **Safe Wallets**: Account abstraction for enhanced security

## 🛠️ Technology Stack

### Frontend

- **Next.js 14**: React framework with App Router
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Utility-first styling
- **React Hot Toast**: User notifications
- **@uiw/react-md-editor**: Markdown editing

### Blockchain

- **Base Sepolia**: Layer 2 testnet
- **Safe Protocol**: Smart wallet infrastructure
- **Gelato Network**: Gasless transaction relay
- **ethers.js**: Web3 interactions

### Storage & Encryption

- **IPFS/Pinata**: Decentralized file storage
- **CryptoJS**: Client-side encryption
- **localStorage**: Local state persistence

## 📋 Prerequisites

- Node.js 18+
- MetaMask browser extension
- Base Sepolia testnet ETH

## ⚙️ Installation

1. **Clone the repository**

```bash
git clone <repository-url>
cd beyond-pad
```

2. **Install dependencies**

```bash
yarn
```

3. **Configure environment variables**

```bash
cp .env.example .env
```

Fill in the required variables:

```env
NEXT_PUBLIC_NOTE_REGISTRY_ADDRESS=0x0ec7441eF05ABEaF4089f0b01982D7cfdFefEFbA
NEXT_PUBLIC_GELATO_RELAY_API_KEY=your_gelato_api_key
NEXT_PUBLIC_PINATA_JWT=your_pinata_jwt_token
```

4. **Start development server**

```bash
yarn dev
```

## 🔧 Smart Contract

### NoteRegistry.sol

```solidity
struct Note {
    string cid;           // IPFS content identifier
    address nftGate;      // NFT contract for access control
    address owner;        // Note owner address
    string encKeyOwner;   // Encrypted AES key for owner
}

function addNote(string cid, address nftAddr, string encKeyOwner);
function addCollaborator(string noteId, address collaborator, string encKeyCollaborator);
function getNotes(address user) returns (Note[]);
```

### Contract Address

- **Base Sepolia**: `0x0ec7441eF05ABEaF4089f0b01982D7cfdFefEFbA`

## 🔐 Encryption Details

### Content Encryption Process

```javascript
// 1. Generate random AES key
const contentKey = CryptoJS.lib.WordArray.random(256 / 8);

// 2. Encrypt note content
const encryptedContent = CryptoJS.AES.encrypt(noteContent, contentKey);

// 3. Upload to IPFS
const cid = await uploadToIPFS({ encryptedContent });

// 4. Derive wallet-specific key
const walletKey = await generateWalletKey(userAddress, cid);

// 5. Encrypt content key
const encryptedKey = CryptoJS.AES.encrypt(contentKey, walletKey);

// 6. Store on blockchain
await contract.addNote(cid, nftGate, encryptedKey);
```

### Decryption Process

```javascript
// 1. Get encrypted key from blockchain
const { encKeys } = await contract.getNotes(userAddress);

// 2. Derive wallet-specific key
const walletKey = await generateWalletKey(userAddress, cid);

// 3. Decrypt content key
const contentKey = CryptoJS.AES.decrypt(encKeys[0], walletKey);

// 4. Fetch encrypted content from IPFS
const ipfsData = await fetchFromIPFS(cid);

// 5. Decrypt content
const noteContent = CryptoJS.AES.decrypt(ipfsData.encryptedContent, contentKey);
```

## 🤝 Collaboration Features

### Adding Collaborators

1. Owner generates collaborator's wallet-derived key
2. Encrypts content key with collaborator's key
3. Calls `addCollaborator` with encrypted key
4. Collaborator can now decrypt the note

### NFT Gating

- Set NFT contract address when creating note
- Only NFT holders can access the note
- Checked via `ERC721.balanceOf(user) > 0`

## 🔄 Gasless Transactions

### Gelato Integration

```javascript
const relayPack = new GelatoRelayPack({
  protocolKit: aaKit.protocolKit,
  apiKey: process.env.NEXT_PUBLIC_GELATO_RELAY_API_KEY,
});

const result = await aaKit.relayTransaction(tx, {
  isSponsored: true,
  gasLimit: "600000",
});
```

### Rate Limiting Handling

- Exponential backoff retry (max 3 attempts)
- 2^attempt seconds delay between retries
- User-friendly error messages

## 📱 User Interface

### Main Components

- **Navbar**: Wallet connection and status
- **Editor**: Markdown note editor with encryption
- **Share Panel**: Collaboration and NFT gating options
- **Notes List**: Saved notes with metadata

### Key Features

- Real-time markdown preview
- Copy CID to clipboard
- View encrypted content on IPFS
- Track transaction status on Gelato/Basescan

## 🔍 Debugging

### Common Issues

1. **"No notes found"**: Check if using correct Safe address
2. **Decryption failed**: Verify wallet can sign messages
3. **Transaction failed**: Check Gelato API key and rate limits
4. **IPFS timeout**: Try refreshing or check Pinata status

### Debug Commands

```javascript
// Check Safe deployment
await refreshDeploymentStatus();

// View transaction on explorer
https://sepolia.basescan.org/tx/{txHash}

// Check Gelato task status
https://relay.gelato.digital/tasks/status/{taskId}
```

## 🚦 Network Configuration

### Base Sepolia Testnet

- **Chain ID**: 84532 (0x14a34)
- **RPC URL**: https://sepolia.base.org
- **Explorer**: https://sepolia.basescan.org
- **Faucet**: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet

## 📊 Storage Costs

### IPFS (Pinata)

- ~$0.01 per GB per month
- Notes typically 1-10 KB each
- Metadata adds ~500 bytes

### Blockchain

- Gasless transactions (sponsored)
- ~200,000 gas per note (~$0.01 on Base)
- ~100,000 gas per collaborator

## 🔮 Future Enhancements

- [ ] Real-time collaborative editing
- [ ] Note versioning and history
- [ ] Advanced search and tagging
- [ ] Mobile application
- [ ] Integration with other DeFi protocols
- [ ] Advanced NFT gating (trait-based)

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📄 License

This project is licensed under the Beyond License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Safe Protocol team for account abstraction
- Gelato Network for gasless transactions
- Pinata for IPFS infrastructure
- Base team for Layer 2 solution
