import { z } from 'zod';
import { TransactionTypeEnum, TransactionStatusEnum } from '../enums/transaction.js';
import { PolicyTierEnum } from '../enums/policy.js';
import { ChainTypeEnum } from '../enums/chain.js';

export const TransactionSchema = z.object({
  id: z.string().uuid(),
  agentId: z.string().uuid(),
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
