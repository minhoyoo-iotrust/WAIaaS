import { z } from 'zod';
import type { ChainType, NetworkType } from '../enums/chain.js';

// @x402/core Zod schemas (v2)
import {
  PaymentRequiredV2Schema,
  PaymentPayloadV2Schema,
  PaymentRequirementsV2Schema,
} from '@x402/core/schemas';

// @x402/core TypeScript types (v2)
import type {
  PaymentRequired,
  PaymentPayload,
  PaymentRequirements,
} from '@x402/core/types';

// ── CAIP-2 <-> WAIaaS NetworkType Mapping ────────────────────

export const CAIP2_TO_NETWORK: Record<string, { chain: ChainType; network: NetworkType }> = {
  // EVM
  'eip155:1':        { chain: 'ethereum', network: 'ethereum-mainnet' },
  'eip155:11155111': { chain: 'ethereum', network: 'ethereum-sepolia' },
  'eip155:137':      { chain: 'ethereum', network: 'polygon-mainnet' },
  'eip155:80002':    { chain: 'ethereum', network: 'polygon-amoy' },
  'eip155:42161':    { chain: 'ethereum', network: 'arbitrum-mainnet' },
  'eip155:421614':   { chain: 'ethereum', network: 'arbitrum-sepolia' },
  'eip155:10':       { chain: 'ethereum', network: 'optimism-mainnet' },
  'eip155:11155420': { chain: 'ethereum', network: 'optimism-sepolia' },
  'eip155:8453':     { chain: 'ethereum', network: 'base-mainnet' },
  'eip155:84532':    { chain: 'ethereum', network: 'base-sepolia' },
  // Solana
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': { chain: 'solana', network: 'mainnet' },
  'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1':  { chain: 'solana', network: 'devnet' },
  'solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z':  { chain: 'solana', network: 'testnet' },
};

// Reverse mapping (WAIaaS NetworkType -> CAIP-2)
export const NETWORK_TO_CAIP2 = Object.fromEntries(
  Object.entries(CAIP2_TO_NETWORK).map(([caip2, { network }]) => [network, caip2]),
) as Record<NetworkType, string>;

/**
 * Parse a CAIP-2 identifier into namespace and reference.
 * @example parseCaip2('eip155:1') => { namespace: 'eip155', reference: '1' }
 */
export function parseCaip2(caip2Network: string): { namespace: string; reference: string } {
  const colonIndex = caip2Network.indexOf(':');
  if (colonIndex === -1) throw new Error(`Invalid CAIP-2 identifier: ${caip2Network}`);
  return {
    namespace: caip2Network.slice(0, colonIndex),
    reference: caip2Network.slice(colonIndex + 1),
  };
}

/**
 * Resolve a CAIP-2 network identifier to WAIaaS chain+network.
 * Throws if the CAIP-2 identifier is not supported.
 */
export function resolveX402Network(caip2: string): { chain: ChainType; network: NetworkType } {
  const resolved = CAIP2_TO_NETWORK[caip2];
  if (!resolved) throw new Error(`Unsupported x402 network: ${caip2}`);
  return resolved;
}

// ── WAIaaS X402 Request/Response Schemas (Zod SSoT) ──────────

export const X402FetchRequestSchema = z.object({
  url: z.string().url(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).default('GET'),
  headers: z.record(z.string()).optional(),
  body: z.string().optional(),
});
export type X402FetchRequest = z.infer<typeof X402FetchRequestSchema>;

export const X402PaymentInfoSchema = z.object({
  amount: z.string(),
  asset: z.string(),
  network: z.string(),
  payTo: z.string(),
  txId: z.string(),
});
export type X402PaymentInfo = z.infer<typeof X402PaymentInfoSchema>;

export const X402FetchResponseSchema = z.object({
  status: z.number().int(),
  headers: z.record(z.string()),
  body: z.string(),
  payment: X402PaymentInfoSchema.optional(),
});
export type X402FetchResponse = z.infer<typeof X402FetchResponseSchema>;

// @x402/core re-exports
export { PaymentRequiredV2Schema, PaymentPayloadV2Schema, PaymentRequirementsV2Schema };
export type { PaymentRequired, PaymentPayload, PaymentRequirements };
