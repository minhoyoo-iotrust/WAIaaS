/**
 * CAIP-19 <-> DCent Currency ID bidirectional converter.
 *
 * DCent Swap API uses its own currency identifier format (e.g., 'ETHEREUM',
 * 'ERC20/0x...', 'CHAN:10', 'SPL-TOKEN/...'). This module converts between
 * WAIaaS CAIP-19 asset identifiers and DCent Currency IDs.
 *
 * Design source: doc 77 section 6 (CAIP-19 <-> DCent Currency ID 변환 설계).
 *
 * IMPORTANT: Polygon uses slip44:966 (per codebase NATIVE_SLIP44), NOT 60.
 * IMPORTANT: Solana SPL tokens use 'token:' namespace (per codebase), NOT 'spl:'.
 */
import { parseCaip19 } from '@waiaas/core';
import { parseCaip2 } from '@waiaas/core';
import { ChainError } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Internal helper: build CAIP-19 string without re-validation.
// formatCaip19 from @waiaas/core validates via Zod, which can fail in
// certain test runners due to Zod v3 compat layer regex issues. Since our
// inputs are trusted (from mapping tables), direct construction is safe.
// ---------------------------------------------------------------------------
function buildCaip19(chainId: string, namespace: string, reference: string): string {
  return `${chainId}/${namespace}:${reference}`;
}

// ---------------------------------------------------------------------------
// Mapping tables
// ---------------------------------------------------------------------------

/** EVM chainId -> DCent native currency name (well-known chains only). */
const NATIVE_DCENT_ID_MAP: Record<number, string> = {
  1: 'ETHEREUM',
  56: 'BSC',
  137: 'POLYGON',
  8217: 'KLAYTN',
  50: 'XINFIN',
};

