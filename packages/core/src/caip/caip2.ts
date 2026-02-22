import { z } from 'zod';

// CAIP-2 spec: namespace = [-a-z0-9]{3,8}, reference = [-_a-zA-Z0-9]{1,32}
// Source: standards.chainagnostic.org/CAIPs/caip-2
// IMPORTANT: reference includes underscore per official spec (e.g., SN_GOERLI)
export const Caip2Schema = z.string().regex(
  /^[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}$/,
  'Invalid CAIP-2 chain ID format (expected namespace:reference)',
);
export type Caip2 = z.infer<typeof Caip2Schema>;

export interface Caip2Params {
  namespace: string;
  reference: string;
}

export function parseCaip2(chainId: string): Caip2Params {
  Caip2Schema.parse(chainId);
  const idx = chainId.indexOf(':');
  return {
    namespace: chainId.slice(0, idx),
    reference: chainId.slice(idx + 1),
  };
}

export function formatCaip2(namespace: string, reference: string): string {
  const result = `${namespace}:${reference}`;
  Caip2Schema.parse(result);
  return result;
}
