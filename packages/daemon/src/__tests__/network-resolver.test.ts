import { describe, it, expect } from 'vitest';
import { resolveNetwork } from '../pipeline/network-resolver.js';

describe('resolveNetwork()', () => {
  // Test 1: All params null -> 3rd priority fallback (solana+testnet -> devnet)
  it('falls back to getDefaultNetwork when all params are null (solana+testnet -> devnet)', () => {
    const result = resolveNetwork(null, null, 'testnet', 'solana');
    expect(result).toBe('devnet');
  });

  // Test 2: requestNetwork specified -> 1st priority (solana+testnet+testnet -> testnet)
  it('uses requestNetwork as 1st priority (solana+testnet, request=testnet)', () => {
    const result = resolveNetwork('testnet', null, 'testnet', 'solana');
    expect(result).toBe('testnet');
  });

  // Test 3: requestNetwork overrides walletDefaultNetwork (ethereum+testnet, request=polygon-amoy, wallet=ethereum-sepolia)
  it('requestNetwork overrides walletDefaultNetwork (1st > 2nd priority)', () => {
    const result = resolveNetwork('polygon-amoy', 'ethereum-sepolia', 'testnet', 'ethereum');
    expect(result).toBe('polygon-amoy');
  });

  // Test 4: walletDefaultNetwork used (ethereum+mainnet, wallet=polygon-mainnet)
  it('uses walletDefaultNetwork as 2nd priority when requestNetwork is null', () => {
    const result = resolveNetwork(null, 'polygon-mainnet', 'mainnet', 'ethereum');
    expect(result).toBe('polygon-mainnet');
  });

  // Test 5: 3rd priority fallback (ethereum+mainnet, null, null -> ethereum-mainnet)
  it('falls back to getDefaultNetwork (ethereum+mainnet -> ethereum-mainnet)', () => {
    const result = resolveNetwork(null, null, 'mainnet', 'ethereum');
    expect(result).toBe('ethereum-mainnet');
  });

  // Test 6: environment mismatch FAIL (solana+mainnet+devnet -> throw)
  it('throws on environment mismatch (solana mainnet wallet + devnet request)', () => {
    expect(() => resolveNetwork('devnet', null, 'mainnet', 'solana')).toThrow();
  });

  // Test 7: environment mismatch FAIL (ethereum+testnet+ethereum-mainnet -> throw)
  it('throws on environment mismatch (ethereum testnet wallet + ethereum-mainnet request)', () => {
    expect(() => resolveNetwork('ethereum-mainnet', null, 'testnet', 'ethereum')).toThrow();
  });

  // Test 8: chain mismatch FAIL (solana+testnet+ethereum-sepolia -> throw)
  it('throws on chain mismatch (solana wallet + ethereum-sepolia request)', () => {
    expect(() => resolveNetwork('ethereum-sepolia', null, 'testnet', 'solana')).toThrow();
  });

  // Test 9: chain mismatch FAIL (ethereum+mainnet+devnet -> throw)
  it('throws on chain mismatch (ethereum wallet + devnet request)', () => {
    expect(() => resolveNetwork('devnet', null, 'mainnet', 'ethereum')).toThrow();
  });

  // Test 10: L2 testnet usage (ethereum+testnet, wallet=polygon-amoy -> polygon-amoy)
  it('supports L2 testnet via walletDefaultNetwork (ethereum+testnet, wallet=polygon-amoy)', () => {
    const result = resolveNetwork(null, 'polygon-amoy', 'testnet', 'ethereum');
    expect(result).toBe('polygon-amoy');
  });

  // Test 11: requestNetwork overrides walletDefaultNetwork (solana+testnet, request=devnet, wallet=testnet -> devnet)
  it('requestNetwork overrides walletDefaultNetwork (solana, request=devnet, wallet=testnet)', () => {
    const result = resolveNetwork('devnet', 'testnet', 'testnet', 'solana');
    expect(result).toBe('devnet');
  });
});
