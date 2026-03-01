/**
 * Unit tests for DriftMarketData conversion.
 *
 * Covers: getMarkets() PerpMarketInfo[] conversion, marketIndex stripping,
 * delegation to sdkWrapper, edge cases (empty array, wrapper error).
 */
import { describe, expect, it, vi } from 'vitest';
import { DriftMarketData } from '../providers/drift/drift-market-data.js';
import { MockDriftSdkWrapper } from '../providers/drift/drift-sdk-wrapper.js';
import type { IDriftSdkWrapper } from '../providers/drift/drift-sdk-wrapper.js';

// ---------------------------------------------------------------------------
// DriftMarketData.getMarkets()
// ---------------------------------------------------------------------------

describe('DriftMarketData.getMarkets()', () => {
  it('should return PerpMarketInfo[] with correct length (3 from mock)', async () => {
    const md = new DriftMarketData(new MockDriftSdkWrapper());
    const markets = await md.getMarkets();
    expect(markets).toHaveLength(3);
  });

  it('should have market, baseAsset, maxLeverage fields on each result', async () => {
    const md = new DriftMarketData(new MockDriftSdkWrapper());
    const markets = await md.getMarkets();
    for (const m of markets) {
      expect(typeof m.market).toBe('string');
      expect(typeof m.baseAsset).toBe('string');
      expect(typeof m.maxLeverage).toBe('number');
    }
  });

  it('should strip marketIndex from output', async () => {
    const md = new DriftMarketData(new MockDriftSdkWrapper());
    const markets = await md.getMarkets();
    for (const m of markets) {
      // PerpMarketInfo does not have marketIndex
      expect((m as Record<string, unknown>)['marketIndex']).toBeUndefined();
    }
  });

  it('should include fundingRate and oraclePrice (number or null)', async () => {
    const md = new DriftMarketData(new MockDriftSdkWrapper());
    const markets = await md.getMarkets();
    for (const m of markets) {
      expect(m.fundingRate === null || typeof m.fundingRate === 'number').toBe(true);
      expect(m.oraclePrice === null || typeof m.oraclePrice === 'number').toBe(true);
    }
  });

  it('should delegate to sdkWrapper.getMarkets (verified with spy)', async () => {
    const mock = new MockDriftSdkWrapper();
    const spy = vi.spyOn(mock, 'getMarkets');
    const md = new DriftMarketData(mock);
    await md.getMarkets();
    expect(spy).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('DriftMarketData edge cases', () => {
  it('should return empty array when wrapper returns empty markets', async () => {
    const emptyWrapper: IDriftSdkWrapper = {
      ...new MockDriftSdkWrapper(),
      getMarkets: vi.fn().mockResolvedValue([]),
    } as unknown as IDriftSdkWrapper;
    const md = new DriftMarketData(emptyWrapper);
    const markets = await md.getMarkets();
    expect(markets).toEqual([]);
  });

  it('should propagate error when wrapper throws', async () => {
    const errorWrapper: IDriftSdkWrapper = {
      ...new MockDriftSdkWrapper(),
      getMarkets: vi.fn().mockRejectedValue(new Error('SDK error')),
    } as unknown as IDriftSdkWrapper;
    const md = new DriftMarketData(errorWrapper);
    await expect(md.getMarkets()).rejects.toThrow('SDK error');
  });
});
