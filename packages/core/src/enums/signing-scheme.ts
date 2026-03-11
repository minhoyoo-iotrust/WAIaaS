/**
 * Signing scheme enumeration for External Action framework.
 *
 * 7 signing schemes that ISignerCapability implementations support.
 * SSoT: doc-81 D1.2 (External Action Framework design).
 *
 * @since v31.12
 */
import { z } from 'zod';

/** Zod enum for signing scheme identifiers. */
export const SigningSchemeEnum = z.enum([
  'eip712',
  'personal',
  'hmac-sha256',
  'rsa-pss',
  'ecdsa-secp256k1',
  'ed25519',
  'erc8128',
]);

/** TypeScript type derived from SigningSchemeEnum. */
export type SigningScheme = z.infer<typeof SigningSchemeEnum>;

/** Readonly array of all signing scheme values. */
export const SIGNING_SCHEMES = SigningSchemeEnum.options;
