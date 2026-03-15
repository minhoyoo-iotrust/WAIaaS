/**
 * Tests for well-known contracts data and ActionProviderMetadata displayName.
 */
import { describe, it, expect } from 'vitest';
import {
  WELL_KNOWN_CONTRACTS,
} from '../constants/well-known-contracts.js';
import {
  ActionProviderMetadataSchema,
  snakeCaseToDisplayName,
} from '../interfaces/action-provider.types.js';

// ---------------------------------------------------------------------------
// Well-Known Contracts Data
// ---------------------------------------------------------------------------
describe('WELL_KNOWN_CONTRACTS', () => {
  it('should have at least 300 entries', () => {
    expect(WELL_KNOWN_CONTRACTS.length).toBeGreaterThanOrEqual(300);
  });

  it('every entry has required fields', () => {
    for (const entry of WELL_KNOWN_CONTRACTS) {
      expect(entry).toHaveProperty('address');
      expect(entry).toHaveProperty('name');
      expect(entry).toHaveProperty('protocol');
      expect(entry).toHaveProperty('network');
      expect(typeof entry.address).toBe('string');
      expect(typeof entry.name).toBe('string');
      expect(typeof entry.protocol).toBe('string');
      expect(typeof entry.network).toBe('string');
      expect(entry.address.length).toBeGreaterThan(0);
      expect(entry.name.length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate (address, network) pairs', () => {
    const seen = new Set<string>();
    for (const entry of WELL_KNOWN_CONTRACTS) {
      const key = `${entry.address.toLowerCase()}:${entry.network}`;
      expect(seen.has(key), `Duplicate: ${key} (${entry.name})`).toBe(false);
      seen.add(key);
    }
  });

  it('all EVM addresses are lowercase hex (0x-prefixed, 42 chars)', () => {
    const evmNetworks = ['ethereum', 'base', 'arbitrum', 'optimism', 'polygon'];
    const evmEntries = WELL_KNOWN_CONTRACTS.filter((e) =>
      evmNetworks.includes(e.network),
    );
    expect(evmEntries.length).toBeGreaterThan(0);
    for (const entry of evmEntries) {
      expect(entry.address).toMatch(/^0x[0-9a-f]{40}$/);
    }
  });

  it('all Solana addresses are base58 strings', () => {
    const solanaEntries = WELL_KNOWN_CONTRACTS.filter(
      (e) => e.network === 'solana-mainnet',
    );
    expect(solanaEntries.length).toBeGreaterThan(0);
    for (const entry of solanaEntries) {
      // Base58 alphabet: 123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz
      expect(entry.address).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/);
    }
  });

  // --- Network coverage ---
  it('has Ethereum mainnet entries (Uniswap, Aave, Lido, WETH, USDC, etc.)', () => {
    const eth = WELL_KNOWN_CONTRACTS.filter((e) => e.network === 'ethereum');
    expect(eth.length).toBeGreaterThanOrEqual(80);
    const names = eth.map((e) => e.name.toLowerCase());
    expect(names.some((n) => n.includes('uniswap'))).toBe(true);
    expect(names.some((n) => n.includes('aave'))).toBe(true);
    expect(names.some((n) => n.includes('lido') || n.includes('steth'))).toBe(true);
    expect(names.some((n) => n.includes('weth'))).toBe(true);
    expect(names.some((n) => n.includes('usdc'))).toBe(true);
    expect(names.some((n) => n.includes('usdt'))).toBe(true);
  });

  it('has Base entries (Uniswap, Aerodrome, etc.)', () => {
    const base = WELL_KNOWN_CONTRACTS.filter((e) => e.network === 'base');
    expect(base.length).toBeGreaterThanOrEqual(30);
    const names = base.map((e) => e.name.toLowerCase());
    expect(names.some((n) => n.includes('uniswap') || n.includes('aerodrome'))).toBe(true);
  });

  it('has Arbitrum entries (GMX, Camelot, etc.)', () => {
    const arb = WELL_KNOWN_CONTRACTS.filter((e) => e.network === 'arbitrum');
    expect(arb.length).toBeGreaterThanOrEqual(30);
    const names = arb.map((e) => e.name.toLowerCase());
    expect(names.some((n) => n.includes('gmx') || n.includes('camelot'))).toBe(true);
  });

  it('has Optimism entries (Velodrome, etc.)', () => {
    const op = WELL_KNOWN_CONTRACTS.filter((e) => e.network === 'optimism');
    expect(op.length).toBeGreaterThanOrEqual(25);
    const names = op.map((e) => e.name.toLowerCase());
    expect(names.some((n) => n.includes('velodrome'))).toBe(true);
  });

  it('has Polygon entries (QuickSwap, Aave, etc.)', () => {
    const poly = WELL_KNOWN_CONTRACTS.filter((e) => e.network === 'polygon');
    expect(poly.length).toBeGreaterThanOrEqual(30);
    const names = poly.map((e) => e.name.toLowerCase());
    expect(names.some((n) => n.includes('quickswap') || n.includes('aave'))).toBe(true);
  });

  it('has Solana entries (Jupiter, Raydium, Marinade, Token Program, System Program, etc.)', () => {
    const sol = WELL_KNOWN_CONTRACTS.filter(
      (e) => e.network === 'solana-mainnet',
    );
    expect(sol.length).toBeGreaterThanOrEqual(40);
    const names = sol.map((e) => e.name.toLowerCase());
    expect(names.some((n) => n.includes('jupiter'))).toBe(true);
    expect(names.some((n) => n.includes('raydium'))).toBe(true);
    expect(names.some((n) => n.includes('system program'))).toBe(true);
    expect(names.some((n) => n.includes('token program') || n.includes('spl token'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ActionProviderMetadataSchema displayName
// ---------------------------------------------------------------------------
describe('ActionProviderMetadataSchema displayName', () => {
  const validBase = {
    name: 'test_provider',
    description: 'A test provider for unit tests',
    version: '1.0.0',
    chains: ['ethereum'],
  };

  it('accepts displayName as optional string', () => {
    const result = ActionProviderMetadataSchema.safeParse({
      ...validBase,
      displayName: 'My Protocol',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.displayName).toBe('My Protocol');
    }
  });

  it('works without displayName (backward compat)', () => {
    const result = ActionProviderMetadataSchema.safeParse(validBase);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.displayName).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// snakeCaseToDisplayName
// ---------------------------------------------------------------------------
describe('snakeCaseToDisplayName', () => {
  it('converts jupiter_swap to Jupiter Swap', () => {
    expect(snakeCaseToDisplayName('jupiter_swap')).toBe('Jupiter Swap');
  });

  it('converts lifi to Lifi', () => {
    expect(snakeCaseToDisplayName('lifi')).toBe('Lifi');
  });

  it('converts aave_v3 to Aave V3', () => {
    expect(snakeCaseToDisplayName('aave_v3')).toBe('Aave V3');
  });

  it('converts zerox_swap to Zerox Swap', () => {
    expect(snakeCaseToDisplayName('zerox_swap')).toBe('Zerox Swap');
  });
});
