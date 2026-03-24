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
  ApprovalMethodSchema,
  WalletPresetTypeSchema,
  AaProviderNameEnum,
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
    latestVersion: z.string().nullable(),
    updateAvailable: z.boolean(),
    schemaVersion: z.number().int(),
    uptime: z.number().int(),
    timestamp: z.number().int(),
  })
  .openapi('HealthResponse');

// ---------------------------------------------------------------------------
// Provider Status Schema (Phase 325: wallet provider status)
// ---------------------------------------------------------------------------

export const ProviderStatusSchema = z
  .object({
    name: AaProviderNameEnum,
    supportedChains: z.array(z.string()),
    paymasterEnabled: z.boolean(),
  })
  .openapi('ProviderStatus');

// ---------------------------------------------------------------------------
// Wallet CRUD Response Schemas
// ---------------------------------------------------------------------------

export const WalletCrudResponseSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    chain: z.string(),
    network: z.string(),
    environment: z.string(),
    publicKey: z.string(),
    status: z.string(),
    ownerAddress: z.string().nullable(),
    ownerState: z.enum(['NONE', 'GRACE', 'LOCKED']),
    monitorIncoming: z.boolean(),
    accountType: z.enum(['eoa', 'smart']).default('eoa'),
    signerKey: z.string().nullable().default(null),
    deployed: z.boolean().default(true),
    provider: ProviderStatusSchema.nullable().default(null),
    createdAt: z.number().int(),
  })
  .openapi('WalletCrudResponse');

export const WalletCreateResponseSchema = WalletCrudResponseSchema.extend({
  session: z
    .object({
      id: z.string().uuid(),
      token: z.string(),
      expiresAt: z.number().int(),
    })
    .nullable(),
}).openapi('WalletCreateResponse');

export const WalletOwnerResponseSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    chain: z.string(),
    network: z.string(),
    environment: z.string(),
    publicKey: z.string(),
    status: z.string(),
    ownerAddress: z.string().nullable(),
    ownerVerified: z.boolean().nullable(),
    approvalMethod: z.string().nullable().optional(),
    walletType: z.string().nullable().optional(),
    warning: z.string().nullable().optional(),
    updatedAt: z.number().int().nullable(),
  })
  .openapi('WalletOwnerResponse');

export const OwnerVerifyResponseSchema = z
  .object({
    ownerState: z.enum(['NONE', 'GRACE', 'LOCKED']),
    ownerAddress: z.string().nullable(),
    ownerVerified: z.boolean(),
  })
  .openapi('OwnerVerifyResponse');

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
    balanceFormatted: z.string().nullable().optional(),
    displayBalance: z.string().nullable().optional(),
    displayCurrency: z.string().nullable().optional(),
    chainId: z.string().optional().openapi({ description: 'CAIP-2 chain identifier', example: 'eip155:1' }),
    assetId: z.string().optional().openapi({ description: 'CAIP-19 native asset identifier', example: 'eip155:1/slip44:60' }),
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
    walletId: z.string().uuid(), // first wallet in session
    wallets: z.array(z.object({
      id: z.string().uuid(),
      name: z.string(),
    })),
  })
  .openapi('SessionCreateResponse');

export const SessionListItemSchema = z
  .object({
    id: z.string().uuid(),
    walletId: z.string().uuid(), // first wallet in session
    walletName: z.string().nullable(), // first wallet name
    wallets: z.array(z.object({
      id: z.string().uuid(),
      name: z.string(),
    })),
    status: z.string(),
    renewalCount: z.number().int(),
    maxRenewals: z.number().int(),
    expiresAt: z.number().int(),
    absoluteExpiresAt: z.number().int(),
    createdAt: z.number().int(),
    lastRenewedAt: z.number().int().nullable(),
    source: z.enum(['api', 'mcp']),
  })
  .openapi('SessionListItem');

// ---------------------------------------------------------------------------
// Pagination Schemas (v32.6 PAG-01..PAG-05)
// ---------------------------------------------------------------------------

export const PaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50).optional(),
  offset: z.coerce.number().int().min(0).default(0).optional(),
});

/**
 * Factory to create paginated response schema wrapping an item schema.
 */
export function createPaginatedSchema<T extends z.ZodTypeAny>(
  itemSchema: T,
  name: string,
) {
  return z.object({
    data: z.array(itemSchema),
    total: z.number().int(),
    limit: z.number().int(),
    offset: z.number().int(),
  }).openapi(name);
}

export const PaginatedSessionListSchema = createPaginatedSchema(
  SessionListItemSchema,
  'PaginatedSessionList',
);

// ---------------------------------------------------------------------------
// Session-Wallet Management Schemas (v26.4)
// ---------------------------------------------------------------------------

export const SessionWalletSchema = z.object({
  sessionId: z.string().uuid(),
  walletId: z.string().uuid(),
  createdAt: z.number().int(),
}).openapi('SessionWallet');

export const SessionWalletListSchema = z.object({
  wallets: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    chain: z.string(),
    createdAt: z.number().int(),
  })),
}).openapi('SessionWalletList');

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
    network: z.string().nullable(),
    toAddress: z.string().nullable(),
    amount: z.string().nullable(),
    txHash: z.string().nullable(),
    error: z.string().nullable(),
    createdAt: z.number().int().nullable(),
    displayAmount: z.string().nullable().optional(),
    displayCurrency: z.string().nullable().optional(),
    atomic: z.boolean().optional(),
    amountFormatted: z.string().nullable().optional(),
    amountDecimals: z.number().int().nullable().optional(),
    amountSymbol: z.string().nullable().optional(),
    chainId: z.string().optional().openapi({ description: 'CAIP-2 chain identifier' }),
    contractName: z.string().nullable().optional().openapi({ description: 'Resolved human-readable contract name (CONTRACT_CALL only)' }),
    contractNameSource: z.string().nullable().optional().openapi({ description: 'Resolution source: action_provider | well_known | whitelist | fallback' }),
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
    network: z.string().nullable(),
    createdAt: z.number().int(),
    updatedAt: z.number().int(),
  })
  .openapi('PolicyResponse');

