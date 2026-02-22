import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PythOracle, PriceNotAvailableError } from '../infrastructure/oracle/pyth-oracle.js';

/**
 * Build a mock Pyth Hermes API response.
 *
 * @param feeds - Array of { id, price, conf, expo } to include in parsed response.
 */
function makePythResponse(
  feeds: Array<{ id: string; price: string; conf: string; expo: number }>,
) {
  return {
    parsed: feeds.map((f) => ({
      id: f.id,
      price: { price: f.price, conf: f.conf, expo: f.expo, publish_time: 1711356300 },
      ema_price: { price: f.price, conf: f.conf, expo: f.expo, publish_time: 1711356300 },
      metadata: { slot: 123456, proof_available_time: 1711356300, prev_publish_time: 1711356299 },
    })),
  };
}

describe('PythOracle', () => {
  let oracle: PythOracle;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    oracle = new PythOracle();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // -----------------------------------------------------------------------
  // 1. getPrice() - SOL/USD (with network for CAIP-19 key derivation)
  // -----------------------------------------------------------------------
  it('getPrice() should return SOL/USD price from Pyth Hermes API', async () => {
    const solFeedId = 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d';
    const response = makePythResponse([
      { id: solFeedId, price: '18413602312', conf: '17716632', expo: -8 },
    ]);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(response),
    });

    const result = await oracle.getPrice({ address: 'native', decimals: 9, chain: 'solana', network: 'mainnet' });

    expect(result.usdPrice).toBeCloseTo(184.13602312, 6);
    expect(result.source).toBe('pyth');
    expect(result.confidence).toBeDefined();
    expect(result.confidence!).toBeGreaterThan(0);
    expect(result.confidence!).toBeLessThanOrEqual(1);
    expect(result.isStale).toBe(false);
    expect(result.fetchedAt).toBeGreaterThan(0);
    expect(result.expiresAt).toBeGreaterThan(result.fetchedAt);
  });

  // -----------------------------------------------------------------------
  // 2. getPrice() - ETH/USD (with network for CAIP-19 key derivation)
  // -----------------------------------------------------------------------
  it('getPrice() should return ETH/USD price from Pyth Hermes API', async () => {
    const ethFeedId = 'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace';
    const response = makePythResponse([
      { id: ethFeedId, price: '330012345678', conf: '123456789', expo: -8 },
    ]);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(response),
    });

    const result = await oracle.getPrice({ address: 'native', decimals: 18, chain: 'ethereum', network: 'ethereum-mainnet' });

    expect(result.usdPrice).toBeCloseTo(3300.12345678, 6);
    expect(result.source).toBe('pyth');
    expect(result.confidence).toBeDefined();
    expect(result.isStale).toBe(false);
  });

  // -----------------------------------------------------------------------
  // 3. getPrice() - unregistered token throws PriceNotAvailableError
  // -----------------------------------------------------------------------
  it('getPrice() should throw PriceNotAvailableError for unregistered token', async () => {
    await expect(
      oracle.getPrice({
        address: 'UnKnOwNtOkEn1111111111111111111111111111',
        decimals: 6,
        chain: 'solana',
        network: 'mainnet',
      }),
    ).rejects.toThrow(PriceNotAvailableError);

    // fetch should NOT have been called (no feed ID found)
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 4. getPrice() - Pyth API HTTP error throws error
  // -----------------------------------------------------------------------
  it('getPrice() should throw on Pyth API HTTP error', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    await expect(
      oracle.getPrice({ address: 'native', decimals: 9, chain: 'solana', network: 'mainnet' }),
    ).rejects.toThrow(/Pyth API/);
  });

  // -----------------------------------------------------------------------
  // 5. getPrice() - 5s timeout via AbortSignal
  // -----------------------------------------------------------------------
  it('getPrice() should use 5-second timeout via AbortSignal', async () => {
    const solFeedId = 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d';
    const response = makePythResponse([
      { id: solFeedId, price: '18413602312', conf: '17716632', expo: -8 },
    ]);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(response),
    });

    await oracle.getPrice({ address: 'native', decimals: 9, chain: 'solana', network: 'mainnet' });

    // Verify fetch was called with AbortSignal.timeout
    expect(fetchMock).toHaveBeenCalledOnce();
    const callArgs = fetchMock.mock.calls[0];
    expect(callArgs[1]).toBeDefined();
    expect(callArgs[1].signal).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // 6. getPrices() - batch query with CAIP-19 result keys
  // -----------------------------------------------------------------------
  it('getPrices() should batch multiple tokens into a single API call with CAIP-19 keys', async () => {
    const solFeedId = 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d';
    const ethFeedId = 'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace';

    const response = makePythResponse([
      { id: solFeedId, price: '18413602312', conf: '17716632', expo: -8 },
      { id: ethFeedId, price: '330012345678', conf: '123456789', expo: -8 },
    ]);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(response),
    });

    const tokens = [
      { address: 'native', decimals: 9, chain: 'solana' as const, network: 'mainnet' as const },
      { address: 'native', decimals: 18, chain: 'ethereum' as const, network: 'ethereum-mainnet' as const },
    ];

    const result = await oracle.getPrices(tokens);

    // Should be a single fetch call with multiple ids[]
    expect(fetchMock).toHaveBeenCalledOnce();
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain(`ids[]=0x${solFeedId}`);
    expect(url).toContain(`ids[]=0x${ethFeedId}`);

    // Should return Map with CAIP-19 keys
    expect(result.size).toBe(2);
    expect(result.get('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501')?.usdPrice).toBeCloseTo(184.13602312, 6);
    expect(result.get('eip155:1/slip44:60')?.usdPrice).toBeCloseTo(3300.12345678, 6);
  });

  // -----------------------------------------------------------------------
  // 7. getNativePrice('solana') - SOL price
  // -----------------------------------------------------------------------
  it("getNativePrice('solana') should return SOL price", async () => {
    const solFeedId = 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d';
    const response = makePythResponse([
      { id: solFeedId, price: '18413602312', conf: '17716632', expo: -8 },
    ]);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(response),
    });

    const result = await oracle.getNativePrice('solana');

    expect(result.usdPrice).toBeCloseTo(184.13602312, 6);
    expect(result.source).toBe('pyth');
  });

  // -----------------------------------------------------------------------
  // 8. getNativePrice('ethereum') - ETH price
  // -----------------------------------------------------------------------
  it("getNativePrice('ethereum') should return ETH price", async () => {
    const ethFeedId = 'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace';
    const response = makePythResponse([
      { id: ethFeedId, price: '330012345678', conf: '123456789', expo: -8 },
    ]);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(response),
    });

    const result = await oracle.getNativePrice('ethereum');

    expect(result.usdPrice).toBeCloseTo(3300.12345678, 6);
    expect(result.source).toBe('pyth');
  });

  // -----------------------------------------------------------------------
  // 9. getCacheStats() - empty stats (PythOracle has no internal cache)
  // -----------------------------------------------------------------------
  it('getCacheStats() should return all-zero stats (no internal cache)', () => {
    const stats = oracle.getCacheStats();

    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
    expect(stats.staleHits).toBe(0);
    expect(stats.size).toBe(0);
    expect(stats.evictions).toBe(0);
  });

  // -----------------------------------------------------------------------
  // 10. getPrice() backward compatibility: chain without network still works
  // -----------------------------------------------------------------------
  it('getPrice() should resolve network from chain when network is not provided', async () => {
    const solFeedId = 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d';
    const response = makePythResponse([
      { id: solFeedId, price: '18413602312', conf: '17716632', expo: -8 },
    ]);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(response),
    });

    // No network field -- resolveNetwork(chain) should handle it
    const result = await oracle.getPrice({ address: 'native', decimals: 9, chain: 'solana' });

    expect(result.usdPrice).toBeCloseTo(184.13602312, 6);
    expect(result.source).toBe('pyth');
  });
});
