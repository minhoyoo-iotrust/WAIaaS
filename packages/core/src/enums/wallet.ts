import { z } from 'zod';

export const WALLET_STATUSES = [
  'CREATING',
  'ACTIVE',
  'SUSPENDED',
  'TERMINATING',
  'TERMINATED',
] as const;
export type WalletStatus = (typeof WALLET_STATUSES)[number];
export const WalletStatusEnum = z.enum(WALLET_STATUSES);
