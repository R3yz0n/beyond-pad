export function formatWalletAddress(address: string, startChars: number, endChars: number): string {
  if (!address || address.length < startChars + endChars) return address;

  const start = address.slice(0, startChars);
  const end = address.slice(-endChars);
  return `${start}...${end}`;
}
