/**
 * SessionManager — Session lifecycle for E2E tests.
 *
 * WAIaaS auth model:
 * - masterAuth: X-Master-Password header for admin operations
 * - sessionAuth: Authorization: Bearer wai_sess_<jwt> for session operations
 *
 * Typical flow:
 * 1. POST /v1/wallets (X-Master-Password, createSession: true) -> returns wallet + session token
 * 2. Use session token for API calls
 * 3. PUT /v1/sessions/:id/renew (sessionAuth) -> new token
 * 4. DELETE /v1/sessions/:id (masterAuth) -> revoke
 */

import { E2EHttpClient } from './http-client.js';

const DEFAULT_PASSWORD = 'e2e-test-password-12345';

interface WalletCreateResponse {
  id: string;
  name: string;
  chain: string;
  environment: string;
  publicKey: string;
  status: string;
  session: {
    id: string;
    token: string;
    expiresAt: number;
  } | null;
}

export class SessionManager {
  /** HTTP client for admin operations (X-Master-Password). */
  private adminClient: E2EHttpClient;
  /** HTTP client for session operations (Bearer token). */
  private sessionClient: E2EHttpClient;
  private masterPassword: string;
  private _token?: string;
  private _sessionId?: string;
  private _walletId?: string;

  constructor(baseUrl: string, masterPassword: string) {
    this.masterPassword = masterPassword;
    this.adminClient = new E2EHttpClient(baseUrl);
    this.sessionClient = new E2EHttpClient(baseUrl);
  }

  /**
   * Create a wallet (with auto-session).
   * Returns the session token. The wallet is created as a side effect.
   */
  async createWalletAndSession(opts?: {
    name?: string;
    chain?: string;
    environment?: string;
  }): Promise<string> {
    const { status, body } = await this.adminClient.post<WalletCreateResponse>(
      '/v1/wallets',
      {
        name: opts?.name ?? 'e2e-test-wallet',
        chain: opts?.chain ?? 'solana',
        environment: opts?.environment ?? 'testnet',
        createSession: true,
      },
      { headers: { 'X-Master-Password': this.masterPassword } },
    );

    if (status !== 201) {
      throw new Error(`Failed to create wallet: HTTP ${status} - ${JSON.stringify(body)}`);
    }

    if (!body.session) {
      throw new Error('Wallet created but no session returned');
    }

    this._walletId = body.id;
    this._sessionId = body.session.id;
    this._token = body.session.token;
    this.sessionClient.setToken(body.session.token);

    return body.session.token;
  }

  /**
   * Create a session for an existing wallet.
   * POST /v1/sessions with X-Master-Password.
   */
  async createSession(walletId: string, opts?: {
    ttl?: number;
    maxRenewals?: number;
  }): Promise<string> {
    const { status, body } = await this.adminClient.post<{
      id: string;
      token: string;
      expiresAt: number;
      walletId: string;
    }>(
      '/v1/sessions',
      { walletId, ...opts },
      { headers: { 'X-Master-Password': this.masterPassword } },
    );

    if (status !== 201) {
      throw new Error(`Failed to create session: HTTP ${status} - ${JSON.stringify(body)}`);
    }

    this._sessionId = body.id;
    this._token = body.token;
    this._walletId = walletId;
    this.sessionClient.setToken(body.token);

    return body.token;
  }

  /**
   * Renew the current session.
   * PUT /v1/sessions/:id/renew with sessionAuth.
   * Note: Only works for sessions with finite TTL, and only after 50% of TTL has elapsed.
   */
  async renewSession(): Promise<string> {
    if (!this._sessionId) {
      throw new Error('No active session to renew');
    }

    const { status, body } = await this.sessionClient.put<{
      token: string;
      expiresAt: number;
    }>(`/v1/sessions/${this._sessionId}/renew`);

    if (status !== 200) {
      throw new Error(`Failed to renew session: HTTP ${status} - ${JSON.stringify(body)}`);
    }

    this._token = body.token;
    this.sessionClient.setToken(body.token);
    return body.token;
  }

  /**
   * Rotate session token (immediate replacement, no timing constraint).
   * POST /v1/sessions/:id/rotate with masterAuth.
   */
  async rotateToken(): Promise<string> {
    if (!this._sessionId) {
      throw new Error('No active session to rotate');
    }

    const { status, body } = await this.adminClient.post<{
      token: string;
      expiresAt: number;
    }>(
      `/v1/sessions/${this._sessionId}/rotate`,
      undefined,
      { headers: { 'X-Master-Password': this.masterPassword } },
    );

    if (status !== 200) {
      throw new Error(`Failed to rotate session token: HTTP ${status} - ${JSON.stringify(body)}`);
    }

    this._token = body.token;
    this.sessionClient.setToken(body.token);
    return body.token;
  }

  /**
   * Delete/revoke the current session.
   * DELETE /v1/sessions/:id with masterAuth.
   */
  async deleteSession(): Promise<void> {
    if (!this._sessionId) {
      throw new Error('No active session to delete');
    }

    const { status } = await this.adminClient.delete(
      `/v1/sessions/${this._sessionId}`,
      { headers: { 'X-Master-Password': this.masterPassword } },
    );

    if (status !== 200) {
      throw new Error(`Failed to delete session: HTTP ${status}`);
    }

    this._token = undefined;
    this._sessionId = undefined;
    this.sessionClient.clearToken();
  }

  /** Get the authenticated HTTP client (sessionAuth). */
  get http(): E2EHttpClient {
    return this.sessionClient;
  }

  /** Get an HTTP client for admin operations (uses X-Master-Password header). */
  get admin(): E2EHttpClient {
    return this.adminClient;
  }

  /** Get the current session token. */
  get token(): string | undefined {
    return this._token;
  }

  /** Get the current session ID. */
  get sessionId(): string | undefined {
    return this._sessionId;
  }

  /** Get the wallet ID associated with this session. */
  get walletId(): string | undefined {
    return this._walletId;
  }
}

/**
 * One-line convenience: create wallet + session + return authenticated client.
 *
 * Creates a Solana testnet wallet with auto-session and returns
 * both a session-authenticated and master-password-authenticated HTTP client.
 *
 * @example
 * const { session, http, token } = await setupDaemonSession(baseUrl, masterPassword);
 * const { body } = await http.get('/v1/wallets');
 */
export async function setupDaemonSession(
  baseUrl: string,
  masterPassword?: string,
): Promise<{ session: SessionManager; http: E2EHttpClient; token: string }> {
  const pw = masterPassword ?? DEFAULT_PASSWORD;
  const session = new SessionManager(baseUrl, pw);
  const token = await session.createWalletAndSession();
  return { session, http: session.http, token };
}
