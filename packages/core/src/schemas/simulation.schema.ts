/**
 * DryRunSimulationResult Zod SSoT schema.
 *
 * Defines the response structure for transaction dry-run simulation.
 * Used by POST /v1/transactions/simulate REST API.
 *
 * Derivation: Zod -> TypeScript types -> OpenAPI (per CLAUDE.md SSoT principle).
 *
 * @see Phase 304 DESIGN-SPEC.md section 2 (SIM-01)
 * @see Phase 309 Plan 01
 */

import { z } from 'zod';
import { PolicyTierEnum } from '../enums/policy.js';
import { ChainTypeEnum, NetworkTypeEnum } from '../enums/chain.js';

// ---------------------------------------------------------------------------
// Warning codes (12 codes per design spec section 2.2)
// ---------------------------------------------------------------------------

export const SimulationWarningCodeEnum = z.enum([
  'INSUFFICIENT_BALANCE',
  'INSUFFICIENT_BALANCE_WITH_FEE',
  'ORACLE_PRICE_UNAVAILABLE',
  'SIMULATION_FAILED',
  'HIGH_FEE_RATIO',
  'APPROVAL_REQUIRED',
  'DELAY_REQUIRED',
  'CUMULATIVE_LIMIT_WARNING',
  'TOKEN_NOT_IN_ALLOWED_LIST',
  'CONTRACT_NOT_WHITELISTED',
  'NETWORK_NOT_ALLOWED',
  'DOWNGRADED_NO_OWNER',
  'GAS_CONDITION_NOT_MET',
  'GAS_CONDITION_DISABLED',
]);

// ---------------------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------------------

/** Policy evaluation result from dry-run. */
export const PolicyResultSchema = z.object({
  tier: PolicyTierEnum,
  allowed: z.boolean(),
  reason: z.string().optional(),
  delaySeconds: z.number().optional(),
  approvalReason: z.string().optional(),
  downgraded: z.boolean().optional(),
  cumulativeWarning: z
    .object({
      type: z.enum(['daily', 'monthly']),
      ratio: z.number(),
      spent: z.number(),
      limit: z.number(),
    })
    .optional(),
});

/** Estimated fee result (null when simulation/build fails). */
export const FeeEstimateResultSchema = z.object({
  estimatedFee: z.string(),
  feeSymbol: z.string(),
  feeDecimals: z.number(),
  feeUsd: z.number().nullable(),
  needsAtaCreation: z.boolean().optional(),
  ataRentCost: z.string().optional(),
});

/** Predicted balance change for a single asset. */
export const BalanceChangeSchema = z.object({
  asset: z.string(),
  symbol: z.string(),
  decimals: z.number(),
  currentBalance: z.string(),
  changeAmount: z.string(),
  afterBalance: z.string(),
});

/** Warning entry with machine code and human message. */
export const SimulationWarningSchema = z.object({
  code: SimulationWarningCodeEnum,
  message: z.string(),
  severity: z.enum(['info', 'warning', 'error']),
});

/** On-chain simulation detail (wraps IChainAdapter SimulationResult). */
export const SimulationDetailSchema = z.object({
  success: z.boolean(),
  logs: z.array(z.string()),
  unitsConsumed: z.string().nullable(),
  error: z.string().nullable(),
});

/** Request metadata for the simulation. */
export const SimulationMetaSchema = z.object({
  chain: ChainTypeEnum,
  network: NetworkTypeEnum,
  transactionType: z.string(),
  durationMs: z.number(),
});

// ---------------------------------------------------------------------------
// Top-level schema
// ---------------------------------------------------------------------------

/** Gas condition evaluation result (present only when gasCondition was specified in request). */
export const GasConditionResultSchema = z.object({
  met: z.boolean(),
  currentGasPrice: z.string(),
  currentPriorityFee: z.string().optional(),
  maxGasPrice: z.string().optional(),
  maxPriorityFee: z.string().optional(),
});

/** Complete dry-run simulation result (Zod SSoT). */
export const DryRunSimulationResultSchema = z.object({
  success: z.boolean(),
  policy: PolicyResultSchema,
  fee: FeeEstimateResultSchema.nullable(),
  balanceChanges: z.array(BalanceChangeSchema),
  warnings: z.array(SimulationWarningSchema),
  simulation: SimulationDetailSchema,
  meta: SimulationMetaSchema,
  gasCondition: GasConditionResultSchema.optional(),
});

// ---------------------------------------------------------------------------
// Inferred TypeScript types
// ---------------------------------------------------------------------------

export type SimulationWarningCode = z.infer<typeof SimulationWarningCodeEnum>;
export type PolicyResult = z.infer<typeof PolicyResultSchema>;
export type FeeEstimateResult = z.infer<typeof FeeEstimateResultSchema>;
export type BalanceChange = z.infer<typeof BalanceChangeSchema>;
export type SimulationWarning = z.infer<typeof SimulationWarningSchema>;
export type SimulationDetail = z.infer<typeof SimulationDetailSchema>;
export type SimulationMeta = z.infer<typeof SimulationMetaSchema>;
export type GasConditionResult = z.infer<typeof GasConditionResultSchema>;
export type DryRunSimulationResult = z.infer<typeof DryRunSimulationResultSchema>;
