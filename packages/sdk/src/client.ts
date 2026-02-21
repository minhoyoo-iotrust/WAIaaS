/**
 * WAIaaSClient - Core wallet client for WAIaaS daemon REST API.
 *
 * Wraps 21 REST API methods with typed responses:
 * - getBalance(), getAddress(), getAssets() (wallet queries)
 * - getWalletInfo(), setDefaultNetwork() (wallet management)
 * - sendToken(), getTransaction(), listTransactions(), listPendingTransactions() (transactions)
 * - listIncomingTransactions(), getIncomingTransactionSummary() (incoming transactions)
 * - createSession(), renewSession() (session management)
 * - getConnectInfo() (discovery)
 * - encodeCalldata(), signTransaction() (utils)
 * - x402Fetch() (x402 auto-payment)
 * - wcConnect(), wcStatus(), wcDisconnect() (WalletConnect)
 *
 * All methods use exponential backoff retry for 429/5xx responses.
 * sendToken() performs inline pre-validation before making the HTTP request.
 */

import { HttpClient } from './internal/http.js';
import { WAIaaSError } from './error.js';
import { withRetry } from './retry.js';
import { validateSendToken } from './validation.js';
import { DEFAULT_TIMEOUT } from './internal/constants.js';
import type {
  WAIaaSClientOptions,
  RetryOptions,
  BalanceOptions,
  AssetsOptions,
  BalanceResponse,
  AddressResponse,
  AssetsResponse,
  SendTokenParams,
  SendTokenResponse,
  TransactionResponse,
  TransactionListResponse,
  ListTransactionsParams,
  PendingTransactionsResponse,
  CreateSessionParams,
  CreateSessionResponse,
  RenewSessionResponse,
  ConnectInfoResponse,
  EncodeCalldataParams,
  EncodeCalldataResponse,
  SignTransactionParams,
  SignTransactionResponse,
  WalletInfoResponse,
  SetDefaultNetworkResponse,
  MultiNetworkBalanceResponse,
  MultiNetworkAssetsResponse,
  X402FetchParams,
  X402FetchResponse,
  WcPairingResponse,
  WcSessionResponse,
  WcDisconnectResponse,
  IncomingTransactionListResponse,
  ListIncomingTransactionsParams,
  IncomingTransactionSummaryResponse,
  GetIncomingTransactionSummaryParams,
} from './types.js';

export class WAIaaSClient {
  private http: HttpClient;
  private sessionToken: string | undefined;
  private sessionId: string | undefined;
  private retryOptions?: RetryOptions;

  constructor(options: WAIaaSClientOptions) {
    this.http = new HttpClient(
      options.baseUrl.replace(/\/+$/, ''),
      options.timeout ?? DEFAULT_TIMEOUT,
    );
    this.sessionToken = options.sessionToken;
    this.retryOptions = options.retryOptions;
  }

  // --- Token management ---
  setSessionToken(token: string): void {
    this.sessionToken = token;
  }

  clearSessionToken(): void {
    this.sessionToken = undefined;
    this.sessionId = undefined;
  }

  private authHeaders(): Record<string, string> {
    if (!this.sessionToken) {
      throw new WAIaaSError({
        code: 'NO_TOKEN',
        message: 'No session token set',
        status: 0,
        retryable: false,
      });
    }
    return { Authorization: `Bearer ${this.sessionToken}` };
  }

  private masterHeaders(masterPassword: string): Record<string, string> {
    return { 'X-Master-Password': masterPassword };
  }

  // --- Wallet queries ---
  async getBalance(options?: BalanceOptions): Promise<BalanceResponse> {
    const query = new URLSearchParams();
    if (options?.network) query.set('network', options.network);
    const qs = query.toString();
    return withRetry(
      () => this.http.get<BalanceResponse>(
        `/v1/wallet/balance${qs ? `?${qs}` : ''}`,
        this.authHeaders(),
      ),
      this.retryOptions,
    );
  }

  async getAddress(): Promise<AddressResponse> {
    return withRetry(
      () => this.http.get<AddressResponse>('/v1/wallet/address', this.authHeaders()),
      this.retryOptions,
    );
  }

  async getAssets(options?: AssetsOptions): Promise<AssetsResponse> {
    const query = new URLSearchParams();
    if (options?.network) query.set('network', options.network);
    const qs = query.toString();
    return withRetry(
      () => this.http.get<AssetsResponse>(
        `/v1/wallet/assets${qs ? `?${qs}` : ''}`,
        this.authHeaders(),
      ),
      this.retryOptions,
    );
  }

