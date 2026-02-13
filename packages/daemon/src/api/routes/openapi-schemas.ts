/**
 * Shared OpenAPI Zod response schemas and error code mapping.
 *
 * This file provides:
 * 1. Response schemas for all 18 routes (using z from @hono/zod-openapi)
 * 2. Error code -> OpenAPI response mapping via buildErrorResponses()
 * 3. Re-exported request schemas with .openapi() metadata
 *
 * @see docs/37-rest-api-complete-spec.md
 */

import { z } from '@hono/zod-openapi';
import {
  ERROR_CODES,
  WAIaaSError,
  CreateWalletRequestSchema,
  CreateSessionRequestSchema,
  SendTransactionRequestSchema,
  CreatePolicyRequestSchema,
  UpdatePolicyRequestSchema,
  TransferRequestSchema,
  TokenTransferRequestSchema,
  ContractCallRequestSchema,
  ApproveRequestSchema,
  BatchRequestSchema,
} from '@waiaas/core';
import type { ErrorCode } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Error Response Schema
// ---------------------------------------------------------------------------

export const ErrorResponseSchema = z
  .object({
    code: z.string(),
    message: z.string(),
    retryable: z.boolean(),
    details: z.record(z.unknown()).optional(),
    requestId: z.string().optional(),
    hint: z.string().optional(),
  })
  .openapi('ErrorResponse');

// ---------------------------------------------------------------------------
// Health Response Schema
// ---------------------------------------------------------------------------

export const HealthResponseSchema = z
  .object({
    status: z.string(),
    version: z.string(),
    uptime: z.number().int(),
    timestamp: z.number().int(),
  })
  .openapi('HealthResponse');

// ---------------------------------------------------------------------------
// Wallet CRUD Response Schemas
// ---------------------------------------------------------------------------

export const WalletCrudResponseSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    chain: z.string(),
    network: z.string(),
    publicKey: z.string(),
    status: z.string(),
    createdAt: z.number().int(),
  })
  .openapi('WalletCrudResponse');

export const WalletOwnerResponseSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    chain: z.string(),
    network: z.string(),
    publicKey: z.string(),
    status: z.string(),
    ownerAddress: z.string().nullable(),
    ownerVerified: z.boolean().nullable(),
    updatedAt: z.number().int().nullable(),
  })
  .openapi('WalletOwnerResponse');

// ---------------------------------------------------------------------------
// Wallet Query Response Schemas
// ---------------------------------------------------------------------------

export const WalletAddressResponseSchema = z
  .object({
    walletId: z.string().uuid(),
    chain: z.string(),
    network: z.string(),
    address: z.string(),
  })
  .openapi('WalletAddressResponse');

export const WalletBalanceResponseSchema = z
  .object({
    walletId: z.string().uuid(),
    chain: z.string(),
    network: z.string(),
    address: z.string(),
    balance: z.string(),
    decimals: z.number().int(),
    symbol: z.string(),
  })
  .openapi('WalletBalanceResponse');

// ---------------------------------------------------------------------------
// Session Response Schemas
// ---------------------------------------------------------------------------

export const SessionCreateResponseSchema = z
  .object({
    id: z.string().uuid(),
    token: z.string(),
    expiresAt: z.number().int(),
    walletId: z.string().uuid(),
  })
  .openapi('SessionCreateResponse');

export const SessionListItemSchema = z
  .object({
    id: z.string().uuid(),
    walletId: z.string().uuid(),
    status: z.string(),
    renewalCount: z.number().int(),
    maxRenewals: z.number().int(),
    expiresAt: z.number().int(),
    absoluteExpiresAt: z.number().int(),
    createdAt: z.number().int(),
    lastRenewedAt: z.number().int().nullable(),
  })
  .openapi('SessionListItem');

export const SessionRevokeResponseSchema = z
  .object({
    id: z.string().uuid(),
    status: z.string(),
    message: z.string().optional(),
  })
  .openapi('SessionRevokeResponse');

