import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { TokenRef } from '@waiaas/core';
import { CoinGeckoOracle, CoinGeckoNotConfiguredError, PriceNotAvailableError } from '../infrastructure/oracle/coingecko-oracle.js';

/** USDC SPL token on Solana. */
const SOLANA_USDC: TokenRef = {
  address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  symbol: 'USDC',
  decimals: 6,
  chain: 'solana',
  network: 'mainnet',
};

/** USDC ERC-20 token on Ethereum (checksum address). */
const ETH_USDC: TokenRef = {
  address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  symbol: 'USDC',
  decimals: 6,
  chain: 'ethereum',
  network: 'ethereum-mainnet',
};

/** USDT ERC-20 token on Ethereum. */
const _ETH_USDT: TokenRef = {
  address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  symbol: 'USDT',
  decimals: 6,
  chain: 'ethereum',
  network: 'ethereum-mainnet',
};

/** WBTC SPL token (fictional for test). */
const SOLANA_WBTC: TokenRef = {
  address: '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh',
  symbol: 'WBTC',
  decimals: 8,
  chain: 'solana',
  network: 'mainnet',
};

/** USDC on Polygon (L2 test token). */
const POLYGON_USDC: TokenRef = {
  address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  symbol: 'USDC',
  decimals: 6,
  chain: 'ethereum',
  network: 'polygon-mainnet',
};

const TEST_API_KEY = 'CG-test-key-12345';

