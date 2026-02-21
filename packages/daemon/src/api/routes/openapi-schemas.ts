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
    displayBalance: z.string().nullable().optional(),
    displayCurrency: z.string().nullable().optional(),
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
    walletId: z.string().uuid(), // backward compat: default wallet
    wallets: z.array(z.object({
      id: z.string().uuid(),
      name: z.string(),
      isDefault: z.boolean(),
    })),
  })
  .openapi('SessionCreateResponse');

export const SessionListItemSchema = z
  .object({
    id: z.string().uuid(),
    walletId: z.string().uuid(), // backward compat: default wallet
    walletName: z.string().nullable(), // backward compat: default wallet name
    wallets: z.array(z.object({
      id: z.string().uuid(),
      name: z.string(),
      isDefault: z.boolean(),
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
// Session-Wallet Management Schemas (v26.4)
// ---------------------------------------------------------------------------

export const SessionWalletSchema = z.object({
  sessionId: z.string().uuid(),
  walletId: z.string().uuid(),
  isDefault: z.boolean(),
  createdAt: z.number().int(),
}).openapi('SessionWallet');

export const SessionWalletListSchema = z.object({
  wallets: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    chain: z.string(),
    isDefault: z.boolean(),
    createdAt: z.number().int(),
  })),
}).openapi('SessionWalletList');

export const SessionDefaultWalletSchema = z.object({
  sessionId: z.string().uuid(),
  defaultWalletId: z.string().uuid(),
}).openapi('SessionDefaultWallet');

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
        displayValue: z.string().nullable().optional(),
      }),
    ),
    displayCurrency: z.string().nullable().optional(),
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
    defaultNetwork: z.string().nullable().optional(),
    publicKey: z.string(),
    status: z.string(),
    ownerAddress: z.string().nullable(),
    ownerVerified: z.boolean().nullable(),
    ownerState: z.enum(['NONE', 'GRACE', 'LOCKED']),
    approvalMethod: z.string().nullable().optional(),
    suspendedAt: z.number().int().nullable().optional(),
    suspensionReason: z.string().nullable().optional(),
    createdAt: z.number().int(),
    updatedAt: z.number().int().nullable(),
  })
  .openapi('WalletDetailResponse');

// ---------------------------------------------------------------------------
// Wallet Network Management Schemas (PUT /wallets/:id/default-network, GET /wallets/:id/networks)
// ---------------------------------------------------------------------------

// PUT /wallets/:id/default-network request
export const UpdateDefaultNetworkRequestSchema = z
  .object({
    network: z.string().min(1),
  })
  .openapi('UpdateDefaultNetworkRequest');

// PUT /wallets/:id/default-network response
export const UpdateDefaultNetworkResponseSchema = z
  .object({
    id: z.string().uuid(),
    defaultNetwork: z.string(),
    previousNetwork: z.string().nullable(),
  })
  .openapi('UpdateDefaultNetworkResponse');

// GET /wallets/:id/networks response
export const WalletNetworksResponseSchema = z
  .object({
    id: z.string().uuid(),
    chain: z.string(),
    environment: z.string(),
    defaultNetwork: z.string().nullable(),
    availableNetworks: z.array(
      z.object({
        network: z.string(),
        isDefault: z.boolean(),
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
    recentTransactions: z.array(
      z.object({
        id: z.string(),
        walletId: z.string(),
        walletName: z.string().nullable(),
        type: z.string(),
        status: z.string(),
        toAddress: z.string().nullable(),
        amount: z.string().nullable(),
        network: z.string().nullable(),
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

export const KillSwitchResponseSchema = z
  .object({
    state: z.string(),
    activatedAt: z.number().int().nullable(),
    activatedBy: z.string().nullable(),
  })
  .openapi('KillSwitchResponse');

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
    expiresIn: z.number().int().min(300).max(604800).optional(),
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
      description: 'Network (optional -- resolved from wallet defaults)',
    }),
    walletId: z.string().uuid().optional().openapi({
      description: 'Target wallet ID (optional -- defaults to session default wallet)',
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
    defaultNetwork: z.string().nullable(),
    address: z.string(),
    isDefault: z.boolean(),
    availableNetworks: z.array(z.string()),
  })),
  policies: z.record(z.string(), z.array(z.object({
    type: z.string(),
    rules: z.record(z.unknown()),
    priority: z.number().int(),
    network: z.string().nullable(),
  }))),
  capabilities: z.array(z.string()),
  daemon: z.object({
    version: z.string(),
    baseUrl: z.string(),
  }),
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