export const SessionRenewResponseSchema = z
  .object({
    id: z.string().uuid(),
    token: z.string(),
    expiresAt: z.number().int(),
    renewalCount: z.number().int(),
  })
  .openapi('SessionRenewResponse');

// ---------------------------------------------------------------------------
// Transaction Response Schemas
// ---------------------------------------------------------------------------

export const TxSendResponseSchema = z
  .object({
    id: z.string().uuid(),
    status: z.string(),
  })
  .openapi('TxSendResponse');

export const TxDetailResponseSchema = z
  .object({
    id: z.string().uuid(),
    walletId: z.string().uuid(),
    type: z.string(),
    status: z.string(),
    tier: z.string().nullable(),
    chain: z.string(),
    toAddress: z.string().nullable(),
    amount: z.string().nullable(),
    txHash: z.string().nullable(),
    error: z.string().nullable(),
    createdAt: z.number().int().nullable(),
  })
  .openapi('TxDetailResponse');

export const TxApproveResponseSchema = z
  .object({
    id: z.string().uuid(),
    status: z.string(),
    approvedAt: z.number().int(),
  })
  .openapi('TxApproveResponse');

export const TxRejectResponseSchema = z
  .object({
    id: z.string().uuid(),
    status: z.string(),
    rejectedAt: z.number().int(),
  })
  .openapi('TxRejectResponse');

export const TxCancelResponseSchema = z
  .object({
    id: z.string().uuid(),
    status: z.string(),
  })
  .openapi('TxCancelResponse');

// ---------------------------------------------------------------------------
// Policy Response Schemas
// ---------------------------------------------------------------------------

export const PolicyResponseSchema = z
  .object({
    id: z.string().uuid(),
    walletId: z.string().uuid().nullable(),
    type: z.string(),
    rules: z.record(z.unknown()),
    priority: z.number().int(),
    enabled: z.boolean(),
    createdAt: z.number().int(),
    updatedAt: z.number().int(),
  })
  .openapi('PolicyResponse');

export const PolicyDeleteResponseSchema = z
  .object({
    id: z.string().uuid(),
    deleted: z.boolean(),
  })
  .openapi('PolicyDeleteResponse');

// ---------------------------------------------------------------------------
// Error Code -> OpenAPI Response Mapping
// ---------------------------------------------------------------------------

/**
 * Build OpenAPI error response entries from a list of error codes.
 * Groups error codes by httpStatus, merging multiple codes into a single
 * response entry with description listing which codes can occur.
 *
 * @param codes - Array of error code keys from ERROR_CODES
 * @returns Record of HTTP status code string -> OpenAPI response definition
 */
export function buildErrorResponses(
  codes: ErrorCode[],
): Record<string, { description: string; content: { 'application/json': { schema: typeof ErrorResponseSchema } } }> {
  const grouped = new Map<number, ErrorCode[]>();

  for (const code of codes) {
    const entry = ERROR_CODES[code];
    const status = entry.httpStatus;
    if (!grouped.has(status)) {
      grouped.set(status, []);
    }
    grouped.get(status)!.push(code);
  }

  const result: Record<string, { description: string; content: { 'application/json': { schema: typeof ErrorResponseSchema } } }> = {};

  for (const [status, codelist] of grouped) {
    const descriptions = codelist.map((c) => `${c}: ${ERROR_CODES[c].message}`);
    result[String(status)] = {
      description: descriptions.join(' | '),
      content: {
        'application/json': { schema: ErrorResponseSchema },
      },
    };
  }

  return result;
}

// ---------------------------------------------------------------------------
// Re-exported Request Schemas with OpenAPI metadata
// ---------------------------------------------------------------------------

export const CreateWalletRequestOpenAPI = CreateWalletRequestSchema.openapi('CreateWalletRequest');
export const CreateSessionRequestOpenAPI = CreateSessionRequestSchema.openapi('CreateSessionRequest');
export const SendTransactionRequestOpenAPI = SendTransactionRequestSchema.openapi('SendTransactionRequest');
export const CreatePolicyRequestOpenAPI = CreatePolicyRequestSchema.openapi('CreatePolicyRequest');
export const UpdatePolicyRequestOpenAPI = UpdatePolicyRequestSchema.openapi('UpdatePolicyRequest');

