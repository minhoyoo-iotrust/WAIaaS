export { WalletSchema, type Wallet, CreateWalletRequestSchema, type CreateWalletRequest } from './wallet.schema.js';
export { SessionSchema, type Session, CreateSessionRequestSchema, type CreateSessionRequest } from './session.schema.js';
export {
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
} from './transaction.schema.js';
export {
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
} from './policy.schema.js';
export { ConfigSchema, type Config } from './config.schema.js';
export { AssetInfoSchema, type AssetInfoDto } from './asset.schema.js';

// v27.1 incoming transaction schema (Zod SSoT)
export {
  IncomingTransactionSchema,
  type IncomingTransaction as IncomingTransactionDto,
} from './incoming-transaction.schema.js';

// v30.2 audit log schema (Zod SSoT)
export {
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
} from './audit.schema.js';

// v30.2 webhook outbound schema (Zod SSoT)
export {
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
} from './webhook.schema.js';

// v30.2 admin stats + autostop rules schema (Zod SSoT)
export {
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
} from './admin-stats.schema.js';

// v30.2 dry-run simulation schema (Zod SSoT)
export {
  DryRunSimulationResultSchema,
  SimulationWarningCodeEnum,
  PolicyResultSchema,
  FeeEstimateResultSchema,
  BalanceChangeSchema,
  SimulationWarningSchema,
  SimulationDetailSchema,
  SimulationMetaSchema,
  type DryRunSimulationResult,
  type SimulationWarningCode,
  type PolicyResult,
  type FeeEstimateResult,
  type BalanceChange,
  type SimulationWarning,
  type SimulationDetail,
  type SimulationMeta,
} from './simulation.schema.js';
