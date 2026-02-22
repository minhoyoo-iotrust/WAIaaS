/**
 * Network-to-block-explorer URL mapping.
 *
 * Returns a transaction URL for the given network + txHash,
 * or null if the network is not recognized.
 */

const EXPLORER_MAP: Record<string, string> = {
  // Solana
  mainnet: 'https://solscan.io/tx/{txHash}',
  devnet: 'https://solscan.io/tx/{txHash}?cluster=devnet',
  testnet: 'https://solscan.io/tx/{txHash}?cluster=testnet',
  // Ethereum
  'ethereum-mainnet': 'https://etherscan.io/tx/{txHash}',
  'ethereum-sepolia': 'https://sepolia.etherscan.io/tx/{txHash}',
  // Polygon
  'polygon-mainnet': 'https://polygonscan.com/tx/{txHash}',
  'polygon-amoy': 'https://amoy.polygonscan.com/tx/{txHash}',
  // Arbitrum
  'arbitrum-mainnet': 'https://arbiscan.io/tx/{txHash}',
  'arbitrum-sepolia': 'https://sepolia.arbiscan.io/tx/{txHash}',
  // Optimism
  'optimism-mainnet': 'https://optimistic.etherscan.io/tx/{txHash}',
  'optimism-sepolia': 'https://sepolia-optimism.etherscan.io/tx/{txHash}',
  // Base
  'base-mainnet': 'https://basescan.org/tx/{txHash}',
  'base-sepolia': 'https://sepolia.basescan.org/tx/{txHash}',
};

/**
 * Get block explorer transaction URL for a given network and txHash.
 * Returns null if the network has no known explorer mapping.
 */
export function getExplorerTxUrl(network: string, txHash: string): string | null {
  const template = EXPLORER_MAP[network];
  if (!template) return null;
  return template.replace('{txHash}', txHash);
}
