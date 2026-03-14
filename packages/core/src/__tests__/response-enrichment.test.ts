/**
 * Tests for CAIP response enrichment utilities.
 *
 * Covers: enrichBalance, enrichAsset, enrichNft, enrichTransaction, enrichIncomingTx
 *
 * @see Phase 409-01 -- response enrichment utility functions
 */

import { describe, it, expect } from 'vitest';
import {
  enrichBalance,
  enrichAsset,
  enrichNft,
  enrichTransaction,
  enrichIncomingTx,
} from '../caip/response-enrichment.js';

describe('response-enrichment', () => {
  // -----------------------------------------------------------------
  // enrichBalance
  // -----------------------------------------------------------------
  describe('enrichBalance', () => {
    it('adds chainId and native assetId for ethereum-mainnet', () => {
      const input = { network: 'ethereum-mainnet', balance: '1000', decimals: 18, symbol: 'ETH' };
      const result = enrichBalance(input);
      expect(result.chainId).toBe('eip155:1');
      expect(result.assetId).toBe('eip155:1/slip44:60');
      // original fields preserved
      expect(result.network).toBe('ethereum-mainnet');
      expect(result.balance).toBe('1000');
      expect(result.decimals).toBe(18);
      expect(result.symbol).toBe('ETH');
    });

    it('adds chainId and native assetId for solana-mainnet', () => {
      const input = { network: 'solana-mainnet', balance: '5000000000', decimals: 9, symbol: 'SOL' };
      const result = enrichBalance(input);
      expect(result.chainId).toMatch(/^solana:/);
      expect(result.assetId).toMatch(/\/slip44:501$/);
      expect(result.network).toBe('solana-mainnet');
    });

    it('adds chainId for polygon-mainnet with correct slip44', () => {
      const input = { network: 'polygon-mainnet', balance: '100', decimals: 18, symbol: 'POL' };
      const result = enrichBalance(input);
      expect(result.chainId).toBe('eip155:137');
      expect(result.assetId).toBe('eip155:137/slip44:966');
    });

    it('gracefully skips for unknown network', () => {
      const input = { network: 'unknown-network', balance: '0', decimals: 18, symbol: 'X' };
      const result = enrichBalance(input);
      expect(result.chainId).toBeUndefined();
      expect(result.assetId).toBeUndefined();
      expect(result.network).toBe('unknown-network');
      expect(result.balance).toBe('0');
    });
  });

  // -----------------------------------------------------------------
  // enrichAsset
  // -----------------------------------------------------------------
  describe('enrichAsset', () => {
    it('adds slip44 assetId for native asset', () => {
      const input = { network: 'ethereum-mainnet', mint: '0x0000000000000000000000000000000000000000', isNative: true, balance: '1000' };
      const result = enrichAsset(input);
      expect(result.chainId).toBe('eip155:1');
      expect(result.assetId).toBe('eip155:1/slip44:60');
      expect(result.mint).toBe('0x0000000000000000000000000000000000000000');
    });

    it('adds erc20 assetId for EVM token', () => {
      const input = { network: 'ethereum-mainnet', mint: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', isNative: false, balance: '5000' };
      const result = enrichAsset(input);
      expect(result.chainId).toBe('eip155:1');
      expect(result.assetId).toBe('eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48');
      // original mint preserved (not lowercased)
      expect(result.mint).toBe('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48');
    });

    it('adds token assetId for Solana SPL token (case preserved)', () => {
      const input = { network: 'solana-mainnet', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', isNative: false, balance: '1000000' };
      const result = enrichAsset(input);
      expect(result.chainId).toMatch(/^solana:/);
      expect(result.assetId).toMatch(/\/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v$/);
    });

    it('gracefully skips for unknown network', () => {
      const input = { network: 'unknown-net', mint: '0x1234', isNative: false, balance: '0' };
      const result = enrichAsset(input);
      expect(result.chainId).toBeUndefined();
      expect(result.assetId).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------
  // enrichNft
  // -----------------------------------------------------------------
  describe('enrichNft', () => {
    it('adds erc721 assetId', () => {
      const input = { network: 'ethereum-mainnet', contractAddress: '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D', tokenId: '1234', standard: 'erc721' };
      const result = enrichNft(input);
      expect(result.chainId).toBe('eip155:1');
      expect(result.assetId).toMatch(/^eip155:1\/erc721:0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d-1234$/);
    });

    it('adds erc1155 assetId', () => {
      const input = { network: 'ethereum-mainnet', contractAddress: '0x1234567890abcdef1234567890abcdef12345678', tokenId: '42', standard: 'erc1155' };
      const result = enrichNft(input);
      expect(result.assetId).toMatch(/^eip155:1\/erc1155:/);
    });

    it('adds metaplex assetId (case preserved)', () => {
      const input = { network: 'solana-mainnet', contractAddress: 'DRpbCBMxVnDK7maPM5tGv6MvB3v1sRMC86PZ8okm21hy', tokenId: '0', standard: 'metaplex' };
      const result = enrichNft(input);
      expect(result.chainId).toMatch(/^solana:/);
      expect(result.assetId).toMatch(/\/metaplex:DRpbCBMxVnDK7maPM5tGv6MvB3v1sRMC86PZ8okm21hy$/);
    });

    it('skips assetId for unknown standard', () => {
      const input = { network: 'ethereum-mainnet', contractAddress: '0x1234', tokenId: '1', standard: 'unknown-standard' };
      const result = enrichNft(input);
      expect(result.chainId).toBe('eip155:1');
      expect(result.assetId).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------
  // enrichTransaction
  // -----------------------------------------------------------------
  describe('enrichTransaction', () => {
    it('adds chainId for tx with network', () => {
      const input = { id: 'tx-1', network: 'ethereum-mainnet', status: 'CONFIRMED' };
      const result = enrichTransaction(input);
      expect(result.chainId).toBe('eip155:1');
      expect(result.id).toBe('tx-1');
      expect(result.status).toBe('CONFIRMED');
    });

    it('skips chainId when network is null', () => {
      const input = { id: 'tx-2', network: null, status: 'PENDING' };
      const result = enrichTransaction(input);
      expect(result.chainId).toBeUndefined();
      expect(result.id).toBe('tx-2');
    });

    it('skips chainId when network is undefined', () => {
      const input = { id: 'tx-3', status: 'FAILED' };
      const result = enrichTransaction(input as any);
      expect(result.chainId).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------
  // enrichIncomingTx
  // -----------------------------------------------------------------
  describe('enrichIncomingTx', () => {
    it('adds chainId and native assetId when tokenAddress is null', () => {
      const input = { network: 'ethereum-mainnet', chain: 'ethereum', tokenAddress: null, amount: '1000000000000000000' };
      const result = enrichIncomingTx(input);
      expect(result.chainId).toBe('eip155:1');
      expect(result.assetId).toBe('eip155:1/slip44:60');
      expect(result.amount).toBe('1000000000000000000');
    });

    it('adds chainId and erc20 assetId when tokenAddress present', () => {
      const input = { network: 'ethereum-mainnet', chain: 'ethereum', tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', amount: '5000' };
      const result = enrichIncomingTx(input);
      expect(result.chainId).toBe('eip155:1');
      expect(result.assetId).toBe('eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48');
    });

    it('handles Solana incoming tx', () => {
      const input = { network: 'solana-mainnet', chain: 'solana', tokenAddress: null, amount: '5000000000' };
      const result = enrichIncomingTx(input);
      expect(result.chainId).toMatch(/^solana:/);
      expect(result.assetId).toMatch(/\/slip44:501$/);
    });

    it('gracefully skips for unknown network', () => {
      const input = { network: 'unknown-chain', chain: 'unknown', tokenAddress: null, amount: '0' };
      const result = enrichIncomingTx(input);
      expect(result.chainId).toBeUndefined();
      expect(result.assetId).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------
  // Additive only verification
  // -----------------------------------------------------------------
  describe('additive only', () => {
    it('all enrichment functions preserve every original field', () => {
      const balanceInput = { network: 'ethereum-mainnet', balance: '100', decimals: 18, symbol: 'ETH', extra: 'field' };
      const balanceResult = enrichBalance(balanceInput);
      expect(balanceResult.extra).toBe('field');

      const assetInput = { network: 'ethereum-mainnet', mint: '0x123', isNative: true, custom: 42 };
      const assetResult = enrichAsset(assetInput);
      expect(assetResult.custom).toBe(42);

      const txInput = { network: 'ethereum-mainnet', id: 'tx', myField: true };
      const txResult = enrichTransaction(txInput);
      expect(txResult.myField).toBe(true);
    });
  });
});