  async getAllBalances(): Promise<MultiNetworkBalanceResponse> {
    return withRetry(
      () => this.http.get<MultiNetworkBalanceResponse>(
        '/v1/wallet/balance?network=all',
        this.authHeaders(),
      ),
      this.retryOptions,
    );
  }

  async getAllAssets(): Promise<MultiNetworkAssetsResponse> {
    return withRetry(
      () => this.http.get<MultiNetworkAssetsResponse>(
        '/v1/wallet/assets?network=all',
        this.authHeaders(),
      ),
      this.retryOptions,
    );
  }

  // --- Transaction operations ---
  async sendToken(params: SendTokenParams): Promise<SendTokenResponse> {
    // Pre-validate before making HTTP request
    validateSendToken(params);
    return withRetry(
      () => this.http.post<SendTokenResponse>(
        '/v1/transactions/send',
        params,
        this.authHeaders(),
      ),
      this.retryOptions,
    );
  }

  async getTransaction(id: string): Promise<TransactionResponse> {
    return withRetry(
      () => this.http.get<TransactionResponse>(
        `/v1/transactions/${id}`,
        this.authHeaders(),
      ),
      this.retryOptions,
    );
  }

  async listTransactions(params?: ListTransactionsParams): Promise<TransactionListResponse> {
    const query = new URLSearchParams();
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return withRetry(
      () => this.http.get<TransactionListResponse>(
        `/v1/transactions${qs ? `?${qs}` : ''}`,
        this.authHeaders(),
      ),
      this.retryOptions,
    );
  }

  async listPendingTransactions(): Promise<PendingTransactionsResponse> {
    return withRetry(
      () => this.http.get<PendingTransactionsResponse>(
        '/v1/transactions/pending',
        this.authHeaders(),
      ),
      this.retryOptions,
    );
  }

