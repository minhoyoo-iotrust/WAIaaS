/**
 * Resolve numeric EVM chain ID from network identifier.
 * Falls back to 1 (mainnet) for unknown networks.
 */
const CHAIN_IDS: Record<string, number> = {
  'ethereum-mainnet': 1,
  'ethereum-sepolia': 11155111,
  'ethereum-goerli': 5,
  'polygon-mainnet': 137,
  'polygon-mumbai': 80001,
  'arbitrum-mainnet': 42161,
  'arbitrum-sepolia': 421614,
  'optimism-mainnet': 10,
  'optimism-sepolia': 11155420,
  'base-mainnet': 8453,
  'base-sepolia': 84532,
};

export function resolveChainId(network: string): number {
  return CHAIN_IDS[network] ?? 1;
}
