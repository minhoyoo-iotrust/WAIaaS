// @waiaas/core - shared types, schemas, errors, interfaces

// Enums (13 SSoT enums + EVM/Solana subsets + validateChainNetwork + environment model)
export {
  CHAIN_TYPES,
  type ChainType,
  ChainTypeEnum,
  NETWORK_TYPES,
  type NetworkType,
  NetworkTypeEnum,
  EVM_NETWORK_TYPES,
  type EvmNetworkType,
  EvmNetworkTypeEnum,
  SOLANA_NETWORK_TYPES,
  type SolanaNetworkType,
  validateChainNetwork,
  ENVIRONMENT_TYPES,
  type EnvironmentType,
  EnvironmentTypeEnum,
  ENVIRONMENT_NETWORK_MAP,
  ENVIRONMENT_SINGLE_NETWORK,
  getNetworksForEnvironment,
  getSingleNetwork,
  deriveEnvironment,
  validateNetworkEnvironment,
  normalizeNetworkInput,
  _resetLegacyWarning,
  NetworkTypeEnumWithLegacy,
  WALLET_STATUSES,
  type WalletStatus,
  WalletStatusEnum,
  TRANSACTION_STATUSES,
  type TransactionStatus,
  TransactionStatusEnum,
  TRANSACTION_TYPES,
  type TransactionType,
  TransactionTypeEnum,
  POLICY_TYPES,
  type PolicyType,
  PolicyTypeEnum,
  POLICY_TIERS,
  type PolicyTier,
  PolicyTierEnum,
  SESSION_STATUSES,
  type SessionStatus,
  SessionStatusEnum,
  NOTIFICATION_EVENT_TYPES,
  type NotificationEventType,
  NotificationEventTypeEnum,
  NOTIFICATION_LOG_STATUSES,
  type NotificationLogStatus,
  NotificationLogStatusEnum,
  AUDIT_ACTIONS,
  type AuditAction,
  AuditActionEnum,
  KILL_SWITCH_STATES,
  type KillSwitchState,
  KillSwitchStateEnum,
  OWNER_STATES,
  type OwnerState,
  OwnerStateEnum,
  INCOMING_TX_STATUSES,
  type IncomingTxStatus,
  IncomingTxStatusEnum,
  POSITION_CATEGORIES,
  type PositionCategory,
  PositionCategoryEnum,
  POSITION_STATUSES,
  type PositionStatus,
  PositionStatusEnum,
  ACCOUNT_TYPES,
  type AccountType,
  AccountTypeEnum,
  AA_PROVIDER_NAMES,
  type AaProviderName,
  AaProviderNameEnum,
  SigningSchemeEnum,
  type SigningScheme,
  SIGNING_SCHEMES,
} from './enums/index.js';

