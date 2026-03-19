/**
 * DCent Swap API Zod SSoT schemas.
 *
 * Defines response schemas for all DCent Swap Backend API endpoints.
 * Types are derived from schemas via z.infer (Zod SSoT pattern).
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// GET /api/swap/v3/get_supported_currencies
// ---------------------------------------------------------------------------

export const DcentCurrencySchema = z.object({
  currencyId: z.string(),
  tokenDeviceId: z.string(),
  currencyName: z.string(),
  contractTokenSupport: z.string().optional(),
  providers: z.array(z.string()).optional(),
  providerTickers: z.record(z.unknown()).optional(),
  contractTokens: z.array(z.unknown()).optional(),
  cgkId: z.string().optional(),
});

export type DcentCurrency = z.infer<typeof DcentCurrencySchema>;

export const DcentCurrenciesResponseSchema = z.array(DcentCurrencySchema);

// ---------------------------------------------------------------------------
// POST /api/swap/v3/get_quotes
// ---------------------------------------------------------------------------

export const DcentQuoteProviderSchema = z.object({
  id: z.string(),
  status: z.string(),
  providerId: z.string(),
  providerType: z.enum(['swap', 'cross_swap']),
  name: z.string().optional(),
  iconUrl: z.string().optional(),
  fromAmount: z.string().optional(),
  quoteType: z.enum(['flexible', 'fixed']).optional(),
  providerFee: z.record(z.unknown()).optional(),
  expectedAmount: z.string().optional(),
  networkFee: z.record(z.unknown()).optional(),
  spenderContractAddress: z.string().optional(),
  fixedRate: z.object({
    id: z.string(),
    validUntil: z.number(),
  }).optional(),
  minAmount: z.string().optional(),
  maxAmount: z.string().optional(),
});

export type DcentQuoteProvider = z.infer<typeof DcentQuoteProviderSchema>;

export const DcentQuotesResponseSchema = z.object({
  status: z.string(),
  fromId: z.string().optional(),
  toId: z.string().optional(),
  providers: z.object({
    bestOrder: z.array(z.string()).optional(),
    common: z.array(DcentQuoteProviderSchema).optional(),
  }).optional(),
});

export type DcentQuotesResponse = z.infer<typeof DcentQuotesResponseSchema>;

// ---------------------------------------------------------------------------
// POST /api/swap/v3/get_dex_swap_transaction_data
// ---------------------------------------------------------------------------

/** EVM transaction data: from/to/data/value fields. */
export const DcentEvmTxDataSchema = z.object({
  from: z.string(),
  to: z.string(),
  data: z.string(),
  value: z.string().optional(),
});

/** Solana transaction data: base64 serialized transaction or instruction data. */
export const DcentSolanaTxDataSchema = z.object({
  serializedTransaction: z.string().optional(),
  data: z.string().optional(),
}).passthrough();

/** Union of EVM and Solana transaction data formats. */
export const DcentTxDataSchema = z.union([DcentEvmTxDataSchema, DcentSolanaTxDataSchema]);

export const DcentTxDataResponseSchema = z.object({
  status: z.string(),
  txdata: DcentTxDataSchema.optional(),
  networkFee: z.object({
    gas: z.string().optional(),
    gasPrice: z.string().optional(),
  }).optional(),
});

export type DcentTxDataResponse = z.infer<typeof DcentTxDataResponseSchema>;

