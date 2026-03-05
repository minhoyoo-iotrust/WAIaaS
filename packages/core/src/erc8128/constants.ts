/**
 * ERC-8128 Signed HTTP Requests - Constants
 *
 * Algorithm registry, default covered components, signature label.
 */

/** EIP-191 personal_sign with secp256k1 (Ethereum standard signing) */
export const DEFAULT_ALGORITHM = 'eip191-secp256k1';

/** Signature label for RFC 9421 Signature-Input header */
export const SIGNATURE_LABEL = 'sig1';

/**
 * Default covered components per preset.
 *
 * - minimal: Only method and target URI (lightweight)
 * - standard: Includes content-digest and content-type for body integrity
 * - strict: Adds @authority and @request-target for full request binding
 */
export const DEFAULT_COVERED_COMPONENTS: Record<string, string[]> = {
  minimal: ['@method', '@target-uri'],
  standard: ['@method', '@target-uri', 'content-digest', 'content-type'],
  strict: [
    '@method',
    '@target-uri',
    '@authority',
    '@request-target',
    'content-digest',
    'content-type',
  ],
};

/**
 * Algorithm registry with descriptions.
 * Sign/verify functions are added at runtime when viem is available (Plan 02).
 */
export const ERC8128_ALGORITHMS: Record<
  string,
  { description: string }
> = {
  'eip191-secp256k1': {
    description:
      'EIP-191 personal_sign with secp256k1 curve (Ethereum standard)',
  },
};