// ---------------------------------------------------------------------------
// 5-type Transaction Request OpenAPI Components (Phase 86-01)
// ---------------------------------------------------------------------------

export const TransferRequestOpenAPI = TransferRequestSchema.openapi('TransferRequest');
export const TokenTransferRequestOpenAPI = TokenTransferRequestSchema.openapi('TokenTransferRequest');
export const ContractCallRequestOpenAPI = ContractCallRequestSchema.openapi('ContractCallRequest');
export const ApproveRequestOpenAPI = ApproveRequestSchema.openapi('ApproveRequest');
export const BatchRequestOpenAPI = BatchRequestSchema.openapi('BatchRequest');

/**
 * Loose passthrough schema for the send transaction route.
 * Uses z.any() to bypass Hono's built-in Zod validation (validation is delegated
 * to stage1Validate which uses the correct discriminatedUnion or legacy schema).
 * The OpenAPI doc uses manual oneOf to document all 6 request variants.
 */
export const TransactionRequestOpenAPI = z.any().openapi({
  type: 'object',
  oneOf: [
    { $ref: '#/components/schemas/TransferRequest' },
    { $ref: '#/components/schemas/TokenTransferRequest' },
    { $ref: '#/components/schemas/ContractCallRequest' },
    { $ref: '#/components/schemas/ApproveRequest' },
    { $ref: '#/components/schemas/BatchRequest' },
    { $ref: '#/components/schemas/SendTransactionRequest' },
  ],
  description: 'Transaction request. Legacy format (to/amount/memo without type) is treated as TRANSFER.',
});

// ---------------------------------------------------------------------------
// Default validation hook for OpenAPIHono
// ---------------------------------------------------------------------------

/**
 * Default validation hook that throws WAIaaSError on validation failure.
 * This ensures OpenAPIHono's built-in Zod validation produces the same
 * error format as our existing errorHandler (code, message, retryable).
 */
export function openApiValidationHook(result: { success: boolean; error?: unknown }, _c: unknown): void | Response {
  if (!result.success) {
    throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
      message: 'Validation error',
      details: { issues: (result.error as { issues?: unknown[] })?.issues ?? [] },
    });
  }
}

// ---------------------------------------------------------------------------
// Wallet Assets Response Schema (GET /v1/wallet/assets)
// ---------------------------------------------------------------------------

export const WalletAssetsResponseSchema = z
  .object({
    walletId: z.string().uuid(),
    chain: z.string(),
    network: z.string(),
    assets: z.array(
      z.object({
        mint: z.string(),
        symbol: z.string(),
        name: z.string(),
        balance: z.string(),
        decimals: z.number().int(),
        isNative: z.boolean(),
        usdValue: z.number().optional(),
      }),
    ),
  })
  .openapi('WalletAssetsResponse');

// ---------------------------------------------------------------------------
// Transaction List Response Schemas (GET /v1/transactions, /pending)
// ---------------------------------------------------------------------------

export const TxListResponseSchema = z
  .object({
    items: z.array(TxDetailResponseSchema),
    cursor: z.string().nullable(),
    hasMore: z.boolean(),
  })
  .openapi('TxListResponse');

export const TxPendingListResponseSchema = z
  .object({
    items: z.array(TxDetailResponseSchema),
  })
  .openapi('TxPendingListResponse');

// ---------------------------------------------------------------------------
// Nonce Response Schema (GET /v1/nonce)
// ---------------------------------------------------------------------------

export const NonceResponseSchema = z
  .object({
    nonce: z.string(),
    expiresAt: z.number().int(),
  })
  .openapi('NonceResponse');

// ---------------------------------------------------------------------------
// Wallet List / Detail Response Schemas (GET /v1/wallets, GET /v1/wallets/:id)
// ---------------------------------------------------------------------------

export const WalletListResponseSchema = z
  .object({
    items: z.array(WalletCrudResponseSchema),
  })
  .openapi('WalletListResponse');

