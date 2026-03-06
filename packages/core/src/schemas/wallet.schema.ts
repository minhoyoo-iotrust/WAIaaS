import { z } from 'zod';
import {
  ChainTypeEnum,
  EnvironmentTypeEnum,
  WalletStatusEnum,
  AccountTypeEnum,
  AaProviderNameEnum,
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
  aaProvider: AaProviderNameEnum.nullable().default(null),
  aaBundlerUrl: z.string().nullable().default(null),
  aaPaymasterUrl: z.string().nullable().default(null),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Wallet = z.infer<typeof WalletSchema>;

/** Base shape for wallet creation request (before superRefine). */
const CreateWalletRequestBaseSchema = z.object({
  name: z.string().min(1).max(100),
  chain: ChainTypeEnum.default('solana'),
  environment: EnvironmentTypeEnum.default('testnet'),
  createSession: z.boolean().default(true),
  accountType: AccountTypeEnum.default('eoa'),
  aaProvider: AaProviderNameEnum.optional(),
  aaProviderApiKey: z.string().min(1).optional(),
  aaBundlerUrl: z.string().url().optional(),
  aaPaymasterUrl: z.string().url().optional(),
  aaPaymasterPolicyId: z.string().min(1).optional(),
});

export const CreateWalletRequestSchema = CreateWalletRequestBaseSchema.superRefine((data, ctx) => {
  if (data.accountType === 'smart') {
    // aaProvider is optional: omitting it creates a Lite mode smart account
    // (no bundler/paymaster -- UserOp Build/Sign API only, external sponsorship)
    if (!data.aaProvider) {
      return; // Lite mode: no provider validation needed
    }
    if (data.aaProvider === 'pimlico' || data.aaProvider === 'alchemy') {
      if (!data.aaProviderApiKey) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Provider '${data.aaProvider}' requires an API key (aaProviderApiKey)`,
          path: ['aaProviderApiKey'],
        });
      }
    }
    if (data.aaProvider === 'custom') {
      if (!data.aaBundlerUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Custom provider requires bundler URL (aaBundlerUrl)",
          path: ['aaBundlerUrl'],
        });
      }
    }
  }
});
export type CreateWalletRequest = z.infer<typeof CreateWalletRequestSchema>;
