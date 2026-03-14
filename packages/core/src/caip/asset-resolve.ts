/**
 * CAIP-19 asset ID parsing and network extraction utilities.
 *
 * parseAssetId: parses a CAIP-19 asset type string and resolves the WAIaaS network.
 * extractNetworkFromAssetId: convenience wrapper that returns only the network.
 *
 * @see standards.chainagnostic.org/CAIPs/caip-19
 */
import type { NetworkType } from '../enums/chain.js';
import { parseCaip19 } from './caip19.js';
import { caip2ToNetwork } from './network-map.js';

export interface ParsedAssetId {
  /** CAIP-2 chain identifier (e.g., "eip155:1") */
  chainId: string;
  /** Asset namespace (e.g., "erc20", "token", "slip44") */
  namespace: string;
  /** Token address, or null for native assets (slip44) */
  address: string | null;
  /** Resolved WAIaaS network type */
  network: NetworkType;
  /** True if this is a native asset (slip44 namespace) */
  isNative: boolean;
}

/**
 * Parse a CAIP-19 asset type string into its components with WAIaaS network resolution.
 *
 * - slip44 namespace => isNative=true, address=null
 * - erc20/token namespace => isNative=false, address=assetReference
 *
 * @throws {Error} if CAIP-19 format is invalid
 * @throws {Error} if CAIP-2 chain ID is not in the network mapping
 */
export function parseAssetId(assetId: string): ParsedAssetId {
  const parsed = parseCaip19(assetId);
  const { network } = caip2ToNetwork(parsed.chainId);

  const isNative = parsed.assetNamespace === 'slip44';

  return {
    chainId: parsed.chainId,
    namespace: parsed.assetNamespace,
    address: isNative ? null : parsed.assetReference,
    network,
    isNative,
  };
}

/**
 * Extract the WAIaaS network type from a CAIP-19 asset type string.
 * Convenience wrapper around parseAssetId.
 *
 * @throws {Error} if CAIP-19 format is invalid or CAIP-2 chain ID is unknown
 */
export function extractNetworkFromAssetId(assetId: string): NetworkType {
  return parseAssetId(assetId).network;
}
