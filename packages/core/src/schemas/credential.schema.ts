/**
 * Credential Zod schemas -- SSoT for credential type system.
 *
 * Derivation: Zod -> TypeScript types -> OpenAPI -> DB CHECK constraints.
 *
 * @see docs/81-external-action-design.md D3.6
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/**
 * Credential type enum -- 5 supported types.
 * Maps to wallet_credentials.type CHECK constraint.
 */
export const CredentialTypeEnum = z.enum([
  'api-key',
  'hmac-secret',
  'rsa-private-key',
  'session-token',
  'custom',
]);
export type CredentialType = z.infer<typeof CredentialTypeEnum>;

/** Array for DB CHECK constraint generation */
export const CREDENTIAL_TYPES = CredentialTypeEnum.options;

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

/** Parameters for creating a new credential. */
export const CreateCredentialParamsSchema = z.object({
  type: CredentialTypeEnum,
  name: z.string().min(1).max(128),
  value: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
  expiresAt: z.number().int().positive().optional(),
});
export type CreateCredentialParams = z.infer<typeof CreateCredentialParamsSchema>;

// ---------------------------------------------------------------------------
// Output schemas
// ---------------------------------------------------------------------------

/** Credential metadata returned by API -- never includes the decrypted value. */
export const CredentialMetadataSchema = z.object({
  id: z.string(),
  walletId: z.string().nullable(),
  type: CredentialTypeEnum,
  name: z.string(),
  metadata: z.record(z.unknown()),
  expiresAt: z.number().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type CredentialMetadata = z.infer<typeof CredentialMetadataSchema>;

/** Decrypted credential -- internal use only, never exposed via API. */
export const DecryptedCredentialSchema = CredentialMetadataSchema.extend({
  value: z.string(),
});
export type DecryptedCredential = z.infer<typeof DecryptedCredentialSchema>;
