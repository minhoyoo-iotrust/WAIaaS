/**
 * SessionManager: manages MCP session token lifecycle.
 *
 * Composition pattern -- independent from MCP SDK (SM-01).
 * 4 public methods: getToken, getState, start, dispose (SM-02, SMGI-D01).
 *
 * Token load strategy (SM-04, SM-05):
 *   file > env var priority. JWT decoded via base64url (no jose needed).
 *
 * Renewal scheduling (SM-09): 60% TTL default, PUT /v1/sessions/:id/renew.
 *
 * CRITICAL: All logging via console.error (SMGI-D04).
 * Never use console.log -- stdout is stdio JSON-RPC transport.
 */

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';

const LOG_PREFIX = '[waiaas-mcp:session]';

export type SessionState = 'active' | 'expired' | 'error';

export interface SessionManagerOptions {
  baseUrl: string;
  dataDir?: string;
  envToken?: string;
  renewalRatio?: number; // default 0.6 (60% of TTL)
}

// Safe setTimeout wrapper for delays > 2^31-1 ms (SM-08)
const MAX_TIMEOUT = 2_147_483_647; // 2^31 - 1

function safeSetTimeout(cb: () => void, delayMs: number): NodeJS.Timeout {
  if (delayMs <= MAX_TIMEOUT) {
    return setTimeout(cb, delayMs);
  }
  // Chain timeouts for very long delays
  return setTimeout(() => {
    const remaining = delayMs - MAX_TIMEOUT;
    safeSetTimeout(cb, remaining);
  }, MAX_TIMEOUT);
}

export class SessionManager {
  private readonly baseUrl: string;
  private readonly dataDir: string | undefined;
  private readonly envToken: string | undefined;
  private readonly renewalRatio: number;

  private token: string | null = null;
  private sessionId: string | null = null;
  private expiresAt = 0; // unix seconds
  private renewalCount = 0;
  private maxRenewals = Infinity; // lazy from server response
  private timer: NodeJS.Timeout | null = null;
  private isRenewing = false;
  private state: SessionState = 'error';

  constructor(options: SessionManagerOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.dataDir = options.dataDir;
    this.envToken = options.envToken;
    this.renewalRatio = options.renewalRatio ?? 0.6;
  }

  // --- Public API (SM-02) ---

  getToken(): string | null {
    // During renewal, returns old token (concurrency safe) (SM-14)
    if (this.state === 'expired' || this.state === 'error') {
      return null;
    }
    return this.token;
  }

  getState(): SessionState {
    return this.state;
  }

  async start(): Promise<void> {
    await this.loadToken();
    if (this.state === 'active') {
      this.scheduleRenewal();
      console.error(`${LOG_PREFIX} Started with active session, renewal scheduled`);
    } else {
      console.error(`${LOG_PREFIX} Started in ${this.state} state (degraded mode)`);
    }
  }

  dispose(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.state = 'expired';
    console.error(`${LOG_PREFIX} Disposed`);
  }

  // --- Internal ---

