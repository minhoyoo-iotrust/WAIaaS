/**
 * Hyperliquid DEX integration - shared infrastructure.
 *
 * Re-exports all components for Perp/Spot/Sub-account providers.
 *
 * @see HDESIGN-03: Component dependency graph
 */

// Config
export {
  HL_MAINNET_API_URL,
  HL_TESTNET_API_URL,
  HL_L1_DOMAIN,
  hlUserSignedDomain,
  INFO_WEIGHTS,
  HL_DEFAULTS,
  HL_SETTINGS,
  HL_ERRORS,
} from './config.js';

// Schemas
export {
  HlOpenPositionInputSchema,
  HlPlaceOrderInputSchema,
  HlClosePositionInputSchema,
  HlCancelOrderInputSchema,
  HlSetLeverageInputSchema,
  HlSetMarginModeInputSchema,
  HlTransferUsdcInputSchema,
  HlSpotBuyInputSchema,
  HlSpotSellInputSchema,
  HlSpotCancelInputSchema,
  HlCreateSubAccountInputSchema,
  HlSubTransferInputSchema,
  HlGetSubPositionsInputSchema,
  SubAccountInfoSchema,
  ExchangeResponseSchema,
  PositionSchema,
  ClearinghouseStateSchema,
  OpenOrderSchema,
  FillSchema,
  MarketMetaSchema,
  FundingRateSchema,
  AllMidsSchema,
  SpotMetaSchema,
  SpotBalanceSchema,
  SpotClearinghouseStateSchema,
  USER_ACTION_TYPES,
  type ExchangeResponse,
  type Position,
  type ClearinghouseState,
  type OpenOrder,
  type Fill,
  type MarketMeta,
  type FundingRate,
  type AllMids,
  type OrderWire,
  type OrderTypeWire,
  type SpotMeta,
  type SpotBalance,
  type SpotClearinghouseState,
  type SpotMarketInfo,
  type HlCreateSubAccountInput,
  type HlSubTransferInput,
  type HlGetSubPositionsInput,
  type SubAccountInfo,
} from './schemas.js';

// Signer
export { HyperliquidSigner, removeTrailingZeros, orderToWire } from './signer.js';

// Exchange Client
export {
  HyperliquidExchangeClient,
  HyperliquidRateLimiter,
  createHyperliquidClient,
  type ExchangeRequest,
  type InfoRequest,
} from './exchange-client.js';

// Market Data
export { HyperliquidMarketData, type MarketInfo } from './market-data.js';

// Perp Provider
export { HyperliquidPerpProvider } from './perp-provider.js';

// Spot Provider
export { HyperliquidSpotProvider } from './spot-provider.js';

// Sub-account Service + Provider
export { HyperliquidSubAccountService } from './sub-account-service.js';
export { HyperliquidSubAccountProvider } from './sub-account-provider.js';
