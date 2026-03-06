/**
 * Tests for Smart Account Lite/Full provider mode.
 *
 * Plan 338-01: Provider Lite/Full mode validation and send blocking.
 */

import { describe, it, expect } from 'vitest';
import { CreateWalletRequestSchema, type CreateWalletRequest } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Task 1: Schema validation + buildProviderStatus
// ---------------------------------------------------------------------------

describe('CreateWalletRequestSchema Lite mode', () => {
  // Test 1: accountType='smart' + no aaProvider should PASS (Lite mode)
  it('T1: smart account without aaProvider passes validation (Lite mode)', () => {
    const input = {
      name: 'lite-wallet',
      chain: 'ethereum',
      environment: 'testnet',
      accountType: 'smart',
    };
    const result = CreateWalletRequestSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  // Test 2: smart + pimlico without API key still fails
  it('T2: smart + pimlico without aaProviderApiKey still fails', () => {
    const input = {
      name: 'pimlico-wallet',
      chain: 'ethereum',
      environment: 'testnet',
      accountType: 'smart',
      aaProvider: 'pimlico',
    };
    const result = CreateWalletRequestSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  // Test 3: smart + custom without aaBundlerUrl still fails
  it('T3: smart + custom without aaBundlerUrl still fails', () => {
    const input = {
      name: 'custom-wallet',
      chain: 'ethereum',
      environment: 'testnet',
      accountType: 'smart',
      aaProvider: 'custom',
    };
    const result = CreateWalletRequestSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  // Test 4: smart + pimlico + API key passes
  it('T4: smart + pimlico + aaProviderApiKey passes validation (Full mode)', () => {
    const input = {
      name: 'full-wallet',
      chain: 'ethereum',
      environment: 'testnet',
      accountType: 'smart',
      aaProvider: 'pimlico',
      aaProviderApiKey: 'pk_test_abc123',
    };
    const result = CreateWalletRequestSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  // Test 5: EOA wallet ignores aaProvider fields
  it('T5: EOA wallet ignores aaProvider fields', () => {
    const input = {
      name: 'eoa-wallet',
      chain: 'solana',
      environment: 'testnet',
      accountType: 'eoa',
    };
    const result = CreateWalletRequestSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});

describe('buildProviderStatus Lite/Full mode', () => {
  // Dynamically import to test the function
  it('T6: returns null for aaProvider=null (Lite mode)', async () => {
    const { buildProviderStatus } = await import('../api/routes/wallets.js');
    const result = buildProviderStatus({ aaProvider: null, aaPaymasterUrl: null });
    expect(result).toBeNull();
  });

  it('T7: returns provider info for aaProvider=pimlico (Full mode)', async () => {
    const { buildProviderStatus } = await import('../api/routes/wallets.js');
    const result = buildProviderStatus({ aaProvider: 'pimlico', aaPaymasterUrl: null });
    expect(result).not.toBeNull();
    expect(result!.name).toBe('pimlico');
    expect(result!.supportedChains).toBeDefined();
    // Preset providers like pimlico always have paymaster enabled
    expect(result!.paymasterEnabled).toBe(true);
  });

  it('T8: custom provider paymasterEnabled depends on aaPaymasterUrl', async () => {
    const { buildProviderStatus } = await import('../api/routes/wallets.js');
    const withoutPaymaster = buildProviderStatus({ aaProvider: 'custom', aaPaymasterUrl: null });
    expect(withoutPaymaster).not.toBeNull();
    expect(withoutPaymaster!.paymasterEnabled).toBe(false);

    const withPaymaster = buildProviderStatus({
      aaProvider: 'custom',
      aaPaymasterUrl: 'https://paymaster.example.com',
    });
    expect(withPaymaster).not.toBeNull();
    expect(withPaymaster!.paymasterEnabled).toBe(true);
  });
});