// Schemas (5 domain Zod SSoT schemas + v1.4 discriminatedUnion 6-type)
export {
  WalletSchema,
  type Wallet,
  CreateWalletRequestSchema,
  type CreateWalletRequest,
  SessionSchema,
  type Session,
  CreateSessionRequestSchema,
  type CreateSessionRequest,
  TransactionSchema,
  type Transaction,
  SendTransactionRequestSchema,
  type SendTransactionRequest,
  // v28.5 gas condition schema
  GasConditionSchema,
  type GasCondition,
  // v1.4 discriminatedUnion 6-type transaction request schemas
  TransactionRequestSchema,
  type TransactionRequest,
  TransferRequestSchema,
  type TransferRequestInput,
  TokenTransferRequestSchema,
  type TokenTransferRequest,
  ContractCallRequestSchema,
  type ContractCallRequest,
  ApproveRequestSchema,
  type ApproveRequest,
  BatchRequestSchema,
  type BatchRequest,
  // v31.14 CONTRACT_DEPLOY (7th type) -- EVM contract deployment
  ContractDeployRequestSchema,
  type ContractDeployRequest,
  // v31.0 NFT_TRANSFER (6th type) + NFT standard enum
  NftTransferRequestSchema,
  type NftTransferRequest,
  NftStandardEnum,
  type NftStandard,
  NftTokenInfoSchema,
  type NftTokenInfo,
  // v30.9 sign message schemas (EIP-712 signTypedData)
  SignMessageRequestSchema,
  type SignMessageRequest,
  Eip712TypedDataSchema,
  type Eip712TypedData,
  SignTypeEnum,
  type SignType,
  PolicySchema,
  type Policy,
  CreatePolicyRequestSchema,
  type CreatePolicyRequest,
  UpdatePolicyRequestSchema,
  type UpdatePolicyRequest,
  TokenLimitSchema,
  type TokenLimit,
  SpendingLimitRulesSchema,
  type SpendingLimitRules,
  WhitelistRulesSchema,
  type WhitelistRules,
  RateLimitRulesSchema,
  type RateLimitRules,
  TimeRestrictionRulesSchema,
  type TimeRestrictionRules,
  X402AllowedDomainsRulesSchema,
  type X402AllowedDomainsRules,
  ReputationThresholdRulesSchema,
  type ReputationThresholdRules,
  // v32.4: newly-exported rule schemas + POLICY_RULES_SCHEMAS map (Phase 427)
  POLICY_RULES_SCHEMAS,
  AllowedTokensRulesSchema,
  type AllowedTokensRules,
  ContractWhitelistRulesSchema,
  type ContractWhitelistRules,
  MethodWhitelistRulesSchema,
  type MethodWhitelistRules,
  ApprovedSpendersRulesSchema,
  type ApprovedSpendersRules,
  ApproveAmountLimitRulesSchema,
  type ApproveAmountLimitRules,
  ApproveTierOverrideRulesSchema,
  type ApproveTierOverrideRules,
  AllowedNetworksRulesSchema,
  type AllowedNetworksRules,
  // v32.4-429: Lending/Perp/Venue/ActionCategory rule schemas
  LendingAssetWhitelistRulesSchema,
  type LendingAssetWhitelistRules,
  LendingLtvLimitRulesSchema,
  type LendingLtvLimitRules,
  PerpMaxLeverageRulesSchema,
  type PerpMaxLeverageRules,
  PerpMaxPositionUsdRulesSchema,
  type PerpMaxPositionUsdRules,
  PerpAllowedMarketsRulesSchema,
  type PerpAllowedMarketsRules,
  VenueWhitelistRulesSchema,
  type VenueWhitelistRules,
  ActionCategoryLimitRulesSchema,
  type ActionCategoryLimitRules,
  ConfigSchema,
  type Config,
  AssetInfoSchema,
  type AssetInfoDto,
  IncomingTransactionSchema,
  type IncomingTransactionDto,
  // v30.2 audit log schema (Zod SSoT)
  AuditEventTypeSchema,
  AuditSeveritySchema,
  AUDIT_EVENT_TYPES,
  AUDIT_SEVERITIES,
  AuditLogItemSchema,
  AuditLogResponseSchema,
  AuditLogQuerySchema,
  type AuditEventType,
  type AuditSeverity,
  type AuditLogItem,
  type AuditLogResponse,
  type AuditLogQuery,
  // v30.2 webhook outbound schema (Zod SSoT)
  WEBHOOK_EVENT_TYPES,
  WebhookEventTypeSchema,
  CreateWebhookRequestSchema,
  WebhookResponseSchema,
  CreateWebhookResponseSchema,
  WEBHOOK_LOG_STATUSES,
  WebhookLogSchema,
  WebhookLogQuerySchema,
  type WebhookEventType,
  type CreateWebhookRequest,
  type WebhookResponse,
  type CreateWebhookResponse,
  type WebhookLog,
  type WebhookLogQuery,
  // v30.2 admin stats + autostop rules schema (Zod SSoT)
  AdminStatsTransactionsSchema,
  AdminStatsSessionsSchema,
  AdminStatsWalletsSchema,
  AdminStatsRpcSchema,
  AdminStatsAutoStopSchema,
  AdminStatsNotificationsSchema,
  AdminStatsSystemSchema,
  AdminStatsResponseSchema,
  AutoStopRuleInfoSchema,
  AutoStopRulesResponseSchema,
  UpdateAutoStopRuleRequestSchema,
  type AdminStatsResponse,
  type AutoStopRuleInfo,
  type AutoStopRulesResponse,
  type UpdateAutoStopRuleRequest,
  // v30.2 dry-run simulation schema (Zod SSoT)
  DryRunSimulationResultSchema,
  SimulationWarningCodeEnum,
  PolicyResultSchema,
  FeeEstimateResultSchema,
  BalanceChangeSchema,
  SimulationWarningSchema,
  SimulationDetailSchema,
  SimulationMetaSchema,
  GasConditionResultSchema,
  type GasConditionResult,
  type DryRunSimulationResult,
  type SimulationWarningCode,
  type PolicyResult,
  type FeeEstimateResult,
  type BalanceChange,
  type SimulationWarning,
  type SimulationDetail,
  type SimulationMeta,
  // v31.2 UserOp Build/Sign API schemas (Phase 338)
  UserOperationV07Schema,
  UserOpBuildRequestSchema,
  UserOpBuildResponseSchema,
  UserOpSignRequestSchema,
  UserOpSignResponseSchema,
  type UserOperationV07,
  type UserOpBuildRequest,
  type UserOpBuildResponse,
  type UserOpSignRequest,
  type UserOpSignResponse,
  // v31.12 Credential Vault schemas
  CredentialTypeEnum,
  CREDENTIAL_TYPES,
  CreateCredentialParamsSchema,
  CredentialMetadataSchema,
  DecryptedCredentialSchema,
  type CredentialType,
  type CreateCredentialParams,
  type CredentialMetadata,
  type DecryptedCredential,
} from './schemas/index.js';

