/**
 * Tests for AA provider API key encryption/decryption.
 */

import { describe, it, expect } from 'vitest';
import {
  encryptProviderApiKey,
  decryptProviderApiKey,
} from '../infrastructure/smart-account/aa-provider-crypto.js';

describe('AA provider API key crypto', () => {
  const masterPassword = 'test-master-password-123';
  const apiKey = 'pk_live_abc123def456';

  it('round-trip encrypt + decrypt succeeds', () => {
    const encrypted = encryptProviderApiKey(apiKey, masterPassword);
    expect(encrypted).not.toBe(apiKey);
    const decrypted = decryptProviderApiKey(encrypted, masterPassword);
    expect(decrypted).toBe(apiKey);
  });

  it('produces different ciphertext each time (random IV)', () => {
    const a = encryptProviderApiKey(apiKey, masterPassword);
    const b = encryptProviderApiKey(apiKey, masterPassword);
    expect(a).not.toBe(b);
  });

  it('decryption with wrong password throws', () => {
    const encrypted = encryptProviderApiKey(apiKey, masterPassword);
    expect(() => decryptProviderApiKey(encrypted, 'wrong-password')).toThrow();
  });

  it('encrypted value is base64 JSON with iv, ct, tag', () => {
    const encrypted = encryptProviderApiKey(apiKey, masterPassword);
    const parsed = JSON.parse(Buffer.from(encrypted, 'base64').toString('utf8'));
    expect(parsed).toHaveProperty('iv');
    expect(parsed).toHaveProperty('ct');
    expect(parsed).toHaveProperty('tag');
  });
});
