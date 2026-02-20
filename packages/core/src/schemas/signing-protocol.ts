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
  'sdk_ntfy',
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

export const NtfyResponseChannelSchema = z.object({
  type: z.literal('ntfy'),
  responseTopic: z.string(),
  serverUrl: z.string().url().optional(),
});

export const TelegramResponseChannelSchema = z.object({
  type: z.literal('telegram'),
  botUsername: z.string(),
});

export const ResponseChannelSchema = z.discriminatedUnion('type', [
  NtfyResponseChannelSchema,
  TelegramResponseChannelSchema,
]);

export type NtfyResponseChannel = z.infer<typeof NtfyResponseChannelSchema>;
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
  chain: z.enum(['solana', 'evm']),
  network: z.string(),
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
  ntfy: z
    .object({
      requestTopic: z.string(),
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
