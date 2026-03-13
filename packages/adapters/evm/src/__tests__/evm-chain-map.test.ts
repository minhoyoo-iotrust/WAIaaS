import { describe, it, expect } from 'vitest';
import { EVM_CHAIN_MAP, EVM_CHAIN_ID_TO_NETWORK, getNetworkByChainId } from '../evm-chain-map.js';
import { EVM_NETWORK_TYPES } from '@waiaas/core';

describe('EVM_CHAIN_MAP', () => {
  it('has exactly 12 entries (one per EVM network)', () => {
    expect(Object.keys(EVM_CHAIN_MAP)).toHaveLength(12);
  });

  it('keys match EVM_NETWORK_TYPES exactly', () => {
    const mapKeys = Object.keys(EVM_CHAIN_MAP).sort();
    const enumValues = [...EVM_NETWORK_TYPES].sort();
    expect(mapKeys).toEqual(enumValues);
  });

  describe('each entry has required fields', () => {
    for (const [network, entry] of Object.entries(EVM_CHAIN_MAP)) {
      it(`${network} has viemChain with id`, () => {
        expect(entry.viemChain).toBeDefined();
        expect(typeof entry.viemChain.id).toBe('number');
      });

      it(`${network} has positive chainId`, () => {
        expect(entry.chainId).toBeGreaterThan(0);
      });

      it(`${network} has non-empty nativeSymbol`, () => {
        expect(typeof entry.nativeSymbol).toBe('string');
        expect(entry.nativeSymbol.length).toBeGreaterThan(0);
      });

      it(`${network} has non-empty nativeName`, () => {
        expect(typeof entry.nativeName).toBe('string');
        expect(entry.nativeName.length).toBeGreaterThan(0);
      });
    }
  });

  describe('specific chain values', () => {
    it('ethereum-mainnet: chainId=1, ETH', () => {
      const entry = EVM_CHAIN_MAP['ethereum-mainnet'];
      expect(entry.chainId).toBe(1);
      expect(entry.nativeSymbol).toBe('ETH');
      expect(entry.nativeName).toBe('Ether');
    });

    it('polygon-mainnet: chainId=137, POL', () => {
      const entry = EVM_CHAIN_MAP['polygon-mainnet'];
      expect(entry.chainId).toBe(137);
      expect(entry.nativeSymbol).toBe('POL');
      expect(entry.nativeName).toBe('POL');
    });

    it('polygon-amoy: chainId=80002, POL', () => {
      const entry = EVM_CHAIN_MAP['polygon-amoy'];
      expect(entry.chainId).toBe(80002);
      expect(entry.nativeSymbol).toBe('POL');
      expect(entry.nativeName).toBe('POL');
    });

    it('arbitrum-mainnet: chainId=42161, ETH', () => {
      const entry = EVM_CHAIN_MAP['arbitrum-mainnet'];
      expect(entry.chainId).toBe(42161);
      expect(entry.nativeSymbol).toBe('ETH');
      expect(entry.nativeName).toBe('Ether');
    });

    it('optimism-mainnet: chainId=10, ETH', () => {
      const entry = EVM_CHAIN_MAP['optimism-mainnet'];
      expect(entry.chainId).toBe(10);
      expect(entry.nativeSymbol).toBe('ETH');
      expect(entry.nativeName).toBe('Ether');
    });

    it('base-mainnet: chainId=8453, ETH', () => {
      const entry = EVM_CHAIN_MAP['base-mainnet'];
      expect(entry.chainId).toBe(8453);
      expect(entry.nativeSymbol).toBe('ETH');
      expect(entry.nativeName).toBe('Ether');
    });

    it('ethereum-sepolia: chainId=11155111, ETH', () => {
      const entry = EVM_CHAIN_MAP['ethereum-sepolia'];
      expect(entry.chainId).toBe(11155111);
      expect(entry.nativeSymbol).toBe('ETH');
      expect(entry.nativeName).toBe('Ether');
    });

    it('arbitrum-sepolia: chainId=421614, ETH', () => {
      const entry = EVM_CHAIN_MAP['arbitrum-sepolia'];
      expect(entry.chainId).toBe(421614);
      expect(entry.nativeSymbol).toBe('ETH');
      expect(entry.nativeName).toBe('Ether');
    });

    it('optimism-sepolia: chainId=11155420, ETH', () => {
      const entry = EVM_CHAIN_MAP['optimism-sepolia'];
      expect(entry.chainId).toBe(11155420);
      expect(entry.nativeSymbol).toBe('ETH');
      expect(entry.nativeName).toBe('Ether');
    });

    it('base-sepolia: chainId=84532, ETH', () => {
      const entry = EVM_CHAIN_MAP['base-sepolia'];
      expect(entry.chainId).toBe(84532);
      expect(entry.nativeSymbol).toBe('ETH');
      expect(entry.nativeName).toBe('Ether');
    });

    it('hyperevm-mainnet: chainId=999, HYPE', () => {
      const entry = EVM_CHAIN_MAP['hyperevm-mainnet'];
      expect(entry.chainId).toBe(999);
      expect(entry.nativeSymbol).toBe('HYPE');
      expect(entry.nativeName).toBe('HYPE');
    });

    it('hyperevm-testnet: chainId=998, HYPE', () => {
      const entry = EVM_CHAIN_MAP['hyperevm-testnet'];
      expect(entry.chainId).toBe(998);
      expect(entry.nativeSymbol).toBe('HYPE');
      expect(entry.nativeName).toBe('HYPE');
    });
  });

  describe('viemChain.id matches chainId', () => {
    for (const [network, entry] of Object.entries(EVM_CHAIN_MAP)) {
      it(`${network}: viemChain.id === chainId`, () => {
        expect(entry.viemChain.id).toBe(entry.chainId);
      });
    }
  });

  // v31.14: EVM_CHAIN_ID_TO_NETWORK reverse lookup tests (RPC-07)
  describe('EVM_CHAIN_ID_TO_NETWORK reverse lookup', () => {
    it('getNetworkByChainId(1) returns ethereum-mainnet', () => {
      expect(getNetworkByChainId(1)).toBe('ethereum-mainnet');
    });

    it('getNetworkByChainId(8453) returns base-mainnet', () => {
      expect(getNetworkByChainId(8453)).toBe('base-mainnet');
    });

    it('getNetworkByChainId(11155111) returns ethereum-sepolia', () => {
      expect(getNetworkByChainId(11155111)).toBe('ethereum-sepolia');
    });

    it('getNetworkByChainId(42161) returns arbitrum-mainnet', () => {
      expect(getNetworkByChainId(42161)).toBe('arbitrum-mainnet');
    });

    it('getNetworkByChainId(999) returns hyperevm-mainnet', () => {
      expect(getNetworkByChainId(999)).toBe('hyperevm-mainnet');
    });

    it('getNetworkByChainId(99999) returns undefined for unknown chainId', () => {
      expect(getNetworkByChainId(99999)).toBeUndefined();
    });

    it('EVM_CHAIN_ID_TO_NETWORK has same size as EVM_CHAIN_MAP (12 entries)', () => {
      expect(EVM_CHAIN_ID_TO_NETWORK.size).toBe(Object.keys(EVM_CHAIN_MAP).length);
      expect(EVM_CHAIN_ID_TO_NETWORK.size).toBe(12);
    });

    it('every EVM_CHAIN_MAP entry has a reverse mapping', () => {
      for (const [network, entry] of Object.entries(EVM_CHAIN_MAP)) {
        expect(getNetworkByChainId(entry.chainId)).toBe(network);
      }
    });
  });
});
