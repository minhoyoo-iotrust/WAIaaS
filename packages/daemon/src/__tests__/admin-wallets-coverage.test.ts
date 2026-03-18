/**
 * Coverage tests for admin-wallets.ts exported helpers and route edge cases.
 *
 * Tests buildTokenMap() and formatTxAmount() helpers that are major
 * uncovered function targets.
 */

import { describe, it, expect } from 'vitest';
import { buildTokenMap, formatTxAmount } from '../api/routes/admin-wallets.js';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import { tokenRegistry } from '../infrastructure/database/schema.js';
import { generateId } from '../infrastructure/database/id.js';

// ---------------------------------------------------------------------------
// In-memory DB helpers
// ---------------------------------------------------------------------------

function createTestDb() {
  const conn = createDatabase(':memory:');
  pushSchema(conn.sqlite);
  return conn;
}

// ---------------------------------------------------------------------------
// buildTokenMap
// ---------------------------------------------------------------------------

describe('buildTokenMap', () => {
  it('returns empty map for empty input', () => {
    const { db } = createTestDb();
    const result = buildTokenMap([], db as any);
    expect(result.size).toBe(0);
  });

  it('looks up tokens from DB by address', () => {
    const { db } = createTestDb();
    // Insert test token
    db.insert(tokenRegistry).values({
      id: generateId(),
      address: '0xtoken1',
      network: 'ethereum-mainnet',
      name: 'Test Token',
      symbol: 'TT',
      decimals: 18,
      createdAt: new Date(),
    }).run();

    const result = buildTokenMap(
      [{ address: '0xtoken1', network: 'ethereum-mainnet' }],
      db as any,
    );

    expect(result.size).toBeGreaterThan(0);
    const info = result.get('0xtoken1:ethereum-mainnet');
    expect(info).toBeDefined();
    expect(info!.symbol).toBe('TT');
    expect(info!.decimals).toBe(18);
  });

  it('creates wildcard fallback entry', () => {
    const { db } = createTestDb();
    db.insert(tokenRegistry).values({
      id: generateId(),
      address: '0xtoken2',
      network: 'ethereum-mainnet',
      name: 'Token2',
      symbol: 'T2',
      decimals: 6,
      createdAt: new Date(),
    }).run();

    const result = buildTokenMap(
      [{ address: '0xtoken2', network: null }],
      db as any,
    );

    // Should have wildcard entry
    const wildcardInfo = result.get('0xtoken2:*');
    expect(wildcardInfo).toBeDefined();
    expect(wildcardInfo!.symbol).toBe('T2');
  });

  it('deduplicates addresses in query', () => {
    const { db } = createTestDb();
    db.insert(tokenRegistry).values({
      id: generateId(),
      address: '0xtoken3',
      network: 'ethereum-mainnet',
      name: 'Token3',
      symbol: 'T3',
      decimals: 8,
      createdAt: new Date(),
    }).run();

    const result = buildTokenMap(
      [
        { address: '0xtoken3', network: 'ethereum-mainnet' },
        { address: '0xtoken3', network: 'ethereum-mainnet' },
      ],
      db as any,
    );

    // Should still work despite duplicates
    expect(result.get('0xtoken3:ethereum-mainnet')).toBeDefined();
  });

  it('handles tokens not found in DB', () => {
    const { db } = createTestDb();

    const result = buildTokenMap(
      [{ address: '0xunknown', network: 'ethereum-mainnet' }],
      db as any,
    );

    expect(result.get('0xunknown:ethereum-mainnet')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// formatTxAmount
// ---------------------------------------------------------------------------

describe('formatTxAmount', () => {
  it('returns null/0 for null or zero amount', () => {
    const { db } = createTestDb();
    expect(formatTxAmount(null, 'ethereum', 'ethereum-mainnet', null, db as any)).toBeNull();
    expect(formatTxAmount('0', 'ethereum', 'ethereum-mainnet', null, db as any)).toBe('0');
  });

  it('formats native transfer with correct symbol (ethereum)', () => {
    const { db } = createTestDb();
    const result = formatTxAmount('1000000000000000000', 'ethereum', 'ethereum-mainnet', null, db as any);
    expect(result).toContain('ETH');
    expect(result).toContain('1');
  });

  it('formats native transfer with correct symbol (solana)', () => {
    const { db } = createTestDb();
    const result = formatTxAmount('1000000000', 'solana', 'solana-mainnet', null, db as any);
    expect(result).toContain('SOL');
    expect(result).toContain('1');
  });

  it('formats token transfer using DB lookup', () => {
    const { db } = createTestDb();
    db.insert(tokenRegistry).values({
      id: generateId(),
      address: '0xusdc',
      network: 'ethereum-mainnet',
      name: 'USDC',
      symbol: 'USDC',
      decimals: 6,
      createdAt: new Date(),
    }).run();

    const result = formatTxAmount('1000000', 'ethereum', 'ethereum-mainnet', '0xusdc', db as any);
    expect(result).toContain('USDC');
    expect(result).toContain('1');
  });

  it('formats token transfer using pre-fetched tokenMap (NQ-04)', () => {
    const { db } = createTestDb();
    const tokenMap = new Map([
      ['0xdai:ethereum-mainnet', { symbol: 'DAI', decimals: 18 }],
    ]);

    const result = formatTxAmount(
      '1000000000000000000',
      'ethereum',
      'ethereum-mainnet',
      '0xdai',
      db as any,
      tokenMap,
    );
    expect(result).toContain('DAI');
    expect(result).toContain('1');
  });

  it('uses wildcard fallback from tokenMap', () => {
    const { db } = createTestDb();
    const tokenMap = new Map([
      ['0xwbtc:*', { symbol: 'WBTC', decimals: 8 }],
    ]);

    const result = formatTxAmount(
      '100000000',
      'ethereum',
      'ethereum-mainnet',
      '0xwbtc',
      db as any,
      tokenMap,
    );
    expect(result).toContain('WBTC');
  });

  it('returns null for unknown token (not in DB or map)', () => {
    const { db } = createTestDb();
    const result = formatTxAmount(
      '1000000',
      'ethereum',
      'ethereum-mainnet',
      '0xnotfound',
      db as any,
    );
    expect(result).toBeNull();
  });

  it('returns null on BigInt conversion error', () => {
    const { db } = createTestDb();
    const result = formatTxAmount('not-a-number', 'ethereum', 'ethereum-mainnet', null, db as any);
    expect(result).toBeNull();
  });

  it('falls back to chain name for unknown chain native symbol', () => {
    const { db } = createTestDb();
    const result = formatTxAmount('1000000000000000000', 'unknownchain', 'unknown-net', null, db as any);
    // Should use uppercase chain name as symbol
    expect(result).toContain('UNKNOWNCHAIN');
  });
});
