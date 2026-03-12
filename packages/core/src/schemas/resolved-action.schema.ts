/**
 * ResolvedAction 3-kind Zod discriminatedUnion for External Action framework.
 *
 * Three action kinds:
 * - contractCall: existing on-chain transactions (backward compatible)
 * - signedData: off-chain signed data (EIP-712, HMAC, RSA-PSS, etc.)
 * - signedHttp: signed HTTP requests (ERC-8128 or HMAC-based)
 *
 * SSoT: doc-81 D1.3~D1.5, D1.8 (External Action Framework design).
 *
 * @since v31.12
 */
import { z } from 'zod';
import { SigningSchemeEnum } from '../enums/signing-scheme.js';
import { ContractCallRequestSchema } from './transaction.schema.js';

// ---------------------------------------------------------------------------
// SignedData sub-schemas
// ---------------------------------------------------------------------------

/** Tracking configuration for async off-chain actions. */
export const SignedDataActionTrackingSchema = z.object({
  trackerName: z.string().min(1),
  metadata: z.record(z.unknown()).default({}),
});

/** Action category for policy evaluation. */
export const ActionCategoryEnum = z.enum([
  'swap',
  'perp',
  'lending',
  'staking',
  'bridge',
  'prediction',
  'governance',
  'custom',
]);

/** Policy context for spending limit / category-based policy evaluation. */
export const SignedDataActionPolicyContextSchema = z.object({
  actionCategory: ActionCategoryEnum,
  notionalUsd: z.number().nonnegative().optional(),
  leverage: z.number().positive().optional(),
  expiry: z.number().int().positive().optional(),
  hasWithdrawCapability: z.boolean().default(false),
});

// ---------------------------------------------------------------------------
// SignedData action schema (doc-81 D1.3)
// ---------------------------------------------------------------------------

/** Off-chain signed data action (EIP-712 typed data, HMAC signatures, etc.). */
export const SignedDataActionSchema = z.object({
  kind: z.literal('signedData'),
  signingScheme: SigningSchemeEnum,
  payload: z.record(z.unknown()),
  venue: z.string().min(1),
  operation: z.string().min(1),
  credentialRef: z.string().optional(),
  tracking: SignedDataActionTrackingSchema.optional(),
  policyContext: SignedDataActionPolicyContextSchema.optional(),
  actionProvider: z.string().optional(),
  actionName: z.string().optional(),
}).strict();

// ---------------------------------------------------------------------------
// SignedHttp action schema (doc-81 D1.4)
// ---------------------------------------------------------------------------

/** Signed HTTP request action (ERC-8128 or HMAC-based HTTP signing). */
export const SignedHttpActionSchema = z.object({
  kind: z.literal('signedHttp'),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  url: z.string().url(),
  headers: z.record(z.string()).default({}),
  body: z.string().optional(),
  signingScheme: z.enum(['erc8128', 'hmac-sha256']),
  coveredComponents: z.array(z.string()).optional(),
  preset: z.string().optional(),
  ttlSec: z.number().int().positive().optional(),
  nonce: z.string().optional(),
  venue: z.string().min(1),
  operation: z.string().min(1),
  credentialRef: z.string().optional(),
  tracking: SignedDataActionTrackingSchema.optional(),
  policyContext: SignedDataActionPolicyContextSchema.optional(),
  actionProvider: z.string().optional(),
  actionName: z.string().optional(),
}).strict();

// ---------------------------------------------------------------------------
// NormalizedContractCall schema (backward compatible)
// ---------------------------------------------------------------------------

/**
 * ContractCallRequest extended with kind:'contractCall'.
 * Does NOT modify the original ContractCallRequestSchema.
 */
export const NormalizedContractCallSchema = ContractCallRequestSchema.extend({
  kind: z.literal('contractCall'),
});

// ---------------------------------------------------------------------------
// ResolvedAction discriminatedUnion
// ---------------------------------------------------------------------------

/**
 * 3-kind discriminatedUnion: dispatches on `kind` field.
 * - contractCall: on-chain transactions (existing pipeline)
 * - signedData: off-chain signed payloads (new pipeline)
 * - signedHttp: signed HTTP requests (new pipeline)
 */
export const ResolvedActionSchema = z.discriminatedUnion('kind', [
  NormalizedContractCallSchema,
  SignedDataActionSchema,
  SignedHttpActionSchema,
]);

// ---------------------------------------------------------------------------
// Derived types
// ---------------------------------------------------------------------------

export type SignedDataAction = z.infer<typeof SignedDataActionSchema>;
export type SignedHttpAction = z.infer<typeof SignedHttpActionSchema>;
export type NormalizedContractCall = z.infer<typeof NormalizedContractCallSchema>;
export type ResolvedAction = z.infer<typeof ResolvedActionSchema>;
export type ActionCategory = z.infer<typeof ActionCategoryEnum>;

// ---------------------------------------------------------------------------
// Normalization utilities
// ---------------------------------------------------------------------------

/**
 * Normalize a raw action result into a typed ResolvedAction.
 *
 * - If `kind` is present: parse directly via ResolvedActionSchema
 * - If `kind` is absent but `type === 'CONTRACT_CALL'`: add kind:'contractCall' and parse
 * - Otherwise: throw error
 */
export function normalizeResolvedAction(raw: unknown): ResolvedAction {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('normalizeResolvedAction: input must be an object');
  }

  const obj = raw as Record<string, unknown>;

  if ('kind' in obj && obj.kind !== undefined) {
    return ResolvedActionSchema.parse(raw);
  }

  if ('type' in obj && obj.type === 'CONTRACT_CALL') {
    return ResolvedActionSchema.parse({ ...obj, kind: 'contractCall' });
  }

  throw new Error(
    'normalizeResolvedAction: input must have kind field or type=CONTRACT_CALL',
  );
}

/**
 * Normalize one or more raw action results into ResolvedAction[].
 */
export function normalizeResolvedActions(
  raw: unknown | unknown[],
): ResolvedAction[] {
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr.map(normalizeResolvedAction);
}
