/**
 * ExplorerLink — renders a clickable link to a block explorer for a given network + txHash.
 *
 * Network-to-explorer mapping is inlined (mirrored from @waiaas/core/src/utils/explorer-url.ts)
 * because the admin SPA cannot import backend packages directly.
 */

const EXPLORER_MAP: Record<string, string> = {
  // Solana
  'solana-mainnet': 'https://solscan.io/tx/{txHash}',
  'solana-devnet': 'https://solscan.io/tx/{txHash}?cluster=devnet',
  'solana-testnet': 'https://solscan.io/tx/{txHash}?cluster=testnet',
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

function truncateHash(hash: string): string {
  if (hash.length <= 16) return hash;
  return hash.slice(0, 8) + '...' + hash.slice(-6);
}

export interface ExplorerLinkProps {
  network: string;
  txHash: string | null | undefined;
  label?: string;
}

export function ExplorerLink({ network, txHash, label }: ExplorerLinkProps) {
  if (!txHash) return null;

  const url = getExplorerTxUrl(network, txHash);
  const displayText = label ?? truncateHash(txHash);

  if (!url) {
    return <span class="explorer-link-text">{displayText}</span>;
  }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" class="explorer-link">
      {displayText}
    </a>
  );
}