describe('CoinGeckoOracle', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // --- Test 1: SPL token price ---
  it('getPrice() - SPL token price via /simple/token_price/solana', async () => {
    const oracle = new CoinGeckoOracle(TEST_API_KEY);

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': {
          usd: 1.0001,
          last_updated_at: 1711356300,
        },
      }),
    });

    const result = await oracle.getPrice(SOLANA_USDC);

    expect(result.usdPrice).toBe(1.0001);
    expect(result.source).toBe('coingecko');
    expect(result.isStale).toBe(false);
    expect(result.fetchedAt).toBeGreaterThan(0);
    expect(result.expiresAt).toBeGreaterThan(result.fetchedAt);

    // Verify URL contains correct platform and address
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/simple/token_price/solana');
    expect(calledUrl).toContain('contract_addresses=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    expect(calledUrl).toContain('vs_currencies=usd');
  });

  // --- Test 2: ERC-20 token price (lowercase address) ---
  it('getPrice() - ERC-20 token price uses platformId=ethereum with lowercased address', async () => {
    const oracle = new CoinGeckoOracle(TEST_API_KEY);

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': {
          usd: 0.9999,
          last_updated_at: 1711356300,
        },
      }),
    });

    const result = await oracle.getPrice(ETH_USDC);

    expect(result.usdPrice).toBe(0.9999);
    expect(result.source).toBe('coingecko');

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/simple/token_price/ethereum');
    // EVM address should be lowercased in the request
    expect(calledUrl).toContain('contract_addresses=0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48');
  });

  // --- Test 3: Native price (SOL) ---
  it('getNativePrice(solana) - uses /simple/price with ids=solana', async () => {
    const oracle = new CoinGeckoOracle(TEST_API_KEY);

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        solana: {
          usd: 150.25,
          last_updated_at: 1711356300,
        },
      }),
    });

    const result = await oracle.getNativePrice('solana');

    expect(result.usdPrice).toBe(150.25);
    expect(result.source).toBe('coingecko');
    expect(result.isStale).toBe(false);

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/simple/price');
    expect(calledUrl).toContain('ids=solana');
    expect(calledUrl).toContain('vs_currencies=usd');
  });

  // --- Test 4: Native price (ETH) ---
  it('getNativePrice(ethereum) - uses /simple/price with ids=ethereum', async () => {
    const oracle = new CoinGeckoOracle(TEST_API_KEY);

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        ethereum: {
          usd: 3400.50,
          last_updated_at: 1711356300,
        },
      }),
    });

    const result = await oracle.getNativePrice('ethereum');

    expect(result.usdPrice).toBe(3400.50);

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('ids=ethereum');
  });

  // --- Test 5: Batch query (comma-separated addresses) ---
  it('getPrices() - batch query with comma-separated addresses', async () => {
    const oracle = new CoinGeckoOracle(TEST_API_KEY);

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': {
          usd: 1.0001,
          last_updated_at: 1711356300,
        },
        '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh': {
          usd: 67000.0,
          last_updated_at: 1711356300,
        },
      }),
    });

    const tokens = [SOLANA_USDC, SOLANA_WBTC];
    const result = await oracle.getPrices(tokens);

    // Only 1 API call for same-network tokens
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Verify comma-separated addresses
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('contract_addresses=');
    expect(calledUrl).toContain('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    expect(calledUrl).toContain('3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh');

    expect(result.size).toBe(2);

    // Verify CAIP-19 cache keys
    expect(result.has('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')).toBe(true);
    expect(result.has('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh')).toBe(true);
  });

  // --- Test 6: Mixed chain tokens grouped by network (2 API calls) ---
  it('getPrices() - mixed chain tokens grouped by network (2 API calls)', async () => {
    const oracle = new CoinGeckoOracle(TEST_API_KEY);

    // First call: solana tokens (mainnet)
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { usd: 1.0001, last_updated_at: 1711356300 },
          '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh': { usd: 67000.0, last_updated_at: 1711356300 },
        }),
      })
      // Second call: ethereum tokens (ethereum-mainnet)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { usd: 0.9999, last_updated_at: 1711356300 },
        }),
      });

    const tokens = [SOLANA_USDC, SOLANA_WBTC, ETH_USDC];
    const result = await oracle.getPrices(tokens);

    // 2 API calls: 1 for solana (mainnet), 1 for ethereum (ethereum-mainnet)
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.size).toBe(3);

    // Verify CAIP-19 keys in result
    expect(result.has('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')).toBe(true);
    expect(result.has('eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')).toBe(true);
  });

  // --- Test 7: API key not configured ---
  it('getPrice() - throws CoinGeckoNotConfiguredError when API key is empty', async () => {
    const oracle = new CoinGeckoOracle('');

    await expect(oracle.getPrice(SOLANA_USDC))
      .rejects.toThrow(CoinGeckoNotConfiguredError);
  });

  // --- Test 8: HTTP error (429 Too Many Requests) ---
  it('getPrice() - throws on CoinGecko API HTTP error (429)', async () => {
    const oracle = new CoinGeckoOracle(TEST_API_KEY);

    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
    });

    await expect(oracle.getPrice(SOLANA_USDC)).rejects.toThrow(/429/);
  });

  // --- Test 9: Timeout (5 seconds) ---
  it('getPrice() - passes AbortSignal.timeout(5000) to fetch', async () => {
    const oracle = new CoinGeckoOracle(TEST_API_KEY);

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': {
          usd: 1.0001,
          last_updated_at: 1711356300,
        },
      }),
    });

    await oracle.getPrice(SOLANA_USDC);

    const fetchOptions = fetchMock.mock.calls[0][1] as RequestInit;
    expect(fetchOptions.signal).toBeDefined();
    // AbortSignal.timeout returns an AbortSignal instance
    expect(fetchOptions.signal).toBeInstanceOf(AbortSignal);
  });

  // --- Test 10: getCacheStats() returns empty stats ---
  it('getCacheStats() - returns zeroed stats (no internal cache)', () => {
    const oracle = new CoinGeckoOracle(TEST_API_KEY);

    const stats = oracle.getCacheStats();

    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
    expect(stats.staleHits).toBe(0);
    expect(stats.size).toBe(0);
    expect(stats.evictions).toBe(0);
  });

  // --- Test 11: x-cg-demo-api-key header ---
  it('getPrice() - sends x-cg-demo-api-key header', async () => {
    const oracle = new CoinGeckoOracle(TEST_API_KEY);

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': {
          usd: 1.0001,
          last_updated_at: 1711356300,
        },
      }),
    });

    await oracle.getPrice(SOLANA_USDC);

    const fetchOptions = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = fetchOptions.headers as Record<string, string>;
    expect(headers['x-cg-demo-api-key']).toBe(TEST_API_KEY);
  });

  // --- Test 12: Empty response -> PriceNotAvailableError ---
  it('getPrice() - throws PriceNotAvailableError when CoinGecko returns empty object', async () => {
    const oracle = new CoinGeckoOracle(TEST_API_KEY);

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    await expect(oracle.getPrice(SOLANA_USDC))
      .rejects.toThrow(PriceNotAvailableError);
  });

  // --- Test 13: L2 token price (Polygon USDC) ---
  it('getPrice() - Polygon USDC uses platformId=polygon-pos', async () => {
    const oracle = new CoinGeckoOracle(TEST_API_KEY);

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359': {
          usd: 1.0002,
          last_updated_at: 1711356300,
        },
      }),
    });

    const result = await oracle.getPrice(POLYGON_USDC);

    expect(result.usdPrice).toBe(1.0002);
    expect(result.source).toBe('coingecko');

    // Verify URL uses polygon-pos platformId (not ethereum)
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/simple/token_price/polygon-pos');
    expect(calledUrl).not.toContain('/simple/token_price/ethereum');
    expect(calledUrl).toContain('contract_addresses=0x3c499c542cef5e3811e1192ce70d8cc03d5c3359');
  });

  // --- Test 14: L2 + L1 batch -> separate API calls per network ---
  it('getPrices() - ETH_USDC + POLYGON_USDC batched into SEPARATE API calls', async () => {
    const oracle = new CoinGeckoOracle(TEST_API_KEY);

    // First call: ethereum-mainnet (platformId=ethereum)
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { usd: 0.9999, last_updated_at: 1711356300 },
        }),
      })
      // Second call: polygon-mainnet (platformId=polygon-pos)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359': { usd: 1.0002, last_updated_at: 1711356300 },
        }),
      });

    const result = await oracle.getPrices([ETH_USDC, POLYGON_USDC]);

    // 2 separate API calls (different networks = different platformIds)
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Verify both CAIP-19 keys present with distinct chain prefixes
    expect(result.size).toBe(2);
    expect(result.has('eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')).toBe(true);
    expect(result.has('eip155:137/erc20:0x3c499c542cef5e3811e1192ce70d8cc03d5c3359')).toBe(true);

    // Verify USD prices
    expect(result.get('eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')!.usdPrice).toBe(0.9999);
    expect(result.get('eip155:137/erc20:0x3c499c542cef5e3811e1192ce70d8cc03d5c3359')!.usdPrice).toBe(1.0002);
  });
});
