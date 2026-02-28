import { z } from 'zod';
import { TransactionTypeEnum, TransactionStatusEnum } from '../enums/transaction.js';
import { PolicyTierEnum } from '../enums/policy.js';
import { ChainTypeEnum, NetworkTypeEnum, NetworkTypeEnumWithLegacy } from '../enums/chain.js';
import { Caip19Schema, parseCaip19 } from '../caip/index.js';

// ---------------------------------------------------------------------------
// GasCondition schema (v28.5): optional gas price condition for deferred execution
// ---------------------------------------------------------------------------

/** Gas condition for conditional execution. At least one of maxGasPrice or maxPriorityFee required. */
export const GasConditionSchema = z.object({
  /** EVM: baseFee + priorityFee upper bound in wei. */
  maxGasPrice: z.string().regex(/^\d+$/, 'maxGasPrice must be a numeric string (wei)').optional(),
  /** EVM: priorityFee upper bound in wei. Solana: computeUnitPrice upper bound in micro-lamports. */
  maxPriorityFee: z.string().regex(/^\d+$/, 'maxPriorityFee must be a numeric string').optional(),
  /** Maximum wait time in seconds (60-86400). Uses Admin Settings default if omitted. */
  timeout: z.number().int().min(60).max(86400).optional(),
}).refine(
  (data) => data.maxGasPrice !== undefined || data.maxPriorityFee !== undefined,
  { message: 'At least one of maxGasPrice or maxPriorityFee must be specified' },
);
export type GasCondition = z.infer<typeof GasConditionSchema>;

