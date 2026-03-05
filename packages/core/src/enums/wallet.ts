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

export const AA_PROVIDER_NAMES = ['pimlico', 'alchemy', 'custom'] as const;
export type AaProviderName = (typeof AA_PROVIDER_NAMES)[number];
export const AaProviderNameEnum = z.enum(AA_PROVIDER_NAMES);
