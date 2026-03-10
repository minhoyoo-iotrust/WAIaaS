/**
 * Polymarket prediction market integration - shared infrastructure.
 *
 * Re-exports all components for Order/CTF providers.
 *
 * @see design doc 80
 */

// Config
export {
  PM_CONTRACTS,
  PM_API_URLS,
  CLOB_AUTH_DOMAIN,
  CTF_EXCHANGE_DOMAIN,
  NEG_RISK_CTF_EXCHANGE_DOMAIN,
  ORDER_TYPES,
  CLOB_AUTH_TYPES,
  CLOB_AUTH_MESSAGE,
  ORDER_SIDE,
  SIGNATURE_TYPE,
  ZERO_ADDRESS,
  PM_DEFAULTS,
  PM_SETTINGS,
  PM_ERRORS,
} from './config.js';

// Schemas
export {
  PmBuySchema,
  PmSellSchema,
  PmCancelOrderSchema,
  PmCancelAllSchema,
  PmUpdateOrderSchema,
  PM_ORDER_TYPES,
  PM_ORDER_SIDES,
  PM_ORDER_STATUSES,
  ClobOrderResponseSchema,
  OrderbookResponseSchema,
  PriceResponseSchema,
  MidpointResponseSchema,
  OrderbookEntrySchema,
  type PmBuyInput,
  type PmSellInput,
  type PmCancelOrderInput,
  type PmCancelAllInput,
  type PmUpdateOrderInput,
  type PmOrderType,
  type PmOrderSide,
  type PmOrderStatus,
  type ClobOrderResponse,
  type OrderbookResponse,
  type PriceResponse,
  type MidpointResponse,
  type PolymarketOrderStruct,
} from './schemas.js';

// Signer
export { PolymarketSigner } from './signer.js';

// Order Builder
export { OrderBuilder, type OrderBuilderParams } from './order-builder.js';

// Rate Limiter
export { PolymarketRateLimiter } from './rate-limiter.js';

// CLOB Client
export {
  PolymarketClobClient,
  type L1Headers,
  type ApiCredentials,
  type ClobOrder,
} from './clob-client.js';

// API Key Service
export {
  PolymarketApiKeyService,
  type ApiKeyDb,
  type PolymarketApiKeyRow,
  type EncryptFn,
  type DecryptFn,
} from './api-key-service.js';

// Order Provider
export {
  PolymarketOrderProvider,
  type NegRiskResolver,
  type OrderDb,
  type UuidFn,
} from './order-provider.js';

// Neg Risk Router
export { NegRiskRouter, type ExchangeInfo } from './neg-risk-router.js';

// Approve Helper
export { PolymarketApproveHelper, type ApproveRequest } from './approve-helper.js';

// Orderbook Service
export {
  PolymarketOrderbookService,
  type OrderbookResult,
  type OrderbookEntry,
} from './orderbook-service.js';

// CTF Schemas
export {
  PmRedeemSchema,
  PmSplitSchema,
  PmMergeSchema,
  PmApproveCollateralSchema,
  PmApproveCtfSchema,
  type PmRedeemInput,
  type PmSplitInput,
  type PmMergeInput,
  type PmApproveCollateralInput,
  type PmApproveCtfInput,
} from './ctf-schemas.js';

// CTF Provider
export { PolymarketCtfProvider } from './ctf-provider.js';

// Market Schemas
export {
  GammaTokenSchema,
  GammaMarketSchema,
  GammaEventSchema,
  MarketFilterSchema,
  type GammaToken,
  type GammaMarket,
  type GammaEvent,
  type MarketFilter,
} from './market-schemas.js';

// Gamma Client
export { PolymarketGammaClient } from './gamma-client.js';

// Market Data
export { PolymarketMarketData, type ResolutionStatus } from './market-data.js';

// Infrastructure Factory
export {
  createPolymarketInfrastructure,
  type PolymarketConfig,
  type PolymarketDb,
  type PolymarketInfrastructure,
} from './infrastructure.js';
