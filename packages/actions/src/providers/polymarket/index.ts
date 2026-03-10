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
