/**
 * Zod SSoT input schemas for Kamino K-Lend lending actions.
 *
 * Four schemas for the 4 lending actions: supply, borrow, repay, withdraw.
 * Amount is always a human-readable string (e.g., "100.5").
 * Repay and withdraw accept 'max' for full repayment/withdrawal.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Supply input schema
// ---------------------------------------------------------------------------

export const KaminoSupplyInputSchema = z.object({
  /** SPL token mint address to supply as collateral. */
  asset: z.string().min(1, 'token mint address is required'),
  /** Amount to supply (human-readable, e.g., "100.5"). */
  amount: z.string().min(1, 'amount is required (e.g. "100.5")'),
  /** Market pubkey (defaults to config market). */
  market: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Borrow input schema
// ---------------------------------------------------------------------------

export const KaminoBorrowInputSchema = z.object({
  /** SPL token mint address to borrow. */
  asset: z.string().min(1, 'token mint address is required'),
  /** Amount to borrow (human-readable, e.g., "100.5"). */
  amount: z.string().min(1, 'amount is required (e.g. "100.5")'),
  /** Market pubkey (defaults to config market). */
  market: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Repay input schema (supports 'max' for full repayment)
// ---------------------------------------------------------------------------

export const KaminoRepayInputSchema = z.object({
  /** SPL token mint address to repay. */
  asset: z.string().min(1, 'token mint address is required'),
  /** Amount to repay (human-readable, e.g., "100.5") or 'max' for full repayment. */
  amount: z.string().min(1, 'amount is required').or(z.literal('max')),
  /** Market pubkey (defaults to config market). */
  market: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Withdraw input schema (supports 'max' for full withdrawal)
// ---------------------------------------------------------------------------

export const KaminoWithdrawInputSchema = z.object({
  /** SPL token mint address to withdraw. */
  asset: z.string().min(1, 'token mint address is required'),
  /** Amount to withdraw (human-readable, e.g., "100.5") or 'max' for full withdrawal. */
  amount: z.string().min(1, 'amount is required').or(z.literal('max')),
  /** Market pubkey (defaults to config market). */
  market: z.string().optional(),
});
