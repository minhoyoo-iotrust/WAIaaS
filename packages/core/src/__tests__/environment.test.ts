import { describe, it, expect } from 'vitest';
import {
  ENVIRONMENT_TYPES,
  EnvironmentTypeEnum,
  ENVIRONMENT_NETWORK_MAP,
  getNetworksForEnvironment,
  getDefaultNetwork,
  deriveEnvironment,
  validateNetworkEnvironment,
  NETWORK_TYPES,
} from '../enums/chain.js';

// ─── 1. ENVIRONMENT_TYPES SSoT ─────────────────────────────────

describe('ENVIRONMENT_TYPES SSoT', () => {
  it('should be exactly [testnet, mainnet]', () => {
    expect(ENVIRONMENT_TYPES).toEqual(['testnet', 'mainnet']);
  });

  it('EnvironmentTypeEnum should parse valid values', () => {
    expect(EnvironmentTypeEnum.parse('testnet')).toBe('testnet');
    expect(EnvironmentTypeEnum.parse('mainnet')).toBe('mainnet');
  });

  it('EnvironmentTypeEnum should reject invalid values', () => {
    expect(() => EnvironmentTypeEnum.parse('staging')).toThrow();
    expect(() => EnvironmentTypeEnum.parse('local')).toThrow();
    expect(() => EnvironmentTypeEnum.parse('')).toThrow();
  });
});

// ─── 2. ENVIRONMENT_NETWORK_MAP coverage ────────────────────────

describe('ENVIRONMENT_NETWORK_MAP', () => {
  it('should cover all 13 NETWORK_TYPES without duplicates or omissions', () => {
    const allMapped = Object.values(ENVIRONMENT_NETWORK_MAP).flat();
    const sorted = [...allMapped].sort();
    const expected = [...NETWORK_TYPES].sort();
    expect(sorted).toEqual(expected);
  });

  it('should have all 4 chain:environment keys', () => {
    expect(ENVIRONMENT_NETWORK_MAP).toHaveProperty('solana:mainnet');
    expect(ENVIRONMENT_NETWORK_MAP).toHaveProperty('solana:testnet');
    expect(ENVIRONMENT_NETWORK_MAP).toHaveProperty('ethereum:mainnet');
    expect(ENVIRONMENT_NETWORK_MAP).toHaveProperty('ethereum:testnet');
  });
});

// ─── 3. getNetworksForEnvironment() ─────────────────────────────

describe('getNetworksForEnvironment', () => {
  it('solana mainnet -> [mainnet]', () => {
    expect(getNetworksForEnvironment('solana', 'mainnet')).toEqual(['mainnet']);
  });

  it('solana testnet -> [devnet, testnet]', () => {
    expect(getNetworksForEnvironment('solana', 'testnet')).toEqual([
      'devnet',
      'testnet',
    ]);
  });

  it('ethereum mainnet -> 5 EVM mainnet networks', () => {
    expect(getNetworksForEnvironment('ethereum', 'mainnet')).toEqual([
      'ethereum-mainnet',
      'polygon-mainnet',
      'arbitrum-mainnet',
      'optimism-mainnet',
      'base-mainnet',
    ]);
  });

  it('ethereum testnet -> 5 EVM testnet networks', () => {
    expect(getNetworksForEnvironment('ethereum', 'testnet')).toEqual([
      'ethereum-sepolia',
      'polygon-amoy',
      'arbitrum-sepolia',
      'optimism-sepolia',
      'base-sepolia',
    ]);
  });
});

// ─── 4. getDefaultNetwork() ─────────────────────────────────────

describe('getDefaultNetwork', () => {
  it('solana mainnet -> mainnet', () => {
    expect(getDefaultNetwork('solana', 'mainnet')).toBe('mainnet');
  });

  it('solana testnet -> devnet (ENV-04)', () => {
    expect(getDefaultNetwork('solana', 'testnet')).toBe('devnet');
  });

  it('ethereum mainnet -> ethereum-mainnet', () => {
    expect(getDefaultNetwork('ethereum', 'mainnet')).toBe('ethereum-mainnet');
  });

  it('ethereum testnet -> ethereum-sepolia', () => {
    expect(getDefaultNetwork('ethereum', 'testnet')).toBe('ethereum-sepolia');
  });
});

// ─── 5. deriveEnvironment() -- 13-value exhaustive ──────────────

describe('deriveEnvironment', () => {
  // 6 mainnet networks
  it.each([
    'mainnet',
    'ethereum-mainnet',
    'polygon-mainnet',
    'arbitrum-mainnet',
    'optimism-mainnet',
    'base-mainnet',
  ] as const)('%s -> mainnet', (network) => {
    expect(deriveEnvironment(network)).toBe('mainnet');
  });

  // 7 testnet networks
  it.each([
    'devnet',
    'testnet',
    'ethereum-sepolia',
    'polygon-amoy',
    'arbitrum-sepolia',
    'optimism-sepolia',
    'base-sepolia',
  ] as const)('%s -> testnet', (network) => {
    expect(deriveEnvironment(network)).toBe('testnet');
  });
});

// ─── 6. validateNetworkEnvironment() ────────────────────────────

describe('validateNetworkEnvironment', () => {
  it('valid: solana mainnet mainnet -> no throw', () => {
    expect(() =>
      validateNetworkEnvironment('solana', 'mainnet', 'mainnet'),
    ).not.toThrow();
  });

  it('valid: ethereum testnet polygon-amoy -> no throw', () => {
    expect(() =>
      validateNetworkEnvironment('ethereum', 'testnet', 'polygon-amoy'),
    ).not.toThrow();
  });

  it('mismatch: solana mainnet devnet -> throw', () => {
    expect(() =>
      validateNetworkEnvironment('solana', 'mainnet', 'devnet'),
    ).toThrow(/Invalid network 'devnet' for chain 'solana' in environment 'mainnet'/);
  });

  it('mismatch: ethereum testnet ethereum-mainnet -> throw', () => {
    expect(() =>
      validateNetworkEnvironment('ethereum', 'testnet', 'ethereum-mainnet'),
    ).toThrow(/Invalid network 'ethereum-mainnet' for chain 'ethereum' in environment 'testnet'/);
  });

  it('cross-chain: solana mainnet ethereum-mainnet -> throw', () => {
    expect(() =>
      validateNetworkEnvironment('solana', 'mainnet', 'ethereum-mainnet'),
    ).toThrow(/Invalid network 'ethereum-mainnet' for chain 'solana' in environment 'mainnet'/);
  });
});
