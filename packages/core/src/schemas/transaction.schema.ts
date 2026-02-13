import { z } from 'zod';
import { TransactionTypeEnum, TransactionStatusEnum } from '../enums/transaction.js';
import { PolicyTierEnum } from '../enums/policy.js';
import { ChainTypeEnum } from '../enums/chain.js';

export const TransactionSchema = z.object({
  id: z.string().uuid(),
  walletId: z.string().uuid(),
  sessionId: z.string().uuid().nullable(),
  type: TransactionTypeEnum,
  status: TransactionStatusEnum,
  tier: PolicyTierEnum.nullable(),
  chain: ChainTypeEnum,
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

/** Type 1: TRANSFER -- native token transfer (SOL/ETH). */
export const TransferRequestSchema = z.object({
  type: z.literal('TRANSFER'),
  to: z.string().min(1),
  amount: z.string().regex(numericStringPattern, 'amount must be a numeric string (lamports/wei)'),
  memo: z.string().max(256).optional(),
});
export type TransferRequestInput = z.infer<typeof TransferRequestSchema>;

/** Token metadata for TOKEN_TRANSFER and APPROVE requests. */
const TokenInfoSchema = z.object({
  address: z.string().min(1), // mint address (SPL) or contract address (ERC-20)
  decimals: z.number().int().min(0).max(18),
  symbol: z.string().min(1).max(10),
});

/** Type 2: TOKEN_TRANSFER -- SPL/ERC-20 token transfer. */
export const TokenTransferRequestSchema = z.object({
  type: z.literal('TOKEN_TRANSFER'),
  to: z.string().min(1),
  amount: z.string().regex(numericStringPattern, 'amount must be a numeric string'),
  token: TokenInfoSchema,
  memo: z.string().max(256).optional(),
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
});
export type ContractCallRequest = z.infer<typeof ContractCallRequestSchema>;

/** Type 4: APPROVE -- token spending approval (ERC-20 approve / SPL delegate). */
export const ApproveRequestSchema = z.object({
  type: z.literal('APPROVE'),
  spender: z.string().min(1),
  token: TokenInfoSchema,
  amount: z.string().regex(numericStringPattern, 'amount must be a numeric string'),
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