export const PaginatedPolicyListSchema = createPaginatedSchema(
  PolicyResponseSchema,
  'PaginatedPolicyList',
);

export const PolicyDeleteResponseSchema = z
  .object({
    id: z.string().uuid(),
    deleted: z.boolean(),
  })
  .openapi('PolicyDeleteResponse');

// ---------------------------------------------------------------------------
// Wallet Apps schemas (v29.7 Human Wallet Apps)
// ---------------------------------------------------------------------------

export const WalletAppSchema = z
  .object({
    id: z.string().openapi({ description: 'Wallet app UUID', example: '01234567-89ab-cdef-0123-456789abcdef' }),
    name: z.string().openapi({ description: 'App identifier (unique name)', example: 'dcent' }),
    display_name: z.string().openapi({ description: 'Human-readable app name', example: "D'CENT Wallet" }),
    wallet_type: z.string().openapi({ description: 'Wallet type for grouping (multiple apps can share a type)', example: 'dcent' }),
    signing_enabled: z.boolean().openapi({ description: 'Whether signing requests are sent to this app' }),
    alerts_enabled: z.boolean().openapi({ description: 'Whether activity alerts are sent to this app' }),
    sign_topic: z.string().nullable().openapi({ description: '(legacy, unused) Signing topic identifier' }),
    notify_topic: z.string().nullable().openapi({ description: '(legacy, unused) Notification topic identifier' }),
    subscription_token: z.string().nullable().openapi({ description: 'Push Relay subscription token' }),
    push_relay_url: z.string().nullable().openapi({ description: 'Push Relay server URL for sign requests and notifications' }),
    used_by: z.array(z.object({
      id: z.string(),
      label: z.string(),
    })).openapi({ description: 'Wallets using this app (wallet_type match)' }),
    created_at: z.number().openapi({ description: 'Unix timestamp (seconds)' }),
    updated_at: z.number().openapi({ description: 'Unix timestamp (seconds)' }),
  })
  .openapi('WalletApp');

export const WalletAppListResponseSchema = z
  .object({
    apps: z.array(WalletAppSchema),
  })
  .openapi('WalletAppListResponse');

export const WalletAppCreateRequestSchema = z
  .object({
    name: z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9-]*$/, 'Lowercase alphanumeric with hyphens').openapi({ description: 'App identifier', example: 'my-custom-wallet' }),
    display_name: z.string().min(1).max(128).openapi({ description: 'Display name', example: 'My Custom Wallet' }),
    wallet_type: z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9-]*$/, 'Lowercase alphanumeric with hyphens').optional().openapi({ description: 'Wallet type for grouping (defaults to name)', example: 'dcent' }),
    sign_topic: z.string().max(256).optional().openapi({ description: 'Custom signing topic (auto-generated if omitted)' }),
    notify_topic: z.string().max(256).optional().openapi({ description: 'Custom notification topic (auto-generated if omitted)' }),
    push_relay_url: z.string().url().max(512).optional().openapi({ description: 'Push Relay server URL' }),
  })
  .openapi('WalletAppCreateRequest');

export const WalletAppUpdateRequestSchema = z
  .object({
    signing_enabled: z.boolean().optional().openapi({ description: 'Toggle signing requests' }),
    alerts_enabled: z.boolean().optional().openapi({ description: 'Toggle activity alerts' }),
    sign_topic: z.string().max(256).optional().openapi({ description: 'Custom signing topic' }),
    notify_topic: z.string().max(256).optional().openapi({ description: 'Custom notification topic' }),
    subscription_token: z.string().max(64).optional().openapi({ description: 'Push Relay subscription token' }),
    push_relay_url: z.string().url().max(512).optional().openapi({ description: 'Push Relay server URL' }),
  })
  .openapi('WalletAppUpdateRequest');

export const WalletAppResponseSchema = z
  .object({
    app: WalletAppSchema,
  })
  .openapi('WalletAppResponse');

export const WalletAppTestNotificationResponseSchema = z
  .object({
    success: z.boolean().openapi({ description: 'Whether the test notification was sent successfully' }),
    error: z.string().optional().openapi({ description: 'Error message if notification failed' }),
  })
  .openapi('WalletAppTestNotificationResponse');

export const WalletAppTestSignRequestResponseSchema = z
  .object({
    success: z.boolean().openapi({ description: 'Whether the test sign request completed' }),
    error: z.string().optional().openapi({ description: 'Error message if request failed' }),
    timeout: z.boolean().optional().openapi({ description: 'True if no response within 30 seconds' }),
    result: z
      .object({
        action: z.enum(['approve', 'reject']).openapi({ description: 'User action' }),
        signature: z.string().optional().openapi({ description: 'SIWE signature (approve only)' }),
        signerAddress: z.string().openapi({ description: 'Address that signed' }),
        signedAt: z.string().openapi({ description: 'ISO 8601 timestamp' }),
      })
      .optional()
      .openapi({ description: 'Sign response result' }),
  })
  .openapi('WalletAppTestSignRequestResponse');

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
// GasCondition OpenAPI Schema (Phase 259-01)
// ---------------------------------------------------------------------------

/**
 * OpenAPI schema for gas condition. Documents the optional gasCondition field
 * available on all 5 transaction request types. Actual validation is handled
 * by @waiaas/core GasConditionSchema (Zod SSoT) in stage1Validate.
 */
