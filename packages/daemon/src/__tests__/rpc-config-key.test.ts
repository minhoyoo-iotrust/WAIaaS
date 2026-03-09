/**
 * rpcConfigKey + resolveRpcUrl unit tests.
 *
 * Covers:
 * 1. Solana RPC config key: solana_{network}
 * 2. EVM RPC config key: evm_{network_underscored} (no chain prefix)
 * 3. All 10 EVM networks produce keys matching setting-keys.ts definitions
 * 4. resolveRpcUrl delegates to rpcConfigKey for consistent key construction
 *
 * Regression test for #167: subscriberFactory was constructing
 * rpc.evm_{chain}_{network} instead of rpc.evm_{network}.
 */

import { describe, it, expect } from 'vitest';
import { rpcConfigKey, resolveRpcUrl } from '../infrastructure/adapter-pool.js';

// All EVM network IDs defined in setting-keys.ts
const EVM_NETWORKS = [
  'ethereum-mainnet',
  'ethereum-sepolia',
  'polygon-mainnet',
  'polygon-amoy',
  'arbitrum-mainnet',
  'arbitrum-sepolia',
  'optimism-mainnet',
  'optimism-sepolia',
  'base-mainnet',
  'base-sepolia',
  'hyperevm-mainnet',
  'hyperevm-testnet',
] as const;

// Expected setting keys (without `rpc.` prefix) from setting-keys.ts
const EXPECTED_EVM_KEYS: Record<string, string> = {
  'ethereum-mainnet': 'evm_ethereum_mainnet',
  'ethereum-sepolia': 'evm_ethereum_sepolia',
  'polygon-mainnet': 'evm_polygon_mainnet',
  'polygon-amoy': 'evm_polygon_amoy',
  'arbitrum-mainnet': 'evm_arbitrum_mainnet',
  'arbitrum-sepolia': 'evm_arbitrum_sepolia',
  'optimism-mainnet': 'evm_optimism_mainnet',
  'optimism-sepolia': 'evm_optimism_sepolia',
  'base-mainnet': 'evm_base_mainnet',
  'base-sepolia': 'evm_base_sepolia',
  'hyperevm-mainnet': 'evm_hyperevm_mainnet',
  'hyperevm-testnet': 'evm_hyperevm_testnet',
};

describe('rpcConfigKey', () => {
  // Test 1: Solana networks (strip solana- prefix for config key)
  it.each([
    ['solana-mainnet', 'solana_mainnet'],
    ['solana-devnet', 'solana_devnet'],
    ['solana-testnet', 'solana_testnet'],
  ])('solana + %s -> %s', (network, expectedKey) => {
    expect(rpcConfigKey('solana', network)).toBe(expectedKey);
  });

  // Test 2: EVM networks — no chain prefix duplication (#167)
  it.each(EVM_NETWORKS)('ethereum + %s -> evm_{network} (no chain prefix)', (network) => {
    const key = rpcConfigKey('ethereum', network);
    expect(key).toBe(EXPECTED_EVM_KEYS[network]);
    // Regression: must NOT contain chain prefix duplication
    expect(key).not.toMatch(/^evm_ethereum_ethereum_/);
    expect(key).not.toMatch(/^evm_ethereum_polygon_/);
    expect(key).not.toMatch(/^evm_ethereum_arbitrum_/);
    expect(key).not.toMatch(/^evm_ethereum_optimism_/);
    expect(key).not.toMatch(/^evm_ethereum_base_/);
  });

  // Test 3: SettingsService key format (with rpc. prefix)
  it('prefixed with rpc. matches SettingsService keys', () => {
    expect(`rpc.${rpcConfigKey('solana', 'solana-devnet')}`).toBe('rpc.solana_devnet');
    expect(`rpc.${rpcConfigKey('ethereum', 'ethereum-sepolia')}`).toBe('rpc.evm_ethereum_sepolia');
    expect(`rpc.${rpcConfigKey('ethereum', 'polygon-amoy')}`).toBe('rpc.evm_polygon_amoy');
    expect(`rpc.${rpcConfigKey('ethereum', 'base-sepolia')}`).toBe('rpc.evm_base_sepolia');
  });
});

describe('resolveRpcUrl', () => {
  const rpcConfig: Record<string, string> = {
    solana_devnet: 'https://api.devnet.solana.com',
    evm_ethereum_sepolia: 'https://sepolia.drpc.org',
    evm_polygon_amoy: 'https://polygon-amoy.drpc.org',
  };

  it('resolves Solana RPC URL', () => {
    expect(resolveRpcUrl(rpcConfig, 'solana', 'solana-devnet')).toBe('https://api.devnet.solana.com');
  });

  it('resolves EVM RPC URL without chain prefix duplication', () => {
    expect(resolveRpcUrl(rpcConfig, 'ethereum', 'ethereum-sepolia')).toBe('https://sepolia.drpc.org');
    expect(resolveRpcUrl(rpcConfig, 'ethereum', 'polygon-amoy')).toBe('https://polygon-amoy.drpc.org');
  });

  it('returns empty string for unknown network', () => {
    expect(resolveRpcUrl(rpcConfig, 'ethereum', 'unknown-chain')).toBe('');
    expect(resolveRpcUrl(rpcConfig, 'solana', 'unknown')).toBe('');
  });

  it('returns empty string for unknown chain', () => {
    expect(resolveRpcUrl(rpcConfig, 'bitcoin', 'solana-mainnet')).toBe('');
  });
});
