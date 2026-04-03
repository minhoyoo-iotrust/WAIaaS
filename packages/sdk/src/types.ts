/**
 * SDK type definitions for WAIaaS daemon REST API responses.
 *
 * These types match the daemon's OpenAPI schemas exactly.
 * The SDK has zero dependency on @waiaas/core -- types are standalone.
 */

// ---------------------------------------------------------------------------
// CAIP Standard Identifiers
// ---------------------------------------------------------------------------

/** CAIP-2 chain identifier (e.g., "eip155:1", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp") */
export type Caip2ChainId = string;

/** CAIP-19 asset identifier (e.g., "eip155:1/erc20:0xa0b8...", "eip155:1/slip44:60") */
export type Caip19AssetId = string;

// ---------------------------------------------------------------------------
// Client Options
// ---------------------------------------------------------------------------

export interface WAIaaSClientOptions {
  /** Base URL of the WAIaaS daemon (e.g., "http://localhost:3000") */
  baseUrl: string;
  /** Session token for authentication (Bearer token) */
  sessionToken?: string;
  /** Master password for admin operations (e.g., createWallet) */
  masterPassword?: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Retry options (used by retry wrapper in 61-02) */
  retryOptions?: RetryOptions;
}

export interface ConnectOptions {
  /** Base URL of the WAIaaS daemon (default: "http://localhost:3100") */
  baseUrl?: string;
  /** Session token — if provided, auto-discovery is skipped */
  token?: string;
  /** Data directory path (default: ~/.waiaas) */
  dataDir?: string;
  /** Auto-start the daemon if not running (default: false) */
  autoStart?: boolean;
  /** Readiness polling timeout in ms when autoStart is true (default: 30000) */
  startTimeoutMs?: number;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Retry options for API calls */
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
// Wallet Creation Types
// ---------------------------------------------------------------------------

export interface CreateWalletParams {
  /** Wallet name */
  name: string;
  /** Chain type: solana, ethereum, or ripple */
  chain?: 'solana' | 'ethereum' | 'ripple';
  /** Environment: testnet or mainnet */
  environment?: 'testnet' | 'mainnet';
  /** Account type: eoa (default) or smart (ERC-4337, EVM only) */
  accountType?: 'eoa' | 'smart';
  /** Whether to create an initial session (default: true) */
  createSession?: boolean;
}

export interface CreateWalletResponse {
  id: string;
  name: string;
  chain: string;
  network: string;
  environment: string;
  publicKey: string;
  status: string;
  accountType: string;
  signerKey: string | null;
  deployed: boolean;
  createdAt: number;
  session?: {
    id: string;
    token: string;
    expiresAt: number;
  } | null;
}

// ---------------------------------------------------------------------------
// Health Response
// ---------------------------------------------------------------------------

export interface HealthResponse {
  /** Daemon status (always "ok" when running) */
  status: string;
  /** Current daemon version (semver) */
  version: string;
  /** Latest available version from npm registry, null if check not performed */
  latestVersion: string | null;
  /** True when a newer version is available */
  updateAvailable: boolean;
  /** Current database schema version number */
  schemaVersion: number;
  /** Seconds since daemon start */
  uptime: number;
  /** Current epoch timestamp (seconds) */
  timestamp: number;
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
  /** CAIP-2 chain identifier (e.g., "eip155:1"). Present in daemon responses. */
  chainId?: Caip2ChainId;
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
  /** CAIP-19 asset identifier. Present in daemon responses for registered tokens. */
  assetId?: Caip19AssetId;
  /** CAIP-2 chain identifier (e.g., "eip155:1"). Present in daemon responses. */
  chainId?: Caip2ChainId;
}

export interface AssetsResponse {
  walletId: string;
  chain: string;
  network: string;
  assets: AssetInfo[];
  /** CAIP-2 chain identifier (e.g., "eip155:1"). Present in daemon responses. */
  chainId?: Caip2ChainId;
}

// ---------------------------------------------------------------------------
// Transaction Types
// ---------------------------------------------------------------------------

/** Token identification: provide either full metadata OR assetId alone (daemon resolves). */
export type TokenInfo = TokenInfoFull | TokenInfoByAssetId;

/** Full token metadata (existing pattern). */
export interface TokenInfoFull {
  address: string;
  decimals: number;
  symbol: string;
  /** CAIP-19 asset identifier (e.g., "eip155:1/erc20:0xa0b8..."). Optional -- daemon cross-validates against address when provided. */
  assetId?: Caip19AssetId;
}

/** CAIP-19 only -- daemon resolves address/decimals/symbol from registry. */
export interface TokenInfoByAssetId {
  assetId: Caip19AssetId;
  address?: string;
  decimals?: number;
  symbol?: string;
}

/** Gas price condition for deferred execution. */
export interface GasCondition {
  /** Max gas price in wei (EVM baseFee+priorityFee) */
  maxGasPrice?: string;
  /** Max priority fee in wei (EVM) or micro-lamports (Solana) */
  maxPriorityFee?: string;
  /** Max wait time in seconds (60-86400) */
  timeout?: number;
}

export interface SendTokenParams {
  to?: string;
  amount?: string;
  /** Human-readable amount (e.g., '1.5' for 1.5 ETH). Mutually exclusive with amount -- server converts using token decimals. */
  humanAmount?: string;
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
  /** Target network (e.g., 'polygon-mainnet' or CAIP-2 'eip155:137'). Required for EVM wallets. */
  network?: string;
  // Gas conditional execution
  gasCondition?: GasCondition;
}

export interface BalanceOptions {
  /** Query balance for a specific network (e.g., 'polygon-mainnet' or CAIP-2 'eip155:137'). */
  network?: string;
}

export interface AssetsOptions {
  /** Query assets for a specific network (e.g., 'polygon-mainnet' or CAIP-2 'eip155:137'). */
  network?: string;
}

export interface SendTokenResponse {
  id: string;
  status: string;
}

/** v30.2 Dry-run simulation result (POST /v1/transactions/simulate). */
export interface SimulateResponse {
  success: boolean;
  policy: {
    tier: string;
    allowed: boolean;
    reason?: string;
    delaySeconds?: number;
    approvalReason?: string;
    downgraded?: boolean;
    cumulativeWarning?: { type: string; ratio: number; spent: number; limit: number };
  };
  fee: {
    estimatedFee: string;
    feeSymbol: string;
    feeDecimals: number;
    feeUsd: number | null;
    needsAtaCreation?: boolean;
    ataRentCost?: string;
  } | null;
  balanceChanges: Array<{
    asset: string;
    symbol: string;
    decimals: number;
    currentBalance: string;
    changeAmount: string;
    afterBalance: string;
  }>;
  warnings: Array<{
    code: string;
    message: string;
    severity: 'info' | 'warning' | 'error';
  }>;
  simulation: {
    success: boolean;
    logs: string[];
    unitsConsumed: string | null;
    error: string | null;
  };
  meta: {
    chain: string;
    network: string;
    transactionType: string;
    durationMs: number;
  };
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
  /** CAIP-2 chain identifier (e.g., "eip155:1"). Present in daemon responses. */
  chainId?: Caip2ChainId;
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

export interface CreateSessionParams {
  /** Wallet IDs for multi-wallet session (plural) */
  walletIds?: string[];
  /** Single wallet ID (backward-compatible, singular) */
  walletId?: string;
  /** Session TTL in seconds (omit for unlimited session) */
  ttl?: number;
  /** Maximum number of renewals (0 = unlimited) */
  maxRenewals?: number;
  /** Absolute session lifetime in seconds (0 = unlimited) */
  absoluteLifetime?: number;
  /** Session constraints */
  constraints?: Record<string, unknown>;
  /** Source indicator */
  source?: 'api' | 'mcp';
}

export interface CreateSessionWallet {
  id: string;
  name: string;
}

export interface CreateSessionResponse {
  id: string;
  token: string;
  expiresAt: number;
  /** Default wallet ID (backward-compatible) */
  walletId: string;
  /** All wallets linked to this session */
  wallets: CreateSessionWallet[];
}

export interface RenewSessionResponse {
  id: string;
  token: string;
  expiresAt: number;
  renewalCount: number;
}

export interface RotateSessionTokenResponse {
  id: string;
  token: string;
  expiresAt: number;
  tokenIssuedCount: number;
}

// ---------------------------------------------------------------------------
// Session/Policy List (Paginated) Types
// ---------------------------------------------------------------------------

export interface ListSessionsParams {
  walletId?: string;
  limit?: number;
  offset?: number;
}

export interface SessionListItem {
  id: string;
  walletId: string;
  walletName: string | null;
  wallets: Array<{ id: string; name: string }>;
  status: string;
  renewalCount: number;
  maxRenewals: number;
  expiresAt: number;
  absoluteExpiresAt: number;
  createdAt: number;
  lastRenewedAt: number | null;
  source: 'api' | 'mcp';
}

export interface PaginatedSessionList {
  data: SessionListItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface ListPoliciesParams {
  walletId?: string;
  limit?: number;
  offset?: number;
}

export interface PaginatedPolicyList {
  data: Array<{
    id: string;
    walletId: string | null;
    type: string;
    rules: Record<string, unknown>;
    priority: number;
    enabled: boolean;
    network: string | null;
    createdAt: number;
    updatedAt: number;
  }>;
  total: number;
  limit: number;
  offset: number;
}

// ---------------------------------------------------------------------------
// Connect Info (Discovery) Types
// ---------------------------------------------------------------------------

export interface ConnectInfoPolicyEntry {
  type: string;
  rules: Record<string, unknown>;
  priority: number;
  network: string | null;
}

export interface ConnectInfoWallet {
  id: string;
  name: string;
  chain: string;
  environment: string;
  address: string;
  accountType?: string;
}

export interface ConnectInfoSession {
  id: string;
  expiresAt: number;
  source: string;
}

export interface ConnectInfoDaemon {
  version: string;
  baseUrl: string;
}

export interface ConnectInfoResponse {
  session: ConnectInfoSession;
  wallets: ConnectInfoWallet[];
  policies: Record<string, ConnectInfoPolicyEntry[]>;
  capabilities: string[];
  daemon: ConnectInfoDaemon;
  /** RPC proxy info (null when disabled) */
  rpcProxy?: { enabled: boolean; baseUrl: string } | null;
  prompt: string;
  /** Supported CAIP-2 chain identifiers (e.g., ["eip155:1", "eip155:137"]). Present in daemon responses. */
  supportedChainIds?: Caip2ChainId[];
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
  /** Target network (e.g., 'polygon-mainnet' or CAIP-2 'eip155:137'). */
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
// UserOp Types
// ---------------------------------------------------------------------------

export interface BuildUserOpParams {
  /** Standard TransactionRequest object */
  request: Record<string, unknown>;
  /** EVM network identifier (e.g., 'ethereum-sepolia') */
  network: string;
}

export interface BuildUserOpResponse {
  sender: string;
  nonce: string;
  callData: string;
  factory: string | null;
  factoryData: string | null;
  entryPoint: string;
  buildId: string;
}

export interface SignUserOpParams {
  buildId: string;
  userOperation: Record<string, unknown>;
}

export interface SignUserOpResponse {
  signedUserOperation: Record<string, unknown>;
  txId: string;
}

// ---------------------------------------------------------------------------
// Wallet Info Types
// ---------------------------------------------------------------------------

export interface WalletNetworkInfo {
  network: string;
}

export interface WalletInfoResponse {
  walletId: string;
  chain: string;
  network: string;
  environment: string;
  address: string;
  networks: WalletNetworkInfo[];
  accountType?: string;
  signerKey?: string | null;
  deployed?: boolean;
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
  /** CAIP-2 chain identifier (e.g., "eip155:1"). Present in daemon responses. */
  chainId?: Caip2ChainId;
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
  /** CAIP-2 chain identifier (e.g., "eip155:1"). Present in daemon responses. */
  chainId?: Caip2ChainId;
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

// ---------------------------------------------------------------------------
// ERC-8128 Signed HTTP Requests
// ---------------------------------------------------------------------------

export interface Erc8128SignParams {
  /** HTTP method */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  /** Target URL to sign for */
  url: string;
  /** HTTP headers to include in signature */
  headers?: Record<string, string>;
  /** Request body (used for Content-Digest) */
  body?: string;
  /** Target wallet ID (required for multi-wallet sessions) */
  walletId?: string;
  /** Network ID (e.g., evm-ethereum-mainnet) */
  network?: string;
  /** Covered Components preset (default: standard) */
  preset?: 'minimal' | 'standard' | 'strict';
  /** Signature TTL in seconds (default: 300) */
  ttlSeconds?: number;
  /** Include nonce (default: true) */
  includeNonce?: boolean;
  /** Signing algorithm (default: eip191) */
  algorithm?: string;
}

export interface Erc8128SignResponse {
  /** Signature-Input header value */
  signatureInput: string;
  /** Signature header value */
  signature: string;
  /** Content-Digest header value (present when body was provided) */
  contentDigest?: string;
  /** keyid in erc8128:<chainId>:<address> format */
  keyid: string;
  /** Preset used */
  preset: string;
  /** TTL used in seconds */
  ttlSeconds: number;
  /** Nonce (present when includeNonce is true) */
  nonce?: string;
  /** Algorithm used */
  algorithm: string;
}

export interface Erc8128VerifyParams {
  /** HTTP method */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  /** Request URL */
  url: string;
  /** HTTP headers from the signed request */
  headers: Record<string, string>;
  /** Signature-Input header value */
  signatureInput: string;
  /** Signature header value */
  signature: string;
  /** Content-Digest header value */
  contentDigest?: string;
}

export interface Erc8128VerifyResponse {
  /** Whether the signature is valid */
  valid: boolean;
  /** Recovered Ethereum address */
  recoveredAddress?: string;
  /** keyid from Signature-Input */
  keyid?: string;
  /** Signature expiry timestamp (ISO-8601) */
  expiresAt?: string;
  /** Whether the signature has expired */
  expired?: boolean;
  /** Error message if invalid */
  error?: string;
}

export interface Erc8128FetchParams {
  /** HTTP method (default: GET) */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  /** Target URL to fetch with ERC-8128 signature */
  url: string;
  /** Additional HTTP headers */
  headers?: Record<string, string>;
  /** Request body string */
  body?: string;
  /** Target wallet ID */
  walletId?: string;
  /** Network ID */
  network?: string;
  /** Covered Components preset */
  preset?: 'minimal' | 'standard' | 'strict';
  /** Signature TTL in seconds */
  ttlSeconds?: number;
}

export interface Erc8128FetchResponse {
  /** HTTP status code from the external server */
  status: number;
  /** Response headers from the external server */
  headers: Record<string, string>;
  /** Response body string from the external server */
  body: string;
  /** Signature headers that were sent */
  signatureHeaders: {
    signatureInput: string;
    signature: string;
    contentDigest?: string;
  };
}

// ---------------------------------------------------------------------------
// WalletConnect Responses
// ---------------------------------------------------------------------------

export interface WcPairingResponse {
  uri: string;
  qrCode: string;
  expiresAt: number;
}

export interface WcSessionResponse {
  walletId: string;
  topic: string;
  peerName: string | null;
  peerUrl: string | null;
  chainId: string;
  ownerAddress: string;
  expiry: number;
  createdAt: number;
}

export interface WcDisconnectResponse {
  disconnected: boolean;
}

// ---------------------------------------------------------------------------
// Policy Types (reference for REST API /v1/policies users)
// ---------------------------------------------------------------------------

/**
 * SPENDING_LIMIT policy rules schema.
 *
 * Per-transaction tiers: instant_max, notify_max, delay_max (native amount digit strings).
 * USD tiers (optional): instant_max_usd, notify_max_usd, delay_max_usd.
 * Cumulative limits (optional): daily_limit_usd (24h rolling), monthly_limit_usd (30d rolling).
 *
 * When cumulative USD spending exceeds the limit, the transaction tier is escalated to APPROVAL.
 *
 * @example
 * ```typescript
 * const rules: SpendingLimitRules = {
 *   instant_max: '100000000',
 *   notify_max: '500000000',
 *   delay_max: '1000000000',
 *   daily_limit_usd: 500,
 *   monthly_limit_usd: 5000,
 * };
 * ```
 */
export interface SpendingLimitRules {
  /** INSTANT tier max amount (lamports/wei digit string) */
  instant_max: string;
  /** NOTIFY tier max amount (digit string) */
  notify_max: string;
  /** DELAY tier max amount (digit string) */
  delay_max: string;
  /** Delay cooldown seconds (min 60, default 900) */
  delay_seconds?: number;
  /** INSTANT tier max USD amount (oracle-based, optional) */
  instant_max_usd?: number;
  /** NOTIFY tier max USD amount */
  notify_max_usd?: number;
  /** DELAY tier max USD amount */
  delay_max_usd?: number;
  /** 24h rolling window cumulative USD spending limit (optional, exceeding escalates to APPROVAL) */
  daily_limit_usd?: number;
  /** 30d rolling window cumulative USD spending limit (optional, exceeding escalates to APPROVAL) */
  monthly_limit_usd?: number;
}

// ---------------------------------------------------------------------------
// Incoming Transaction Types
// ---------------------------------------------------------------------------

export interface IncomingTransactionItem {
  id: string;
  txHash: string;
  walletId: string;
  fromAddress: string;
  amount: string;
  tokenAddress: string | null;
  chain: string;
  network: string;
  status: string; // 'DETECTED' | 'CONFIRMED'
  blockNumber: number | null;
  detectedAt: number;
  confirmedAt: number | null;
  suspicious: boolean;
  /** CAIP-2 chain identifier (e.g., "eip155:1"). Present in daemon responses. */
  chainId?: Caip2ChainId;
  /** CAIP-19 asset identifier. Present in daemon responses. */
  assetId?: Caip19AssetId;
}

export interface IncomingTransactionListResponse {
  data: IncomingTransactionItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ListIncomingTransactionsParams {
  cursor?: string;
  limit?: number;
  chain?: string;
  network?: string;
  status?: 'DETECTED' | 'CONFIRMED';
  token?: string;
  fromAddress?: string;
  since?: number;
  until?: number;
  walletId?: string;
}

export interface IncomingSummaryEntry {
  date: string;
  totalCount: number;
  totalAmountNative: string;
  totalAmountUsd: number | null;
  suspiciousCount: number;
}

export interface IncomingTransactionSummaryResponse {
  period: string;
  entries: IncomingSummaryEntry[];
}

export interface GetIncomingTransactionSummaryParams {
  period?: 'daily' | 'weekly' | 'monthly';
  chain?: string;
  network?: string;
  since?: number;
  until?: number;
  walletId?: string;
}

// ---------------------------------------------------------------------------
// Action Provider Types
// ---------------------------------------------------------------------------

export interface ExecuteActionParams {
  /** Action-specific parameters as key-value pairs */
  params?: Record<string, unknown>;
  /** Target network (e.g., 'ethereum-mainnet'). Required for EVM wallets. */
  network?: string;
  /** Target wallet ID (required for multi-wallet sessions). */
  walletId?: string;
  /** Gas price condition for deferred execution */
  gasCondition?: GasCondition;
}

export interface ExecuteActionResponse {
  /** Transaction ID (last element for multi-step) */
  id: string;
  /** Transaction status */
  status: string;
  /** Pipeline steps (present for multi-step actions like approve+swap) */
  pipeline?: Array<{ id: string; status: string }>;
}

/** Policy type enum for REST API /v1/policies. */
export type PolicyType =
  | 'SPENDING_LIMIT'
  | 'WHITELIST'
  | 'TIME_RESTRICTION'
  | 'RATE_LIMIT'
  | 'ALLOWED_TOKENS'
  | 'CONTRACT_WHITELIST'
  | 'METHOD_WHITELIST'
  | 'APPROVED_SPENDERS'
  | 'APPROVE_AMOUNT_LIMIT'
  | 'APPROVE_TIER_OVERRIDE'
  | 'ALLOWED_NETWORKS'
  | 'X402_ALLOWED_DOMAINS'
  | 'REPUTATION_THRESHOLD';

// ---------------------------------------------------------------------------
// ERC-8004 Types
// ---------------------------------------------------------------------------

export interface Erc8004AgentInfoResponse {
  agentId: string;
  wallet: string;
  uri: string;
  metadata: Record<string, unknown>;
  registryAddress: string;
  chainId: number;
}

export interface Erc8004ReputationResponse {
  agentId: string;
  count: number;
  score: string;
  decimals: number;
  tag1: string;
  tag2: string;
}

export interface Erc8004RegistrationFileResponse {
  [key: string]: unknown;
}

export interface Erc8004ValidationResponse {
  requestHash: string;
  validator: string;
  agentId: string;
  response: number;
  responseHash: string;
  tag: string;
  lastUpdate: number;
}

/** Params for registerAgent SDK method. */
export interface Erc8004RegisterAgentParams {
  name: string;
  description?: string;
  services?: Array<{ name: string; endpoint: string; version?: string }>;
  metadata?: Record<string, string>;
  network?: string;
  walletId?: string;
  gasCondition?: GasCondition;
}

/** Params for setAgentWallet SDK method. */
export interface Erc8004SetAgentWalletParams {
  agentId: string;
  network?: string;
  walletId?: string;
  gasCondition?: GasCondition;
}

/** Params for unsetAgentWallet SDK method. */
export interface Erc8004UnsetAgentWalletParams {
  agentId: string;
  network?: string;
  walletId?: string;
  gasCondition?: GasCondition;
}

/** Params for setAgentUri SDK method. */
export interface Erc8004SetAgentUriParams {
  agentId: string;
  uri: string;
  network?: string;
  walletId?: string;
  gasCondition?: GasCondition;
}

/** Params for setAgentMetadata SDK method. */
export interface Erc8004SetAgentMetadataParams {
  agentId: string;
  key: string;
  value: string;
  network?: string;
  walletId?: string;
  gasCondition?: GasCondition;
}

/** Params for giveFeedback SDK method. */
export interface Erc8004GiveFeedbackParams {
  targetAgentId: string;
  score: number;
  tag1?: string;
  tag2?: string;
  network?: string;
  walletId?: string;
  gasCondition?: GasCondition;
}

/** Params for revokeFeedback SDK method. */
export interface Erc8004RevokeFeedbackParams {
  targetAgentId: string;
  tag1?: string;
  tag2?: string;
  network?: string;
  walletId?: string;
  gasCondition?: GasCondition;
}

/** Params for requestValidation SDK method. */
export interface Erc8004RequestValidationParams {
  requestURI: string;
  network?: string;
  walletId?: string;
  gasCondition?: GasCondition;
}

/** Params for getAgentReputation SDK method. */
export interface Erc8004GetReputationOptions {
  tag1?: string;
  tag2?: string;
}

// ---------------------------------------------------------------------------
// NFT Types
// ---------------------------------------------------------------------------

export interface ListNftsParams {
  /** Network identifier (required) */
  network: string;
  /** Pagination cursor */
  cursor?: string;
  /** Max items per page */
  limit?: number;
  /** Group NFTs by collection */
  groupBy?: 'collection';
  /** Target wallet ID (multi-wallet sessions) */
  walletId?: string;
}

export interface NftItemResponse {
  tokenId: string;
  contractAddress: string;
  standard: string;
  name?: string;
  image?: string;
  description?: string;
  amount?: string;
  collection?: { name?: string; address: string };
  assetId?: Caip19AssetId;
  /** CAIP-2 chain identifier (e.g., "eip155:1"). Present in daemon responses. */
  chainId?: Caip2ChainId;
}

export interface NftListResponse {
  nfts: NftItemResponse[];
  cursor?: string;
  hasMore: boolean;
}

export interface NftMetadataParams {
  /** Network identifier (required) */
  network: string;
  /** Target wallet ID (multi-wallet sessions) */
  walletId?: string;
}

export interface NftMetadataResponse {
  tokenId: string;
  contractAddress: string;
  standard: string;
  name?: string;
  image?: string;
  description?: string;
  attributes?: Array<{ traitType: string; value: string }>;
  metadata?: Record<string, unknown>;
  assetId?: Caip19AssetId;
  /** CAIP-2 chain identifier (e.g., "eip155:1"). Present in daemon responses. */
  chainId?: Caip2ChainId;
}

export interface TransferNftParams {
  /** Recipient address */
  to: string;
  /** NFT token info */
  token: { address: string; tokenId: string; standard: string };
  /** Network identifier */
  network: string;
  /** Amount (default "1", relevant for ERC-1155) */
  amount?: string;
  /** Target wallet ID (multi-wallet sessions) */
  walletId?: string;
  /** Gas price condition */
  gasCondition?: GasCondition;
}

// ---------------------------------------------------------------------------
// DCent Swap Types
// ---------------------------------------------------------------------------

/** Params for getDcentQuotes SDK method. */
export interface DcentQuoteParams {
  fromAsset: string;    // CAIP-19 identifier
  toAsset: string;      // CAIP-19 identifier
  amount: string;       // from token smallest unit
  fromDecimals: number;
  toDecimals: number;
  network?: string;
  walletId?: string;
}

/** Params for dcentDexSwap SDK method. */
export interface DcentDexSwapParams {
  fromAsset: string;
  toAsset: string;
  amount: string;
  fromDecimals: number;
  toDecimals: number;
  providerId?: string;
  slippageBps?: number;
  network?: string;
  walletId?: string;
  gasCondition?: GasCondition;
}


// ---------------------------------------------------------------------------
// Across Bridge Types
// ---------------------------------------------------------------------------

export interface AcrossBridgeQuoteParams {
  fromChain: string;
  toChain: string;
  inputToken: string;
  outputToken: string;
  amount: string;
  recipient?: string;
  walletId?: string;
  network?: string;
}

export interface AcrossBridgeExecuteParams {
  fromChain: string;
  toChain: string;
  inputToken: string;
  outputToken: string;
  amount: string;
  recipient?: string;
  slippage?: number;
  walletId?: string;
  network?: string;
  gasCondition?: Record<string, unknown>;
}

export interface AcrossBridgeStatusParams {
  depositTxHash: string;
  originChainId?: number;
  walletId?: string;
  network?: string;
}

export interface AcrossBridgeRoutesParams {
  fromChain?: string;
  toChain?: string;
  inputToken?: string;
  outputToken?: string;
  walletId?: string;
  network?: string;
}

// ---------------------------------------------------------------------------
// DeFi Position Types (API-01, API-02, API-05)
// ---------------------------------------------------------------------------

export interface DeFiPosition {
  id: string;
  category: string;
  provider: string;
  chain: string;
  network: string | null;
  assetId: string | null;
  amount: string;
  amountUsd: number | null;
  metadata: unknown | null;
  status: string;
  openedAt: number;
  lastSyncedAt: number;
  /** CAIP-2 chain identifier (e.g., "eip155:1"). Present in daemon responses. */
  chainId?: Caip2ChainId;
}

export interface DeFiPositionsResponse {
  walletId: string;
  positions: DeFiPosition[];
  totalValueUsd: number | null;
}

export interface HealthFactorResponse {
  walletId: string;
  factor: number;
  totalCollateralUsd: number;
  totalDebtUsd: number;
  currentLtv: number;
  status: 'safe' | 'warning' | 'danger' | 'critical';
}

// ---------------------------------------------------------------------------
// External Action Types (off-chain signedData/signedHttp)
// ---------------------------------------------------------------------------

export interface OffchainActionItem {
  id: string;
  actionKind: string;
  venue: string | null;
  operation: string | null;
  status: string;
  bridgeStatus: string | null;
  createdAt: number;
  provider: string | null;
  actionName: string | null;
}

export interface OffchainActionDetail extends OffchainActionItem {
  metadata: Record<string, unknown> | null;
  bridgeMetadata: Record<string, unknown> | null;
  error: string | null;
  txHash: string | null;
}

export interface OffchainActionsListResponse {
  actions: OffchainActionItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface ListOffchainActionsParams {
  walletId: string;
  venue?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

// ---------------------------------------------------------------------------
// Credential Types (AES-256-GCM encrypted at rest)
// ---------------------------------------------------------------------------

export interface CredentialMetadata {
  id: string;
  name: string;
  type: string;
  walletId: string | null;
  expiresAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface CreateCredentialParams {
  name: string;
  type: string;
  value: string;
  expiresAt?: number;
}
