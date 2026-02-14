import { z } from 'zod';

export const TRANSACTION_STATUSES = [
  'PENDING',
  'QUEUED',
  'EXECUTING',
  'SUBMITTED',
  'CONFIRMED',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
  'PARTIAL_FAILURE',
  'SIGNED',
] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];
export const TransactionStatusEnum = z.enum(TRANSACTION_STATUSES);

export const TRANSACTION_TYPES = [
  'TRANSFER',
  'TOKEN_TRANSFER',
  'CONTRACT_CALL',
  'APPROVE',
  'BATCH',
  'SIGN',
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];
export const TransactionTypeEnum = z.enum(TRANSACTION_TYPES);