  private async loadToken(): Promise<void> {
    // Step 1-2: File > env var priority (SM-04)
    let rawToken: string | null = null;

    if (this.dataDir) {
      try {
        rawToken = await this.readMcpToken();
      } catch {
        // File not found or unreadable, fall through to env
      }
    }

    if (!rawToken && this.envToken) {
      rawToken = this.envToken;
    }

    // Step 3: No token found
    if (!rawToken) {
      this.state = 'error';
      console.error(`${LOG_PREFIX} No token found (check WAIAAS_SESSION_TOKEN or data dir)`);
      return;
    }

    // Step 4: Decode JWT payload (base64url, no signature verification)
    let payload: Record<string, unknown>;
    try {
      const parts = rawToken.split('.');
      const payloadPart = parts[1];
      if (!payloadPart) throw new Error('Invalid token format');
      payload = JSON.parse(
        Buffer.from(payloadPart, 'base64url').toString('utf-8'),
      ) as Record<string, unknown>;
    } catch {
      this.state = 'error';
      console.error(`${LOG_PREFIX} Failed to decode JWT payload`);
      return;
    }

    // Step 5: Validate exp range (C-03)
    const exp = payload['exp'];
    if (typeof exp !== 'number') {
      this.state = 'error';
      console.error(`${LOG_PREFIX} JWT missing exp claim`);
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const tenYears = 10 * 365 * 24 * 60 * 60;
    const oneYear = 365 * 24 * 60 * 60;
    if (exp < now - tenYears || exp > now + oneYear) {
      this.state = 'error';
      console.error(`${LOG_PREFIX} JWT exp out of valid range`);
      return;
    }

    // Step 6: Extract sessionId
    const sessionId = payload['sessionId'];
    if (typeof sessionId !== 'string' || !sessionId) {
      this.state = 'error';
      console.error(`${LOG_PREFIX} JWT missing sessionId claim`);
      return;
    }

    this.token = rawToken;
    this.sessionId = sessionId;
    this.expiresAt = exp;

    // Step 7-8: Check expiration
    if (exp < now) {
      this.state = 'expired';
      console.error(`${LOG_PREFIX} Token already expired`);
    } else {
      this.state = 'active';
      console.error(`${LOG_PREFIX} Token loaded, expires in ${exp - now}s`);
    }
  }

  private scheduleRenewal(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const now = Math.floor(Date.now() / 1000);
    const remaining = this.expiresAt - now;
    if (remaining <= 0) {
      this.state = 'expired';
      return;
    }

    const delayMs = Math.floor(remaining * this.renewalRatio) * 1000;
    if (delayMs <= 0) {
      // Very close to expiry, renew immediately
      void this.renew();
      return;
    }

    this.timer = safeSetTimeout(() => {
      void this.renew();
    }, delayMs);

    console.error(`${LOG_PREFIX} Renewal scheduled in ${Math.floor(delayMs / 1000)}s`);
  }

  private async renew(): Promise<void> {
    if (this.isRenewing) return;
    if (!this.sessionId || !this.token) return;

    this.isRenewing = true;
    console.error(`${LOG_PREFIX} Renewing session...`);

    try {
      const url = `${this.baseUrl}/v1/sessions/${this.sessionId}/renew`;
      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`,
          'User-Agent': '@waiaas/mcp/0.0.0',
        },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null) as Record<string, unknown> | null;
        throw new Error(
          `Renewal failed: ${res.status} ${body?.['message'] ?? res.statusText}`,
        );
      }

      const data = await res.json() as {
        token: string;
        id: string;
        expiresAt: number;
        renewalCount: number;
        maxRenewals?: number;
      };

      // Write file first, then update memory (H-02 defense)
      if (this.dataDir) {
        await this.writeMcpToken(data.token);
      }

      this.token = data.token;
      this.sessionId = data.id;
      this.expiresAt = data.expiresAt;
      this.renewalCount = data.renewalCount;
      if (typeof data.maxRenewals === 'number') {
        this.maxRenewals = data.maxRenewals;
      }
      this.state = 'active';

      console.error(
        `${LOG_PREFIX} Renewed (${this.renewalCount}/${this.maxRenewals === Infinity ? 'inf' : this.maxRenewals})`,
      );

      this.scheduleRenewal();
    } catch (err) {
      this.handleRenewalError(err);
    } finally {
      this.isRenewing = false;
    }
  }

  private handleRenewalError(err: unknown): void {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${LOG_PREFIX} Renewal error: ${msg}`);

    // If renewal fails, try to schedule another attempt
    // unless the token is already expired
    const now = Math.floor(Date.now() / 1000);
    if (this.expiresAt > now) {
      // Retry in 30s or at 90% of remaining TTL, whichever is sooner
      const remaining = this.expiresAt - now;
      const retryDelay = Math.min(30, Math.floor(remaining * 0.9)) * 1000;
      this.timer = safeSetTimeout(() => {
        void this.renew();
      }, retryDelay);
      console.error(`${LOG_PREFIX} Retry scheduled in ${Math.floor(retryDelay / 1000)}s`);
    } else {
      this.state = 'expired';
      console.error(`${LOG_PREFIX} Token expired, no more retries`);
    }
  }

  private async readMcpToken(): Promise<string> {
    const filePath = join(this.dataDir!, 'mcp-token');
    const content = await readFile(filePath, 'utf-8');
    return content.trim();
  }

  private async writeMcpToken(token: string): Promise<void> {
    const filePath = join(this.dataDir!, 'mcp-token');
    const tmpPath = `${filePath}.tmp`;

    // Ensure directory exists
    await mkdir(dirname(filePath), { recursive: true });

    // Atomic write: write to .tmp then rename
    await writeFile(tmpPath, token, 'utf-8');
    await rename(tmpPath, filePath);
  }
}