export const GasConditionOpenAPI = z
  .object({
    maxGasPrice: z.string().optional().openapi({
      description: 'Max gas price in wei (EVM: baseFee + priorityFee upper bound)',
      example: '30000000000',
    }),
    maxPriorityFee: z.string().optional().openapi({
      description: 'Max priority fee in wei (EVM) or micro-lamports (Solana)',
      example: '2000000000',
    }),
    timeout: z.number().int().min(60).max(86400).optional().openapi({
      description: 'Max wait time in seconds (60-86400). Uses Admin Settings default if omitted.',
      example: 3600,
    }),
  })
  .openapi('GasCondition');

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
        displayValue: z.string().nullable().optional(),
        balanceFormatted: z.string().nullable().optional(),
        assetId: z.string().optional().openapi({ description: 'CAIP-19 asset identifier' }),
      }),
    ),
    displayCurrency: z.string().nullable().optional(),
    chainId: z.string().optional().openapi({ description: 'CAIP-2 chain identifier' }),
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
    environment: z.string(),
    publicKey: z.string(),
    status: z.string(),
    ownerAddress: z.string().nullable(),
    ownerVerified: z.boolean().nullable(),
    ownerState: z.enum(['NONE', 'GRACE', 'LOCKED']),
    approvalMethod: z.string().nullable().optional(),
    walletType: z.string().nullable().optional(),
    accountType: z.enum(['eoa', 'smart']).default('eoa'),
    signerKey: z.string().nullable().default(null),
    deployed: z.boolean().default(true),
    factoryAddress: z.string().nullable().default(null),
    factorySupportedNetworks: z.array(z.string()).nullable().default(null),
    factoryVerifiedOnNetwork: z.boolean().nullable().default(null),
    provider: ProviderStatusSchema.nullable().default(null),
    suspendedAt: z.number().int().nullable().optional(),
    suspensionReason: z.string().nullable().optional(),
    createdAt: z.number().int(),
    updatedAt: z.number().int().nullable(),
  })
  .openapi('WalletDetailResponse');

// ---------------------------------------------------------------------------
// Wallet Network Schemas (GET /wallets/:id/networks)
// ---------------------------------------------------------------------------

// GET /wallets/:id/networks response
export const WalletNetworksResponseSchema = z
  .object({
    id: z.string().uuid(),
    chain: z.string(),
    environment: z.string(),
    availableNetworks: z.array(
      z.object({
        network: z.string(),
      }),
    ),
  })
  .openapi('WalletNetworksResponse');

// Owner address request body schema (for PUT /wallets/:id/owner)
// approval_method uses three-state protocol:
//   undefined (omitted) = preserve existing value
//   null (explicit) = clear to NULL (revert to Auto/global fallback)
//   valid string = save to DB
export const SetOwnerRequestSchema = z
  .object({
    owner_address: z.string().min(1),
    approval_method: ApprovalMethodSchema.nullable().optional(),
    wallet_type: WalletPresetTypeSchema.optional(),
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

export const WalletPurgeResponseSchema = z
  .object({
    id: z.string().uuid(),
    status: z.literal('PURGED'),
  })
  .openapi('WalletPurgeResponse');

export const WalletSuspendRequestSchema = z
  .object({
    reason: z.string().max(200).optional(),
  })
  .openapi('WalletSuspendRequest');

export const WalletSuspendResponseSchema = z
  .object({
    id: z.string().uuid(),
    status: z.literal('SUSPENDED'),
    suspendedAt: z.number().int(),
    suspensionReason: z.string(),
  })
  .openapi('WalletSuspendResponse');

export const WalletResumeResponseSchema = z
  .object({
    id: z.string().uuid(),
    status: z.literal('ACTIVE'),
  })
  .openapi('WalletResumeResponse');

// ---------------------------------------------------------------------------
// Set Provider Request/Response Schemas (PUT /wallets/:id/provider)
// ---------------------------------------------------------------------------

export const SetProviderRequestSchema = z
  .object({
    provider: AaProviderNameEnum,
    apiKey: z.string().min(1).optional(),
    bundlerUrl: z.string().url().optional(),
    paymasterUrl: z.string().url().optional(),
    policyId: z.string().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.provider === 'pimlico' || data.provider === 'alchemy') {
      if (!data.apiKey) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `apiKey is required for ${data.provider} provider`,
          path: ['apiKey'],
        });
      }
    }
    if (data.provider === 'custom') {
      if (!data.bundlerUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'bundlerUrl is required for custom provider',
          path: ['bundlerUrl'],
        });
      }
    }
  })
  .openapi('SetProviderRequest');

export const SetProviderResponseSchema = z
  .object({
    id: z.string().uuid(),
    provider: ProviderStatusSchema,
    updatedAt: z.number().int(),
  })
  .openapi('SetProviderResponse');

// ---------------------------------------------------------------------------
// Admin Response Schemas (6 admin endpoints)
// ---------------------------------------------------------------------------

export const AdminStatusResponseSchema = z
  .object({
    status: z.string(),
    version: z.string(),
    latestVersion: z.string().nullable(),
    updateAvailable: z.boolean(),
    uptime: z.number().int(),
    walletCount: z.number().int(),
    activeSessionCount: z.number().int(),
    killSwitchState: z.string(),
    adminTimeout: z.number().int(),
    timestamp: z.number().int(),
    policyCount: z.number().int(),
    recentTxCount: z.number().int(),
    failedTxCount: z.number().int(),
    autoProvisioned: z.boolean().openapi({ description: 'Whether daemon was auto-provisioned (recovery.key exists)' }),
    recentTransactions: z.array(
      z.object({
        id: z.string(),
        walletId: z.string(),
        walletName: z.string().nullable(),
        type: z.string(),
        status: z.string(),
        toAddress: z.string().nullable(),
        amount: z.string().nullable(),
        formattedAmount: z.string().nullable(),
        amountUsd: z.number().nullable(),
        network: z.string().nullable(),
        txHash: z.string().nullable(),
        createdAt: z.number().int().nullable(),
      }),
    ),
  })
  .openapi('AdminStatusResponse');

