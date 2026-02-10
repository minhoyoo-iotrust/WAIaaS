/**
 * WAIaaSClient - Core agent client for WAIaaS daemon REST API.
 *
 * Wraps 9 REST API methods with typed responses:
 * - getBalance(), getAddress(), getAssets() (wallet queries)
 * - sendToken(), getTransaction(), listTransactions(), listPendingTransactions() (transactions)
 * - renewSession() (session management)
 *
 * Full implementation in Task 2.
 */

import { HttpClient } from './internal/http.js';
import { WAIaaSError } from './error.js';
import { DEFAULT_TIMEOUT } from './internal/constants.js';
import type {
  WAIaaSClientOptions,
  BalanceResponse,
  AddressResponse,
  AssetsResponse,
  SendTokenParams,
  SendTokenResponse,
  TransactionResponse,
  TransactionListResponse,
  ListTransactionsParams,
  PendingTransactionsResponse,
  RenewSessionResponse,
} from './types.js';

export class WAIaaSClient {
  private http: HttpClient;
  private sessionToken: string | undefined;
  private sessionId: string | undefined;

  constructor(options: WAIaaSClientOptions) {
    this.http = new HttpClient(
      options.baseUrl.replace(/\/+$/, ''),
      options.timeout ?? DEFAULT_TIMEOUT,
    );
    this.sessionToken = options.sessionToken;
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

  // --- Wallet queries ---
  async getBalance(): Promise<BalanceResponse> {
    return this.http.get<BalanceResponse>('/v1/wallet/balance', this.authHeaders());
  }

  async getAddress(): Promise<AddressResponse> {
    return this.http.get<AddressResponse>('/v1/wallet/address', this.authHeaders());
  }

  async getAssets(): Promise<AssetsResponse> {
    return this.http.get<AssetsResponse>('/v1/wallet/assets', this.authHeaders());
  }

  // --- Transaction operations ---
  async sendToken(params: SendTokenParams): Promise<SendTokenResponse> {
    return this.http.post<SendTokenResponse>(
      '/v1/transactions/send',
      params,
      this.authHeaders(),
    );
  }

  async getTransaction(id: string): Promise<TransactionResponse> {
    return this.http.get<TransactionResponse>(
      `/v1/transactions/${id}`,
      this.authHeaders(),
    );
  }

  async listTransactions(params?: ListTransactionsParams): Promise<TransactionListResponse> {
    const query = new URLSearchParams();
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return this.http.get<TransactionListResponse>(
      `/v1/transactions${qs ? `?${qs}` : ''}`,
      this.authHeaders(),
    );
  }

  async listPendingTransactions(): Promise<PendingTransactionsResponse> {
    return this.http.get<PendingTransactionsResponse>(
      '/v1/transactions/pending',
      this.authHeaders(),
    );
  }

  // --- Session management ---
  async renewSession(): Promise<RenewSessionResponse> {
    if (!this.sessionId) {
      this.sessionId = this.extractSessionId();
    }
    const result = await this.http.put<RenewSessionResponse>(
      `/v1/sessions/${this.sessionId}/renew`,
      {},
      this.authHeaders(),
    );
    // Auto-update token after successful renewal
    this.sessionToken = result.token;
    return result;
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
