/**
 * SDK type definitions for WAIaaS daemon REST API responses.
 *
 * These types match the daemon's OpenAPI schemas exactly.
 * The SDK has zero dependency on @waiaas/core -- types are standalone.
 */

// ---------------------------------------------------------------------------
// Client Options
// ---------------------------------------------------------------------------

export interface WAIaaSClientOptions {
  /** Base URL of the WAIaaS daemon (e.g., "http://localhost:3000") */
  baseUrl: string;
  /** Session token for authentication (Bearer token) */
  sessionToken?: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Retry options (used by retry wrapper in 61-02) */
  retryOptions?: RetryOptions;
}

export interface RetryOptions {
  /** Maximum number of retries (default: 3) */
  maxRetries?: number;
  /** Base delay between retries in ms (default: 1000) */
  baseDelayMs?: number;
  /** Maximum delay between retries in ms (default: 30000) */
  maxDelayMs?: number;
  /** HTTP status codes to retry on (default: [429, 500, 502, 503, 504]) */
  retryableStatuses?: number[];
}

// ---------------------------------------------------------------------------
// Wallet Responses
// ---------------------------------------------------------------------------

export interface BalanceResponse {
  agentId: string;
  chain: string;
  network: string;
  address: string;
  balance: string;
  decimals: number;
  symbol: string;
}

export interface AddressResponse {
  agentId: string;
  chain: string;
  network: string;
  address: string;
}

export interface AssetInfo {
  mint: string;
  symbol: string;
  name: string;
  balance: string;
  decimals: number;
  isNative: boolean;
  usdValue?: number;
}

export interface AssetsResponse {
  agentId: string;
  chain: string;
  network: string;
  assets: AssetInfo[];
}

// ---------------------------------------------------------------------------
// Transaction Types
// ---------------------------------------------------------------------------

export interface SendTokenParams {
  to: string;
  amount: string;
  memo?: string;
}

export interface SendTokenResponse {
  id: string;
  status: string;
}

export interface TransactionResponse {
  id: string;
  agentId: string;
  type: string;
  status: string;
  tier: string | null;
  chain: string;
  toAddress: string | null;
  amount: string | null;
  txHash: string | null;
  error: string | null;
  createdAt: number | null;
}

export interface TransactionListResponse {
  items: TransactionResponse[];
  cursor: string | null;
  hasMore: boolean;
}

export interface ListTransactionsParams {
  cursor?: string;
  limit?: number;
}

export interface PendingTransactionsResponse {
  items: TransactionResponse[];
}

// ---------------------------------------------------------------------------
// Session Types
// ---------------------------------------------------------------------------

export interface RenewSessionResponse {
  id: string;
  token: string;
  expiresAt: number;
  renewalCount: number;
}

// ---------------------------------------------------------------------------
// Owner Client Types (61-02)
// ---------------------------------------------------------------------------

export interface WAIaaSOwnerClientOptions {
  /** Base URL of the WAIaaS daemon (e.g., "http://localhost:3000") */
  baseUrl: string;
  /** Owner wallet address (base58 for Solana) */
  ownerAddress: string;
  /** Callback to sign a message with the owner's private key (Ed25519) */
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  /** Master password for recover() operation */
  masterPassword?: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Retry options for exponential backoff */
  retryOptions?: RetryOptions;
}

// ---------------------------------------------------------------------------
// Owner Responses (matching daemon OpenAPI schemas)
// ---------------------------------------------------------------------------

export interface ApproveResponse {
  id: string;
  status: string;
  approvedAt: number;
}

export interface RejectResponse {
  id: string;
  status: string;
  rejectedAt: number;
}

export interface KillSwitchActivateResponse {
  state: 'ACTIVATED';
  activatedAt: number;
}

export interface KillSwitchStatusResponse {
  state: string;
  activatedAt: number | null;
  activatedBy: string | null;
}

export interface RecoverResponse {
  state: 'NORMAL';
  recoveredAt: number;
}

export interface NonceResponse {
  nonce: string;
  expiresAt: number;
}
