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

export const ACCOUNT_TYPES = ['eoa', 'smart'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];
export const AccountTypeEnum = z.enum(ACCOUNT_TYPES);
