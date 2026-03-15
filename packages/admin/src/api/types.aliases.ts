// ---------------------------------------------------------------------------
// Central type aliases for generated OpenAPI types.
// All pages should import types from here or directly from types.generated.ts.
// ---------------------------------------------------------------------------

import type { paths, components } from './types.generated';

// Re-export for convenience
export type { paths, components };

// ---------------------------------------------------------------------------
// Wallet types
// ---------------------------------------------------------------------------

export type Wallet = components['schemas']['WalletCrudResponse'];
export type WalletDetail = components['schemas']['WalletDetailResponse'];
export type WalletListResponse = components['schemas']['WalletListResponse'];

// ---------------------------------------------------------------------------
// Session types
// ---------------------------------------------------------------------------

export type SessionListItem = components['schemas']['SessionListItem'];
export type SessionWallet = components['schemas']['SessionWallet'];

// ---------------------------------------------------------------------------
// Policy types
// ---------------------------------------------------------------------------

export type PolicyResponse = components['schemas']['PolicyResponse'];

// ---------------------------------------------------------------------------
// Transaction types
// ---------------------------------------------------------------------------

export type TxDetailResponse = components['schemas']['TxDetailResponse'];
export type TxListResponse = components['schemas']['TxListResponse'];
export type IncomingTxItem = components['schemas']['IncomingTxItem'];
export type IncomingTxListResponse = components['schemas']['IncomingTxListResponse'];

// ---------------------------------------------------------------------------
// Notification types
// ---------------------------------------------------------------------------

export type NotificationChannelStatus = components['schemas']['NotificationChannelStatus'];
export type NotificationStatusResponse = components['schemas']['NotificationStatusResponse'];
export type NotificationLogEntry = components['schemas']['NotificationLogEntry'];
export type NotificationLogResponse = components['schemas']['NotificationLogResponse'];

// ---------------------------------------------------------------------------
// Settings types
// ---------------------------------------------------------------------------

export type SettingsResponse = components['schemas']['SettingsResponse'];
export type KillSwitchResponse = components['schemas']['KillSwitchResponse'];
export type TestRpcResponse = components['schemas']['TestRpcResponse'];

// ---------------------------------------------------------------------------
// Token types
// ---------------------------------------------------------------------------

export type TokenRegistryItem = components['schemas']['TokenRegistryItem'];
export type TokenRegistryListResponse = components['schemas']['TokenRegistryListResponse'];

// ---------------------------------------------------------------------------
// Credential types
// ---------------------------------------------------------------------------

// CredentialMetadata: path-level type (no named schema)
export type CredentialMetadata = paths['/v1/admin/credentials']['get']['responses']['200']['content']['application/json']['credentials'][number];

// ---------------------------------------------------------------------------
// Wallet App types
// ---------------------------------------------------------------------------

export type WalletApp = components['schemas']['WalletApp'];

// ---------------------------------------------------------------------------
// Action/Provider types
// ---------------------------------------------------------------------------

export type ProvidersListResponse = components['schemas']['ProvidersListResponse'];

// ---------------------------------------------------------------------------
// Admin types
// ---------------------------------------------------------------------------

export type AdminStatusResponse = components['schemas']['AdminStatusResponse'];

// ---------------------------------------------------------------------------
// Staking / DeFi types
// ---------------------------------------------------------------------------

export type StakingPosition = components['schemas']['StakingPosition'];
export type StakingPositionsResponse = components['schemas']['StakingPositionsResponse'];

// ---------------------------------------------------------------------------
// NFT types
// ---------------------------------------------------------------------------

export type NftListResponse = components['schemas']['NftListResponse'];
export type NftMetadataResponse = components['schemas']['NftMetadataResponse'];

// ---------------------------------------------------------------------------
// RPC types
// ---------------------------------------------------------------------------

export type RpcEndpointStatus = components['schemas']['RpcEndpointStatus'];
export type RpcStatusResponse = components['schemas']['RpcStatusResponse'];

// ---------------------------------------------------------------------------
// WalletConnect types
// ---------------------------------------------------------------------------

// Path-level types (no named schemas for individual responses)
export type WcPairResult = paths['/v1/wallets/{id}/wc/pair']['post']['responses']['200']['content']['application/json'];
export type WcPairStatus = paths['/v1/wallets/{id}/wc/pair/status']['get']['responses']['200']['content']['application/json'];

// ---------------------------------------------------------------------------
// ERC-8004 types
// ---------------------------------------------------------------------------

// Path-level type extraction
export type Erc8004AgentResponse = paths['/v1/erc8004/agent/{agentId}']['get']['responses']['200']['content']['application/json'];

// ---------------------------------------------------------------------------
// Audit log types (path-level, no named schema)
// ---------------------------------------------------------------------------

export type AuditLogResponse = paths['/v1/audit-logs']['get']['responses']['200']['content']['application/json'];
export type AuditLogItem = AuditLogResponse['data'][number];

// ---------------------------------------------------------------------------
// Telegram user types (path-level, no named schema)
// ---------------------------------------------------------------------------

export type TelegramUsersResponse = paths['/v1/admin/telegram-users']['get']['responses']['200']['content']['application/json'];
export type TelegramUser = TelegramUsersResponse['users'][number];
