/**
 * verifySIWE pure function tests: SIWE (EIP-4361) message + EIP-191 signature verification.
 *
 * Tests cover:
 * 1. Returns valid=true for valid SIWE message + correct signature
 * 2. Returns valid=false with "expired" for expired SIWE message
 * 3. Returns valid=false when signature is from different account than expectedAddress
 * 4. Returns valid=false when message is malformed (not EIP-4361 format)
 * 5. Returns valid=false when signature is corrupted (invalid hex)
 *
 * Uses viem/accounts privateKeyToAccount + viem/siwe createSiweMessage for real crypto.
 */

import { describe, it, expect } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { createSiweMessage } from 'viem/siwe';
import { verifySIWE } from '../api/middleware/siwe-verify.js';

// Hardhat account #0 -- well-known test private key
const testAccount = privateKeyToAccount(
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
);

// Hardhat account #1 -- different signer
const otherAccount = privateKeyToAccount(
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
);

/**
 * Helper: create a valid SIWE message for the given account with optional overrides.
 */
function buildSiweMessage(
  address: `0x${string}`,
  opts?: { expirationTime?: Date },
): string {
  return createSiweMessage({
    address,
    chainId: 1,
    domain: 'localhost',
    nonce: 'testnonce123',
    uri: 'http://localhost:3000',
    version: '1',
    expirationTime: opts?.expirationTime ?? new Date(Date.now() + 300_000),
  });
}

describe('verifySIWE', () => {
  it('returns valid=true for valid SIWE message + correct signature', async () => {
    const message = buildSiweMessage(testAccount.address);
    const signature = await testAccount.signMessage({ message });

    const result = await verifySIWE({
      message,
      signature,
      expectedAddress: testAccount.address,
    });

    expect(result.valid).toBe(true);
    expect(result.address).toBe(testAccount.address);
    expect(result.error).toBeUndefined();
  });

  it('returns valid=false with "expired" error for expired SIWE message', async () => {
    const message = buildSiweMessage(testAccount.address, {
      expirationTime: new Date(Date.now() - 60_000), // 1 minute in the past
    });
    const signature = await testAccount.signMessage({ message });

    const result = await verifySIWE({
      message,
      signature,
      expectedAddress: testAccount.address,
    });

    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error!.toLowerCase()).toContain('expired');
  });

  it('returns valid=false when signature is from different account', async () => {
    const message = buildSiweMessage(testAccount.address);
    // Sign with a DIFFERENT account
    const signature = await otherAccount.signMessage({ message });

    const result = await verifySIWE({
      message,
      signature,
      expectedAddress: testAccount.address,
    });

    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('returns valid=false when message is malformed (not EIP-4361)', async () => {
    const malformedMessage = 'This is not a valid SIWE message at all';
    const signature = await testAccount.signMessage({ message: malformedMessage });

    const result = await verifySIWE({
      message: malformedMessage,
      signature,
      expectedAddress: testAccount.address,
    });

    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('returns valid=false when signature is corrupted', async () => {
    const message = buildSiweMessage(testAccount.address);

    const result = await verifySIWE({
      message,
      signature: '0xdeadbeef',
      expectedAddress: testAccount.address,
    });

    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });
});
