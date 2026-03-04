/**
 * WAIaaSClient - Core wallet client for WAIaaS daemon REST API.
 *
 * Wraps 21 REST API methods with typed responses:
 * - getBalance(), getAddress(), getAssets() (wallet queries)
 * - getWalletInfo() (wallet management)
 * - sendToken(), getTransaction(), listTransactions(), listPendingTransactions() (transactions)
 * - listIncomingTransactions(), getIncomingTransactionSummary() (incoming transactions)
 * - createSession(), renewSession() (session management)
 * - getConnectInfo() (discovery)
 * - encodeCalldata(), signTransaction() (utils)
 * - x402Fetch() (x402 auto-payment)
 * - wcConnect(), wcStatus(), wcDisconnect() (WalletConnect)
 * - executeAction() (action providers: DeFi swaps, etc.)
 *
 * All methods use exponential backoff retry for 429/5xx responses.
 * sendToken() performs inline pre-validation before making the HTTP request.
 */

import { readFile, access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawn, execSync } from 'node:child_process';
import { HttpClient } from './internal/http.js';
import { WAIaaSError } from './error.js';
import { withRetry } from './retry.js';
import { validateSendToken } from './validation.js';
import { DEFAULT_TIMEOUT } from './internal/constants.js';
import type {
  ConnectOptions,
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
  ExecuteActionParams,
  ExecuteActionResponse,
  DeFiPositionsResponse,
  HealthFactorResponse,
  SimulateResponse,
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

  /**
   * Auto-discover a running daemon and connect, or optionally auto-start one.
   *
   * @example
   * ```typescript
   * // Daemon already running — auto-discover + connect
   * const client = await WAIaaSClient.connect();
   *
   * // Auto-start if not running (opt-in)
   * const client = await WAIaaSClient.connect({ autoStart: true });
   *
   * // Direct connection (skip auto-discovery)
   * const client = await WAIaaSClient.connect({ token: 'wai_sess_...', baseUrl: 'http://...' });
   * ```
   */
  static async connect(options?: ConnectOptions): Promise<WAIaaSClient> {
    const baseUrl = (options?.baseUrl ?? 'http://localhost:3100').replace(/\/+$/, '');
    const dataDir = options?.dataDir ?? process.env['WAIAAS_DATA_DIR'] ?? join(homedir(), '.waiaas');
    const autoStart = options?.autoStart ?? false;
    const startTimeoutMs = options?.startTimeoutMs ?? 30_000;

    // If token is explicitly provided, skip auto-discovery
    if (options?.token) {
      return new WAIaaSClient({
        baseUrl,
        sessionToken: options.token,
        timeout: options?.timeout,
        retryOptions: options?.retryOptions,
      });
    }

    // 1. Check if daemon is running via health check
    const running = await WAIaaSClient.checkHealth(baseUrl);

    if (!running && !autoStart) {
      throw new WAIaaSError({
        code: 'DAEMON_NOT_RUNNING',
        message:
          'WAIaaS daemon is not running.\n' +
          'Setup:\n' +
          '  npx @waiaas/cli init --auto-provision\n' +
          '  npx @waiaas/cli start &\n' +
          '  npx @waiaas/cli quickset\n' +
          'Docs: https://github.com/minhoyoo-iotrust/WAIaaS',
        status: 0,
        retryable: false,
      });
    }

    if (!running && autoStart) {
      await WAIaaSClient.autoStartDaemon(dataDir, baseUrl, startTimeoutMs);
    }

    // 2. Read token from file
    const token = await WAIaaSClient.readTokenFile(dataDir);

    return new WAIaaSClient({
      baseUrl,
      sessionToken: token,
      timeout: options?.timeout,
      retryOptions: options?.retryOptions,
    });
  }

  /** @internal */
  private static async checkHealth(baseUrl: string): Promise<boolean> {
    try {
      const res = await fetch(`${baseUrl}/health`, {
        signal: AbortSignal.timeout(5_000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /** @internal */
  private static async readTokenFile(dataDir: string): Promise<string> {
    const tokenPath = join(dataDir, 'mcp-token');
    try {
      const token = (await readFile(tokenPath, 'utf-8')).trim();
      if (!token) {
        throw new WAIaaSError({
          code: 'TOKEN_NOT_FOUND',
          message:
            `Token file is empty: ${tokenPath}\n` +
            'Run: npx @waiaas/cli quickset',
          status: 0,
          retryable: false,
        });
      }
      return token;
    } catch (err) {
      if (err instanceof WAIaaSError) throw err;
      throw new WAIaaSError({
        code: 'TOKEN_NOT_FOUND',
        message:
          `Token file not found: ${tokenPath}\n` +
          'Run: npx @waiaas/cli quickset',
        status: 0,
        retryable: false,
      });
    }
  }

  /** @internal */
  private static resolveCliCommand(): { command: string; args: string[] } {
    try {
      execSync('which waiaas', { stdio: 'ignore' });
      return { command: 'waiaas', args: [] };
    } catch {
      return { command: 'npx', args: ['@waiaas/cli'] };
    }
  }

  /** @internal */
  private static async autoStartDaemon(
    dataDir: string,
    baseUrl: string,
    timeoutMs: number,
  ): Promise<void> {
    const cli = WAIaaSClient.resolveCliCommand();

    // Ensure data dir exists (init --auto-provision if needed)
    try {
      await access(dataDir);
    } catch {
      const initArgs = [...cli.args, 'init', '--auto-provision', '--data-dir', dataDir];
      await WAIaaSClient.runCliSync(cli.command, initArgs);
    }

    // Start daemon (detached)
    const startArgs = [...cli.args, 'start', '--data-dir', dataDir];
    const child = spawn(cli.command, startArgs, {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();

    // Poll for readiness
    const deadline = Date.now() + timeoutMs;
    const pollIntervalMs = 500;
    let ready = false;
    while (Date.now() < deadline) {
      if (await WAIaaSClient.checkHealth(baseUrl)) {
        ready = true;
        break;
      }
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }

    if (!ready) {
      throw new WAIaaSError({
        code: 'START_TIMEOUT',
        message: `Daemon did not become ready within ${timeoutMs}ms`,
        status: 0,
        retryable: false,
      });
    }

    // Run quickset if token file doesn't exist
    const tokenPath = join(dataDir, 'mcp-token');
    try {
      await access(tokenPath);
    } catch {
      const quicksetArgs = [...cli.args, 'quickset', '--data-dir', dataDir];
      await WAIaaSClient.runCliSync(cli.command, quicksetArgs);
    }
  }

  /** @internal */
  private static runCliSync(command: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { stdio: 'pipe' });
      let stderr = '';
      child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}: ${stderr}`));
      });
      child.on('error', reject);
    });
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

  // --- DeFi queries ---
  async getPositions(options?: { walletId?: string }): Promise<DeFiPositionsResponse> {
    const query = new URLSearchParams();
    if (options?.walletId) query.set('wallet_id', options.walletId);
    const qs = query.toString();
    return withRetry(
      () => this.http.get<DeFiPositionsResponse>(
        `/v1/wallet/positions${qs ? `?${qs}` : ''}`,
        this.authHeaders(),
      ),
      this.retryOptions,
    );
  }

  async getHealthFactor(options?: { walletId?: string; network?: string }): Promise<HealthFactorResponse> {
    const query = new URLSearchParams();
    if (options?.walletId) query.set('wallet_id', options.walletId);
    if (options?.network) query.set('network', options.network);
    const qs = query.toString();
    return withRetry(
      () => this.http.get<HealthFactorResponse>(
        `/v1/wallet/health-factor${qs ? `?${qs}` : ''}`,
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

  /** Simulate a transaction without executing it (dry-run). */
  async simulate(params: SendTokenParams): Promise<SimulateResponse> {
    validateSendToken(params);
    return withRetry(
      () => this.http.post<SimulateResponse>(
        '/v1/transactions/simulate',
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
    if (params.ttl !== undefined) body['ttl'] = params.ttl;
    if (params.maxRenewals !== undefined) body['maxRenewals'] = params.maxRenewals;
    if (params.absoluteLifetime !== undefined) body['absoluteLifetime'] = params.absoluteLifetime;
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
      () => this.http.get<{ networks: Array<{ network: string }> }>(
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

  // --- Actions ---
  async executeAction(
    provider: string,
    action: string,
    params?: ExecuteActionParams,
  ): Promise<ExecuteActionResponse> {
    const body: Record<string, unknown> = {};
    if (params?.params) body.params = params.params;
    if (params?.network) body.network = params.network;
    if (params?.walletId) body.walletId = params.walletId;
    if (params?.gasCondition) body.gasCondition = params.gasCondition;
    return withRetry(
      () => this.http.post<ExecuteActionResponse>(
        `/v1/actions/${provider}/${action}`,
        body,
        this.authHeaders(),
      ),
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