export const AgentPromptRequestSchema = z
  .object({
    walletIds: z.array(z.string()).optional().openapi({ description: 'Specific wallet IDs (all ACTIVE wallets if omitted)' }),
    ttl: z.number().int().positive().optional().openapi({ description: 'Session TTL in seconds (default: 86400)' }),
  })
  .openapi('AgentPromptRequest');

export const AgentPromptResponseSchema = z
  .object({
    prompt: z.string(),
    walletCount: z.number().int(),
    sessionsCreated: z.number().int(),
    sessionReused: z.boolean(),
    expiresAt: z.number().int(),
  })
  .openapi('AgentPromptResponse');

export const SessionReissueResponseSchema = z
  .object({
    token: z.string(),
    sessionId: z.string().uuid(),
    tokenIssuedCount: z.number().int(),
    expiresAt: z.number().int(),
  })
  .openapi('SessionReissueResponse');

export const SessionRotateResponseSchema = z
  .object({
    id: z.string().uuid(),
    token: z.string(),
    expiresAt: z.number().int(),
    tokenIssuedCount: z.number().int(),
  })
  .openapi('SessionRotateResponse');

export const KillSwitchResponseSchema = z
  .object({
    state: z.string(),
    activatedAt: z.number().int().nullable(),
    activatedBy: z.string().nullable(),
  })
  .openapi('KillSwitchResponse');

export const MasterPasswordChangeRequestSchema = z
  .object({
    newPassword: z.string().min(8).openapi({ description: 'New master password (minimum 8 characters)' }),
  })
  .openapi('MasterPasswordChangeRequest');

export const MasterPasswordChangeResponseSchema = z
  .object({
    message: z.string(),
    walletsReEncrypted: z.number().int(),
    settingsReEncrypted: z.number().int(),
  })
  .openapi('MasterPasswordChangeResponse');

export const KillSwitchActivateResponseSchema = z
  .object({
    state: z.literal('SUSPENDED'),
    activatedAt: z.number().int(),
  })
  .openapi('KillSwitchActivateResponse');

export const KillSwitchEscalateResponseSchema = z
  .object({
    state: z.literal('LOCKED'),
    escalatedAt: z.number().int(),
  })
  .openapi('KillSwitchEscalateResponse');

export const RecoverResponseSchema = z
  .object({
    state: z.literal('ACTIVE'),
    recoveredAt: z.number().int(),
  })
  .openapi('RecoverResponse');

export const KillSwitchRecoverRequestSchema = z
  .object({
    ownerSignature: z.string().optional(),
    ownerAddress: z.string().optional(),
    chain: z.enum(['solana', 'ethereum']).optional(),
    message: z.string().optional(),
  })
  .openapi('KillSwitchRecoverRequest');

export const OwnerKillSwitchResponseSchema = z
  .object({
    state: z.literal('SUSPENDED'),
    activatedAt: z.number().int(),
  })
  .openapi('OwnerKillSwitchResponse');

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
    configuredWallets: z.number().int().optional(),
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
    message: z.string().nullable(),
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

// ---------------------------------------------------------------------------
// Token Registry Schemas (GET/POST/DELETE /v1/tokens)
// ---------------------------------------------------------------------------

export const TokenRegistryItemSchema = z
  .object({
    address: z.string(),
    symbol: z.string(),
    name: z.string(),
    decimals: z.number().int(),
    source: z.enum(['builtin', 'custom']),
    assetId: z.string().nullable(),
    chainId: z.string().optional().openapi({ description: 'CAIP-2 chain identifier' }),
  })
  .openapi('TokenRegistryItem');

export const TokenRegistryListResponseSchema = z
  .object({
    network: z.string(),
    tokens: z.array(TokenRegistryItemSchema),
  })
  .openapi('TokenRegistryListResponse');

export const AddTokenRequestSchema = z
  .object({
    network: z.string().openapi({ example: 'ethereum-mainnet' }),
    address: z.string().openapi({ example: '0x...' }),
    symbol: z.string().min(1).max(20).openapi({ example: 'LINK' }),
    name: z.string().min(1).max(100).openapi({ example: 'Chainlink Token' }),
    decimals: z.number().int().min(0).max(18).openapi({ example: 18 }),
  })
  .openapi('AddTokenRequest');

export const AddTokenResponseSchema = z
  .object({
    id: z.string(),
    network: z.string(),
    address: z.string(),
    symbol: z.string(),
  })
  .openapi('AddTokenResponse');

export const RemoveTokenRequestSchema = z
  .object({
    network: z.string(),
    address: z.string(),
  })
  .openapi('RemoveTokenRequest');

export const RemoveTokenResponseSchema = z
  .object({
    removed: z.boolean(),
    network: z.string(),
    address: z.string(),
  })
  .openapi('RemoveTokenResponse');

// ---------------------------------------------------------------------------
// Settings Admin Schemas (GET/PUT /v1/admin/settings, POST /v1/admin/settings/test-rpc)
// ---------------------------------------------------------------------------

export const SettingsResponseSchema = z
  .object({
    notifications: z.record(z.union([z.string(), z.boolean()])),
    rpc: z.record(z.union([z.string(), z.boolean()])),
    security: z.record(z.union([z.string(), z.boolean()])),
    daemon: z.record(z.union([z.string(), z.boolean()])),
    walletconnect: z.record(z.union([z.string(), z.boolean()])),
    oracle: z.record(z.union([z.string(), z.boolean()])),
    display: z.record(z.union([z.string(), z.boolean()])),
    autostop: z.record(z.union([z.string(), z.boolean()])),
    monitoring: z.record(z.union([z.string(), z.boolean()])),
    telegram: z.record(z.union([z.string(), z.boolean()])),
    signing_sdk: z.record(z.union([z.string(), z.boolean()])),
    gas_condition: z.record(z.union([z.string(), z.boolean()])),
  })
  .openapi('SettingsResponse');

