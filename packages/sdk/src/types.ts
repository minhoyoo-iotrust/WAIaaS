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
  walletId: string;
  chain: string;
  network: string;
  address: string;
  balance: string;
  decimals: number;
  symbol: string;
}

export interface AddressResponse {
  walletId: string;
  chain: string;
  network: string;
  environment?: string;
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
  walletId: string;
  chain: string;
  network: string;
  assets: AssetInfo[];
}

// ---------------------------------------------------------------------------
// Transaction Types
// ---------------------------------------------------------------------------

export interface TokenInfo {
  address: string;
  decimals: number;
  symbol: string;
}

export interface SendTokenParams {
  to?: string;
  amount?: string;
  memo?: string;
  type?: 'TRANSFER' | 'TOKEN_TRANSFER' | 'CONTRACT_CALL' | 'APPROVE' | 'BATCH';
  token?: TokenInfo;
  // CONTRACT_CALL fields
  calldata?: string;
  abi?: Record<string, unknown>[];
  value?: string;
  programId?: string;
  instructionData?: string;
  accounts?: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
  // APPROVE fields
  spender?: string;
  // BATCH fields
  instructions?: Array<Record<string, unknown>>;
  // Network selection (multichain)
  network?: string;
}

export interface BalanceOptions {
  /** Query balance for a specific network (e.g., 'polygon-mainnet') */
  network?: string;
}

export interface AssetsOptions {
  /** Query assets for a specific network (e.g., 'polygon-mainnet') */
  network?: string;
}

export interface SendTokenResponse {
  id: string;
  status: string;
}

export interface TransactionResponse {
  id: string;
  walletId: string;
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

// ---------------------------------------------------------------------------
// Utils Responses
// ---------------------------------------------------------------------------

export interface EncodeCalldataParams {
  /** ABI fragment array (JSON objects) */
  abi: Record<string, unknown>[];
  /** Function name to encode */
  functionName: string;
  /** Function arguments (optional, defaults to []) */
  args?: unknown[];
}

export interface EncodeCalldataResponse {
  /** Hex-encoded calldata (0x-prefixed) */
  calldata: string;
  /** Function selector (first 4 bytes, 0x-prefixed) */
  selector: string;
  /** Encoded function name */
  functionName: string;
}

// ---------------------------------------------------------------------------
// Sign Transaction Types
// ---------------------------------------------------------------------------

export interface SignTransactionParams {
  /** Raw unsigned transaction (base64 for Solana, hex for EVM) */
  transaction: string;
  /** Target network (e.g., 'polygon-mainnet') */
  network?: string;
}

export interface SignTransactionOperation {
  /** Operation type (e.g., NATIVE_TRANSFER, TOKEN_TRANSFER, CONTRACT_CALL) */
  type: string;
  /** Destination address */
  to?: string | null;
  /** Amount in base units */
  amount?: string | null;
  /** Token mint/contract address */
  token?: string | null;
  /** Solana program ID */
  programId?: string | null;
  /** Contract method name */
  method?: string | null;
}

export interface SignTransactionResponse {
  /** Transaction record ID */
  id: string;
  /** Signed transaction (base64 for Solana, hex for EVM) */
  signedTransaction: string;
  /** Transaction hash (null if not available at sign time) */
  txHash: string | null;
  /** Parsed operations from the transaction */
  operations: SignTransactionOperation[];
  /** Policy evaluation result */
  policyResult: { tier: string };
}

// ---------------------------------------------------------------------------
// Wallet Info Types
// ---------------------------------------------------------------------------

export interface WalletNetworkInfo {
  network: string;
  isDefault: boolean;
}

export interface WalletInfoResponse {
  walletId: string;
  chain: string;
  network: string;
  environment: string;
  address: string;
  networks: WalletNetworkInfo[];
}

export interface SetDefaultNetworkResponse {
  id: string;
  defaultNetwork: string;
  previousNetwork: string | null;
}

// ---------------------------------------------------------------------------
// Multi-Network Aggregate Types (network=all)
// ---------------------------------------------------------------------------

export interface MultiNetworkBalanceEntry {
  network: string;
  balance?: string;
  decimals?: number;
  symbol?: string;
  error?: string;
}

export interface MultiNetworkBalanceResponse {
  walletId: string;
  chain: string;
  environment: string;
  balances: MultiNetworkBalanceEntry[];
}

export interface MultiNetworkAssetsEntry {
  network: string;
  assets?: AssetInfo[];
  error?: string;
}

export interface MultiNetworkAssetsResponse {
  walletId: string;
  chain: string;
  environment: string;
  networkAssets: MultiNetworkAssetsEntry[];
}

// ---------------------------------------------------------------------------
// x402 Types
// ---------------------------------------------------------------------------

export interface X402FetchParams {
  /** Target URL to fetch (HTTPS required) */
  url: string;
  /** HTTP method (default: GET) */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  /** Additional HTTP headers */
  headers?: Record<string, string>;
  /** Request body string */
  body?: string;
}

export interface X402PaymentInfo {
  /** Payment amount in smallest unit */
  amount: string;
  /** Asset identifier (e.g., 'USDC') */
  asset: string;
  /** CAIP-2 network identifier (e.g., 'eip155:8453') */
  network: string;
  /** Payment recipient address */
  payTo: string;
  /** WAIaaS transaction record ID */
  txId: string;
}

export interface X402FetchResponse {
  /** HTTP status code from the external server */
  status: number;
  /** Response headers from the external server */
  headers: Record<string, string>;
  /** Response body string from the external server */
  body: string;
  /** Payment details (present only when x402 payment was made) */
  payment?: X402PaymentInfo;
}
