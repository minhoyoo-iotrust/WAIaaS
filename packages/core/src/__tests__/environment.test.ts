import { describe, it, expect } from 'vitest';
import {
  ENVIRONMENT_TYPES,
  EnvironmentTypeEnum,
  ENVIRONMENT_NETWORK_MAP,
  getNetworksForEnvironment,
  getSingleNetwork,
  deriveEnvironment,
  validateNetworkEnvironment,
  NETWORK_TYPES,
  ENVIRONMENT_SINGLE_NETWORK,
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
  it('should cover all 15 NETWORK_TYPES without duplicates or omissions', () => {
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
  it('solana mainnet -> [solana-mainnet]', () => {
    expect(getNetworksForEnvironment('solana', 'mainnet')).toEqual(['solana-mainnet']);
  });

  it('solana testnet -> [solana-devnet, solana-testnet]', () => {
    expect(getNetworksForEnvironment('solana', 'testnet')).toEqual([
      'solana-devnet',
      'solana-testnet',
    ]);
  });

  it('ethereum mainnet -> 6 EVM mainnet networks', () => {
    expect(getNetworksForEnvironment('ethereum', 'mainnet')).toEqual([
      'ethereum-mainnet',
      'polygon-mainnet',
      'arbitrum-mainnet',
      'optimism-mainnet',
      'base-mainnet',
      'hyperevm-mainnet',
    ]);
  });

  it('ethereum testnet -> 6 EVM testnet networks', () => {
    expect(getNetworksForEnvironment('ethereum', 'testnet')).toEqual([
      'ethereum-sepolia',
      'polygon-amoy',
      'arbitrum-sepolia',
      'optimism-sepolia',
      'base-sepolia',
      'hyperevm-testnet',
    ]);
  });
});

// ─── 4. getSingleNetwork() ────────────────────────────────────

describe('getSingleNetwork', () => {
  it('solana mainnet -> solana-mainnet', () => {
    expect(getSingleNetwork('solana', 'mainnet')).toBe('solana-mainnet');
  });

  it('solana testnet -> solana-devnet', () => {
    expect(getSingleNetwork('solana', 'testnet')).toBe('solana-devnet');
  });

  it('ethereum mainnet -> null (EVM has multiple networks)', () => {
    expect(getSingleNetwork('ethereum', 'mainnet')).toBeNull();
  });

  it('ethereum testnet -> null (EVM has multiple networks)', () => {
    expect(getSingleNetwork('ethereum', 'testnet')).toBeNull();
  });
});

// ─── 4b. ENVIRONMENT_SINGLE_NETWORK constant ────────────────────

describe('ENVIRONMENT_SINGLE_NETWORK', () => {
  it('should have all 4 chain:environment keys', () => {
    expect(ENVIRONMENT_SINGLE_NETWORK).toHaveProperty('solana:mainnet');
    expect(ENVIRONMENT_SINGLE_NETWORK).toHaveProperty('solana:testnet');
    expect(ENVIRONMENT_SINGLE_NETWORK).toHaveProperty('ethereum:mainnet');
    expect(ENVIRONMENT_SINGLE_NETWORK).toHaveProperty('ethereum:testnet');
  });

  it('Solana entries return network values', () => {
    expect(ENVIRONMENT_SINGLE_NETWORK['solana:mainnet']).toBe('solana-mainnet');
    expect(ENVIRONMENT_SINGLE_NETWORK['solana:testnet']).toBe('solana-devnet');
  });

  it('EVM entries return null', () => {
    expect(ENVIRONMENT_SINGLE_NETWORK['ethereum:mainnet']).toBeNull();
    expect(ENVIRONMENT_SINGLE_NETWORK['ethereum:testnet']).toBeNull();
  });
});

// ─── 5. deriveEnvironment() -- 15-value exhaustive ──────────────

describe('deriveEnvironment', () => {
  // 7 mainnet networks
  it.each([
    'solana-mainnet',
    'ethereum-mainnet',
    'polygon-mainnet',
    'arbitrum-mainnet',
    'optimism-mainnet',
    'base-mainnet',
    'hyperevm-mainnet',
  ] as const)('%s -> mainnet', (network) => {
    expect(deriveEnvironment(network)).toBe('mainnet');
  });

  // 8 testnet networks
  it.each([
    'solana-devnet',
    'solana-testnet',
    'ethereum-sepolia',
    'polygon-amoy',
    'arbitrum-sepolia',
    'optimism-sepolia',
    'base-sepolia',
    'hyperevm-testnet',
  ] as const)('%s -> testnet', (network) => {
    expect(deriveEnvironment(network)).toBe('testnet');
  });
});

// ─── 6. validateNetworkEnvironment() ────────────────────────────

describe('validateNetworkEnvironment', () => {
  it('valid: solana mainnet solana-mainnet -> no throw', () => {
    expect(() =>
      validateNetworkEnvironment('solana', 'mainnet', 'solana-mainnet'),
    ).not.toThrow();
  });

  it('valid: ethereum testnet polygon-amoy -> no throw', () => {
    expect(() =>
      validateNetworkEnvironment('ethereum', 'testnet', 'polygon-amoy'),
    ).not.toThrow();
  });

  it('mismatch: solana mainnet solana-devnet -> throw', () => {
    expect(() =>
      validateNetworkEnvironment('solana', 'mainnet', 'solana-devnet'),
    ).toThrow(/Invalid network 'solana-devnet' for chain 'solana' in environment 'mainnet'/);
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
