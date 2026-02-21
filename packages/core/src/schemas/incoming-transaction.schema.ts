import { z } from 'zod';
import { ChainTypeEnum, IncomingTxStatusEnum } from '../enums/index.js';

/**
 * Zod SSoT schema for incoming transactions.
 * Derivation: Zod -> TypeScript -> OpenAPI -> Drizzle schema -> DB CHECK constraints.
 *
 * Fields mirror the IncomingTransaction interface in chain-subscriber.types.ts.
 * The Zod schema is the SSoT for validation and OpenAPI generation.
 */
export const IncomingTransactionSchema = z.object({
  id: z.string(),
  txHash: z.string(),
  walletId: z.string(),
  fromAddress: z.string(),
  amount: z.string(),
  tokenAddress: z.string().nullable(),
  chain: ChainTypeEnum,
  network: z.string(),
  status: IncomingTxStatusEnum,
  blockNumber: z.number().int().nullable(),
  detectedAt: z.number().int(),
  confirmedAt: z.number().int().nullable(),
  isSuspicious: z.boolean().optional(),
});

export type IncomingTransaction = z.infer<typeof IncomingTransactionSchema>;
