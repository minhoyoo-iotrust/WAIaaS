/**
 * Across config helpers unit tests.
 * Tests chain ID mapping, SpokePool/WETH address lookups, native token detection.
 *
 * @see internal/design/79-across-protocol-bridge.md (sections 8.6-8.8)
 */
import { describe, it, expect } from 'vitest';
import { ChainError } from '@waiaas/core';
import {
  ACROSS_DEFAULTS,
  ACROSS_CHAIN_MAP,
  SPOKE_POOL_ADDRESSES,
  WETH_ADDRESSES,
  getAcrossChainId,
  getSpokePoolAddress,
  getWethAddress,
  isNativeTokenBridge,
} from '../config.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getAcrossChainId', () => {
  it.each([
    ['ethereum', 1],
    ['arbitrum', 42161],
    ['optimism', 10],
    ['base', 8453],
    ['polygon', 137],
    ['linea', 59144],
  ])('returns correct chain ID for %s -> %d', (chain, expected) => {
    expect(getAcrossChainId(chain)).toBe(expected);
  });

  it.each([
    ['ethereum-mainnet', 1],
    ['arbitrum-mainnet', 42161],
    ['optimism-mainnet', 10],
    ['base-mainnet', 8453],
    ['polygon-mainnet', 137],
    ['linea-mainnet', 59144],
  ])('supports alias %s -> %d', (chain, expected) => {
    expect(getAcrossChainId(chain)).toBe(expected);
  });

  it('is case-insensitive', () => {
    expect(getAcrossChainId('Ethereum')).toBe(1);
    expect(getAcrossChainId('ARBITRUM')).toBe(42161);
    expect(getAcrossChainId('Base')).toBe(8453);
  });

  it('throws ChainError for unsupported chain', () => {
    expect(() => getAcrossChainId('solana')).toThrow(ChainError);
    expect(() => getAcrossChainId('avalanche')).toThrow(ChainError);
  });

  it('error message lists supported chains', () => {
    try {
      getAcrossChainId('solana');
    } catch (err) {
      expect(err).toBeInstanceOf(ChainError);
      expect((err as ChainError).message).toContain('ethereum');
      expect((err as ChainError).message).toContain('arbitrum');
    }
  });
});

describe('getSpokePoolAddress', () => {
  it.each([
    [1, '0x5c7BCd6E7De5423a257D81B442095A1a6ced35C5'],
    [42161, '0xe35e9842fceaCA96570B734083f4a58e8F7C5f2A'],
    [10, '0x6f26Bf09B1C792e3228e5467807a900A503c0281'],
    [8453, '0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64'],
    [137, '0x9295ee1d8C5b022Be115A2AD3c30C72E34e7F096'],
    [59144, '0x7E63A5f1a8F0B4d0934B2f2327DaED3F6bb2ee75'],
  ])('returns correct address for chain %d', (chainId, expected) => {
    expect(getSpokePoolAddress(chainId)).toBe(expected);
  });

  it('throws ChainError for unknown chain ID', () => {
    expect(() => getSpokePoolAddress(999)).toThrow(ChainError);
  });
});

describe('getWethAddress', () => {
  it.each([
    [1, '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'],
    [42161, '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1'],
    [10, '0x4200000000000000000000000000000000000006'],
    [8453, '0x4200000000000000000000000000000000000006'],
    [137, '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270'],
    [59144, '0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f'],
  ])('returns correct WETH address for chain %d', (chainId, expected) => {
    expect(getWethAddress(chainId)).toBe(expected);
  });

  it('throws ChainError for unknown chain ID', () => {
    expect(() => getWethAddress(999)).toThrow(ChainError);
  });
});

describe('isNativeTokenBridge', () => {
  it('returns true when inputToken matches WETH address for chain', () => {
    expect(isNativeTokenBridge('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', 1)).toBe(true);
  });

  it('case-insensitive comparison', () => {
    expect(isNativeTokenBridge('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', 1)).toBe(true);
  });

  it('returns false when inputToken is different ERC-20', () => {
    expect(isNativeTokenBridge('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 1)).toBe(false);
  });

  it('returns false when chainId has no WETH mapping', () => {
    expect(isNativeTokenBridge('0xAnything', 999)).toBe(false);
  });
});

describe('ACROSS_DEFAULTS', () => {
  it('has expected default values', () => {
    expect(ACROSS_DEFAULTS.enabled).toBe(false);
    expect(ACROSS_DEFAULTS.apiBaseUrl).toBe('https://app.across.to/api');
    expect(ACROSS_DEFAULTS.integratorId).toBe('');
    expect(ACROSS_DEFAULTS.fillDeadlineBufferSec).toBe(21_600);
    expect(ACROSS_DEFAULTS.defaultSlippagePct).toBe(0.01);
    expect(ACROSS_DEFAULTS.maxSlippagePct).toBe(0.03);
    expect(ACROSS_DEFAULTS.requestTimeoutMs).toBe(10_000);
  });
});

describe('ACROSS_CHAIN_MAP', () => {
  it('has 12 entries (6 chains x 2 aliases)', () => {
    expect(ACROSS_CHAIN_MAP.size).toBe(12);
  });
});

describe('SPOKE_POOL_ADDRESSES', () => {
  it('has 6 chains', () => {
    expect(SPOKE_POOL_ADDRESSES.size).toBe(6);
  });
});

describe('WETH_ADDRESSES', () => {
  it('has 6 chains', () => {
    expect(WETH_ADDRESSES.size).toBe(6);
  });
});
