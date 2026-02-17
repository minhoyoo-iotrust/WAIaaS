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
  // 1. getPrice() - SOL/USD
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

    const result = await oracle.getPrice({ address: 'native', decimals: 9, chain: 'solana' });

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
  // 2. getPrice() - ETH/USD
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

    const result = await oracle.getPrice({ address: 'native', decimals: 18, chain: 'ethereum' });

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
      oracle.getPrice({ address: 'native', decimals: 9, chain: 'solana' }),
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

    await oracle.getPrice({ address: 'native', decimals: 9, chain: 'solana' });

    // Verify fetch was called with AbortSignal.timeout
    expect(fetchMock).toHaveBeenCalledOnce();
    const callArgs = fetchMock.mock.calls[0];
    expect(callArgs[1]).toBeDefined();
    expect(callArgs[1].signal).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // 6. getPrices() - batch query
  // -----------------------------------------------------------------------
  it('getPrices() should batch multiple tokens into a single API call', async () => {
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
      { address: 'native', decimals: 9, chain: 'solana' as const },
      { address: 'native', decimals: 18, chain: 'ethereum' as const },
    ];

    const result = await oracle.getPrices(tokens);

    // Should be a single fetch call with multiple ids[]
    expect(fetchMock).toHaveBeenCalledOnce();
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain(`ids[]=0x${solFeedId}`);
    expect(url).toContain(`ids[]=0x${ethFeedId}`);

    // Should return Map with both prices
    expect(result.size).toBe(2);
    expect(result.get('solana:native')?.usdPrice).toBeCloseTo(184.13602312, 6);
    expect(result.get('ethereum:native')?.usdPrice).toBeCloseTo(3300.12345678, 6);
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
  // 10. Pyth price conversion precision (BTC range)
  // -----------------------------------------------------------------------
  it('should correctly convert Pyth price with BTC-range values', async () => {
    const btcFeedId = 'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43';
    const response = makePythResponse([
      { id: btcFeedId, price: '6700000000000', conf: '5000000', expo: -8 },
    ]);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(response),
    });

    // Use a cache key that maps to BTC feed
    const result = await oracle.getPrice({
      address: 'native_btc',
      decimals: 8,
      chain: 'ethereum',
    });

    expect(result.usdPrice).toBeCloseTo(67000.0, 2);
    expect(result.source).toBe('pyth');
    // Confidence: 1 - (5000000 * 10^-8 / 67000) ≈ 0.99999925...
    expect(result.confidence).toBeGreaterThan(0.99);
  });
});
