/**
 * Drift market data service.
 *
 * Converts DriftMarketInfo from IDriftSdkWrapper to PerpMarketInfo
 * for IPerpProvider.getMarkets() compliance.
 */
import type { PerpMarketInfo } from '@waiaas/core';
import type { IDriftSdkWrapper } from './drift-sdk-wrapper.js';

export class DriftMarketData {
  constructor(private readonly sdkWrapper: IDriftSdkWrapper) {}

  /**
   * Get all available Drift perp markets as PerpMarketInfo[].
   * Converts DriftMarketInfo -> PerpMarketInfo (drops marketIndex,
   * keeps market/baseAsset/maxLeverage/fundingRate/openInterest/oraclePrice).
   */
  async getMarkets(): Promise<PerpMarketInfo[]> {
    const driftMarkets = await this.sdkWrapper.getMarkets();
    return driftMarkets.map((m) => ({
      market: m.market,
      baseAsset: m.baseAsset,
      maxLeverage: m.maxLeverage,
      fundingRate: m.fundingRate,
      openInterest: m.openInterest,
      oraclePrice: m.oraclePrice,
    }));
  }
}
