/**
 * Jito Staking configuration type, defaults, and address maps.
 *
 * Supports Solana mainnet only (Jito has no official devnet/testnet deployment).
 * See: https://www.jito.network/
 */

export interface JitoStakingConfig {
  enabled: boolean;
  stakePoolAddress: string;    // Jito SPL Stake Pool
  jitosolMint: string;         // JitoSOL token mint
  stakePoolProgram: string;    // SPL Stake Pool program ID
  rpcUrl?: string;             // Solana RPC URL for position queries
}

// ---------------------------------------------------------------------------
// Mainnet addresses (Solana)
// ---------------------------------------------------------------------------

export const JITO_MAINNET_ADDRESSES = {
  stakePoolAddress: 'Jito4APyf642JPZPx3hGc6WWJ8zPKtRbRs4P815Awbb',
  jitosolMint: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn',
  stakePoolProgram: 'SPoo1Ku8WFXoNDMHPsrGSTSG1Y47rzgn41SLUNakuHy',
} as const;

// ---------------------------------------------------------------------------
// Well-known PDA and program addresses
// ---------------------------------------------------------------------------

/** Stake Pool withdraw authority (PDA derived from stake pool address). */
export const JITO_WITHDRAW_AUTHORITY = '6iQKfEyhr3bZMotVkW6beNZz5CPAkiwvgV2CTje9pVSS';

/**
 * @deprecated No longer used at runtime. The reserve_stake account is now read
 * dynamically from the on-chain stake pool data (offset 130) via getStakePoolAccounts().
 * Kept for historical reference only.
 */
export const JITO_RESERVE_STAKE = 'BgKUXdS29YcHCFrPm5M8oLHiTzZaMDjsebggjoaQ6KFL';

/**
 * @deprecated No longer used at runtime. The manager_fee_account is now read
 * dynamically from the on-chain stake pool data (offset 194) via getStakePoolAccounts().
 * The hardcoded value was causing "Invalid manager fee account" errors when the
 * on-chain account changed. Kept for historical reference only.
 */
export const JITO_MANAGER_FEE = 'B1aLzaNMeFVAyQ6f3XbbUyKcH2YPHu2fqiEagmiF23VR';

/** SPL Token Program. */
export const SPL_TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

/** System Program. */
export const SYSTEM_PROGRAM = '11111111111111111111111111111111';

// ---------------------------------------------------------------------------
// Minimum deposit amount
// ---------------------------------------------------------------------------

/** Minimum Jito stake deposit in lamports (0.05 SOL = 50,000,000 lamports). */
export const JITO_MIN_DEPOSIT_LAMPORTS = 50_000_000n;

/** Minimum Jito stake deposit in SOL (human-readable). */
export const JITO_MIN_DEPOSIT_SOL = '0.05';

// ---------------------------------------------------------------------------
// Defaults (disabled, mainnet addresses)
// ---------------------------------------------------------------------------

export const JITO_STAKING_DEFAULTS: JitoStakingConfig = {
  enabled: false,
  ...JITO_MAINNET_ADDRESSES,
};

// ---------------------------------------------------------------------------
// Helper to select addresses by environment
// ---------------------------------------------------------------------------

/**
 * Get Jito addresses for a given environment type.
 *
 * Jito Stake Pool is mainnet-only. Testnet falls back to mainnet addresses.
 *
 * @param environment - 'mainnet' or 'testnet'
 */
export function getJitoAddresses(
  environment: 'mainnet' | 'testnet',
): { stakePoolAddress: string; jitosolMint: string; stakePoolProgram: string } {
  // Jito Stake Pool is mainnet-only. Testnet falls back to mainnet addresses.
  void environment;
  return { ...JITO_MAINNET_ADDRESSES };
}
