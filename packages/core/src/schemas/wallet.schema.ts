import { z } from 'zod';
import {
  ChainTypeEnum,
  EnvironmentTypeEnum,
  WalletStatusEnum,
  AccountTypeEnum,
} from '../enums/index.js';

export const WalletSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  chain: ChainTypeEnum,
  environment: EnvironmentTypeEnum,
  publicKey: z.string(),
  status: WalletStatusEnum,
  ownerAddress: z.string().nullable(),
  ownerVerified: z.boolean(),
  accountType: AccountTypeEnum.default('eoa'),
  signerKey: z.string().nullable().default(null),
  deployed: z.boolean().default(true),
  entryPoint: z.string().nullable().default(null),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Wallet = z.infer<typeof WalletSchema>;

export const CreateWalletRequestSchema = z.object({
  name: z.string().min(1).max(100),
  chain: ChainTypeEnum.default('solana'),
  environment: EnvironmentTypeEnum.default('testnet'),
  createSession: z.boolean().default(true),
  accountType: AccountTypeEnum.default('eoa'),
});
export type CreateWalletRequest = z.infer<typeof CreateWalletRequestSchema>;
