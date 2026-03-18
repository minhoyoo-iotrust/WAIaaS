/**
 * Signing Protocol v1 Zod schemas and utilities.
 *
 * Defines SignRequest, SignResponse, WalletLinkConfig, and approval method types.
 * Provides base64url encoding/decoding utilities for universal link URL construction.
 *
 * Zod SSoT: All TypeScript types are derived from Zod schemas via z.infer<>.
 *
 * @see internal/design/73-signing-protocol-v1.md
 * @see internal/design/74-wallet-sdk-daemon-components.md
 */

import { z } from 'zod';
import type { NotificationEventType } from '../enums/notification.js';

// ---------------------------------------------------------------------------
// Approval Methods
// ---------------------------------------------------------------------------

export const APPROVAL_METHODS = [
  'sdk_push',
  'sdk_telegram',
  'walletconnect',
  'telegram_bot',
  'rest',
] as const;

export const ApprovalMethodSchema = z.enum(APPROVAL_METHODS);
export type ApprovalMethod = z.infer<typeof ApprovalMethodSchema>;

// ---------------------------------------------------------------------------
// Response Channel (discriminatedUnion on 'type')
// ---------------------------------------------------------------------------

export const PushRelayResponseChannelSchema = z.object({
  type: z.literal('push_relay'),
  pushRelayUrl: z.string(), // URL of the Push Relay server (empty when not configured)
  requestId: z.string().uuid(),
});

export const TelegramResponseChannelSchema = z.object({
  type: z.literal('telegram'),
  botUsername: z.string(),
});

export const ResponseChannelSchema = z.discriminatedUnion('type', [
  PushRelayResponseChannelSchema,
  TelegramResponseChannelSchema,
]);

export type PushRelayResponseChannel = z.infer<typeof PushRelayResponseChannelSchema>;
export type TelegramResponseChannel = z.infer<typeof TelegramResponseChannelSchema>;
export type ResponseChannel = z.infer<typeof ResponseChannelSchema>;

// ---------------------------------------------------------------------------
// SignRequest Metadata
// ---------------------------------------------------------------------------

export const SignRequestMetadataSchema = z.object({
  txId: z.string().uuid(),
  type: z.string(),
  from: z.string(),
  to: z.string(),
  amount: z.string().optional(),
  symbol: z.string().optional(),
  policyTier: z.enum(['APPROVAL', 'DELAY']),
});

export type SignRequestMetadata = z.infer<typeof SignRequestMetadataSchema>;

// ---------------------------------------------------------------------------
// SignRequest (doc 73 Section 3)
// ---------------------------------------------------------------------------

export const SignRequestSchema = z.object({
  version: z.literal('1'),
  requestId: z.string().uuid(),
  caip2ChainId: z.string(),
  networkName: z.string(),
  signerAddress: z.string(),
  message: z.string(),
  displayMessage: z.string(),
  metadata: SignRequestMetadataSchema,
  responseChannel: ResponseChannelSchema,
  expiresAt: z.string().datetime(),
});

export type SignRequest = z.infer<typeof SignRequestSchema>;

// ---------------------------------------------------------------------------
// SignResponse (doc 73 Section 4)
// ---------------------------------------------------------------------------

export const SignResponseSchema = z.object({
  version: z.literal('1'),
  requestId: z.string().uuid(),
  action: z.enum(['approve', 'reject']),
  signature: z.string().optional(),
  signerAddress: z.string(),
  signedAt: z.string().datetime(),
});

export type SignResponse = z.infer<typeof SignResponseSchema>;

// ---------------------------------------------------------------------------
// WalletLinkConfig (wallet registration metadata)
// ---------------------------------------------------------------------------

export const WalletLinkConfigSchema = z.object({
  name: z.string(),
  displayName: z.string(),
  universalLink: z.object({
    base: z.string().url(),
    signPath: z.string(),
  }),
  deepLink: z
    .object({
      scheme: z.string(),
      signPath: z.string(),
    })
    .optional(),
});

export type WalletLinkConfig = z.infer<typeof WalletLinkConfigSchema>;

// ---------------------------------------------------------------------------
// base64url encoding/decoding utilities
// ---------------------------------------------------------------------------

/**
 * Encode a SignRequest to a base64url string.
 * Uses Node.js 22 built-in Buffer.toString('base64url').
 */
export function encodeSignRequest(request: SignRequest): string {
  const json = JSON.stringify(request);
  return Buffer.from(json, 'utf-8').toString('base64url');
}

/**
 * Decode a base64url string to a validated SignRequest.
 * Throws ZodError if the decoded JSON doesn't match SignRequestSchema.
 */
export function decodeSignRequest(encoded: string): SignRequest {
  const json = Buffer.from(encoded, 'base64url').toString('utf-8');
  const parsed = JSON.parse(json);
  return SignRequestSchema.parse(parsed);
}

// ---------------------------------------------------------------------------
// Universal Link URL builder
// ---------------------------------------------------------------------------

/**
 * Build a universal link URL for a wallet signing request.
 * Format: https://{base}{signPath}?data={base64url-encoded-request}
 */
