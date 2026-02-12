/**
 * validateOwnerAddress utility tests: chain-aware address validation.
 *
 * Tests cover:
 * 1. Solana: accepts valid base58 32-byte public key
 * 2. Solana: rejects string that decodes to != 32 bytes
 * 3. Solana: rejects string with invalid base58 characters (0, O, I, l)
 * 4. Ethereum: accepts valid EIP-55 checksum address
 * 5. Ethereum: rejects all-lowercase 0x address (strict EIP-55 enforcement)
 * 6. Ethereum: rejects address without 0x prefix
 * 7. Ethereum: rejects address with wrong checksum
 * 8. Ethereum: rejects too-short address
 * 9. Unknown chain: returns error
 */

import { describe, it, expect } from 'vitest';
import { validateOwnerAddress } from '../api/middleware/address-validation.js';
import type { ChainType } from '@waiaas/core';

describe('validateOwnerAddress', () => {
  // -------------------------------------------------------------------------
  // Solana
  // -------------------------------------------------------------------------

  describe('solana', () => {
    it('accepts valid base58 32-byte public key', () => {
      // Solana System Program address -- well-known 32-byte public key
      const result = validateOwnerAddress('solana', '11111111111111111111111111111112');
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe('11111111111111111111111111111112');
    });

    it('rejects string that decodes to != 32 bytes', () => {
      // Short base58 string (decodes to fewer than 32 bytes)
      const result = validateOwnerAddress('solana', 'abc');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('32');
    });

    it('rejects string with invalid base58 characters (0, O, I, l)', () => {
      // '0' is not in base58 alphabet
      const result = validateOwnerAddress('solana', '0InvalidBase58Address');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.toLowerCase()).toContain('base58');
    });
  });

  // -------------------------------------------------------------------------
  // Ethereum
  // -------------------------------------------------------------------------

  describe('ethereum', () => {
    it('accepts valid EIP-55 checksum address', () => {
      // Well-known EIP-55 test vector
      const result = validateOwnerAddress('ethereum', '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed');
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe('0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed');
    });

    it('rejects all-lowercase 0x address (strict EIP-55)', () => {
      // All-lowercase is rejected when strict=true
      const result = validateOwnerAddress(
        'ethereum',
        '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed',
      );
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('rejects address without 0x prefix', () => {
      const result = validateOwnerAddress('ethereum', '5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('rejects address with wrong checksum', () => {
      // Intentionally wrong checksum (swapped a->A in middle)
      const result = validateOwnerAddress('ethereum', '0x5aAeb6053F3E94C9b9A09f33669435E7EF1BeAed');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('rejects too-short address', () => {
      const result = validateOwnerAddress('ethereum', '0x5aAeb6053F3');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Unknown chain
  // -------------------------------------------------------------------------

  describe('unknown chain', () => {
    it('returns error for unsupported chain', () => {
      const result = validateOwnerAddress('bitcoin' as ChainType, 'someaddress');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Unsupported chain');
    });
  });
});
