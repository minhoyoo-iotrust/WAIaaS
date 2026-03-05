/**
 * ERC-8128 Signed HTTP Requests - Zod SSoT schemas and TypeScript types
 *
 * Derivation order: Zod -> TypeScript types (project convention)
 */
import { z } from 'zod';

/**
 * Covered Components preset for RFC 9421 Signature-Input
 * - minimal: only @method and @target-uri
 * - standard: @method, @target-uri, content-digest, content-type
 * - strict: all of standard plus @authority and @request-target
 */
export const CoveredComponentsPresetSchema = z.enum([
  'minimal',
  'standard',
  'strict',
]);
export type CoveredComponentsPreset = z.infer<
  typeof CoveredComponentsPresetSchema
>;

/**
 * Signature parameters for RFC 9421 Signature-Input construction
 */
export const SignatureParamsSchema = z.object({
  nonce: z.union([z.string().uuid(), z.literal(false)]).optional(),
  created: z.number().int().optional(),
  expires: z.number().int().optional(),
  ttlSec: z.number().int().min(10).max(3600).default(300),
});
export type SignatureParams = z.infer<typeof SignatureParamsSchema>;

/**
 * Input for signing an HTTP request message (ERC-8128)
 */
export const SignHttpRequestSchema = z.object({
  method: z.enum([
    'GET',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
    'HEAD',
    'OPTIONS',
  ]),
  url: z.string().url(),
  headers: z.record(z.string()).optional().default({}),
  body: z.string().optional(),
  walletId: z.string().uuid(),
  network: z.string().min(1),
  coveredComponents: z.array(z.string()).optional(),
  preset: CoveredComponentsPresetSchema.optional().default('standard'),
  ttlSec: z.number().int().min(10).max(3600).optional().default(300),
  nonce: z.union([z.string(), z.literal(false)]).optional(),
});
export type SignHttpRequest = z.infer<typeof SignHttpRequestSchema>;

/**
 * Result of signature verification
 */
export const VerifyResultSchema = z.object({
  valid: z.boolean(),
  recoveredAddress: z.string().nullable(),
  keyid: z.string(),
  error: z.string().optional(),
});
export type VerifyResult = z.infer<typeof VerifyResultSchema>;
