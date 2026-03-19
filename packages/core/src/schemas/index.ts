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
  ReputationThresholdRulesSchema,
  type ReputationThresholdRules,
  // v32.4: newly-exported rule schemas + POLICY_RULES_SCHEMAS map
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
} from './policy.schema.js';
export { ConfigSchema, type Config } from './config.schema.js';

// v31.2 UserOp Build/Sign API schemas (Zod SSoT)
export {
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
} from './userop.schema.js';
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
} from './simulation.schema.js';

// v31.12 Credential Vault schemas (Zod SSoT)
export {
  CredentialTypeEnum,
  CREDENTIAL_TYPES,
  CreateCredentialParamsSchema,
  CredentialMetadataSchema,
  DecryptedCredentialSchema,
  type CredentialType,
  type CreateCredentialParams,
  type CredentialMetadata,
  type DecryptedCredential,
} from './credential.schema.js';
