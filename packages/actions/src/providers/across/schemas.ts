/**
 * Zod schemas for Across Protocol API responses.
 * Runtime validation to detect API drift early.
 *
 * Endpoints:
 * - /suggested-fees  -> AcrossSuggestedFeesResponseSchema
 * - /limits          -> AcrossLimitsResponseSchema
 * - /available-routes -> AcrossAvailableRoutesResponseSchema
 * - /deposit/status  -> AcrossDepositStatusResponseSchema
 * - /swap/approval   -> AcrossSwapApprovalResponseSchema
 *
 * See: design doc 79 section 3
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Fee component (shared sub-schema)
// ---------------------------------------------------------------------------

const AcrossFeeComponentSchema = z.object({
  pct: z.string(),     // fee percentage in 18-decimal wei format
  total: z.string(),   // absolute fee in input token smallest units
}).passthrough();

// ---------------------------------------------------------------------------
// GET /suggested-fees (ACROSS-01)
// ---------------------------------------------------------------------------

export const AcrossSuggestedFeesResponseSchema = z.object({
  totalRelayFee: AcrossFeeComponentSchema,
  relayerCapitalFee: AcrossFeeComponentSchema,
  relayerGasFee: AcrossFeeComponentSchema,
  lpFee: AcrossFeeComponentSchema,
  timestamp: z.coerce.number(),            // quoteTimestamp (uint32 seconds) — API may return string
  isAmountTooLow: z.boolean(),
  quoteBlock: z.string().optional(),
  exclusiveRelayer: z.string(),           // address, 0x0 if open
  exclusivityDeadline: z.coerce.number(), // uint32 seconds, 0 if no exclusivity — API may return string
  expectedFillTimeSec: z.coerce.number().optional(),
  limits: z.object({
    minDeposit: z.string(),
    maxDeposit: z.string(),
    maxDepositInstant: z.string(),
    maxDepositShortDelay: z.string(),
  }).passthrough(),
}).passthrough();

export type AcrossSuggestedFeesResponse = z.infer<typeof AcrossSuggestedFeesResponseSchema>;

// ---------------------------------------------------------------------------
// GET /limits (ACROSS-02)
// ---------------------------------------------------------------------------

export const AcrossLimitsResponseSchema = z.object({
  minDeposit: z.string(),
  maxDeposit: z.string(),
  maxDepositInstant: z.string(),
  maxDepositShortDelay: z.string(),
}).passthrough();

export type AcrossLimitsResponse = z.infer<typeof AcrossLimitsResponseSchema>;

// ---------------------------------------------------------------------------
// GET /available-routes (ACROSS-03)
// ---------------------------------------------------------------------------

const AcrossRouteSchema = z.object({
  originChainId: z.number(),
  destinationChainId: z.number(),
  originToken: z.string(),
  destinationToken: z.string(),
  originTokenSymbol: z.string().optional(),
  destinationTokenSymbol: z.string().optional(),
  isNative: z.boolean().optional(),
}).passthrough();

export const AcrossAvailableRoutesResponseSchema = z.array(AcrossRouteSchema);

export type AcrossRoute = z.infer<typeof AcrossRouteSchema>;
export type AcrossAvailableRoutesResponse = z.infer<typeof AcrossAvailableRoutesResponseSchema>;

// ---------------------------------------------------------------------------
// GET /deposit/status (ACROSS-04)
// ---------------------------------------------------------------------------

export const AcrossDepositStatusResponseSchema = z.object({
  status: z.enum(['filled', 'pending', 'expired', 'refunded']),
  fillTx: z.string().optional(),
  fillTxHash: z.string().optional(),
  depositTxHash: z.string().optional(),
  depositId: z.coerce.number().optional(),
  destinationChainId: z.number().optional(),
  updatedAt: z.string().optional(),
}).passthrough();

export type AcrossDepositStatusResponse = z.infer<typeof AcrossDepositStatusResponseSchema>;

// ---------------------------------------------------------------------------
// GET /swap/approval (ACROSS-05)
// ---------------------------------------------------------------------------

const AcrossTransactionSchema = z.object({
  to: z.string(),
  data: z.string(),
  value: z.string().optional(),
  gasLimit: z.string().optional(),
}).passthrough();

export const AcrossSwapApprovalResponseSchema = z.object({
  approvalTxns: z.array(AcrossTransactionSchema).optional(),
  swapTx: AcrossTransactionSchema,
  inputAmount: z.string().optional(),
  expectedOutputAmount: z.string().optional(),
  minOutputAmount: z.string().optional(),
  expectedFillTimeSec: z.number().optional(),
}).passthrough();

export type AcrossSwapApprovalResponse = z.infer<typeof AcrossSwapApprovalResponseSchema>;
