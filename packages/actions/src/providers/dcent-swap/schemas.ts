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
  providers: z.array(z.string()).optional().default([]),
  providerTickers: z.record(z.unknown()).optional().default({}),
  contractTokens: z.array(z.unknown()).optional().default([]),
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
  providerType: z.enum(['swap', 'cross_swap', 'exchange']),
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
    bestOrder: z.array(z.string()).optional().default([]),
    common: z.array(DcentQuoteProviderSchema).optional().default([]),
  }).optional(),
});

export type DcentQuotesResponse = z.infer<typeof DcentQuotesResponseSchema>;

// ---------------------------------------------------------------------------
// POST /api/swap/v3/get_dex_swap_transaction_data
// ---------------------------------------------------------------------------

export const DcentTxDataResponseSchema = z.object({
  status: z.string(),
  txdata: z.object({
    from: z.string(),
    to: z.string(),
    data: z.string(),
    value: z.string().optional(),
  }).optional(),
  networkFee: z.object({
    gas: z.string().optional(),
    gasPrice: z.string().optional(),
  }).optional(),
});

export type DcentTxDataResponse = z.infer<typeof DcentTxDataResponseSchema>;

// ---------------------------------------------------------------------------
// POST /api/swap/v3/create_exchange_transaction
// ---------------------------------------------------------------------------

export const DcentExchangeResponseSchema = z.object({
  status: z.string(),
  transactionId: z.string().optional(),
  transactionStatusUrl: z.string().optional(),
  payInAddress: z.string().optional(),
  fromAmount: z.string().optional(),
  toAmount: z.string().optional(),
  extraId: z.string().optional(),
});

export type DcentExchangeResponse = z.infer<typeof DcentExchangeResponseSchema>;

// ---------------------------------------------------------------------------
// POST /api/swap/v3/get_transactions_status
// ---------------------------------------------------------------------------

export const DcentExchangeStatus = z.enum([
  'waiting',
  'confirming',
  'exchanging',
  'sending',
  'finished',
  'failed',
  'refunded',
  'error',
]);

export type DcentExchangeStatusType = z.infer<typeof DcentExchangeStatus>;

export const DcentStatusResponseItemSchema = z.object({
  providerId: z.string(),
  status: DcentExchangeStatus,
  txId: z.string(),
  contactEmail: z.array(z.string()).optional(),
  payInAddress: z.string().optional(),
  payOutAddress: z.string().optional(),
  fromAmount: z.string().optional(),
  toAmount: z.string().optional(),
});

export type DcentStatusResponseItem = z.infer<typeof DcentStatusResponseItemSchema>;

export const DcentStatusResponseSchema = z.array(DcentStatusResponseItemSchema);

export type DcentStatusResponse = z.infer<typeof DcentStatusResponseSchema>;
