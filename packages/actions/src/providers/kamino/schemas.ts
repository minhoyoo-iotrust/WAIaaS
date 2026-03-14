/**
 * Zod SSoT input schemas for Kamino K-Lend lending actions.
 *
 * Four schemas for the 4 lending actions: supply, borrow, repay, withdraw.
 * Amount is in smallest units (e.g., lamports for SOL tokens).
 * Legacy decimal input is auto-converted with deprecation warning via migrateAmount().
 * Repay and withdraw accept 'max' for full repayment/withdrawal.
 *
 * Phase 405: humanAmount alternative -- human-readable amount with decimals field.
 */
import { z } from 'zod';

/** Shared humanAmount + decimals fields for all Kamino actions. */
const humanAmountFields = {
  humanAmount: z.string().min(1).optional()
    .describe('Human-readable amount (e.g., "100" for 100 USDC). Requires decimals field. Mutually exclusive with amount.'),
  decimals: z.number().int().min(0).max(24).optional()
    .describe('Token decimals for humanAmount conversion. Required when using humanAmount.'),
} as const;

// ---------------------------------------------------------------------------
// Supply input schema
// ---------------------------------------------------------------------------

export const KaminoSupplyInputSchema = z.object({
  /** SPL token mint address to supply as collateral. */
  asset: z.string().min(1, 'token mint address is required'),
  /** Amount in smallest units (e.g., lamports for SOL tokens). Example: "1000000" = 1.0 USDC. Legacy decimal input (e.g., "100.5") is auto-converted with deprecation warning. */
  amount: z.string().min(1, 'amount is required').describe('Amount in smallest units (e.g., lamports for SOL tokens). Example: "1000000" = 1.0 USDC. Legacy decimal input (e.g., "100.5") is auto-converted with deprecation warning.').optional(),
  ...humanAmountFields,
  /** Market pubkey (defaults to config market). */
  market: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Borrow input schema
// ---------------------------------------------------------------------------

export const KaminoBorrowInputSchema = z.object({
  /** SPL token mint address to borrow. */
  asset: z.string().min(1, 'token mint address is required'),
  /** Amount in smallest units (e.g., lamports for SOL tokens). Example: "1000000" = 1.0 USDC. Legacy decimal input (e.g., "100.5") is auto-converted with deprecation warning. */
  amount: z.string().min(1, 'amount is required').describe('Amount in smallest units (e.g., lamports for SOL tokens). Example: "1000000" = 1.0 USDC. Legacy decimal input (e.g., "100.5") is auto-converted with deprecation warning.').optional(),
  ...humanAmountFields,
  /** Market pubkey (defaults to config market). */
  market: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Repay input schema (supports 'max' for full repayment)
// ---------------------------------------------------------------------------

export const KaminoRepayInputSchema = z.object({
  /** SPL token mint address to repay. */
  asset: z.string().min(1, 'token mint address is required'),
  /** Amount in smallest units or 'max' for full repayment. Example: "1000000" = 1.0 USDC. Legacy decimal input (e.g., "100.5") is auto-converted with deprecation warning. */
  amount: z.string().min(1, 'amount is required').describe('Amount in smallest units (e.g., lamports for SOL tokens). Example: "1000000" = 1.0 USDC. Legacy decimal input (e.g., "100.5") is auto-converted with deprecation warning. Use "max" for full repay.').or(z.literal('max')).optional(),
  ...humanAmountFields,
  /** Market pubkey (defaults to config market). */
  market: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Withdraw input schema (supports 'max' for full withdrawal)
// ---------------------------------------------------------------------------

export const KaminoWithdrawInputSchema = z.object({
  /** SPL token mint address to withdraw. */
  asset: z.string().min(1, 'token mint address is required'),
  /** Amount in smallest units or 'max' for full withdrawal. Example: "1000000" = 1.0 USDC. Legacy decimal input (e.g., "100.5") is auto-converted with deprecation warning. */
  amount: z.string().min(1, 'amount is required').describe('Amount in smallest units (e.g., lamports for SOL tokens). Example: "1000000" = 1.0 USDC. Legacy decimal input (e.g., "100.5") is auto-converted with deprecation warning. Use "max" for full withdraw.').or(z.literal('max')).optional(),
  ...humanAmountFields,
  /** Market pubkey (defaults to config market). */
  market: z.string().optional(),
});