export const SettingsUpdateRequestSchema = z
  .object({
    settings: z
      .array(
        z.object({
          key: z.string(),
          value: z.string(),
        }),
      )
      .min(1),
  })
  .openapi('SettingsUpdateRequest');

export const SettingsUpdateResponseSchema = z
  .object({
    updated: z.number().int(),
    settings: SettingsResponseSchema,
  })
  .openapi('SettingsUpdateResponse');

export const TestRpcRequestSchema = z
  .object({
    url: z.string().url(),
    chain: z.enum(['solana', 'ethereum']).optional().default('ethereum'),
  })
  .openapi('TestRpcRequest');

export const TestRpcResponseSchema = z
  .object({
    success: z.boolean(),
    latencyMs: z.number().optional(),
    error: z.string().optional(),
    chainId: z.string().optional(),
    blockNumber: z.number().optional(),
  })
  .openapi('TestRpcResponse');

// ---------------------------------------------------------------------------
// MCP Token Provisioning Schemas (POST /v1/mcp/tokens) -- BUG-013 fix
// ---------------------------------------------------------------------------

export const McpTokenCreateRequestSchema = z
  .object({
    walletId: z.string().uuid(),
    expiresIn: z.number().int().min(300).max(31536000).optional(),
  })
  .openapi('McpTokenCreateRequest');

export const McpTokenCreateResponseSchema = z
  .object({
    walletId: z.string(),
    walletName: z.string().nullable(),
    tokenPath: z.string(),
    expiresAt: z.number(),
    claudeDesktopConfig: z.record(z.unknown()),
  })
  .openapi('McpTokenCreateResponse');

// ---------------------------------------------------------------------------
// Utils: Encode Calldata Schemas
// ---------------------------------------------------------------------------

export const EncodeCalldataRequestSchema = z
  .object({
    abi: z.array(z.record(z.unknown())).describe('ABI fragment array (JSON)'),
    functionName: z.string().describe('Function name to encode'),
    args: z.array(z.any()).optional().default([]).describe('Function arguments'),
  })
  .openapi('EncodeCalldataRequest');

export const EncodeCalldataResponseSchema = z
  .object({
    calldata: z.string().describe('Hex-encoded calldata (0x-prefixed)'),
    selector: z.string().describe('Function selector (first 4 bytes, 0x-prefixed)'),
    functionName: z.string().describe('Encoded function name'),
  })
  .openapi('EncodeCalldataResponse');

// ---------------------------------------------------------------------------
// Sign-Only Transaction Schemas (POST /v1/transactions/sign)
// ---------------------------------------------------------------------------

export const TxSignRequestSchema = z
  .object({
    transaction: z.string().min(1).openapi({
      description: 'Unsigned transaction (base64 for Solana, 0x-hex for EVM)',
    }),
    chain: z.string().optional().openapi({
      description: 'Chain type (optional -- inferred from wallet)',
    }),
    network: z.string().optional().openapi({
      description: 'Network (optional -- auto-resolved for single-network chains)',
    }),
    walletId: z.string().uuid().optional().openapi({
      description: 'Target wallet ID (optional -- auto-resolved if session has single wallet)',
    }),
  })
  .openapi('TxSignRequest');

export const TxSignResponseSchema = z
  .object({
    id: z.string().uuid(),
    signedTransaction: z.string(),
    txHash: z.string().nullable(),
    operations: z.array(
      z.object({
        type: z.string(),
        to: z.string().nullable().optional(),
        amount: z.string().nullable().optional(),
        token: z.string().nullable().optional(),
        programId: z.string().nullable().optional(),
        method: z.string().nullable().optional(),
      }),
    ),
    policyResult: z.object({
      tier: z.string(),
    }),
  })
  .openapi('TxSignResponse');

// ---------------------------------------------------------------------------
// Sign Message Schemas (POST /v1/transactions/sign-message)
// ---------------------------------------------------------------------------

export const TxSignMessageRequestSchema = z
  .object({
    message: z.string().optional().openapi({
      description: 'Message to sign (hex 0x-prefixed or UTF-8 string). Required when signType is "personal".',
    }),
    signType: z.enum(['personal', 'typedData']).default('personal').openapi({
      description: 'Sign type: "personal" (default) for raw message, "typedData" for EIP-712 structured data.',
    }),
    typedData: z
      .object({
        domain: z.object({
          name: z.string().optional(),
          version: z.string().optional(),
          chainId: z.union([z.number(), z.string()]).optional(),
          verifyingContract: z.string().optional(),
          salt: z.string().optional(),
        }),
        types: z.record(z.array(z.object({ name: z.string(), type: z.string() }))),
        primaryType: z.string(),
        message: z.record(z.unknown()),
      })
      .optional()
      .openapi({
        description: 'EIP-712 typed data structure. Required when signType is "typedData".',
      }),
    network: z.string().optional().openapi({
      description: 'Target network (optional)',
    }),
    walletId: z.string().uuid().optional().openapi({
      description: 'Target wallet ID (optional -- auto-resolved if session has single wallet)',
    }),
  })
  .openapi('TxSignMessageRequest');

export const TxSignMessageResponseSchema = z
  .object({
    id: z.string().uuid(),
    signature: z.string(),
    signType: z.enum(['personal', 'typedData']),
  })
  .openapi('TxSignMessageResponse');

// ---------------------------------------------------------------------------
// Dry-Run Simulation Result Schema (POST /v1/transactions/simulate)
// ---------------------------------------------------------------------------

