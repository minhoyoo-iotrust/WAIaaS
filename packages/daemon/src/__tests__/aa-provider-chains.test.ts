/**
 * Tests for AA provider chain mapping: enum, chain resolution, URL building.
 */

import { describe, it, expect } from 'vitest';
import {
  AA_PROVIDER_NAMES,
  AaProviderNameEnum,
  resolveProviderChainId,
  buildProviderBundlerUrl,
  AA_PROVIDER_CHAIN_MAP,
  AA_PROVIDER_DASHBOARD_URLS,
  CreateWalletRequestSchema,
} from '@waiaas/core';

describe('AA_PROVIDER_NAMES enum', () => {
  it('contains exactly pimlico, alchemy, custom', () => {
    expect(AA_PROVIDER_NAMES).toEqual(['pimlico', 'alchemy', 'custom']);
  });
});

describe('AaProviderNameEnum', () => {
  it('parses pimlico', () => {
    expect(AaProviderNameEnum.parse('pimlico')).toBe('pimlico');
  });

  it('parses alchemy', () => {
    expect(AaProviderNameEnum.parse('alchemy')).toBe('alchemy');
  });

  it('parses custom', () => {
    expect(AaProviderNameEnum.parse('custom')).toBe('custom');
  });

  it('rejects gelato', () => {
    expect(() => AaProviderNameEnum.parse('gelato')).toThrow();
  });
});

describe('resolveProviderChainId', () => {
  it('resolves pimlico + ethereum-sepolia -> sepolia', () => {
    expect(resolveProviderChainId('pimlico', 'ethereum-sepolia')).toBe('sepolia');
  });

  it('resolves alchemy + ethereum-sepolia -> eth-sepolia', () => {
    expect(resolveProviderChainId('alchemy', 'ethereum-sepolia')).toBe('eth-sepolia');
  });

  it('returns null for pimlico + solana-mainnet (unsupported)', () => {
    expect(resolveProviderChainId('pimlico', 'solana-mainnet')).toBeNull();
  });

  it('returns null for custom + any-network (no mapping)', () => {
    expect(resolveProviderChainId('custom', 'any-network')).toBeNull();
  });

  it('resolves all 10 WAIaaS networkIds for pimlico', () => {
    const pimlicoMap = AA_PROVIDER_CHAIN_MAP.pimlico;
    expect(Object.keys(pimlicoMap)).toHaveLength(10);
    expect(pimlicoMap['ethereum-mainnet']).toBe('ethereum');
    expect(pimlicoMap['ethereum-sepolia']).toBe('sepolia');
    expect(pimlicoMap['polygon-mainnet']).toBe('polygon');
    expect(pimlicoMap['polygon-amoy']).toBe('polygon-amoy');
    expect(pimlicoMap['arbitrum-mainnet']).toBe('arbitrum');
    expect(pimlicoMap['arbitrum-sepolia']).toBe('arbitrum-sepolia');
    expect(pimlicoMap['optimism-mainnet']).toBe('optimism');
    expect(pimlicoMap['optimism-sepolia']).toBe('optimism-sepolia');
    expect(pimlicoMap['base-mainnet']).toBe('base');
    expect(pimlicoMap['base-sepolia']).toBe('base-sepolia');
  });

  it('resolves all 10 WAIaaS networkIds for alchemy', () => {
    const alchemyMap = AA_PROVIDER_CHAIN_MAP.alchemy;
    expect(Object.keys(alchemyMap)).toHaveLength(10);
    expect(alchemyMap['ethereum-mainnet']).toBe('eth-mainnet');
    expect(alchemyMap['ethereum-sepolia']).toBe('eth-sepolia');
    expect(alchemyMap['polygon-mainnet']).toBe('polygon-mainnet');
    expect(alchemyMap['polygon-amoy']).toBe('polygon-amoy');
    expect(alchemyMap['arbitrum-mainnet']).toBe('arb-mainnet');
    expect(alchemyMap['arbitrum-sepolia']).toBe('arb-sepolia');
    expect(alchemyMap['optimism-mainnet']).toBe('opt-mainnet');
    expect(alchemyMap['optimism-sepolia']).toBe('opt-sepolia');
    expect(alchemyMap['base-mainnet']).toBe('base-mainnet');
    expect(alchemyMap['base-sepolia']).toBe('base-sepolia');
  });
});

describe('buildProviderBundlerUrl', () => {
  it('builds pimlico bundler URL', () => {
    expect(buildProviderBundlerUrl('pimlico', 'sepolia', 'test-key')).toBe(
      'https://api.pimlico.io/v2/sepolia/rpc?apikey=test-key',
    );
  });

  it('builds alchemy bundler URL', () => {
    expect(buildProviderBundlerUrl('alchemy', 'eth-sepolia', 'test-key')).toBe(
      'https://eth-sepolia.g.alchemy.com/v2/test-key',
    );
  });
});

describe('AA_PROVIDER_DASHBOARD_URLS', () => {
  it('has pimlico dashboard URL', () => {
    expect(AA_PROVIDER_DASHBOARD_URLS.pimlico).toBe('https://dashboard.pimlico.io');
  });

  it('has alchemy dashboard URL', () => {
    expect(AA_PROVIDER_DASHBOARD_URLS.alchemy).toBe('https://dashboard.alchemy.com');
  });
});

describe('CreateWalletRequestSchema provider validation', () => {
  it('validates smart account with pimlico provider + apiKey', () => {
    const result = CreateWalletRequestSchema.safeParse({
      name: 'test-smart',
      chain: 'ethereum',
      environment: 'testnet',
      accountType: 'smart',
      aaProvider: 'pimlico',
      aaProviderApiKey: 'pk_live_test123',
    });
    expect(result.success).toBe(true);
  });

  it('rejects smart account without provider', () => {
    const result = CreateWalletRequestSchema.safeParse({
      name: 'test-smart',
      chain: 'ethereum',
      environment: 'testnet',
      accountType: 'smart',
    });
    expect(result.success).toBe(false);
  });

  it('allows EOA without provider', () => {
    const result = CreateWalletRequestSchema.safeParse({
      name: 'test-eoa',
      chain: 'ethereum',
      environment: 'testnet',
      accountType: 'eoa',
    });
    expect(result.success).toBe(true);
  });

  it('rejects pimlico without apiKey', () => {
    const result = CreateWalletRequestSchema.safeParse({
      name: 'test-smart',
      chain: 'ethereum',
      environment: 'testnet',
      accountType: 'smart',
      aaProvider: 'pimlico',
    });
    expect(result.success).toBe(false);
  });

  it('validates custom provider with bundlerUrl', () => {
    const result = CreateWalletRequestSchema.safeParse({
      name: 'test-smart',
      chain: 'ethereum',
      environment: 'testnet',
      accountType: 'smart',
      aaProvider: 'custom',
      aaBundlerUrl: 'https://my-bundler.example.com/rpc',
    });
    expect(result.success).toBe(true);
  });

  it('rejects custom provider without bundlerUrl', () => {
    const result = CreateWalletRequestSchema.safeParse({
      name: 'test-smart',
      chain: 'ethereum',
      environment: 'testnet',
      accountType: 'smart',
      aaProvider: 'custom',
    });
    expect(result.success).toBe(false);
  });
});