export function buildUniversalLinkUrl(
  walletConfig: WalletLinkConfig,
  request: SignRequest,
): string {
  const encoded = encodeSignRequest(request);
  const base = walletConfig.universalLink.base.replace(/\/$/, '');
  const path = walletConfig.universalLink.signPath;
  return `${base}${path}?data=${encoded}`;
}

// ---------------------------------------------------------------------------
// Notification Categories & Event-to-Category Mapping
// ---------------------------------------------------------------------------

export const NOTIFICATION_CATEGORIES = [
  'transaction',
  'policy',
  'security_alert',
  'session',
  'owner',
  'system',
  'defi_monitoring',
  'identity',
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const EVENT_CATEGORY_MAP: Record<NotificationEventType, NotificationCategory> = {
  TX_REQUESTED: 'transaction',
  TX_QUEUED: 'transaction',
  TX_SUBMITTED: 'transaction',
  TX_CONFIRMED: 'transaction',
  TX_FAILED: 'transaction',
  TX_CANCELLED: 'transaction',
  TX_DOWNGRADED_DELAY: 'transaction',
  TX_APPROVAL_REQUIRED: 'transaction',
  TX_APPROVAL_EXPIRED: 'transaction',
  POLICY_VIOLATION: 'policy',
  WALLET_SUSPENDED: 'security_alert',
  KILL_SWITCH_ACTIVATED: 'security_alert',
  KILL_SWITCH_RECOVERED: 'security_alert',
  KILL_SWITCH_ESCALATED: 'security_alert',
  AUTO_STOP_TRIGGERED: 'security_alert',
  SESSION_EXPIRING_SOON: 'session',
  SESSION_EXPIRED: 'session',
  SESSION_CREATED: 'session',
  SESSION_WALLET_ADDED: 'session',
  SESSION_WALLET_REMOVED: 'session',
  OWNER_SET: 'owner',
  OWNER_REMOVED: 'owner',
  OWNER_VERIFIED: 'owner',
  DAILY_SUMMARY: 'system',
  CUMULATIVE_LIMIT_WARNING: 'policy',
  LOW_BALANCE: 'system',
  APPROVAL_CHANNEL_SWITCHED: 'system',
  UPDATE_AVAILABLE: 'system',
  TX_INCOMING: 'transaction',
  TX_INCOMING_SUSPICIOUS: 'security_alert',
  ACTION_API_KEY_REQUIRED: 'system',
  BRIDGE_COMPLETED: 'transaction',
  BRIDGE_FAILED: 'transaction',
  BRIDGE_MONITORING_STARTED: 'transaction',
  BRIDGE_TIMEOUT: 'transaction',
  BRIDGE_REFUNDED: 'transaction',
  STAKING_UNSTAKE_COMPLETED: 'transaction',
  STAKING_UNSTAKE_TIMEOUT: 'transaction',
  RPC_HEALTH_DEGRADED: 'system',
  RPC_ALL_FAILED: 'system',
  RPC_RECOVERED: 'system',
  INCOMING_TX_RANGE_SKIPPED: 'system',
  TX_GAS_WAITING: 'transaction',
  TX_GAS_CONDITION_MET: 'transaction',
  LIQUIDATION_WARNING: 'defi_monitoring',
  MATURITY_WARNING: 'defi_monitoring',
  MARGIN_WARNING: 'defi_monitoring',
  LIQUIDATION_IMMINENT: 'security_alert',
  SESSION_IDLE: 'session',
  AGENT_REGISTERED: 'identity',
  AGENT_WALLET_LINKED: 'identity',
  AGENT_WALLET_UNLINKED: 'identity',
  REPUTATION_FEEDBACK_RECEIVED: 'identity',
  REPUTATION_THRESHOLD_TRIGGERED: 'policy',
  ERC8128_SIGNATURE_CREATED: 'security_alert',
  ERC8128_DOMAIN_BLOCKED: 'policy',
  EXCHANGE_COMPLETED: 'transaction',
  EXCHANGE_FAILED: 'transaction',
  EXCHANGE_REFUNDED: 'transaction',
  EXCHANGE_TIMEOUT: 'transaction',
  EXTERNAL_ACTION_PARTIALLY_FILLED: 'transaction',
  EXTERNAL_ACTION_FILLED: 'transaction',
  EXTERNAL_ACTION_SETTLED: 'transaction',
  EXTERNAL_ACTION_CANCELED: 'transaction',
  EXTERNAL_ACTION_EXPIRED: 'transaction',
  EXTERNAL_ACTION_FAILED: 'transaction',
};

// ---------------------------------------------------------------------------
// Per-Event Descriptions (for Admin UI)
// ---------------------------------------------------------------------------

export const EVENT_DESCRIPTIONS: Record<NotificationEventType, string> = {
  TX_REQUESTED: 'Transaction request received',
  TX_QUEUED: 'Waiting in time-delay queue',
  TX_SUBMITTED: 'Submitted to blockchain',
  TX_CONFIRMED: 'Confirmed on-chain',
  TX_FAILED: 'Transaction failed',
  TX_CANCELLED: 'Cancelled by user or policy',
  TX_DOWNGRADED_DELAY: 'Auto-approved demoted to time-delay',
  TX_APPROVAL_REQUIRED: 'Owner approval required',
  TX_APPROVAL_EXPIRED: 'Approval wait timed out',
  TX_INCOMING: 'Incoming transaction detected',
  TX_INCOMING_SUSPICIOUS: 'Suspicious incoming transaction',
  POLICY_VIOLATION: 'Blocked by policy rule',
  CUMULATIVE_LIMIT_WARNING: 'Cumulative spend limit warning',
  WALLET_SUSPENDED: 'Wallet suspended',
  KILL_SWITCH_ACTIVATED: 'Emergency lock activated',
  KILL_SWITCH_RECOVERED: 'Emergency lock released',
  KILL_SWITCH_ESCALATED: 'Kill switch escalated',
  AUTO_STOP_TRIGGERED: 'Auto-stop triggered',
  SESSION_EXPIRING_SOON: 'Session expiring soon',
  SESSION_EXPIRED: 'Session expired',
  SESSION_CREATED: 'Session created',
  SESSION_WALLET_ADDED: 'Wallet added to session',
  SESSION_WALLET_REMOVED: 'Wallet removed from session',
  OWNER_SET: 'Owner address registered',
  OWNER_REMOVED: 'Owner address removed',
  OWNER_VERIFIED: 'Owner address verified',
  DAILY_SUMMARY: 'Daily summary report',
  LOW_BALANCE: 'Low balance warning',
  APPROVAL_CHANNEL_SWITCHED: 'Approval channel changed',
  UPDATE_AVAILABLE: 'Daemon update available',
  ACTION_API_KEY_REQUIRED: 'API key required for action provider',
  BRIDGE_COMPLETED: 'Cross-chain bridge transfer completed',
  BRIDGE_FAILED: 'Cross-chain bridge transfer failed',
  BRIDGE_MONITORING_STARTED: 'Bridge monitoring extended to reduced frequency',
  BRIDGE_TIMEOUT: 'Bridge transfer timed out after 24 hours',
  BRIDGE_REFUNDED: 'Bridge transfer refunded by protocol',
  STAKING_UNSTAKE_COMPLETED: 'Staking unstake request completed',
  STAKING_UNSTAKE_TIMEOUT: 'Staking unstake monitoring timed out',
  RPC_HEALTH_DEGRADED: 'RPC endpoint experiencing repeated failures',
  RPC_ALL_FAILED: 'All RPC endpoints for a network failed',
  RPC_RECOVERED: 'RPC endpoint recovered from cooldown',
  INCOMING_TX_RANGE_SKIPPED: 'Block range skipped due to RPC errors',
  TX_GAS_WAITING: 'Waiting for gas price condition to be met',
  TX_GAS_CONDITION_MET: 'Gas price condition met, resuming execution',
  LIQUIDATION_WARNING: 'Health factor below warning threshold',
  MATURITY_WARNING: 'Position approaching maturity date',
  MARGIN_WARNING: 'Margin ratio below safe level',
  LIQUIDATION_IMMINENT: 'Position at imminent liquidation risk',
  SESSION_IDLE: 'Session idle for extended period',
  AGENT_REGISTERED: 'Agent registered on ERC-8004 Identity Registry',
  AGENT_WALLET_LINKED: 'Agent wallet linked via EIP-712 signature',
  AGENT_WALLET_UNLINKED: 'Agent wallet unlinked',
  REPUTATION_FEEDBACK_RECEIVED: 'Reputation feedback received from another agent',
  REPUTATION_THRESHOLD_TRIGGERED: 'Reputation threshold policy triggered tier escalation',
  ERC8128_SIGNATURE_CREATED: 'ERC-8128 HTTP message signature created',
  ERC8128_DOMAIN_BLOCKED: 'ERC-8128 signing blocked for unlisted domain',
  EXCHANGE_COMPLETED: 'Cross-chain exchange completed',
  EXCHANGE_FAILED: 'Cross-chain exchange failed',
  EXCHANGE_REFUNDED: 'Cross-chain exchange refunded',
  EXCHANGE_TIMEOUT: 'Cross-chain exchange monitoring timed out',
  EXTERNAL_ACTION_PARTIALLY_FILLED: 'External action partially filled',
  EXTERNAL_ACTION_FILLED: 'External action fully filled',
  EXTERNAL_ACTION_SETTLED: 'External action settled',
  EXTERNAL_ACTION_CANCELED: 'External action canceled',
  EXTERNAL_ACTION_EXPIRED: 'External action expired',
  EXTERNAL_ACTION_FAILED: 'External action failed',
};

// ---------------------------------------------------------------------------
// NotificationMessage Schema (v2.7 Side Channel)
// ---------------------------------------------------------------------------

export const NotificationMessageSchema = z.object({
  version: z.literal('1'),
  eventType: z.string(),
  walletId: z.string(),
  walletName: z.string(),
  category: z.enum(NOTIFICATION_CATEGORIES),
  title: z.string(),
  body: z.string(),
  details: z.record(z.unknown()).optional(),
  timestamp: z.number(),
});
export type NotificationMessage = z.infer<typeof NotificationMessageSchema>;