export const DryRunSimulationResultOpenAPI = z
  .object({
    success: z.boolean(),
    policy: z.object({
      tier: z.string(),
      allowed: z.boolean(),
      reason: z.string().optional(),
      delaySeconds: z.number().optional(),
      approvalReason: z.string().optional(),
      downgraded: z.boolean().optional(),
      cumulativeWarning: z
        .object({
          type: z.string(),
          ratio: z.number(),
          spent: z.number(),
          limit: z.number(),
        })
        .optional(),
    }),
    fee: z
      .object({
        estimatedFee: z.string(),
        feeSymbol: z.string(),
        feeDecimals: z.number(),
        feeUsd: z.number().nullable(),
        needsAtaCreation: z.boolean().optional(),
        ataRentCost: z.string().optional(),
      })
      .nullable(),
    balanceChanges: z.array(
      z.object({
        asset: z.string(),
        symbol: z.string(),
        decimals: z.number(),
        currentBalance: z.string(),
        changeAmount: z.string(),
        afterBalance: z.string(),
      }),
    ),
    warnings: z.array(
      z.object({
        code: z.string(),
        message: z.string(),
        severity: z.enum(['info', 'warning', 'error']),
      }),
    ),
    simulation: z.object({
      success: z.boolean(),
      logs: z.array(z.string()),
      unitsConsumed: z.string().nullable(),
      error: z.string().nullable(),
    }),
    meta: z.object({
      chain: z.string(),
      network: z.string(),
      transactionType: z.string(),
      durationMs: z.number(),
    }),
    gasCondition: z
      .object({
        met: z.boolean(),
        currentGasPrice: z.string(),
        currentPriorityFee: z.string().optional(),
        maxGasPrice: z.string().optional(),
        maxPriorityFee: z.string().optional(),
      })
      .optional(),
  })
  .openapi('DryRunSimulationResult');

// ---------------------------------------------------------------------------
// Oracle Status Schema (GET /v1/admin/oracle-status)
// ---------------------------------------------------------------------------

export const OracleStatusResponseSchema = z
  .object({
    cache: z.object({
      hits: z.number(),
      misses: z.number(),
      staleHits: z.number(),
      size: z.number(),
      evictions: z.number(),
    }),
    sources: z.object({
      pyth: z.object({
        available: z.boolean(),
        baseUrl: z.string(),
      }),
      coingecko: z.object({
        available: z.boolean(),
        apiKeyConfigured: z.boolean(),
      }),
    }),
    crossValidation: z.object({
      enabled: z.boolean(),
      threshold: z.number(),
    }),
  })
  .openapi('OracleStatusResponse');

// ---------------------------------------------------------------------------
// WalletConnect Pairing & Session Schemas
// ---------------------------------------------------------------------------

export const WcPairingResponseSchema = z.object({
  uri: z.string(),
  qrCode: z.string(), // data:image/png;base64,...
  expiresAt: z.number().int(),
}).openapi('WcPairingResponse');

export const WcSessionResponseSchema = z.object({
  walletId: z.string(),
  topic: z.string(),
  peerName: z.string().nullable(),
  peerUrl: z.string().nullable(),
  chainId: z.string(),
  ownerAddress: z.string(),
  expiry: z.number().int(),
  createdAt: z.number().int(),
}).openapi('WcSessionResponse');

export const WcPairingStatusResponseSchema = z.object({
  status: z.enum(['pending', 'connected', 'expired', 'none']),
  session: WcSessionResponseSchema.nullable().optional(),
}).openapi('WcPairingStatusResponse');

export const WcDisconnectResponseSchema = z.object({
  disconnected: z.boolean(),
}).openapi('WcDisconnectResponse');

// ---------------------------------------------------------------------------
// Withdraw (sweep) response
// ---------------------------------------------------------------------------

export const WithdrawResponseSchema = z.object({
  total: z.number().int(),
  succeeded: z.number().int(),
  failed: z.number().int(),
  results: z.array(z.object({
    asset: z.string(),
    amount: z.string(),
    txHash: z.string().optional(),
    error: z.string().optional(),
    status: z.enum(['success', 'failed']),
  })),
}).openapi('WithdrawResponse');

// ---------------------------------------------------------------------------
// Connect Info Response Schema (GET /v1/connect-info) -- Phase 212
// ---------------------------------------------------------------------------