export const WalletDetailResponseSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    chain: z.string(),
    network: z.string(),
    publicKey: z.string(),
    status: z.string(),
    ownerAddress: z.string().nullable(),
    ownerVerified: z.boolean().nullable(),
    ownerState: z.enum(['NONE', 'GRACE', 'LOCKED']),
    createdAt: z.number().int(),
    updatedAt: z.number().int().nullable(),
  })
  .openapi('WalletDetailResponse');

// Owner address request body schema (for PUT /wallets/:id/owner)
export const SetOwnerRequestSchema = z
  .object({
    owner_address: z.string().min(1),
  })
  .openapi('SetOwnerRequest');

// ---------------------------------------------------------------------------
// Wallet CRUD Schemas (PUT /wallets/:id, DELETE /wallets/:id)
// ---------------------------------------------------------------------------

export const UpdateWalletRequestSchema = z
  .object({
    name: z.string().min(1).max(100),
  })
  .openapi('UpdateWalletRequest');

export const WalletDeleteResponseSchema = z
  .object({
    id: z.string().uuid(),
    status: z.literal('TERMINATED'),
  })
  .openapi('WalletDeleteResponse');

// ---------------------------------------------------------------------------
// Admin Response Schemas (6 admin endpoints)
// ---------------------------------------------------------------------------

export const AdminStatusResponseSchema = z
  .object({
    status: z.string(),
    version: z.string(),
    uptime: z.number().int(),
    walletCount: z.number().int(),
    activeSessionCount: z.number().int(),
    killSwitchState: z.string(),
    adminTimeout: z.number().int(),
    timestamp: z.number().int(),
  })
  .openapi('AdminStatusResponse');

export const KillSwitchResponseSchema = z
  .object({
    state: z.string(),
    activatedAt: z.number().int().nullable(),
    activatedBy: z.string().nullable(),
  })
  .openapi('KillSwitchResponse');

export const KillSwitchActivateResponseSchema = z
  .object({
    state: z.literal('ACTIVATED'),
    activatedAt: z.number().int(),
  })
  .openapi('KillSwitchActivateResponse');

export const RecoverResponseSchema = z
  .object({
    state: z.literal('NORMAL'),
    recoveredAt: z.number().int(),
  })
  .openapi('RecoverResponse');

export const ShutdownResponseSchema = z
  .object({
    message: z.string(),
  })
  .openapi('ShutdownResponse');

export const RotateSecretResponseSchema = z
  .object({
    rotatedAt: z.number().int(),
    message: z.string(),
  })
  .openapi('RotateSecretResponse');

// ---------------------------------------------------------------------------
// Notification Admin Response Schemas (3 notification admin endpoints)
// ---------------------------------------------------------------------------

export const NotificationChannelStatusSchema = z
  .object({
    name: z.string(),
    enabled: z.boolean(),
  })
  .openapi('NotificationChannelStatus');

export const NotificationStatusResponseSchema = z
  .object({
    enabled: z.boolean(),
    channels: z.array(NotificationChannelStatusSchema),
  })
  .openapi('NotificationStatusResponse');

export const NotificationTestRequestSchema = z
  .object({
    channel: z.string().optional(),
  })
  .openapi('NotificationTestRequest');

export const NotificationTestResponseSchema = z
  .object({
    results: z.array(
      z.object({
        channel: z.string(),
        success: z.boolean(),
        error: z.string().optional(),
      }),
    ),
  })
  .openapi('NotificationTestResponse');

export const NotificationLogEntrySchema = z
  .object({
    id: z.string(),
    eventType: z.string(),
    walletId: z.string().nullable(),
    channel: z.string(),
    status: z.string(),
    error: z.string().nullable(),
    createdAt: z.number(),
  })
  .openapi('NotificationLogEntry');

export const NotificationLogResponseSchema = z
  .object({
    logs: z.array(NotificationLogEntrySchema),
    total: z.number(),
    page: z.number(),
    pageSize: z.number(),
  })
  .openapi('NotificationLogResponse');
