import { describe, it, expect } from 'vitest';
import { getExplorerTxUrl } from '../utils/explorer-url.js';

describe('getExplorerTxUrl', () => {
  it('returns Solana mainnet URL', () => {
    expect(getExplorerTxUrl('mainnet', '5abc123')).toBe(
      'https://solscan.io/tx/5abc123',
    );
  });

  it('returns Solana devnet URL with cluster param', () => {
    expect(getExplorerTxUrl('devnet', '5abc123')).toBe(
      'https://solscan.io/tx/5abc123?cluster=devnet',
    );
  });

  it('returns Ethereum mainnet URL', () => {
    expect(getExplorerTxUrl('ethereum-mainnet', '0xabc')).toBe(
      'https://etherscan.io/tx/0xabc',
    );
  });

  it('returns Ethereum sepolia URL', () => {
    expect(getExplorerTxUrl('ethereum-sepolia', '0xabc')).toBe(
      'https://sepolia.etherscan.io/tx/0xabc',
    );
  });

  it('returns Polygon mainnet URL', () => {
    expect(getExplorerTxUrl('polygon-mainnet', '0xabc')).toBe(
      'https://polygonscan.com/tx/0xabc',
    );
  });

  it('returns Base sepolia URL', () => {
    expect(getExplorerTxUrl('base-sepolia', '0xabc')).toBe(
      'https://sepolia.basescan.org/tx/0xabc',
    );
  });

  it('returns Arbitrum mainnet URL', () => {
    expect(getExplorerTxUrl('arbitrum-mainnet', '0xabc')).toBe(
      'https://arbiscan.io/tx/0xabc',
    );
  });

  it('returns Optimism mainnet URL', () => {
    expect(getExplorerTxUrl('optimism-mainnet', '0xabc')).toBe(
      'https://optimistic.etherscan.io/tx/0xabc',
    );
  });

  it('returns null for unknown network', () => {
    expect(getExplorerTxUrl('unknown-chain', '0xabc')).toBeNull();
  });

  it('returns all 13 networks', () => {
    const networks = [
      'mainnet', 'devnet', 'testnet',
      'ethereum-mainnet', 'ethereum-sepolia',
      'polygon-mainnet', 'polygon-amoy',
      'arbitrum-mainnet', 'arbitrum-sepolia',
      'optimism-mainnet', 'optimism-sepolia',
      'base-mainnet', 'base-sepolia',
    ];
    for (const network of networks) {
      expect(getExplorerTxUrl(network, '0xtx')).not.toBeNull();
    }
  });
});
