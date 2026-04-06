import { describe, it, expect } from 'vitest';
import { parseAssetId, extractNetworkFromAssetId } from '../caip/asset-resolve.js';

describe('parseAssetId', () => {
  it('parses EVM erc20 token', () => {
    const result = parseAssetId('eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48');
    expect(result).toEqual({
      chainId: 'eip155:1',
      namespace: 'erc20',
      address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      network: 'ethereum-mainnet',
      isNative: false,
    });
  });

  it('parses EVM erc20 on Polygon', () => {
    const result = parseAssetId('eip155:137/erc20:0x2791bca1f2de4661ed88a30c99a7a9449aa84174');
    expect(result).toEqual({
      chainId: 'eip155:137',
      namespace: 'erc20',
      address: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
      network: 'polygon-mainnet',
      isNative: false,
    });
  });

  it('parses Solana token (preserves original case)', () => {
    const result = parseAssetId(
      'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    );
    expect(result).toEqual({
      chainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
      namespace: 'token',
      address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      network: 'solana-mainnet',
      isNative: false,
    });
  });

  it('parses native asset (slip44)', () => {
    const result = parseAssetId('eip155:1/slip44:60');
    expect(result).toEqual({
      chainId: 'eip155:1',
      namespace: 'slip44',
      address: null,
      network: 'ethereum-mainnet',
      isNative: true,
    });
  });

  it('parses Solana native asset (slip44:501)', () => {
    const result = parseAssetId('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501');
    expect(result).toEqual({
      chainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
      namespace: 'slip44',
      address: null,
      network: 'solana-mainnet',
      isNative: true,
    });
  });

  it('parses XRPL native asset (slip44:144)', () => {
    const result = parseAssetId('xrpl:0/slip44:144');
    expect(result).toEqual({
      chainId: 'xrpl:0',
      namespace: 'slip44',
      address: null,
      network: 'xrpl-mainnet',
      isNative: true,
    });
  });

  it('parses XRPL Trust Line token', () => {
    const result = parseAssetId('xrpl:0/token:USD.rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh');
    expect(result).toEqual({
      chainId: 'xrpl:0',
      namespace: 'token',
      address: 'USD.rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
      network: 'xrpl-mainnet',
      isNative: false,
    });
  });

  it('throws on unknown CAIP-2 chain ID', () => {
    expect(() => parseAssetId('eip155:99999/erc20:0xabc')).toThrow('Unknown CAIP-2 chain ID');
  });

  it('throws on invalid CAIP-19 format', () => {
    expect(() => parseAssetId('not-valid')).toThrow();
  });

  it('EVM erc20 address is returned as-is (preserves lowercase from CAIP-19)', () => {
    const result = parseAssetId('eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48');
    expect(result.address).toBe('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48');
  });

  it('parses Arbitrum erc20 token', () => {
    const result = parseAssetId('eip155:42161/erc20:0xaf88d065e77c8cc2239327c5edb3a432268e5831');
    expect(result.network).toBe('arbitrum-mainnet');
    expect(result.isNative).toBe(false);
  });
});

describe('extractNetworkFromAssetId', () => {
  it('extracts network from EVM erc20 assetId', () => {
    expect(
      extractNetworkFromAssetId('eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'),
    ).toBe('ethereum-mainnet');
  });

  it('extracts network from Solana token assetId', () => {
    expect(
      extractNetworkFromAssetId(
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      ),
    ).toBe('solana-mainnet');
  });

  it('extracts network from native assetId', () => {
    expect(extractNetworkFromAssetId('eip155:1/slip44:60')).toBe('ethereum-mainnet');
  });

  it('throws on unknown CAIP-2 chain ID', () => {
    expect(() => extractNetworkFromAssetId('eip155:99999/erc20:0xabc')).toThrow(
      'Unknown CAIP-2 chain ID',
    );
  });
});
