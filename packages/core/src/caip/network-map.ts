/**
 * CAIP-2 <-> WAIaaS NetworkType bidirectional mapping (SSoT).
 *
 * All 13 NetworkType values are mapped to their CAIP-2 chain identifiers.
 * This is the single source of truth -- x402.types.ts and wc-session-service.ts
 * re-export or import from here instead of maintaining local copies.
 */
import type { ChainType, NetworkType } from '../enums/chain.js';

// ── CAIP-2 -> { chain, network } ────────────────────────────────

export const CAIP2_TO_NETWORK: Record<string, { chain: ChainType; network: NetworkType }> = {
  // EVM
  'eip155:1':        { chain: 'ethereum', network: 'ethereum-mainnet' },
  'eip155:11155111': { chain: 'ethereum', network: 'ethereum-sepolia' },
  'eip155:137':      { chain: 'ethereum', network: 'polygon-mainnet' },
  'eip155:80002':    { chain: 'ethereum', network: 'polygon-amoy' },
  'eip155:42161':    { chain: 'ethereum', network: 'arbitrum-mainnet' },
  'eip155:421614':   { chain: 'ethereum', network: 'arbitrum-sepolia' },
  'eip155:10':       { chain: 'ethereum', network: 'optimism-mainnet' },
  'eip155:11155420': { chain: 'ethereum', network: 'optimism-sepolia' },
  'eip155:8453':     { chain: 'ethereum', network: 'base-mainnet' },
  'eip155:84532':    { chain: 'ethereum', network: 'base-sepolia' },
  // Solana
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': { chain: 'solana', network: 'mainnet' },
  'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1':  { chain: 'solana', network: 'devnet' },
  'solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z':  { chain: 'solana', network: 'testnet' },
};

// ── NetworkType -> CAIP-2 (reverse mapping) ─────────────────────

export const NETWORK_TO_CAIP2 = Object.fromEntries(
  Object.entries(CAIP2_TO_NETWORK).map(([caip2, { network }]) => [network, caip2]),
) as Record<NetworkType, string>;

// ── Lookup functions with error handling ────────────────────────

/**
 * Convert a WAIaaS NetworkType to its CAIP-2 chain identifier.
 * @throws {Error} if network is not in the mapping
 */
export function networkToCaip2(network: NetworkType): string {
  const caip2 = NETWORK_TO_CAIP2[network];
  if (!caip2) throw new Error(`Unknown network: ${network}`);
  return caip2;
}

/**
 * Convert a CAIP-2 chain identifier to WAIaaS chain + network.
 * @throws {Error} if CAIP-2 ID is not in the mapping
 */
export function caip2ToNetwork(caip2: string): { chain: ChainType; network: NetworkType } {
  const entry = CAIP2_TO_NETWORK[caip2];
  if (!entry) throw new Error(`Unknown CAIP-2 chain ID: ${caip2}`);
  return entry;
}
