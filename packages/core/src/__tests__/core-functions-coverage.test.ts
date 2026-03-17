import { describe, it, expect } from 'vitest';
import { nativeDecimals, nativeSymbol } from '../utils/chain-constants.js';
import { resolveProviderChainId, buildProviderBundlerUrl } from '../constants/aa-provider-chains.js';

describe('chain-constants utility functions', () => {
  describe('nativeDecimals', () => {
    it('returns 9 for solana', () => {
      expect(nativeDecimals('solana')).toBe(9);
    });

    it('returns 18 for ethereum', () => {
      expect(nativeDecimals('ethereum')).toBe(18);
    });

    it('defaults to 18 for unknown chains', () => {
      expect(nativeDecimals('bitcoin')).toBe(18);
      expect(nativeDecimals('unknown')).toBe(18);
    });
  });

  describe('nativeSymbol', () => {
    it('returns SOL for solana', () => {
      expect(nativeSymbol('solana')).toBe('SOL');
    });

    it('returns ETH for ethereum', () => {
      expect(nativeSymbol('ethereum')).toBe('ETH');
    });

    it('defaults to uppercase chain name for unknown chains', () => {
      expect(nativeSymbol('bitcoin')).toBe('BITCOIN');
      expect(nativeSymbol('polygon')).toBe('POLYGON');
    });
  });
});

describe('AA provider chain functions', () => {
  describe('resolveProviderChainId', () => {
    it('resolves pimlico chain IDs', () => {
      expect(resolveProviderChainId('pimlico', 'ethereum-mainnet')).toBe('ethereum');
      expect(resolveProviderChainId('pimlico', 'base-sepolia')).toBe('base-sepolia');
    });

    it('resolves alchemy chain IDs', () => {
      expect(resolveProviderChainId('alchemy', 'ethereum-mainnet')).toBe('eth-mainnet');
      expect(resolveProviderChainId('alchemy', 'arbitrum-mainnet')).toBe('arb-mainnet');
    });

    it('returns null for custom provider', () => {
      expect(resolveProviderChainId('custom', 'ethereum-mainnet')).toBeNull();
    });

    it('returns null for unsupported network', () => {
      expect(resolveProviderChainId('pimlico', 'solana-mainnet')).toBeNull();
      expect(resolveProviderChainId('alchemy', 'unknown-network')).toBeNull();
    });
  });

  describe('buildProviderBundlerUrl', () => {
    it('builds pimlico URL', () => {
      const url = buildProviderBundlerUrl('pimlico', 'ethereum', 'test-key');
      expect(url).toBe('https://api.pimlico.io/v2/ethereum/rpc?apikey=test-key');
    });

    it('builds alchemy URL', () => {
      const url = buildProviderBundlerUrl('alchemy', 'eth-mainnet', 'alchemy-key');
      expect(url).toBe('https://eth-mainnet.g.alchemy.com/v2/alchemy-key');
    });
  });
});
