/**
 * Integration tests for CAIP response enrichment.
 *
 * Verifies that enrichment utility functions correctly add chainId (CAIP-2) and
 * assetId (CAIP-19) to various response object shapes while preserving all
 * existing fields (additive only).
 *
 * @see Phase 409-02 -- response CAIP enrichment verification
 */

import { describe, it, expect } from 'vitest';
import {
  enrichBalance,
  enrichAsset,
  enrichNft,
  enrichTransaction,
  enrichIncomingTx,
} from '@waiaas/core';

describe('Response CAIP Enrichment Integration', () => {
  // -----------------------------------------------------------------
  // Balance response
  // -----------------------------------------------------------------
  describe('balance response', () => {
    it('enriches ethereum-mainnet balance with chainId and native assetId', () => {
      const balance = {
        walletId: '550e8400-e29b-41d4-a716-446655440000',
        chain: 'ethereum',
        network: 'ethereum-mainnet',
        address: '0x1234567890abcdef1234567890abcdef12345678',
        balance: '1000000000000000000',
        decimals: 18,
        symbol: 'ETH',
        balanceFormatted: '1.0',
        displayBalance: null,
        displayCurrency: null,
      };

      const result = enrichBalance(balance);

      expect(result.chainId).toBe('eip155:1');
      expect(result.assetId).toBe('eip155:1/slip44:60');
      // All original fields preserved
      expect(result.walletId).toBe(balance.walletId);
      expect(result.chain).toBe('ethereum');
      expect(result.network).toBe('ethereum-mainnet');
      expect(result.address).toBe(balance.address);
      expect(result.balance).toBe('1000000000000000000');
      expect(result.decimals).toBe(18);
      expect(result.symbol).toBe('ETH');
      expect(result.balanceFormatted).toBe('1.0');
    });

    it('enriches solana-mainnet balance with correct CAIP identifiers', () => {
      const balance = {
        walletId: '550e8400-e29b-41d4-a716-446655440001',
        chain: 'solana',
        network: 'solana-mainnet',
        address: 'DRpbCBMxVnDK7maPM5tGv6MvB3v1sRMC86PZ8okm21hy',
        balance: '5000000000',
        decimals: 9,
        symbol: 'SOL',
      };

      const result = enrichBalance(balance);

      expect(result.chainId).toBe('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp');
      expect(result.assetId).toBe('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501');
    });
  });

  // -----------------------------------------------------------------
  // Asset response
  // -----------------------------------------------------------------
  describe('asset response', () => {
    it('enriches native asset with slip44 assetId', () => {
      const asset = {
        network: 'ethereum-mainnet',
        mint: '0x0000000000000000000000000000000000000000',
        symbol: 'ETH',
        name: 'Ether',
        balance: '1000000000000000000',
        decimals: 18,
        isNative: true,
        usdValue: 3000,
      };

      const result = enrichAsset(asset);

      expect(result.chainId).toBe('eip155:1');
      expect(result.assetId).toBe('eip155:1/slip44:60');
      expect(result.isNative).toBe(true);
      expect(result.mint).toBe('0x0000000000000000000000000000000000000000');
    });

    it('enriches ERC-20 token with erc20 assetId (lowercased)', () => {
      const asset = {
        network: 'ethereum-mainnet',
        mint: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        symbol: 'USDC',
        name: 'USD Coin',
        balance: '5000000000',
        decimals: 6,
        isNative: false,
      };

      const result = enrichAsset(asset);

      expect(result.chainId).toBe('eip155:1');
      expect(result.assetId).toBe('eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48');
      // Original mint preserved (not lowercased)
      expect(result.mint).toBe('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48');
    });

    it('enriches Solana SPL token with token assetId (case preserved)', () => {
      const asset = {
        network: 'solana-mainnet',
        mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        symbol: 'USDC',
        name: 'USD Coin',
        balance: '1000000',
        decimals: 6,
        isNative: false,
      };

      const result = enrichAsset(asset);

      expect(result.chainId).toBe('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp');
      expect(result.assetId).toBe('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    });
  });

  // -----------------------------------------------------------------
  // Transaction response
  // -----------------------------------------------------------------
  describe('transaction response', () => {
    it('enriches tx list item with chainId', () => {
      const tx = {
        id: '550e8400-e29b-41d4-a716-446655440010',
        walletId: '550e8400-e29b-41d4-a716-446655440000',
        type: 'TRANSFER',
        status: 'CONFIRMED',
        tier: 'IMMEDIATE',
        chain: 'ethereum',
        network: 'ethereum-mainnet',
        toAddress: '0xabcd',
        amount: '1000000000000000000',
        txHash: '0xdeadbeef',
        error: null,
        createdAt: 1700000000,
      };

      const result = enrichTransaction(tx);

      expect(result.chainId).toBe('eip155:1');
      expect(result.id).toBe(tx.id);
      expect(result.walletId).toBe(tx.walletId);
      expect(result.network).toBe('ethereum-mainnet');
      expect(result.chain).toBe('ethereum');
      expect(result.status).toBe('CONFIRMED');
    });

    it('skips chainId when network is null', () => {
      const tx = {
        id: '550e8400-e29b-41d4-a716-446655440011',
        walletId: '550e8400-e29b-41d4-a716-446655440000',
        type: 'BATCH',
        status: 'PENDING',
        tier: null,
        chain: 'ethereum',
        network: null,
        toAddress: null,
        amount: null,
        txHash: null,
        error: null,
        createdAt: 1700000000,
      };

      const result = enrichTransaction(tx);

      expect(result.chainId).toBeUndefined();
      expect(result.network).toBeNull();
    });
  });

  // -----------------------------------------------------------------
  // Incoming transaction response
  // -----------------------------------------------------------------
  describe('incoming transaction response', () => {
    it('enriches native incoming tx with chainId and native assetId', () => {
      const incomingTx = {
        id: '550e8400-e29b-41d4-a716-446655440020',
        txHash: '0xabcdef1234',
        walletId: '550e8400-e29b-41d4-a716-446655440000',
        fromAddress: '0x9876',
        amount: '1000000000000000000',
        tokenAddress: null,
        chain: 'ethereum',
        network: 'ethereum-mainnet',
        status: 'CONFIRMED',
        blockNumber: 12345678,
        detectedAt: 1700000000,
        confirmedAt: 1700000060,
        suspicious: false,
      };

      const result = enrichIncomingTx(incomingTx);

      expect(result.chainId).toBe('eip155:1');
      expect(result.assetId).toBe('eip155:1/slip44:60');
      expect(result.tokenAddress).toBeNull();
      expect(result.amount).toBe('1000000000000000000');
    });

    it('enriches ERC-20 incoming tx with erc20 assetId', () => {
      const incomingTx = {
        id: '550e8400-e29b-41d4-a716-446655440021',
        txHash: '0xfeed',
        walletId: '550e8400-e29b-41d4-a716-446655440000',
        fromAddress: '0x5678',
        amount: '5000000000',
        tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        chain: 'ethereum',
        network: 'ethereum-mainnet',
        status: 'DETECTED',
        blockNumber: null,
        detectedAt: 1700000100,
        confirmedAt: null,
        suspicious: false,
      };

      const result = enrichIncomingTx(incomingTx);

      expect(result.chainId).toBe('eip155:1');
      expect(result.assetId).toBe('eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48');
    });
  });

  // -----------------------------------------------------------------
  // NFT response
  // -----------------------------------------------------------------
  describe('NFT response', () => {
    it('enriches ERC-721 NFT with chainId and assetId', () => {
      const nft = {
        network: 'ethereum-mainnet',
        contractAddress: '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D',
        tokenId: '42',
        standard: 'erc721',
        name: 'Bored Ape #42',
        amount: '1',
      };

      const result = enrichNft(nft);

      expect(result.chainId).toBe('eip155:1');
      expect(result.assetId).toMatch(/^eip155:1\/erc721:0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d-42$/);
      expect(result.contractAddress).toBe('0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D');
    });
  });

  // -----------------------------------------------------------------
  // Additive only (all original fields preserved)
  // -----------------------------------------------------------------
  describe('additive only - original fields preserved', () => {
    it('preserves all fields in balance response', () => {
      const balance = {
        walletId: 'test', chain: 'ethereum', network: 'ethereum-mainnet',
        address: '0x1234', balance: '100', decimals: 18, symbol: 'ETH',
        balanceFormatted: '0.0000000000000001', displayBalance: null, displayCurrency: 'USD',
      };
      const result = enrichBalance(balance);
      for (const [key, value] of Object.entries(balance)) {
        expect(result[key as keyof typeof result]).toEqual(value);
      }
    });

    it('preserves all fields in transaction response', () => {
      const tx = {
        id: 'tx-1', walletId: 'w-1', type: 'TRANSFER', status: 'CONFIRMED',
        tier: 'IMMEDIATE', chain: 'ethereum', network: 'ethereum-mainnet',
        toAddress: '0xabcd', amount: '1000', txHash: '0xhash', error: null,
        createdAt: 1700000000, displayAmount: '$5.00', displayCurrency: 'USD',
        amountFormatted: '0.001', amountDecimals: 18, amountSymbol: 'ETH',
      };
      const result = enrichTransaction(tx);
      for (const [key, value] of Object.entries(tx)) {
        expect(result[key as keyof typeof result]).toEqual(value);
      }
    });
  });

  // -----------------------------------------------------------------
  // Graceful skip for unknown network
  // -----------------------------------------------------------------
  describe('graceful skip for unknown network', () => {
    it('balance with unknown network has no chainId/assetId', () => {
      const result = enrichBalance({ network: 'unknown-net', balance: '0', decimals: 18, symbol: 'X' });
      expect(result.chainId).toBeUndefined();
      expect(result.assetId).toBeUndefined();
      expect(result.network).toBe('unknown-net');
    });

    it('transaction with unknown network has no chainId', () => {
      const result = enrichTransaction({ network: 'nonexistent', id: 'tx' });
      expect(result.chainId).toBeUndefined();
    });

    it('incoming tx with unknown network has no chainId/assetId', () => {
      const result = enrichIncomingTx({ network: 'unknown', chain: 'x', tokenAddress: null, amount: '0' });
      expect(result.chainId).toBeUndefined();
      expect(result.assetId).toBeUndefined();
    });
  });
});