// ResolvedAction 3-kind discriminatedUnion (v31.12 External Action framework)
export {
  ResolvedActionSchema,
  SignedDataActionSchema,
  SignedHttpActionSchema,
  NormalizedContractCallSchema,
  SignedDataActionTrackingSchema,
  SignedDataActionPolicyContextSchema,
  ActionCategoryEnum,
  normalizeResolvedAction,
  normalizeResolvedActions,
  type SignedDataAction,
  type SignedHttpAction,
  type NormalizedContractCall,
  type ResolvedAction,
  type ActionCategory,
} from './schemas/resolved-action.schema.js';

// Wallet Preset (v28.8 builtin wallet preset registry)
export {
  WALLET_PRESET_TYPES,
  WalletPresetTypeSchema,
  BUILTIN_PRESETS,
} from './schemas/wallet-preset.js';
export type { WalletPresetType, WalletPreset } from './schemas/wallet-preset.js';

// Signing Protocol (v2.6.1 Zod schemas + types + utilities)
export {
  APPROVAL_METHODS,
  ApprovalMethodSchema,
  type ApprovalMethod,
  PushRelayResponseChannelSchema,
  TelegramResponseChannelSchema,
  ResponseChannelSchema,
  type PushRelayResponseChannel,
  type TelegramResponseChannel,
  type ResponseChannel,
  SignRequestMetadataSchema,
  type SignRequestMetadata,
  SignRequestSchema,
  type SignRequest,
  SignResponseSchema,
  type SignResponse,
  WalletLinkConfigSchema,
  type WalletLinkConfig,
  encodeSignRequest,
  decodeSignRequest,
  buildUniversalLinkUrl,
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
  EVENT_CATEGORY_MAP,
  EVENT_DESCRIPTIONS,
  NotificationMessageSchema,
  type NotificationMessage,
} from './schemas/signing-protocol.js';