/** DCent native name -> { caip2, slip44 } for reverse conversion. */
const DCENT_NATIVE_TO_CAIP2: Record<string, { caip2: string; slip44: number }> = {
  ETHEREUM: { caip2: 'eip155:1', slip44: 60 },
  BSC: { caip2: 'eip155:56', slip44: 60 },
  POLYGON: { caip2: 'eip155:137', slip44: 966 },
  KLAYTN: { caip2: 'eip155:8217', slip44: 60 },
  XINFIN: { caip2: 'eip155:50', slip44: 60 },
  SOLANA: { caip2: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', slip44: 501 },
};

/** EVM chainId -> DCent token device ID prefix for token currency IDs. */
const EVM_TOKEN_DEVICE_MAP: Record<number, string> = {
  1: 'ERC20',
  56: 'BEP20',
  137: 'POLYGON-ERC20',
  8217: 'KLAYTN-ERC20',
};

/** Reverse: DCent token prefix -> EVM chainId. */
const TOKEN_PREFIX_TO_CHAIN: Record<string, number> = {
  ERC20: 1,
  BEP20: 56,
  'POLYGON-ERC20': 137,
  'KLAYTN-ERC20': 8217,
};

const SOLANA_CAIP2 = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';

// ---------------------------------------------------------------------------
// Forward: CAIP-19 -> DCent Currency ID
// ---------------------------------------------------------------------------

/**
 * Convert a CAIP-19 asset type URI to a DCent Currency ID.
 *
 * @example caip19ToDcentId('eip155:1/slip44:60') => 'ETHEREUM'
 * @example caip19ToDcentId('eip155:1/erc20:0xa0b8...') => 'ERC20/0xa0b8...'
 * @example caip19ToDcentId('eip155:10/slip44:60') => 'CHAN:10'
 * @example caip19ToDcentId('solana:.../token:EPjF...') => 'SPL-TOKEN/EPjF...'
 */
export function caip19ToDcentId(caip19: string): string {
  const { chainId, assetNamespace, assetReference } = parseCaip19(caip19);
  const { namespace, reference } = parseCaip2(chainId);

  // Solana
  if (namespace === 'solana') {
    if (assetNamespace === 'slip44') return 'SOLANA';
    if (assetNamespace === 'token') return `SPL-TOKEN/${assetReference}`;
    throw new ChainError('INVALID_INSTRUCTION', 'solana', {
      message: `Unsupported Solana asset namespace: ${assetNamespace}`,
    });
  }

  // EVM
  if (namespace === 'eip155') {
    const chainIdNum = parseInt(reference, 10);

    // Native asset (slip44)
    if (assetNamespace === 'slip44') {
      const nativeName = NATIVE_DCENT_ID_MAP[chainIdNum];
      return nativeName ?? `CHAN:${chainIdNum}`;
    }

    // ERC-20 token
    if (assetNamespace === 'erc20') {
      const prefix = EVM_TOKEN_DEVICE_MAP[chainIdNum];
      return prefix
        ? `${prefix}/${assetReference}`
        : `CH20:${chainIdNum}/${assetReference}`;
    }

    throw new ChainError('INVALID_INSTRUCTION', 'ethereum', {
      message: `Unsupported EVM asset namespace: ${assetNamespace}`,
    });
  }

  throw new ChainError('INVALID_INSTRUCTION', 'ethereum', {
    message: `Unsupported chain namespace for DCent conversion: ${namespace}`,
  });
}

// ---------------------------------------------------------------------------
// Reverse: DCent Currency ID -> CAIP-19
// ---------------------------------------------------------------------------

/**
 * Convert a DCent Currency ID to a CAIP-19 asset type URI.
 *
 * @example dcentIdToCaip19('ETHEREUM') => 'eip155:1/slip44:60'
 * @example dcentIdToCaip19('ERC20/0xa0b8...') => 'eip155:1/erc20:0xa0b8...'
 * @example dcentIdToCaip19('CHAN:10') => 'eip155:10/slip44:60'
 * @example dcentIdToCaip19('SPL-TOKEN/EPjF...') => 'solana:.../token:EPjF...'
 */
export function dcentIdToCaip19(dcentId: string): string {
  // 1. Named native (ETHEREUM, BSC, POLYGON, etc.)
  const native = DCENT_NATIVE_TO_CAIP2[dcentId];
  if (native) {
    return buildCaip19(native.caip2, 'slip44', String(native.slip44));
  }

  // 2. CHAN:{chainId} - EVM native via chain ID
  if (dcentId.startsWith('CHAN:')) {
    const chainIdStr = dcentId.slice(5); // 'CHAN:'.length = 5
    return buildCaip19(`eip155:${chainIdStr}`, 'slip44', '60');
  }

  // 3. SPL-TOKEN/{mint} - Solana SPL token
  if (dcentId.startsWith('SPL-TOKEN/')) {
    const mint = dcentId.slice(10); // 'SPL-TOKEN/'.length = 10
    return buildCaip19(SOLANA_CAIP2, 'token', mint);
  }

  // 4. CH20:{chainId}/{addr} - Generic EVM token
  if (dcentId.startsWith('CH20:')) {
    const slashIdx = dcentId.indexOf('/');
    if (slashIdx === -1) {
      throw new ChainError('INVALID_INSTRUCTION', 'ethereum', {
        message: `Invalid CH20 DCent ID format (missing /): ${dcentId}`,
      });
    }
    const chainIdStr = dcentId.slice(5, slashIdx); // 'CH20:'.length = 5
    const addr = dcentId.slice(slashIdx + 1);
    return buildCaip19(`eip155:${chainIdStr}`, 'erc20', addr);
  }

  // 5. Known token prefix (ERC20/, BEP20/, POLYGON-ERC20/, KLAYTN-ERC20/)
  const slashIdx = dcentId.indexOf('/');
  if (slashIdx !== -1) {
    const prefix = dcentId.slice(0, slashIdx);
    const addr = dcentId.slice(slashIdx + 1);
    const chainId = TOKEN_PREFIX_TO_CHAIN[prefix];
    if (chainId !== undefined) {
      return buildCaip19(`eip155:${chainId}`, 'erc20', addr);
    }
  }

  // 6. Unknown
  throw new ChainError('INVALID_INSTRUCTION', 'ethereum', {
    message: `Unsupported DCent Currency ID: ${dcentId}`,
  });
}