  // --- Incoming transactions ---
  async listIncomingTransactions(
    params?: ListIncomingTransactionsParams,
  ): Promise<IncomingTransactionListResponse> {
    const query = new URLSearchParams();
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.chain) query.set('chain', params.chain);
    if (params?.network) query.set('network', params.network);
    if (params?.status) query.set('status', params.status);
    if (params?.token) query.set('token', params.token);
    if (params?.fromAddress) query.set('from_address', params.fromAddress);
    if (params?.since) query.set('since', String(params.since));
    if (params?.until) query.set('until', String(params.until));
    if (params?.walletId) query.set('wallet_id', params.walletId);
    const qs = query.toString();
    return withRetry(
      () => this.http.get<IncomingTransactionListResponse>(
        `/v1/wallet/incoming${qs ? `?${qs}` : ''}`,
        this.authHeaders(),
      ),
      this.retryOptions,
    );
  }

  async getIncomingTransactionSummary(
    params?: GetIncomingTransactionSummaryParams,
  ): Promise<IncomingTransactionSummaryResponse> {
    const query = new URLSearchParams();
    if (params?.period) query.set('period', params.period);
    if (params?.chain) query.set('chain', params.chain);
    if (params?.network) query.set('network', params.network);
    if (params?.since) query.set('since', String(params.since));
    if (params?.until) query.set('until', String(params.until));
    if (params?.walletId) query.set('wallet_id', params.walletId);
    const qs = query.toString();
    return withRetry(
      () => this.http.get<IncomingTransactionSummaryResponse>(
        `/v1/wallet/incoming/summary${qs ? `?${qs}` : ''}`,
        this.authHeaders(),
      ),
      this.retryOptions,
    );
  }

  // --- Session management ---
  async createSession(
    params: CreateSessionParams,
    masterPassword: string,
  ): Promise<CreateSessionResponse> {
    const body: Record<string, unknown> = {};
    if (params.walletIds) body['walletIds'] = params.walletIds;
    if (params.walletId) body['walletId'] = params.walletId;
    if (params.defaultWalletId) body['defaultWalletId'] = params.defaultWalletId;
    if (params.expiresIn !== undefined) body['expiresIn'] = params.expiresIn;
    if (params.constraints) body['constraints'] = params.constraints;
    if (params.source) body['source'] = params.source;

    const result = await withRetry(
      () => this.http.post<CreateSessionResponse>(
        '/v1/sessions',
        body,
        this.masterHeaders(masterPassword),
      ),
      this.retryOptions,
    );

    // Auto-update session token and ID
    this.sessionToken = result.token;
    this.sessionId = result.id;

    return result;
  }

  async renewSession(): Promise<RenewSessionResponse> {
    if (!this.sessionId) {
      this.sessionId = this.extractSessionId();
    }
    const result = await withRetry(
      () => this.http.put<RenewSessionResponse>(
        `/v1/sessions/${this.sessionId}/renew`,
        {},
        this.authHeaders(),
      ),
      this.retryOptions,
    );
    // Auto-update token after successful renewal
    this.sessionToken = result.token;
    return result;
  }

  // --- Discovery ---
  async getConnectInfo(): Promise<ConnectInfoResponse> {
    return withRetry(
      () => this.http.get<ConnectInfoResponse>(
        '/v1/connect-info',
        this.authHeaders(),
      ),
      this.retryOptions,
    );
  }

  // --- Utils ---
  async encodeCalldata(params: EncodeCalldataParams): Promise<EncodeCalldataResponse> {
    return withRetry(
      () => this.http.post<EncodeCalldataResponse>(
        '/v1/utils/encode-calldata',
        params,
        this.authHeaders(),
      ),
      this.retryOptions,
    );
  }

  async signTransaction(params: SignTransactionParams): Promise<SignTransactionResponse> {
    return withRetry(
      () => this.http.post<SignTransactionResponse>(
        '/v1/transactions/sign',
        params,
        this.authHeaders(),
      ),
      this.retryOptions,
    );
  }

  // --- Wallet info ---
  async getWalletInfo(): Promise<WalletInfoResponse> {
    const address = await withRetry(
      () => this.http.get<AddressResponse>('/v1/wallet/address', this.authHeaders()),
      this.retryOptions,
    );
    const networks = await withRetry(
      () => this.http.get<{ networks: Array<{ network: string; isDefault: boolean }> }>(
        `/v1/wallets/${address.walletId}/networks`,
        this.authHeaders(),
      ),
      this.retryOptions,
    );
    return {
      walletId: address.walletId,
      chain: address.chain,
      network: address.network,
      environment: address.environment ?? '',
      address: address.address,
      networks: networks.networks ?? [],
    };
  }

  async setDefaultNetwork(network: string): Promise<SetDefaultNetworkResponse> {
    return withRetry(
      () => this.http.put<SetDefaultNetworkResponse>(
        '/v1/wallet/default-network',
        { network },
        this.authHeaders(),
      ),
      this.retryOptions,
    );
  }

  // --- x402 ---
  async x402Fetch(params: X402FetchParams): Promise<X402FetchResponse> {
    return withRetry(
      () => this.http.post<X402FetchResponse>(
        '/v1/x402/fetch',
        params,
        this.authHeaders(),
      ),
      this.retryOptions,
    );
  }

  // --- WalletConnect ---
  async wcConnect(): Promise<WcPairingResponse> {
    return withRetry(
      () => this.http.post<WcPairingResponse>('/v1/wallet/wc/pair', {}, this.authHeaders()),
      this.retryOptions,
    );
  }

  async wcStatus(): Promise<WcSessionResponse> {
    return withRetry(
      () => this.http.get<WcSessionResponse>('/v1/wallet/wc/session', this.authHeaders()),
      this.retryOptions,
    );
  }

  async wcDisconnect(): Promise<WcDisconnectResponse> {
    return withRetry(
      () => this.http.delete<WcDisconnectResponse>('/v1/wallet/wc/session', this.authHeaders()),
      this.retryOptions,
    );
  }

  private extractSessionId(): string {
    if (!this.sessionToken) {
      throw new WAIaaSError({
        code: 'NO_TOKEN',
        message: 'No session token set',
        status: 0,
        retryable: false,
      });
    }
    try {
      const payload = this.sessionToken.split('.')[1];
      if (!payload) throw new Error('Invalid token format');
      const decoded = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf-8'),
      ) as Record<string, unknown>;
      if (!decoded['sessionId']) throw new Error('No sessionId in token');
      return decoded['sessionId'] as string;
    } catch {
      throw new WAIaaSError({
        code: 'INVALID_TOKEN',
        message: 'Cannot extract session ID from token',
        status: 0,
        retryable: false,
      });
    }
  }
}
