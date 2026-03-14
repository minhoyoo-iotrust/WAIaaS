/**
 * CAIP response enrichment utilities.
 *
 * Each function takes an existing response object and returns a new object
 * with chainId (CAIP-2) and/or assetId (CAIP-19) fields added.
 *
 * All functions are:
 * - Additive only: original fields are spread and never removed
 * - Graceful: unknown networks produce no chainId/assetId (no errors thrown)
 *
 * @see Phase 409-01 -- response enrichment utility functions
 */

import type { NetworkType } from '../enums/chain.js';
import { networkToCaip2 } from './network-map.js';
import { nativeAssetId, tokenAssetId, nftAssetId } from './asset-helpers.js';

// ── Helpers ──────────────────────────────────────────────────────────

/** Safely get CAIP-2 chain ID from network string. Returns undefined on failure. */
function safeChainId(network: string): string | undefined {
  try {
    return networkToCaip2(network as NetworkType);
  } catch {
    return undefined;
  }
}

/** Safely get native CAIP-19 asset ID. Returns undefined on failure. */
function safeNativeAssetId(network: string): string | undefined {
  try {
    return nativeAssetId(network as NetworkType);
  } catch {
    return undefined;
  }
}

/** Safely get token CAIP-19 asset ID. Returns undefined on failure. */
function safeTokenAssetId(network: string, address: string): string | undefined {
  try {
    return tokenAssetId(network as NetworkType, address);
  } catch {
    return undefined;
  }
}

// ── Enrichment functions ─────────────────────────────────────────────

/**
 * Enrich a balance response with chainId and native assetId.
 */
export function enrichBalance<T extends Record<string, unknown>>(
  obj: T & { network: string },
): T & { chainId?: string; assetId?: string } {
  const chainId = safeChainId(obj.network);
  const assetId = safeNativeAssetId(obj.network);
  return {
    ...obj,
    ...(chainId ? { chainId } : {}),
    ...(assetId ? { assetId } : {}),
  };
}

/**
 * Enrich an asset response with chainId and assetId.
 * - isNative=true -> slip44 namespace
 * - isNative=false -> erc20 (EVM) or token (Solana) namespace
 */
export function enrichAsset<T extends Record<string, unknown>>(
  obj: T & { network: string; mint: string; isNative: boolean },
): T & { chainId?: string; assetId?: string } {
  const chainId = safeChainId(obj.network);
  let assetId: string | undefined;

  if (obj.isNative) {
    assetId = safeNativeAssetId(obj.network);
  } else {
    assetId = safeTokenAssetId(obj.network, obj.mint);
  }

  return {
    ...obj,
    ...(chainId ? { chainId } : {}),
    ...(assetId ? { assetId } : {}),
  };
}

/**
 * Enrich an NFT response with chainId and assetId.
 * Only generates assetId for known standards (erc721, erc1155, metaplex).
 */
export function enrichNft<T extends Record<string, unknown>>(
  obj: T & { network: string; contractAddress: string; tokenId: string; standard: string },
): T & { chainId?: string; assetId?: string } {
  const chainId = safeChainId(obj.network);
  let assetId: string | undefined;

  const validStandards = new Set(['erc721', 'erc1155', 'metaplex']);
  if (validStandards.has(obj.standard)) {
    try {
      assetId = nftAssetId(
        obj.network as NetworkType,
        obj.contractAddress,
        obj.tokenId,
        obj.standard as 'erc721' | 'erc1155' | 'metaplex',
      );
    } catch {
      // graceful skip
    }
  }

  return {
    ...obj,
    ...(chainId ? { chainId } : {}),
    ...(assetId ? { assetId } : {}),
  };
}

/**
 * Enrich a transaction response with chainId.
 * Only adds chainId when network is present and non-null.
 */
export function enrichTransaction<T extends Record<string, unknown>>(
  obj: T & { network?: string | null },
): T & { chainId?: string } {
  if (!obj.network) {
    return { ...obj };
  }
  const chainId = safeChainId(obj.network);
  return {
    ...obj,
    ...(chainId ? { chainId } : {}),
  };
}

/**
 * Enrich an incoming transaction response with chainId and assetId.
 * - tokenAddress null/undefined -> native assetId
 * - tokenAddress present -> token assetId (erc20/token namespace)
 */
export function enrichIncomingTx<T extends Record<string, unknown>>(
  obj: T & { network: string; chain: string; tokenAddress?: string | null },
): T & { chainId?: string; assetId?: string } {
  const chainId = safeChainId(obj.network);
  let assetId: string | undefined;

  if (obj.tokenAddress) {
    assetId = safeTokenAssetId(obj.network, obj.tokenAddress);
  } else {
    assetId = safeNativeAssetId(obj.network);
  }

  return {
    ...obj,
    ...(chainId ? { chainId } : {}),
    ...(assetId ? { assetId } : {}),
  };
}
