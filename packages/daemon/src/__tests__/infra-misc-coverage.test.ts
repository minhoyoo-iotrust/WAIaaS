/**
 * Coverage sweep tests for infrastructure miscellaneous files.
 *
 * Targets:
 * - infrastructure/settings/settings-crypto.ts (encrypt/decrypt)
 * - infrastructure/adapter-pool.ts (resolveRpcUrl)
 * - pipeline/resolve-effective-amount-usd.ts
 * - CREDENTIAL_KEYS export
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';

// ---------------------------------------------------------------------------
// Settings crypto
// ---------------------------------------------------------------------------

describe('settings crypto', () => {
  let encryptSettingValue: any;
  let decryptSettingValue: any;

  beforeAll(async () => {
    const mod = await import('../infrastructure/settings/settings-crypto.js');
    encryptSettingValue = mod.encryptSettingValue;
    decryptSettingValue = mod.decryptSettingValue;
  });

  it('encrypts and decrypts a value', () => {
    const password = 'test-master-password-coverage';
    const plaintext = 'sk-secret-api-key-coverage';

    const encrypted = encryptSettingValue(plaintext, password);
    expect(encrypted).not.toBe(plaintext);
    expect(encrypted.length).toBeGreaterThan(0);

    const decrypted = decryptSettingValue(encrypted, password);
    expect(decrypted).toBe(plaintext);
  });

  it('different passwords produce different ciphertext', () => {
    const plaintext = 'my-secret-coverage';
    const enc1 = encryptSettingValue(plaintext, 'password-a');
    const enc2 = encryptSettingValue(plaintext, 'password-b');
    expect(enc1).not.toBe(enc2);
  });

  it('decryption with wrong password throws', () => {
    const encrypted = encryptSettingValue('secret-cov', 'correct-pass');
    expect(() => {
      decryptSettingValue(encrypted, 'wrong-pass');
    }).toThrow();
  });

  it('handles empty plaintext', () => {
    const encrypted = encryptSettingValue('', 'password-c');
    const decrypted = decryptSettingValue(encrypted, 'password-c');
    expect(decrypted).toBe('');
  });

  it('handles long plaintext', () => {
    const longText = 'x'.repeat(1000);
    const encrypted = encryptSettingValue(longText, 'password-d');
    const decrypted = decryptSettingValue(encrypted, 'password-d');
    expect(decrypted).toBe(longText);
  });
});

// ---------------------------------------------------------------------------
// CREDENTIAL_KEYS
// ---------------------------------------------------------------------------

describe('CREDENTIAL_KEYS', () => {
  it('contains expected credential keys', async () => {
    const { CREDENTIAL_KEYS } = await import('../infrastructure/settings/settings-crypto.js');
    expect(CREDENTIAL_KEYS instanceof Set).toBe(true);
    expect(CREDENTIAL_KEYS.size).toBeGreaterThan(0);
    expect(CREDENTIAL_KEYS.has('notifications.telegram_bot_token')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// resolveRpcUrl
// ---------------------------------------------------------------------------

describe('resolveRpcUrl', () => {
  let resolveRpcUrl: any;

  beforeAll(async () => {
    const mod = await import('../infrastructure/adapter-pool.js');
    resolveRpcUrl = mod.resolveRpcUrl;
  });

  it('resolves EVM RPC URL from config', () => {
    const config = {
      evm_ethereum_mainnet: 'https://eth-mainnet.g.alchemy.com/v2/key',
    };
    const url = resolveRpcUrl(config, 'ethereum', 'ethereum-mainnet');
    expect(url).toBe('https://eth-mainnet.g.alchemy.com/v2/key');
  });

  it('resolves Solana RPC URL from config', () => {
    const config = {
      solana_mainnet: 'https://api.mainnet-beta.solana.com',
    };
    const url = resolveRpcUrl(config, 'solana', 'solana-mainnet');
    expect(url).toBe('https://api.mainnet-beta.solana.com');
  });

  it('returns empty string for unconfigured network', () => {
    const url = resolveRpcUrl({}, 'ethereum', 'ethereum-mainnet');
    expect(url).toBe('');
  });
});

// ---------------------------------------------------------------------------
// resolveEffectiveAmountUsd
// ---------------------------------------------------------------------------

describe('resolveEffectiveAmountUsd', () => {
  let resolveEffectiveAmountUsd: any;

  beforeAll(async () => {
    const mod = await import('../pipeline/resolve-effective-amount-usd.js');
    resolveEffectiveAmountUsd = mod.resolveEffectiveAmountUsd;
  });

  it('returns error result when oracle throws', async () => {
    const mockOracle = {
      getNativePrice: vi.fn().mockRejectedValue(new Error('oracle down')),
    };
    const result = await resolveEffectiveAmountUsd(
      { amount: '1000000000' },
      'TRANSFER',
      'solana',
      mockOracle,
      'solana-mainnet',
    );
    expect(result.type).toBe('oracleDown');
  });
});
