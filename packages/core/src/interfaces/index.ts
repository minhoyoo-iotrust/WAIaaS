// Logger abstraction
export type { ILogger, LogLevel } from './logger.js';
export { ConsoleLogger } from './logger.js';

// Chain adapter types
export type {
  TokenAmount,
  TransferRequest,
  UnsignedTransaction,
  SimulationResult,
  SubmitResult,
  BalanceInfo,
  HealthInfo,
  AssetInfo,
  // v1.4 new types
  FeeEstimate,
  TokenInfo,
  SweepResult,
  TokenTransferParams,
  ContractCallParams,
  ApproveParams,
  BatchParams,
  // v1.4.7 sign-only types
  ParsedOperationType,
  ParsedOperation,
  ParsedTransaction,
  SignedTransaction,
  // v31.0 NFT chain adapter types
  NftTransferParams,
  NftApproveParams,
} from './chain-adapter.types.js';

// Interfaces
export type { IChainAdapter, INftApprovalQuery } from './IChainAdapter.js';
export { hasNftApprovalQuery } from './IChainAdapter.js';
export type { ILocalKeyStore } from './ILocalKeyStore.js';
export type { IPolicyEngine, PolicyEvaluation } from './IPolicyEngine.js';
export type { INotificationChannel, NotificationPayload } from './INotificationChannel.js';

// v1.5 Price Oracle types (Zod SSoT)
export type { TokenRef, PriceInfo, CacheStats, IPriceOracle } from './price-oracle.types.js';
export { TokenRefSchema, PriceInfoSchema } from './price-oracle.types.js';

// v1.5 Action Provider types (Zod SSoT)
export type {
  ActionProviderMetadata,
  ActionDefinition,
  ActionContext,
  IActionProvider,
  // v31.4: API-direct result type for non-on-chain providers (HDESIGN-01)
  ApiDirectResult,
  // v31.12: async tracking result for IActionProvider.checkStatus()
  ActionProviderTrackingResult,
} from './action-provider.types.js';
export {
  ActionProviderMetadataSchema,
  ActionDefinitionSchema,
  ActionContextSchema,
  // v31.4: type guard for API-direct results
  isApiDirectResult,
  // v32.0: snake_case to display name conversion
  snakeCaseToDisplayName,
} from './action-provider.types.js';

// v1.5.3 Forex Rate types (Zod SSoT)
export type { ForexRate, CurrencyCode, IForexRateService } from './forex-rate.types.js';
export { ForexRateSchema, CurrencyCodeSchema } from './forex-rate.types.js';

// v27.1 incoming transaction subscriber types
export type { IncomingTransaction } from './chain-subscriber.types.js';
export type { IChainSubscriber } from './IChainSubscriber.js';

// v27.1 connection state machine (reconnection infrastructure)
export {
  type ConnectionState,
  type ReconnectConfig,
  calculateDelay,
  DEFAULT_RECONNECT_CONFIG,
  SOLANA_RECONNECT_CONFIG,
  reconnectLoop,
} from './connection-state.js';

// v1.5.1 x402 types (Zod SSoT)
export type { X402FetchRequest, X402FetchResponse, X402PaymentInfo } from './x402.types.js';
export type { PaymentRequired, PaymentPayload, PaymentRequirements } from './x402.types.js';
export {
  X402FetchRequestSchema,
  X402FetchResponseSchema,
  X402PaymentInfoSchema,
  CAIP2_TO_NETWORK,
  NETWORK_TO_CAIP2,
  parseCaip2,
  resolveX402Network,
  PaymentRequiredV2Schema,
  PaymentPayloadV2Schema,
  PaymentRequirementsV2Schema,
} from './x402.types.js';

// v27.2 CAIP-2/19 module (Zod schemas, parsers, formatters, network map, asset helpers)
export {
  Caip2Schema,
  type Caip2,
  type Caip2Params,
  formatCaip2,
  CAIP19_REGEX,
  Caip19AssetTypeSchema,
  Caip19Schema,
  type Caip19AssetType,
  type Caip19,
  type Caip19Params,
  formatCaip19,
  parseCaip19,
  networkToCaip2,
  caip2ToNetwork,
  nativeAssetId,
  tokenAssetId,
  isNativeAsset,
  nftAssetId,
  isNftAsset,
  parseAssetId,
  extractNetworkFromAssetId,
  type ParsedAssetId,
  enrichBalance,
  enrichAsset,
  enrichNft,
  enrichTransaction,
  enrichIncomingTx,
} from '../caip/index.js';

// v29.2 Lending Provider types (Zod SSoT)
export type {
  LendingPositionSummary,
  HealthFactor,
  MarketInfo,
  ILendingProvider,
} from './lending-provider.types.js';
export {
  LendingPositionSummarySchema,
  HealthFactorSchema,
  MarketInfoSchema,
} from './lending-provider.types.js';

// v29.2 Position Provider types
export type { PositionUpdate, PositionQueryContext, IPositionProvider } from './position-provider.types.js';

// v29.2 DeFi Monitor types
export type { IDeFiMonitor, MonitorSeverity, MonitorEvaluation } from './defi-monitor.types.js';

// v29.6 Yield Provider types (Zod SSoT)
export type {
  YieldMarketInfo,
  YieldPositionSummary,
  YieldForecast,
  IYieldProvider,
} from './yield-provider.types.js';
export {
  YieldMarketInfoSchema,
  YieldPositionSummarySchema,
  YieldForecastSchema,
} from './yield-provider.types.js';

// v29.8 Perp Provider types (Zod SSoT)
export type {
  PerpPositionSummary,
  MarginInfo,
  PerpMarketInfo,
  IPerpProvider,
} from './perp-provider.types.js';
export {
  PerpPositionSummarySchema,
  MarginInfoSchema,
  PerpMarketInfoSchema,
} from './perp-provider.types.js';

// v31.0 NFT Indexer types (Zod SSoT)
export type {
  INftIndexer,
  NftItem,
  NftMetadata,
  NftCollection,
  NftListOptions,
  NftListResult,
} from './nft-indexer.types.js';
export {
  NftItemSchema,
  NftMetadataSchema,
  NftCollectionSchema,
  NftListOptionsSchema,
  NftListResultSchema,
} from './nft-indexer.types.js';
