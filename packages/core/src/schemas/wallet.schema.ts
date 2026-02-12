import { z } from 'zod';
import {
  ChainTypeEnum,
  NetworkTypeEnum,
  WalletStatusEnum,
} from '../enums/index.js';

export const WalletSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  chain: ChainTypeEnum,
  network: NetworkTypeEnum,
  publicKey: z.string(),
  status: WalletStatusEnum,
  ownerAddress: z.string().nullable(),
  ownerVerified: z.boolean(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Wallet = z.infer<typeof WalletSchema>;

export const CreateWalletRequestSchema = z.object({
  name: z.string().min(1).max(100),
  chain: ChainTypeEnum.default('solana'),
  network: NetworkTypeEnum.optional(),
});
export type CreateWalletRequest = z.infer<typeof CreateWalletRequestSchema>;