export const TransactionSchema = z.object({
  id: z.string().uuid(),
  walletId: z.string().uuid(),
  sessionId: z.string().uuid().nullable(),
  type: TransactionTypeEnum,
  status: TransactionStatusEnum,
  tier: PolicyTierEnum.nullable(),
  chain: ChainTypeEnum,
  network: NetworkTypeEnum.nullable(),
  fromAddress: z.string(),
  toAddress: z.string(),
  amount: z.string(), // bigint as string for JSON/SQLite
  txHash: z.string().nullable(),
  errorMessage: z.string().nullable(),
  metadata: z.record(z.unknown()).nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Transaction = z.infer<typeof TransactionSchema>;

export const SendTransactionRequestSchema = z.object({
  to: z.string().min(1),
  amount: z.string().regex(/^\d+$/, 'amount must be a numeric string (lamports)'),
  memo: z.string().max(256).optional(),
});
export type SendTransactionRequest = z.infer<typeof SendTransactionRequestSchema>;

// ---------------------------------------------------------------------------
// discriminatedUnion 5-type transaction request schemas (v1.4)
//
// These schemas validate incoming API requests for all 5 transaction types.
// The existing SendTransactionRequestSchema is kept for backward compatibility.
// Stage 1 of the pipeline will switch to TransactionRequestSchema in Phase 81.
// ---------------------------------------------------------------------------

const numericStringPattern = /^\d+$/;

/** Optional gas condition (shared across all 5 request types). */
const gasConditionField = { gasCondition: GasConditionSchema.optional() } as const;

/** Type 1: TRANSFER -- native token transfer (SOL/ETH). */
export const TransferRequestSchema = z.object({
  type: z.literal('TRANSFER'),
  to: z.string().min(1),
  amount: z.string().regex(numericStringPattern, 'amount must be a numeric string (lamports/wei)'),
  memo: z.string().max(256).optional(),
  network: NetworkTypeEnumWithLegacy.optional(),
  ...gasConditionField,
});
export type TransferRequestInput = z.infer<typeof TransferRequestSchema>;

/** Token metadata for TOKEN_TRANSFER and APPROVE requests. */
const TokenInfoBaseSchema = z.object({
  address: z.string().min(1), // mint address (SPL) or contract address (ERC-20)
  decimals: z.number().int().min(0).max(18),
  symbol: z.string().min(1).max(10),
  assetId: Caip19Schema.optional(),
});

/** TokenInfoSchema with cross-validation: when assetId is provided, its address must match the address field. */
const TokenInfoSchema = TokenInfoBaseSchema.superRefine((data, ctx) => {
  if (!data.assetId) return; // No assetId -> skip cross-validation (TXSC-03)

  try {
    const parsed = parseCaip19(data.assetId);
    const extractedAddress = parsed.assetReference;

    // Cross-validate: case-insensitive for EVM (Pitfall 1: checksummed vs lowercased)
    if (extractedAddress.toLowerCase() !== data.address.toLowerCase()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `assetId address '${extractedAddress}' does not match provided address '${data.address}'`,
        path: ['assetId'],
      });
    }
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Invalid CAIP-19 assetId: ${data.assetId}`,
      path: ['assetId'],
    });
  }
});

/** Type 2: TOKEN_TRANSFER -- SPL/ERC-20 token transfer. */
export const TokenTransferRequestSchema = z.object({
  type: z.literal('TOKEN_TRANSFER'),
  to: z.string().min(1),
  amount: z.string().regex(numericStringPattern, 'amount must be a numeric string'),
  token: TokenInfoSchema,
  memo: z.string().max(256).optional(),
  network: NetworkTypeEnumWithLegacy.optional(),
  ...gasConditionField,
});
export type TokenTransferRequest = z.infer<typeof TokenTransferRequestSchema>;

/** Type 3: CONTRACT_CALL -- arbitrary contract invocation. */
export const ContractCallRequestSchema = z.object({
  type: z.literal('CONTRACT_CALL'),
  to: z.string().min(1), // contract address
  // EVM fields
  calldata: z.string().optional(), // hex-encoded calldata
  abi: z.array(z.record(z.unknown())).optional(), // ABI fragment
  value: z.string().regex(numericStringPattern).optional(), // native token value
  // Solana fields
  programId: z.string().optional(),
  instructionData: z.string().optional(), // base64-encoded
  accounts: z
    .array(
      z.object({
        pubkey: z.string(),
        isSigner: z.boolean(),
        isWritable: z.boolean(),
      }),
    )
    .optional(),
  network: NetworkTypeEnumWithLegacy.optional(),
  /** Provider name tag for provider-trust policy bypass. Set by ActionProviderRegistry. */
  actionProvider: z.string().optional(),
  /** Action name for lending policy evaluation. Set by ActionProviderRegistry. */
  actionName: z.string().optional(),
  ...gasConditionField,
});
export type ContractCallRequest = z.infer<typeof ContractCallRequestSchema>;

/** Type 4: APPROVE -- token spending approval (ERC-20 approve / SPL delegate). */
export const ApproveRequestSchema = z.object({
  type: z.literal('APPROVE'),
  spender: z.string().min(1),
  token: TokenInfoSchema,
  amount: z.string().regex(numericStringPattern, 'amount must be a numeric string'),
  network: NetworkTypeEnumWithLegacy.optional(),
  ...gasConditionField,
});
export type ApproveRequest = z.infer<typeof ApproveRequestSchema>;

/** Type 5: BATCH -- multiple instructions in a single transaction. */
export const BatchRequestSchema = z.object({
  type: z.literal('BATCH'),
  instructions: z
    .array(
      z.union([
        TransferRequestSchema.omit({ type: true }),
        TokenTransferRequestSchema.omit({ type: true }),
        ContractCallRequestSchema.omit({ type: true }),
        ApproveRequestSchema.omit({ type: true }),
      ]),
    )
    .min(2, 'Batch requires at least 2 instructions')
    .max(20, 'Batch maximum 20 instructions'),
  network: NetworkTypeEnumWithLegacy.optional(),
  ...gasConditionField,
});
export type BatchRequest = z.infer<typeof BatchRequestSchema>;

/**
 * discriminatedUnion 5-type transaction request schema.
 * Identifies the correct schema variant via the `type` field.
 */
export const TransactionRequestSchema = z.discriminatedUnion('type', [
  TransferRequestSchema,
  TokenTransferRequestSchema,
  ContractCallRequestSchema,
  ApproveRequestSchema,
  BatchRequestSchema,
]);
export type TransactionRequest = z.infer<typeof TransactionRequestSchema>;
