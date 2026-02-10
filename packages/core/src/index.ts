// @waiaas/core - shared types, schemas, errors, interfaces

// Enums (12 SSoT enums)
export {
  CHAIN_TYPES,
  type ChainType,
  ChainTypeEnum,
  NETWORK_TYPES,
  type NetworkType,
  NetworkTypeEnum,
  AGENT_STATUSES,
  type AgentStatus,
  AgentStatusEnum,
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
  AUDIT_ACTIONS,
  type AuditAction,
  AuditActionEnum,
  KILL_SWITCH_STATES,
  type KillSwitchState,
  KillSwitchStateEnum,
  OWNER_STATES,
  type OwnerState,
  OwnerStateEnum,
} from './enums/index.js';

// Schemas (5 domain Zod SSoT schemas)
export {
  AgentSchema,
  type Agent,
  CreateAgentRequestSchema,
  type CreateAgentRequest,
  SessionSchema,
  type Session,
  CreateSessionRequestSchema,
  type CreateSessionRequest,
  TransactionSchema,
  type Transaction,
  SendTransactionRequestSchema,
  type SendTransactionRequest,
  PolicySchema,
  type Policy,
  CreatePolicyRequestSchema,
  type CreatePolicyRequest,
  UpdatePolicyRequestSchema,
  type UpdatePolicyRequest,
  ConfigSchema,
  type Config,
} from './schemas/index.js';

// Errors (67 error codes + WAIaaSError)
export {
  ERROR_CODES,
  type ErrorCode,
  type ErrorDomain,
  type ErrorCodeEntry,
  WAIaaSError,
} from './errors/index.js';

// Interfaces (4 contracts + chain adapter types)
export type {
  TokenAmount,
  TransferRequest,
  UnsignedTransaction,
  SimulationResult,
  SubmitResult,
  BalanceInfo,
  HealthInfo,
  IChainAdapter,
  ILocalKeyStore,
  IPolicyEngine,
  PolicyEvaluation,
  INotificationChannel,
  NotificationPayload,
} from './interfaces/index.js';

// i18n (multilingual messages)
export { getMessages, type SupportedLocale, type Messages } from './i18n/index.js';
