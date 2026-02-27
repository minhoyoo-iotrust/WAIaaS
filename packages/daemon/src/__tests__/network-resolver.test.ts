/**
 * Network resolver tests: 2-priority network resolution with getSingleNetwork auto-resolve.
 *
 * Tests cover:
 *   1-2. Solana auto-resolve (devnet for testnet, mainnet for mainnet)
 *   3. Explicit requestNetwork for Solana overrides auto-resolve
 *   4-5. EVM NETWORK_REQUIRED when network omitted
 *   6-7. Explicit requestNetwork works for EVM
 *   8-9. Cross-validation errors (environment mismatch)
 *   10-11. Cross-validation errors (chain mismatch)
 *
 * @see Phase 279 -- remove default wallet/network concept
 */

import { describe, it, expect } from 'vitest';
import { resolveNetwork } from '../pipeline/network-resolver.js';

describe('resolveNetwork()', () => {
  // --- Solana auto-resolve (getSingleNetwork returns network) ---

  it('auto-resolves Solana testnet to devnet when network omitted', () => {
    const result = resolveNetwork(null, 'testnet', 'solana');
    expect(result).toBe('devnet');
  });

  it('auto-resolves Solana mainnet to mainnet when network omitted', () => {
    const result = resolveNetwork(null, 'mainnet', 'solana');
    expect(result).toBe('mainnet');
  });

  it('uses explicit requestNetwork for Solana (testnet env, request=testnet)', () => {
    const result = resolveNetwork('testnet', 'testnet', 'solana');
    expect(result).toBe('testnet');
  });

  // --- EVM NETWORK_REQUIRED (getSingleNetwork returns null) ---

  it('throws NETWORK_REQUIRED for EVM testnet when network omitted', () => {
    expect(() => resolveNetwork(null, 'testnet', 'ethereum')).toThrow();
    try {
      resolveNetwork(null, 'testnet', 'ethereum');
    } catch (err: any) {
      expect(err.code).toBe('NETWORK_REQUIRED');
    }
  });

  it('throws NETWORK_REQUIRED for EVM mainnet when network omitted', () => {
    expect(() => resolveNetwork(null, 'mainnet', 'ethereum')).toThrow();
    try {
      resolveNetwork(null, 'mainnet', 'ethereum');
    } catch (err: any) {
      expect(err.code).toBe('NETWORK_REQUIRED');
    }
  });

  it('uses explicit requestNetwork for EVM (testnet, request=polygon-amoy)', () => {
    const result = resolveNetwork('polygon-amoy', 'testnet', 'ethereum');
    expect(result).toBe('polygon-amoy');
  });

  it('uses explicit requestNetwork for EVM (mainnet, request=arbitrum-mainnet)', () => {
    const result = resolveNetwork('arbitrum-mainnet', 'mainnet', 'ethereum');
    expect(result).toBe('arbitrum-mainnet');
  });

  // --- Cross-validation errors ---

  it('throws on environment mismatch (solana mainnet + devnet request)', () => {
    expect(() => resolveNetwork('devnet', 'mainnet', 'solana')).toThrow();
  });

  it('throws on environment mismatch (ethereum testnet + ethereum-mainnet request)', () => {
    expect(() => resolveNetwork('ethereum-mainnet', 'testnet', 'ethereum')).toThrow();
  });

  it('throws on chain mismatch (solana + ethereum-sepolia request)', () => {
    expect(() => resolveNetwork('ethereum-sepolia', 'testnet', 'solana')).toThrow();
  });

  it('throws on chain mismatch (ethereum + devnet request)', () => {
    expect(() => resolveNetwork('devnet', 'mainnet', 'ethereum')).toThrow();
  });
});
