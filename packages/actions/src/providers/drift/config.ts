/**
 * Drift Protocol V2 configuration type, defaults, and program addresses.
 *
 * Supports: Solana mainnet (Drift V2 Perpetual Futures).
 * Program ID verified from Drift Protocol documentation.
 */

// ---------------------------------------------------------------------------
// Config type
// ---------------------------------------------------------------------------

export interface DriftConfig {
  enabled: boolean;
  /** Sub-account index (default 0, DEC-PERP-15). */
  subAccount: number;
  /** Solana RPC URL for SDK calls. */
  rpcUrl?: string;
}

// ---------------------------------------------------------------------------
// Program constants
// ---------------------------------------------------------------------------

/** Drift Protocol V2 program ID on Solana mainnet. */
export const DRIFT_PROGRAM_ID = 'dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH';

// ---------------------------------------------------------------------------
// Defaults (disabled)
// ---------------------------------------------------------------------------

export const DRIFT_DEFAULTS: DriftConfig = {
  enabled: false,
  subAccount: 0,
};
