import { z } from 'zod';

/**
 * AssetInfo Zod schema for JSON serialization.
 * Note: balance is string (bigint serialized) for JSON transport.
 */
export const AssetInfoSchema = z.object({
  mint: z.string(),
  symbol: z.string(),
  name: z.string(),
  balance: z.string(), // bigint as string for JSON
  decimals: z.number().int(),
  isNative: z.boolean(),
  usdValue: z.number().optional(),
});

export type AssetInfoDto = z.infer<typeof AssetInfoSchema>;
