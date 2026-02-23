/**
 * Zod schemas for LI.FI API v1 responses.
 * Runtime validation to detect API drift early.
 *
 * Endpoints:
 * - /quote   -> LiFiQuoteResponseSchema
 * - /status  -> LiFiStatusResponseSchema
 *
 * See: https://docs.li.fi/li.fi-api/get-a-quote
 * See: https://docs.li.fi/li.fi-api/check-the-status-of-your-cross-chain-transactions
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Quote Response (/quote) (LIFI-01)
// ---------------------------------------------------------------------------

export const LiFiQuoteResponseSchema = z.object({
  id: z.string(),
  type: z.string(),                       // 'lifi' or 'swap'
  tool: z.string(),                       // e.g., 'stargate', 'across', 'wormhole'
  toolDetails: z.object({
    key: z.string(),
    name: z.string(),
    logoURI: z.string().optional(),
  }).passthrough().optional(),
  action: z.object({
    fromChainId: z.number(),
    toChainId: z.number(),
    fromToken: z.object({
      address: z.string(),
      symbol: z.string(),
      decimals: z.number(),
      chainId: z.number(),
    }).passthrough(),
    toToken: z.object({
      address: z.string(),
      symbol: z.string(),
      decimals: z.number(),
      chainId: z.number(),
    }).passthrough(),
    fromAmount: z.string(),
    slippage: z.number(),
    fromAddress: z.string(),
    toAddress: z.string().optional(),
  }).passthrough(),
  estimate: z.object({
    fromAmount: z.string(),
    toAmount: z.string(),
    toAmountMin: z.string(),
    approvalAddress: z.string().optional(),
    executionDuration: z.number(),        // estimated seconds
    feeCosts: z.array(z.unknown()).optional(),
    gasCosts: z.array(z.unknown()).optional(),
  }).passthrough(),
  transactionRequest: z.object({
    data: z.string(),                     // calldata (hex)
    to: z.string(),                       // target contract
    value: z.string(),                    // native value (hex or decimal)
    from: z.string(),
    chainId: z.number(),
    gasLimit: z.string().optional(),
    gasPrice: z.string().optional(),
  }).passthrough(),
  includedSteps: z.array(z.unknown()).optional(),
}).passthrough();

export type LiFiQuoteResponse = z.infer<typeof LiFiQuoteResponseSchema>;

// ---------------------------------------------------------------------------
// Status Response (/status) (LIFI-02)
// ---------------------------------------------------------------------------

export const LiFiStatusResponseSchema = z.object({
  transactionId: z.string().optional(),
  sending: z.object({
    txHash: z.string(),
    txLink: z.string().optional(),
    chainId: z.number(),
    amount: z.string().optional(),
    token: z.unknown().optional(),
  }).passthrough().optional(),
  receiving: z.object({
    txHash: z.string().optional(),
    txLink: z.string().optional(),
    chainId: z.number().optional(),
    amount: z.string().optional(),
    token: z.unknown().optional(),
  }).passthrough().optional(),
  lifiExplorerLink: z.string().optional(),
  status: z.enum(['PENDING', 'DONE', 'FAILED', 'NOT_FOUND', 'INVALID']),
  substatus: z.string().optional(),
  substatusMessage: z.string().optional(),
  tool: z.string().optional(),
  bridgeExplorerLink: z.string().optional(),
}).passthrough();

export type LiFiStatusResponse = z.infer<typeof LiFiStatusResponseSchema>;