// Errors (100 error codes across 12 domains + WAIaaSError + ChainError)
export {
  ERROR_CODES,
  type ErrorCode,
  type ErrorDomain,
  type ErrorCodeEntry,
  WAIaaSError,
  ChainError,
  type ChainErrorCategory,
  type ChainErrorCode,
  CHAIN_ERROR_CATEGORIES,
} from './errors/index.js';

// Interfaces (7 contracts + chain adapter types + v1.5 price oracle types + v1.5.1 x402 types)
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
  IChainAdapter,
  INftApprovalQuery,
  ILocalKeyStore,
  IPolicyEngine,
  PolicyEvaluation,
  INotificationChannel,
  NotificationPayload,
  // v1.5 price oracle types
  TokenRef,
  PriceInfo,
  CacheStats,
  IPriceOracle,
  // v1.5.3 forex rate types
  ForexRate,
  CurrencyCode,
  IForexRateService,
  // v1.5 action provider types
  ActionProviderMetadata,
  ActionDefinition,
  ActionContext,
  IActionProvider,
  // v31.12: async tracking result for IActionProvider.checkStatus()
  ActionProviderTrackingResult,
  // v31.4: API-direct result type for non-on-chain providers (HDESIGN-01)
  ApiDirectResult,
  // v1.5.1 x402 types
  X402FetchRequest,
  X402FetchResponse,
  X402PaymentInfo,
  PaymentRequired,
  PaymentPayload,
  PaymentRequirements,
  // v27.1 incoming transaction subscriber types
  IncomingTransaction,
  IChainSubscriber,
  // v27.1 connection state machine types
  ConnectionState,
  ReconnectConfig,
  // v27.2 CAIP types
  Caip2,
  Caip2Params,
  Caip19AssetType,
  Caip19,
  Caip19Params,
  // v29.2 lending provider types
  LendingPositionSummary,
  HealthFactor,
  MarketInfo,
  ILendingProvider,
  // v29.2 position provider types
  PositionUpdate,
  PositionQueryContext,
  IPositionProvider,
  // v29.2 DeFi monitor types
  IDeFiMonitor,
  MonitorSeverity,
  MonitorEvaluation,
  // v29.6 yield provider types
  YieldMarketInfo,
  YieldPositionSummary,
  YieldForecast,
  IYieldProvider,
  // v29.8 perp provider types
  PerpPositionSummary,
  MarginInfo,
  PerpMarketInfo,
  IPerpProvider,
  // v31.0 NFT indexer types
  INftIndexer,
  NftItem,
  NftMetadata,
  NftCollection,
  NftListOptions,
  NftListResult,
} from './interfaces/index.js';

// v31.10 NFT approval query type guard (value export)
export { hasNftApprovalQuery } from './interfaces/index.js';

// v32.6 Logger abstraction
export type { ILogger, LogLevel } from './interfaces/index.js';
export { ConsoleLogger } from './interfaces/index.js';

// v27.1 connection state machine (value exports)
export {
  calculateDelay,
  DEFAULT_RECONNECT_CONFIG,
  SOLANA_RECONNECT_CONFIG,
  reconnectLoop,
} from './interfaces/index.js';

// v1.5 Price Oracle Zod schemas (value exports)
export { TokenRefSchema, PriceInfoSchema } from './interfaces/index.js';

// v1.5.3 Forex Rate Zod schemas (value exports)
export { ForexRateSchema, CurrencyCodeSchema } from './interfaces/index.js';

// v1.5 Action Provider Zod schemas (value exports)
export {
  ActionProviderMetadataSchema,
  ActionDefinitionSchema,
  ActionContextSchema,
  // v31.4: type guard for API-direct results
  isApiDirectResult,
  // v32.0: snake_case to display name conversion
  snakeCaseToDisplayName,
} from './interfaces/index.js';

