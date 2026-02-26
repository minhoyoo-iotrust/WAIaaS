/**
 * Zod SSoT input schemas for Aave V3 lending actions.
 *
 * Four schemas for the 4 lending actions: supply, borrow, repay, withdraw.
 * Amount is always a human-readable string (e.g., "100.5").
 * Repay and withdraw accept 'max' for full repayment/withdrawal.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Supply input schema
// ---------------------------------------------------------------------------

export const AaveSupplyInputSchema = z.object({
  /** ERC-20 token address to supply as collateral. */
  asset: z.string().min(1, 'asset address is required'),
  /** Amount to supply (human-readable, e.g., "100.5"). */
  amount: z.string().min(1, 'amount is required (human-readable, e.g. "100.5")'),
  /** Target network (defaults to ethereum-mainnet). */
  network: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Borrow input schema
// ---------------------------------------------------------------------------

export const AaveBorrowInputSchema = z.object({
  /** ERC-20 token address to borrow. */
  asset: z.string().min(1, 'asset address is required'),
  /** Amount to borrow (human-readable, e.g., "100.5"). */
  amount: z.string().min(1, 'amount is required (human-readable, e.g. "100.5")'),
  /** Target network (defaults to ethereum-mainnet). */
  network: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Repay input schema (supports 'max' for full repayment)
// ---------------------------------------------------------------------------

export const AaveRepayInputSchema = z.object({
  /** ERC-20 token address to repay. */
  asset: z.string().min(1, 'asset address is required'),
  /** Amount to repay (human-readable, e.g., "100.5") or 'max' for full repayment. */
  amount: z.string().min(1, 'amount is required (human-readable, e.g. "100.5")').or(z.literal('max')),
  /** Target network (defaults to ethereum-mainnet). */
  network: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Withdraw input schema (supports 'max' for full withdrawal)
// ---------------------------------------------------------------------------

export const AaveWithdrawInputSchema = z.object({
  /** ERC-20 token address to withdraw. */
  asset: z.string().min(1, 'asset address is required'),
  /** Amount to withdraw (human-readable, e.g., "100.5") or 'max' for full withdrawal. */
  amount: z.string().min(1, 'amount is required (human-readable, e.g. "100.5")').or(z.literal('max')),
  /** Target network (defaults to ethereum-mainnet). */
  network: z.string().optional(),
});
