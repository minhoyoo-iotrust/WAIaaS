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

// ── CAIP-2 <-> WAIaaS NetworkType Mapping (re-exported from caip/ SSoT) ──
import { CAIP2_TO_NETWORK, NETWORK_TO_CAIP2, parseCaip2 } from '../caip/index.js';
export { CAIP2_TO_NETWORK, NETWORK_TO_CAIP2, parseCaip2 };

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
