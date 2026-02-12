/**
 * verifySIWE: Pure function for SIWE (EIP-4361) message verification.
 *
 * Verifies that:
 * 1. The message is a valid EIP-4361 SIWE message (parseable, not expired, not before notBefore)
 * 2. The EIP-191 personal_sign signature matches the expectedAddress
 *
 * Per design decision [v1.4.1]: nonce is NOT validated server-side
 * (consistency with Solana owner-auth which has no server-side nonce check;
 * security relies on expirationTime).
 *
 * @see docs/52-auth-redesign.md
 * @see docs/28-daemon.md (owner-auth SIWE)
 */

import { parseSiweMessage, validateSiweMessage } from 'viem/siwe';
import { verifyMessage } from 'viem';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VerifySIWEParams {
  /** EIP-4361 formatted message string */
  message: string;
  /** Hex-encoded 0x-prefixed EIP-191 signature */
  signature: string;
  /** 0x EIP-55 checksum address to match */
  expectedAddress: string;
}

export interface VerifySIWEResult {
  valid: boolean;
  /** Recovered address on success */
  address?: string;
  /** Reason on failure */
  error?: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export async function verifySIWE(params: VerifySIWEParams): Promise<VerifySIWEResult> {
  try {
    // Step 1: Parse the EIP-4361 message
    const parsed = parseSiweMessage(params.message);

    // Step 2: Validate structural fields (expirationTime, notBefore, etc.)
    // Per [v1.4.1] decision: skip nonce validation (no server-side nonce check)
    const validation = await validateSiweMessage({ message: parsed });
    if (!validation) {
      // Check for specific expiration case
      if (parsed.expirationTime && new Date(parsed.expirationTime) < new Date()) {
        return { valid: false, error: 'SIWE message expired' };
      }
      return { valid: false, error: 'SIWE message validation failed' };
    }

    // Step 3: Verify EIP-191 personal_sign signature
    const isValid = await verifyMessage({
      address: params.expectedAddress as `0x${string}`,
      message: params.message,
      signature: params.signature as `0x${string}`,
    });

    if (!isValid) {
      return { valid: false, error: 'EIP-191 signature verification failed' };
    }

    return { valid: true, address: params.expectedAddress };
  } catch (err) {
    // Parse errors, invalid message format, corrupted signatures, etc.
    const errorMessage = err instanceof Error ? err.message : String(err);

    // Surface expiration-related errors clearly
    if (errorMessage.toLowerCase().includes('expir')) {
      return { valid: false, error: `SIWE message expired: ${errorMessage}` };
    }

    return { valid: false, error: `SIWE verification failed: ${errorMessage}` };
  }
}