// v1.5.1 x402 Zod schemas + CAIP-2 mapping (value exports)
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
} from './interfaces/index.js';

// v27.2 CAIP-2/19 module (schemas, parsers, formatters, network map, asset helpers)
export {
  Caip2Schema,
  formatCaip2,
  CAIP19_REGEX,
  Caip19AssetTypeSchema,
  Caip19Schema,
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
} from './interfaces/index.js';

// v29.2 Lending Provider Zod schemas (value exports)
export {
  LendingPositionSummarySchema,
  HealthFactorSchema,
  MarketInfoSchema,
} from './interfaces/index.js';

// v29.6 Yield Provider Zod schemas (value exports)
export {
  YieldMarketInfoSchema,
  YieldPositionSummarySchema,
  YieldForecastSchema,
} from './interfaces/index.js';

// v29.8 Perp Provider Zod schemas (value exports)
export {
  PerpPositionSummarySchema,
  MarginInfoSchema,
  PerpMarketInfoSchema,
} from './interfaces/index.js';

// v31.0 NFT Indexer Zod schemas (value exports)
export {
  NftItemSchema,
  NftMetadataSchema,
  NftCollectionSchema,
  NftListOptionsSchema,
  NftListResultSchema,
} from './interfaces/index.js';

// v32.4 Chain constants SSoT (SSOT-01)
export { NATIVE_DECIMALS, NATIVE_SYMBOLS, nativeDecimals, nativeSymbol } from './utils/index.js';

// v32.4 Sleep utility SSoT (SSOT-02)
export { sleep } from './utils/index.js';

// v32.4 Safe JSON parse with Zod validation (ZOD-01)
export { safeJsonParse, type SafeJsonParseResult, type SafeJsonParseError } from './utils/index.js';

// v1.5.3 Currency formatting utilities
export { formatDisplayCurrency, formatRatePreview } from './utils/index.js';

// v1.7 Blockchain amount formatting utilities (NOTE-01)
export { formatAmount, parseAmount } from './utils/index.js';

// v27.2 Block explorer URL mapping
export { getExplorerTxUrl } from './utils/index.js';

// i18n (multilingual messages)
export { getMessages, type SupportedLocale, type Messages } from './i18n/index.js';

// v30.2 Metrics Counter (IMetricsCounter interface + snapshot type)
export type { IMetricsCounter, MetricsSnapshot } from './metrics/metrics-counter.js';

// v28.6 RPC Pool (priority-based URL rotation with cooldown)
export {
  RpcPool,
  AllRpcFailedError,
  BUILT_IN_RPC_DEFAULTS,
  type RpcPoolOptions,
  type RpcEndpointStatus,
  type RpcRegistryEntry,
  type RpcPoolEvent,
} from './rpc/index.js';

// v30.9 AA Provider chain mapping (provider-specific chainId resolution + URL building)
export {
  AA_PROVIDER_CHAIN_MAP,
  resolveProviderChainId,
  buildProviderBundlerUrl,
  AA_PROVIDER_DASHBOARD_URLS,
} from './constants/index.js';

// v32.0 Well-known contract data
export {
  WELL_KNOWN_CONTRACTS,
  type WellKnownContractEntry,
} from './constants/index.js';

// v32.0 Contract Name Registry
export {
  ContractNameRegistry,
  type ContractNameResult,
  type ContractNameSource,
} from './services/index.js';

// v30.10 ERC-8128 Signed HTTP Requests (RFC 9421 + EIP-191)
export * as erc8128 from './erc8128/index.js';

// v1.6 Events (EventBus + 7 typed event definitions)
export { EventBus } from './events/index.js';
export type {
  WaiaasEventMap,
  TransactionCompletedEvent,
  TransactionFailedEvent,
  WalletActivityEvent,
  IncomingTxEvent,
  IncomingTxSuspiciousEvent,
  YieldMaturityWarningEvent,
  MarginWarningEvent,
} from './events/index.js';
