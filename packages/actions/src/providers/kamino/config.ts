/**
 * Kamino K-Lend configuration type, defaults, and program addresses.
 *
 * Supports: Solana mainnet (Kamino K-Lend V2).
 * Main market address verified from Kamino Finance documentation.
 */

// ---------------------------------------------------------------------------
// Config type
// ---------------------------------------------------------------------------

export interface KaminoConfig {
  enabled: boolean;
  /** Market identifier: 'main' or a custom market pubkey. */
  market: string;
  /** Health factor warning threshold. Default 1.2. */
  hfThreshold: number;
  /** Solana RPC URL for SDK calls. */
  rpcUrl?: string;
}

// ---------------------------------------------------------------------------
// Program constants
// ---------------------------------------------------------------------------

/** Kamino K-Lend V2 program ID on Solana mainnet. */
export const KAMINO_PROGRAM_ID = 'KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD';

/** Kamino main lending market pubkey (Solana mainnet). */
export const KAMINO_MAIN_MARKET = '7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF';

// ---------------------------------------------------------------------------
// Defaults (disabled)
// ---------------------------------------------------------------------------

export const KAMINO_DEFAULTS: KaminoConfig = {
  enabled: false,
  market: 'main',
  hfThreshold: 1.2,
};

// ---------------------------------------------------------------------------
// Helper to resolve market address
// ---------------------------------------------------------------------------

/**
 * Resolve market identifier to an actual pubkey.
 *
 * @param market - 'main' or a custom market pubkey string
 * @returns The market address string
 */
export function resolveMarketAddress(market: string): string {
  return market === 'main' ? KAMINO_MAIN_MARKET : market;
}
