/**
 * Zod SSoT schemas for Polymarket CTF on-chain action inputs.
 *
 * @see design doc 80, Section 7.2
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// CTF Action Input Schemas
// ---------------------------------------------------------------------------

/** Redeem winning tokens after market resolution. */
export const PmRedeemSchema = z.object({
  /** Gnosis condition ID (bytes32 hex). */
  conditionId: z.string().min(1).describe('Gnosis condition ID (bytes32 hex)'),
  /** Index sets for CTF outcome slots. Default [1, 2] for binary markets. */
  indexSets: z.array(z.number().int().positive()).default([1, 2]).describe('Index sets for CTF outcome slots'),
  /** Whether this is a Neg Risk (multi-outcome) market. */
  isNegRisk: z.boolean().default(false),
});

export type PmRedeemInput = z.infer<typeof PmRedeemSchema>;

/** Split USDC collateral into outcome token sets. */
export const PmSplitSchema = z.object({
  /** Gnosis condition ID (bytes32 hex). */
  conditionId: z.string().min(1).describe('Gnosis condition ID (bytes32 hex)'),
  /** USDC.e amount to split (human readable, e.g., "10.5"). */
  amount: z.string().min(1).describe('USDC.e amount to split (human readable, e.g., "10.5")'),
  /** Partition array defining outcome slots. Default [1, 2]. */
  partition: z.array(z.number().int().positive()).default([1, 2]),
});

export type PmSplitInput = z.infer<typeof PmSplitSchema>;

/** Merge outcome token sets back to USDC collateral. */
export const PmMergeSchema = z.object({
  /** Gnosis condition ID (bytes32 hex). */
  conditionId: z.string().min(1).describe('Gnosis condition ID (bytes32 hex)'),
  /** Token amount to merge back (human readable). */
  amount: z.string().min(1).describe('Token amount to merge back (human readable)'),
  /** Partition array defining outcome slots. Default [1, 2]. */
  partition: z.array(z.number().int().positive()).default([1, 2]),
});

export type PmMergeInput = z.infer<typeof PmMergeSchema>;

/** Approve USDC.e spending for CTF Exchange. */
export const PmApproveCollateralSchema = z.object({
  /** Whether to approve for Neg Risk CTF Exchange. */
  isNegRisk: z.boolean().default(false),
  /** USDC amount to approve. Default: MaxUint256 (unlimited). */
  amount: z.string().optional().describe('USDC amount, default MaxUint256'),
});

export type PmApproveCollateralInput = z.infer<typeof PmApproveCollateralSchema>;

/** Approve CTF tokens (ERC-1155) for Exchange contract. */
export const PmApproveCtfSchema = z.object({
  /** Whether to approve for Neg Risk CTF Exchange. */
  isNegRisk: z.boolean().default(false),
});

export type PmApproveCtfInput = z.infer<typeof PmApproveCtfSchema>;
