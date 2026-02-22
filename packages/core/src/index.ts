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
  ENVIRONMENT_DEFAULT_NETWORK,
  getNetworksForEnvironment,
  getDefaultNetwork,
  deriveEnvironment,
  validateNetworkEnvironment,
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
} from './enums/index.js';

// Schemas (5 domain Zod SSoT schemas + v1.4 discriminatedUnion 5-type)
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
  // v1.4 discriminatedUnion 5-type transaction request schemas
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
  PolicySchema,
  type Policy,
  CreatePolicyRequestSchema,
  type CreatePolicyRequest,
  UpdatePolicyRequestSchema,
  type UpdatePolicyRequest,
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
  ConfigSchema,
  type Config,
  AssetInfoSchema,
  type AssetInfoDto,
  IncomingTransactionSchema,
  type IncomingTransactionDto,
} from './schemas/index.js';

// Signing Protocol (v2.6.1 Zod schemas + types + utilities)
export {
  APPROVAL_METHODS,
  ApprovalMethodSchema,
  type ApprovalMethod,
  NtfyResponseChannelSchema,
  TelegramResponseChannelSchema,
  ResponseChannelSchema,
  type NtfyResponseChannel,
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
  IChainAdapter,
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
} from './interfaces/index.js';

// v27.1 connection state machine (value exports)
export {
  calculateDelay,
  DEFAULT_RECONNECT_CONFIG,
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
  Caip19AssetTypeSchema,
  Caip19Schema,
  formatCaip19,
  parseCaip19,
  networkToCaip2,
  caip2ToNetwork,
  nativeAssetId,
  tokenAssetId,
  isNativeAsset,
} from './interfaces/index.js';

// v1.5.3 Currency formatting utilities
export { formatDisplayCurrency, formatRatePreview } from './utils/index.js';

// v1.7 Blockchain amount formatting utilities (NOTE-01)
export { formatAmount, parseAmount } from './utils/index.js';

// i18n (multilingual messages)
export { getMessages, type SupportedLocale, type Messages } from './i18n/index.js';

// v1.6 Events (EventBus + 7 typed event definitions)
export { EventBus } from './events/index.js';
export type {
  WaiaasEventMap,
  TransactionCompletedEvent,
  TransactionFailedEvent,
  WalletActivityEvent,
  IncomingTxEvent,
  IncomingTxSuspiciousEvent,
} from './events/index.js';
