/**
 * validateOwnerAddress: Chain-aware address validation utility.
 *
 * Validates and normalizes owner wallet addresses for both supported chains:
 * - **Solana**: Base58-encoded 32-byte Ed25519 public key
 * - **Ethereum**: 0x-prefixed EIP-55 checksum address (strict mode)
 *
 * **EIP-55 strict mode**: All-lowercase and all-uppercase addresses are rejected.
 * This is intentional -- we require EIP-55 checksum format for security to prevent
 * address typos from going undetected.
 *
 * The `decodeBase58` function is extracted from owner-auth.ts and exported here
 * as the canonical location. owner-auth.ts will import from here in Plan 87-02.
 *
 * @see docs/52-auth-redesign.md
 */

import type { ChainType } from '@waiaas/core';
import { isAddress, getAddress } from 'viem';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AddressValidationResult {
  valid: boolean;
  /** Normalized address (EIP-55 checksum for Ethereum, unchanged for Solana) */
  normalized?: string;
  /** Reason on failure */
  error?: string;
}

// ---------------------------------------------------------------------------
// Base58 decode (Bitcoin alphabet) -- canonical location
// Extracted from owner-auth.ts for reuse across address validation.
// ---------------------------------------------------------------------------

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/**
 * Decode a Base58-encoded string (Bitcoin alphabet) to a Buffer.
 * Characters not in the Base58 alphabet (0, O, I, l) cause an error.
 */
export function decodeBase58(str: string): Buffer {
  // Count leading '1's (zero bytes)
  let zeroes = 0;
  for (let i = 0; i < str.length && str[i] === '1'; i++) {
    zeroes++;
  }

  // Allocate enough space in base256 representation
  const size = Math.ceil((str.length * 733) / 1000) + 1;
  const b256 = new Uint8Array(size);
  let length = 0;

  for (let i = zeroes; i < str.length; i++) {
    const charIndex = BASE58_ALPHABET.indexOf(str[i]!);
    if (charIndex === -1) {
      throw new Error(`Invalid Base58 character: ${str[i]}`);
    }

    let carry = charIndex;
    let j = 0;
    for (let k = size - 1; k >= 0 && (carry !== 0 || j < length); k--, j++) {
      carry += 58 * (b256[k] ?? 0);
      b256[k] = carry % 256;
      carry = Math.floor(carry / 256);
    }
    length = j;
  }

  // Skip leading zeros in b256
  let start = 0;
  while (start < size && b256[start] === 0) {
    start++;
  }

  // Build result with leading zero bytes
  const result = Buffer.alloc(zeroes + (size - start));
  for (let i = start; i < size; i++) {
    result[zeroes + (i - start)] = b256[i]!;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Solana address validation
// ---------------------------------------------------------------------------

function validateSolanaAddress(address: string): AddressValidationResult {
  try {
    const decoded = decodeBase58(address);
    if (decoded.length !== 32) {
      return {
        valid: false,
        error: `Invalid Solana address: expected 32 bytes, got ${String(decoded.length)}`,
      };
    }
    return { valid: true, normalized: address };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { valid: false, error: `Invalid Solana address (Base58 decode failed): ${msg}` };
  }
}

// ---------------------------------------------------------------------------
// Ethereum address validation
// ---------------------------------------------------------------------------

function validateEthereumAddress(address: string): AddressValidationResult {
  // Check basic format first (0x prefix + hex)
  if (!address.startsWith('0x')) {
    return { valid: false, error: 'Invalid Ethereum address format: missing 0x prefix' };
  }

  // isAddress with strict=false checks format only (0x + 40 hex chars)
  if (!isAddress(address, { strict: false })) {
    return { valid: false, error: 'Invalid Ethereum address format' };
  }

  // Require EIP-55 mixed-case checksum format.
  // viem isAddress(strict:true) still accepts all-lowercase/all-uppercase,
  // so we explicitly reject those -- we require the checksummed mixed-case form
  // for security (prevents undetected typos).
  const hex = address.slice(2);
  if (hex === hex.toLowerCase() || hex === hex.toUpperCase()) {
    return { valid: false, error: 'Invalid EIP-55 checksum: all-lowercase or all-uppercase addresses are not accepted, use checksummed format' };
  }

  // Verify the mixed-case matches EIP-55 checksum exactly
  try {
    const checksummed = getAddress(address);
    if (checksummed !== address) {
      return { valid: false, error: 'Invalid EIP-55 checksum' };
    }
    return { valid: true, normalized: checksummed };
  } catch {
    return { valid: false, error: 'Invalid EIP-55 checksum' };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate and normalize an owner wallet address for the given chain.
 *
 * - Solana: Base58 32-byte Ed25519 public key
 * - Ethereum: 0x + EIP-55 checksum (strict -- all-lowercase rejected)
 * - Unknown chain: rejected
 */
export function validateOwnerAddress(chain: ChainType, address: string): AddressValidationResult {
  switch (chain) {
    case 'solana':
      return validateSolanaAddress(address);
    case 'ethereum':
      return validateEthereumAddress(address);
    default:
      return { valid: false, error: `Unsupported chain: ${chain as string}` };
  }
}