export const ConnectInfoResponseSchema = z.object({
  session: z.object({
    id: z.string().uuid(),
    expiresAt: z.number().int(),
    source: z.enum(['api', 'mcp']),
  }),
  wallets: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    chain: z.string(),
    environment: z.string(),
    address: z.string(),
    ownerState: z.enum(['NONE', 'GRACE', 'LOCKED']).openapi({ description: 'Owner registration state' }),
    availableNetworks: z.array(z.string()),
    erc8004: z.object({
      agentId: z.string(),
      registryAddress: z.string(),
      chainId: z.number().int(),
      registrationFileUrl: z.string().nullable(),
      status: z.string(),
    }).optional(),
  })),
  policies: z.record(z.string(), z.array(z.object({
    type: z.string(),
    rules: z.record(z.unknown()),
    priority: z.number().int(),
    network: z.string().nullable(),
  }))),
  capabilities: z.array(z.string()),
  defaultDeny: z.object({
    tokenTransfers: z.boolean().openapi({ description: 'Deny token transfers unless ALLOWED_TOKENS policy exists' }),
    contractCalls: z.boolean().openapi({ description: 'Deny contract calls unless CONTRACT_WHITELIST policy exists' }),
    tokenApprovals: z.boolean().openapi({ description: 'Deny token approvals unless APPROVED_SPENDERS policy exists' }),
    x402Domains: z.boolean().openapi({ description: 'Deny x402 payments unless domain whitelist exists' }),
  }).openapi({ description: 'Global default-deny policy toggles' }),
  daemon: z.object({
    version: z.string(),
    baseUrl: z.string(),
  }),
  rpcProxy: z.object({
    enabled: z.boolean(),
    baseUrl: z.string(),
  }).nullable().optional().openapi({ description: 'RPC proxy info (null when disabled)' }),
  supportedChainIds: z.array(z.string()).optional().openapi({ description: 'CAIP-2 chain identifiers for all supported networks', example: ['eip155:1', 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'] }),
  prompt: z.string(),
}).openapi('ConnectInfoResponse');

// ---------------------------------------------------------------------------
// Incoming Transaction Schemas (GET /v1/wallet/incoming, GET /v1/wallet/incoming/summary)
// ---------------------------------------------------------------------------

export const IncomingTxItemSchema = z
  .object({
    id: z.string().uuid(),
    txHash: z.string(),
    walletId: z.string().uuid(),
    fromAddress: z.string(),
    amount: z.string(),
    tokenAddress: z.string().nullable(),
    chain: z.string(),
    network: z.string(),
    status: z.string().describe('DETECTED | CONFIRMED'),
    blockNumber: z.number().int().nullable(),
    detectedAt: z.number().int(),
    confirmedAt: z.number().int().nullable(),
    suspicious: z.boolean(),
    chainId: z.string().optional().openapi({ description: 'CAIP-2 chain identifier' }),
    assetId: z.string().nullable().optional().openapi({ description: 'CAIP-19 asset identifier' }),
  })
  .openapi('IncomingTxItem');

export const IncomingTxListResponseSchema = z
  .object({
    data: z.array(IncomingTxItemSchema),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  })
  .openapi('IncomingTxListResponse');

export const IncomingTxSummaryEntrySchema = z
  .object({
    date: z.string(),
    totalCount: z.number().int(),
    totalAmountNative: z.string(),
    totalAmountUsd: z.number().nullable(),
    suspiciousCount: z.number().int(),
  })
  .openapi('IncomingTxSummaryEntry');

export const IncomingTxSummaryResponseSchema = z
  .object({
    period: z.string(),
    entries: z.array(IncomingTxSummaryEntrySchema),
  })
  .openapi('IncomingTxSummaryResponse');

// ---------------------------------------------------------------------------
// PATCH /v1/wallets/:id Schemas (monitorIncoming toggle)
// ---------------------------------------------------------------------------

export const PatchWalletRequestSchema = z
  .object({
    monitorIncoming: z.boolean().optional(),
  })
  .openapi('PatchWalletRequest');

export const PatchWalletResponseSchema = z
  .object({
    id: z.string().uuid(),
    monitorIncoming: z.boolean(),
  })
  .openapi('PatchWalletResponse');

// ---------------------------------------------------------------------------
// Staking Position Schemas (GET /v1/wallet/staking)
// ---------------------------------------------------------------------------

export const StakingPositionSchema = z.object({
  protocol: z.enum(['lido', 'jito']),
  chain: z.enum(['ethereum', 'solana']),
  asset: z.string(),           // 'stETH' or 'JitoSOL'
  balance: z.string(),         // Token balance as string (decimal)
  balanceUsd: z.string().nullable(), // USD equivalent or null if price unavailable
  apy: z.string().nullable(),  // Current APY % as string or null
  pendingUnstake: z.object({
    amount: z.string(),
    status: z.enum(['PENDING', 'COMPLETED', 'TIMEOUT']),
    requestedAt: z.number().nullable(),
  }).nullable(),
  network: z.string().optional().openapi({ description: 'Network identifier' }),
  chainId: z.string().optional().openapi({ description: 'CAIP-2 chain identifier' }),
}).openapi('StakingPosition');

export const StakingPositionsResponseSchema = z.object({
  walletId: z.string(),
  positions: z.array(StakingPositionSchema),
}).openapi('StakingPositionsResponse');

// ---------------------------------------------------------------------------
// DeFi Position Schemas (GET /v1/wallet/positions, GET /v1/wallet/health-factor)
// ---------------------------------------------------------------------------

export const DeFiPositionSchema = z.object({
  id: z.string(),
  category: z.string(),         // LENDING / YIELD / PERP / STAKING
  provider: z.string(),         // Provider name (e.g., "aave_v3")
  chain: z.string(),
  network: z.string().nullable(),
  assetId: z.string().nullable(),
  amount: z.string(),           // Raw amount string
  amountUsd: z.number().nullable(), // USD conversion
  metadata: z.unknown().nullable(), // Parsed JSON metadata
  status: z.string(),           // ACTIVE / CLOSED / LIQUIDATED
  openedAt: z.number(),         // Unix seconds
  lastSyncedAt: z.number(),     // Unix seconds
  chainId: z.string().optional().openapi({ description: 'CAIP-2 chain identifier' }),
}).openapi('DeFiPosition');

export const DeFiPositionsResponseSchema = z.object({
  walletId: z.string(),
  positions: z.array(DeFiPositionSchema),
  totalValueUsd: z.number().nullable(), // Sum of all position USD values
}).openapi('DeFiPositionsResponse');

export const HealthFactorResponseSchema = z.object({
  walletId: z.string(),
  factor: z.number(),           // Decimal (e.g., 2.5)
  totalCollateralUsd: z.number(),
  totalDebtUsd: z.number(),
  currentLtv: z.number(),
  status: z.enum(['safe', 'warning', 'danger', 'critical']),
}).openapi('HealthFactorResponse');

// ---------------------------------------------------------------------------
// RPC Pool Status Schema (GET /v1/admin/rpc-status)
// ---------------------------------------------------------------------------

export const RpcEndpointStatusSchema = z.object({
  url: z.string(),
  status: z.enum(['available', 'cooldown']),
  failureCount: z.number().int(),
  cooldownRemainingMs: z.number().int(),
}).openapi('RpcEndpointStatus');

export const RpcStatusResponseSchema = z.object({
  networks: z.record(z.array(RpcEndpointStatusSchema)),
  builtinUrls: z.record(z.array(z.string())),
}).openapi('RpcStatusResponse');

// ---------------------------------------------------------------------------
// Backup Schemas (POST /v1/admin/backup, GET /v1/admin/backups)
// ---------------------------------------------------------------------------

export const BackupInfoResponseSchema = z.object({
  path: z.string().openapi({ description: 'Absolute path to the backup file' }),
  filename: z.string().openapi({ description: 'Backup filename' }),
  size: z.number().int().openapi({ description: 'File size in bytes' }),
  created_at: z.string().openapi({ description: 'ISO 8601 creation timestamp' }),
  daemon_version: z.string().openapi({ description: 'Daemon version at backup time' }),
  schema_version: z.number().int().openapi({ description: 'DB schema version at backup time' }),
  file_count: z.number().int().openapi({ description: 'Number of files in the backup' }),
}).openapi('BackupInfoResponse');

export const BackupListResponseSchema = z.object({
  backups: z.array(BackupInfoResponseSchema),
  total: z.number().int(),
  retention_count: z.number().int().openapi({ description: 'Configured retention count' }),
}).openapi('BackupListResponse');

// ---------------------------------------------------------------------------
// ERC-8004 Response Schemas (Phase 319)
// ---------------------------------------------------------------------------

export const Erc8004AgentInfoResponseSchema = z.object({
  agentId: z.string().openapi({ description: 'On-chain agent ID' }),
  wallet: z.string().openapi({ description: 'Agent wallet address (zero address if not set)' }),
  uri: z.string().openapi({ description: 'Agent URI from Identity Registry' }),
  metadata: z.record(z.unknown()).openapi({ description: 'Local metadata from agent_identities DB' }),
  registryAddress: z.string().openapi({ description: 'Identity Registry contract address' }),
  chainId: z.number().int().openapi({ description: 'EVM chain ID' }),
}).openapi('Erc8004AgentInfoResponse');

export const Erc8004ReputationResponseSchema = z.object({
  agentId: z.string().openapi({ description: 'On-chain agent ID' }),
  count: z.number().int().openapi({ description: 'Total feedback count' }),
  score: z.string().openapi({ description: 'Summary reputation score (stringified int128)' }),
  decimals: z.number().int().openapi({ description: 'Score decimal places (uint8)' }),
  tag1: z.string().openapi({ description: 'Tag1 filter applied' }),
  tag2: z.string().openapi({ description: 'Tag2 filter applied' }),
}).openapi('Erc8004ReputationResponse');

export const Erc8004RegistrationFileResponseSchema = z.any().openapi('Erc8004RegistrationFileResponse');

export const Erc8004ValidationResponseSchema = z.object({
  requestHash: z.string().openapi({ description: 'Validation request hash (bytes32)' }),
  validator: z.string().openapi({ description: 'Validator address' }),
  agentId: z.string().openapi({ description: 'Agent ID (stringified uint256)' }),
  response: z.number().int().openapi({ description: 'Validation response code (uint8, 0-255)' }),
  responseHash: z.string().openapi({ description: 'Response hash (bytes32)' }),
  tag: z.string().openapi({ description: 'Validation tag' }),
  lastUpdate: z.number().int().openapi({ description: 'Last update timestamp (uint256)' }),
}).openapi('Erc8004ValidationResponse');

// ---------------------------------------------------------------------------
// NFT Schemas (Phase 335)
// ---------------------------------------------------------------------------

export const NftListResponseSchema = z
  .object({
    items: z.array(z.object({
      tokenId: z.string(),
      contractAddress: z.string(),
      standard: z.string(),
      name: z.string().optional(),
      image: z.string().optional(),
      description: z.string().optional(),
      amount: z.string(),
      collection: z.object({ name: z.string(), slug: z.string().optional() }).optional(),
      assetId: z.string().optional(),
      chainId: z.string().optional().openapi({ description: 'CAIP-2 chain identifier' }),
    })),
    pageKey: z.string().optional(),
    totalCount: z.number().optional(),
  })
  .openapi('NftListResponse');

export const NftListGroupedResponseSchema = z
  .object({
    collections: z.array(
      z.object({
        collection: z.object({
          name: z.string(),
          slug: z.string().optional(),
          contractAddress: z.string(),
          totalCount: z.number(),
        }),
        nfts: z.array(z.object({
          tokenId: z.string(),
          contractAddress: z.string(),
          standard: z.string(),
          name: z.string().optional(),
          image: z.string().optional(),
          description: z.string().optional(),
          amount: z.string(),
          collection: z.object({ name: z.string(), slug: z.string().optional() }).optional(),
          assetId: z.string().optional(),
          chainId: z.string().optional().openapi({ description: 'CAIP-2 chain identifier' }),
        })),
      }),
    ),
    pageKey: z.string().optional(),
  })
  .openapi('NftListGroupedResponse');

export const NftMetadataResponseSchema = z
  .object({
    tokenId: z.string(),
    contractAddress: z.string(),
    standard: z.string(),
    name: z.string().optional(),
    image: z.string().optional(),
    description: z.string().optional(),
    amount: z.string(),
    collection: z.object({ name: z.string(), slug: z.string().optional() }).optional(),
    assetId: z.string().optional(),
    chainId: z.string().optional().openapi({ description: 'CAIP-2 chain identifier' }),
    attributes: z.array(z.object({
      trait_type: z.string(),
      value: z.union([z.string(), z.number()]),
    })),
    tokenUri: z.string().optional(),
    rawMetadata: z.unknown().optional(),
  })
  .openapi('NftMetadataResponse');
