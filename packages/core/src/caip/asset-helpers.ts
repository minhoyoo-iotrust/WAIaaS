/**
 * CAIP-19 asset helper functions for native and token assets.
 *
 * - nativeAssetId: generates slip44-based CAIP-19 URI for native assets
 * - tokenAssetId: generates erc20/token-based CAIP-19 URI for fungible tokens
 * - isNativeAsset: checks if a CAIP-19 URI refers to a native asset (slip44 namespace)
 */
import type { NetworkType } from '../enums/chain.js';
import { parseCaip2 } from './caip2.js';
import { formatCaip19, parseCaip19 } from './caip19.js';
import { networkToCaip2 } from './network-map.js';

// ── SLIP-44 coin type per CAIP-2 chain ID ───────────────────────
// ETH=60 for Ethereum/Arbitrum/Optimism/Base L2s
// POL=966 for Polygon (NOT ETH!)
// SOL=501 for Solana

const NATIVE_SLIP44: Record<string, number> = {
  'eip155:1': 60,
  'eip155:11155111': 60,
  'eip155:137': 966,
  'eip155:80002': 966,
  'eip155:42161': 60,
  'eip155:421614': 60,
  'eip155:10': 60,
  'eip155:11155420': 60,
  'eip155:8453': 60,
  'eip155:84532': 60,
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': 501,
  'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1': 501,
  'solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z': 501,
};

/**
 * Generate CAIP-19 asset type URI for a network's native asset.
 * Uses slip44 coin type to identify the native currency.
 *
 * @example nativeAssetId('ethereum-mainnet') => 'eip155:1/slip44:60'
 * @example nativeAssetId('polygon-mainnet') => 'eip155:137/slip44:966'
 * @example nativeAssetId('mainnet') => 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501'
 */
export function nativeAssetId(network: NetworkType): string {
  const caip2 = networkToCaip2(network);
  const slip44 = NATIVE_SLIP44[caip2];
  if (slip44 === undefined) throw new Error(`No SLIP-44 coin type for chain: ${caip2}`);
  return formatCaip19(caip2, 'slip44', String(slip44));
}

/**
 * Generate CAIP-19 asset type URI for a fungible token.
 *
 * - EVM tokens use `erc20` namespace with lowercased address (EIP-55 normalization)
 * - Solana tokens use `token` namespace with original base58 address (NEVER lowercase!)
 *
 * @example tokenAssetId('ethereum-mainnet', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')
 *          => 'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
 * @example tokenAssetId('mainnet', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')
 *          => 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
 */
export function tokenAssetId(network: NetworkType, address: string): string {
  const caip2 = networkToCaip2(network);
  const { namespace } = parseCaip2(caip2);

  if (namespace === 'eip155') {
    return formatCaip19(caip2, 'erc20', address.toLowerCase());
  }
  if (namespace === 'solana') {
    return formatCaip19(caip2, 'token', address);
  }

  throw new Error(`Unsupported chain namespace for token asset: ${namespace}`);
}

/**
 * Check if a CAIP-19 asset type URI refers to a native asset (slip44 namespace).
 */
export function isNativeAsset(caip19: string): boolean {
  return parseCaip19(caip19).assetNamespace === 'slip44';
}
