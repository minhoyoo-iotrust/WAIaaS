/**
 * Zod SSoT input schemas for Aave V3 lending actions.
 *
 * Four schemas for the 4 lending actions: supply, borrow, repay, withdraw.
 * Amount is in smallest units (wei). Legacy decimal input is auto-converted
 * with deprecation warning via migrateAmount().
 * Repay and withdraw accept 'max' for full repayment/withdrawal.
 *
 * Phase 405: humanAmount alternative -- human-readable amount with decimals field.
 */
import { z } from 'zod';

/** Shared humanAmount + decimals fields for all Aave V3 actions. */
const humanAmountFields = {
  humanAmount: z.string().min(1).optional()
    .describe('Human-readable amount (e.g., "100" for 100 USDC). Requires decimals field. Mutually exclusive with amount.'),
  decimals: z.number().int().min(0).max(24).optional()
    .describe('Token decimals for humanAmount conversion. Required when using humanAmount.'),
} as const;

// ---------------------------------------------------------------------------
// Supply input schema
// ---------------------------------------------------------------------------

export const AaveSupplyInputSchema = z.object({
  /** ERC-20 token address to supply as collateral. */
  asset: z.string().min(1, 'asset address is required'),
  /** Amount in smallest units (wei). Example: "1000000000000000000" = 1.0 token. Legacy decimal input (e.g., "1.5") is auto-converted with deprecation warning. */
  amount: z.string().min(1, 'amount is required').describe('Amount in smallest units (wei). Example: "1000000000000000000" = 1.0 token. Legacy decimal input (e.g., "1.5") is auto-converted with deprecation warning.').optional(),
  ...humanAmountFields,
  /** Target network (defaults to ethereum-mainnet). */
  network: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Borrow input schema
// ---------------------------------------------------------------------------

export const AaveBorrowInputSchema = z.object({
  /** ERC-20 token address to borrow. */
  asset: z.string().min(1, 'asset address is required'),
  /** Amount in smallest units (wei). Example: "1000000000000000000" = 1.0 token. Legacy decimal input (e.g., "1.5") is auto-converted with deprecation warning. */
  amount: z.string().min(1, 'amount is required').describe('Amount in smallest units (wei). Example: "1000000000000000000" = 1.0 token. Legacy decimal input (e.g., "1.5") is auto-converted with deprecation warning.').optional(),
  ...humanAmountFields,
  /** Target network (defaults to ethereum-mainnet). */
  network: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Repay input schema (supports 'max' for full repayment)
// ---------------------------------------------------------------------------

export const AaveRepayInputSchema = z.object({
  /** ERC-20 token address to repay. */
  asset: z.string().min(1, 'asset address is required'),
  /** Amount in smallest units (wei) or 'max' for full repayment. Example: "1000000000000000000" = 1.0 token. Legacy decimal input (e.g., "1.5") is auto-converted with deprecation warning. */
  amount: z.string().min(1, 'amount is required').describe('Amount in smallest units (wei). Example: "1000000000000000000" = 1.0 token. Legacy decimal input (e.g., "1.5") is auto-converted with deprecation warning. Use "max" for full repay.').or(z.literal('max')).optional(),
  ...humanAmountFields,
  /** Target network (defaults to ethereum-mainnet). */
  network: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Withdraw input schema (supports 'max' for full withdrawal)
// ---------------------------------------------------------------------------

export const AaveWithdrawInputSchema = z.object({
  /** ERC-20 token address to withdraw. */
  asset: z.string().min(1, 'asset address is required'),
  /** Amount in smallest units (wei) or 'max' for full withdrawal. Example: "1000000000000000000" = 1.0 token. Legacy decimal input (e.g., "1.5") is auto-converted with deprecation warning. */
  amount: z.string().min(1, 'amount is required').describe('Amount in smallest units (wei). Example: "1000000000000000000" = 1.0 token. Legacy decimal input (e.g., "1.5") is auto-converted with deprecation warning. Use "max" for full withdraw.').or(z.literal('max')).optional(),
  ...humanAmountFields,
  /** Target network (defaults to ethereum-mainnet). */
  network: z.string().optional(),
});
