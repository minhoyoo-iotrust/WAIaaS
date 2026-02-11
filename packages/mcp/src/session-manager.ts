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
 * Hardened features (63-02):
 *   - Exponential backoff retry (1s/2s/4s, max 3) (MCP-04, SM-11)
 *   - isRenewing concurrency guard (MCP-05)
 *   - 409 RENEWAL_CONFLICT file re-read (MCP-05, CONC-02)
 *   - 5-type error handling: TOO_EARLY/LIMIT/LIFETIME/NETWORK/EXPIRED
 *   - Recovery loop (60s polling) (SMGI-D03)
 *   - safeSetTimeout overflow guard (SM-08)
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

export function safeSetTimeout(cb: () => void, delayMs: number): NodeJS.Timeout {
  if (delayMs <= MAX_TIMEOUT) {
    return setTimeout(cb, delayMs);
  }
  // Chain timeouts for very long delays
  return setTimeout(() => {
    const remaining = delayMs - MAX_TIMEOUT;
    safeSetTimeout(cb, remaining);
  }, MAX_TIMEOUT);
}

// Retryable HTTP status codes
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

// Retry delays in ms: 1s, 2s, 4s (exponential backoff)
const RETRY_DELAYS = [1_000, 2_000, 4_000] as const;
const MAX_RETRIES = 3;

// Recovery loop interval (60s)
const RECOVERY_POLL_MS = 60_000;

// TOO_EARLY retry delay (30s)
const TOO_EARLY_RETRY_MS = 30_000;

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
  private recoveryTimer: NodeJS.Timeout | null = null;
  private isRecoveryRunning = false;

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
      this.startRecoveryLoop();
    }
  }

  dispose(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.stopRecoveryLoop();
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

    this.applyToken(rawToken);
  }

  /**
   * Parse JWT and update internal state.
   * Returns true if the token is valid, false otherwise.
   */
  private applyToken(rawToken: string): boolean {
    // Decode JWT payload (base64url, no signature verification)
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
      return false;
    }

    // Validate exp range (C-03)
    const exp = payload['exp'];
    if (typeof exp !== 'number') {
      this.state = 'error';
      console.error(`${LOG_PREFIX} JWT missing exp claim`);
      return false;
    }

    const now = Math.floor(Date.now() / 1000);
    const tenYears = 10 * 365 * 24 * 60 * 60;
    const oneYear = 365 * 24 * 60 * 60;
    if (exp < now - tenYears || exp > now + oneYear) {
      this.state = 'error';
      console.error(`${LOG_PREFIX} JWT exp out of valid range`);
      return false;
    }

    // Extract sessionId (JWT standard 'sub' first, 'sessionId' fallback for compat)
    const sessionId = payload['sub'] ?? payload['sessionId'];
    if (typeof sessionId !== 'string' || !sessionId) {
      this.state = 'error';
      console.error(`${LOG_PREFIX} JWT missing sub/sessionId claim`);
      return false;
    }

    this.token = rawToken;
    this.sessionId = sessionId;
    this.expiresAt = exp;

    // Check expiration
    if (exp < now) {
      this.state = 'expired';
      console.error(`${LOG_PREFIX} Token already expired`);
      return false;
    } else {
      this.state = 'active';
      console.error(`${LOG_PREFIX} Token loaded, expires in ${exp - now}s`);
      return true;
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
    // MCP-05: isRenewing concurrency guard
    if (this.isRenewing) {
      console.error(`${LOG_PREFIX} Renewal already in progress, skipping`);
      return;
    }
    if (!this.sessionId || !this.token) return;

    this.isRenewing = true;
    console.error(`${LOG_PREFIX} Renewing session...`);

    try {
      const result = await this.retryRenewal();
      if (!result) return; // Error already handled in retryRenewal/handleRenewalError

      // Write file first, then update memory (H-02 defense)
      if (this.dataDir) {
        await this.writeMcpToken(result.token);
      }

      this.token = result.token;
      this.sessionId = result.id;
      this.expiresAt = result.expiresAt;
      this.renewalCount = result.renewalCount;
      if (typeof result.maxRenewals === 'number') {
        this.maxRenewals = result.maxRenewals;
      }
      this.state = 'active';
      this.stopRecoveryLoop();

      console.error(
        `${LOG_PREFIX} Renewed (${this.renewalCount}/${this.maxRenewals === Infinity ? 'inf' : this.maxRenewals})`,
      );

      this.scheduleRenewal();
    } catch (err) {
      // Unexpected error (should have been handled in retryRenewal)
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${LOG_PREFIX} Unexpected renewal error: ${msg}`);
      this.state = 'error';
      this.startRecoveryLoop();
    } finally {
      this.isRenewing = false;
    }
  }

  /**
   * Attempt renewal with exponential backoff retry (MCP-04, SM-11).
   *
   * Only retries on NETWORK errors and retryable HTTP statuses (429, 500, 502, 503, 504).
   * Returns renewal data on success, null on handled failure.
   */
  private async retryRenewal(): Promise<{
    token: string;
    id: string;
    expiresAt: number;
    renewalCount: number;
    maxRenewals?: number;
  } | null> {
    const url = `${this.baseUrl}/v1/sessions/${this.sessionId}/renew`;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.token}`,
            'User-Agent': '@waiaas/mcp/0.0.0',
          },
          body: JSON.stringify({}),
        });

        if (res.ok) {
          return await res.json() as {
            token: string;
            id: string;
            expiresAt: number;
            renewalCount: number;
            maxRenewals?: number;
          };
        }

        // Non-OK response -- handle specific error codes
        const status = res.status;
        const body = await res.json().catch(() => null) as Record<string, unknown> | null;
        const errorCode = body?.['code'] as string | undefined;

        // 409 RENEWAL_CONFLICT (MCP-05, CONC-02)
        if (status === 409) {
          await this.handleConflict();
          return null;
        }

        // 400 TOO_EARLY -- wait 30s, retry once (no exponential backoff)
        if (status === 400 && (errorCode === 'RENEWAL_TOO_EARLY' || !errorCode)) {
          this.handleTooEarly();
          return null;
        }

        // 403 LIMIT or LIFETIME
        if (status === 403) {
          const msg = errorCode === 'SESSION_LIFETIME_EXPIRED'
            ? 'Session lifetime expired'
            : 'Renewal limit exceeded';
          console.error(`${LOG_PREFIX} ${msg}`);
          this.state = 'expired';
          this.startRecoveryLoop();
          return null;
        }

        // 401 SESSION_EXPIRED
        if (status === 401) {
          console.error(`${LOG_PREFIX} Session expired (401)`);
          this.state = 'expired';
          this.startRecoveryLoop();
          return null;
        }

        // Retryable HTTP status -- retry with backoff
        if (RETRYABLE_STATUSES.has(status) && attempt < MAX_RETRIES) {
          const delay = RETRY_DELAYS[attempt]!;
          console.error(
            `${LOG_PREFIX} Renewal retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms (HTTP ${status})`,
          );
          await this.delay(delay);
          continue;
        }

        // Non-retryable or max retries exhausted
        const errMsg = body?.['message'] ?? res.statusText;
        console.error(`${LOG_PREFIX} Renewal failed: ${status} ${errMsg}`);
        this.state = 'error';
        this.startRecoveryLoop();
        return null;
      } catch (err) {
        // Network error -- retry with backoff
        if (attempt < MAX_RETRIES) {
          const delay = RETRY_DELAYS[attempt]!;
          console.error(
            `${LOG_PREFIX} Renewal retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms (network error)`,
          );
          await this.delay(delay);
          continue;
        }

        // All retries exhausted
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`${LOG_PREFIX} Renewal failed after ${MAX_RETRIES} retries: ${msg}`);
        this.state = 'error';
        this.startRecoveryLoop();
        return null;
      }
    }

    return null; // Should not reach here
  }

  /**
   * Handle 409 RENEWAL_CONFLICT (MCP-05, CONC-02).
   *
   * Another process already renewed the token. Check if file has a newer valid token.
   */
  private async handleConflict(): Promise<void> {
    console.error(`${LOG_PREFIX} Renewal conflict (409), checking current token`);

    if (!this.dataDir) {
      console.error(`${LOG_PREFIX} No dataDir, cannot check file for newer token`);
      this.state = 'expired';
      this.startRecoveryLoop();
      return;
    }

    try {
      const fileToken = await this.readMcpToken();

      // If file token is different from memory token
      if (fileToken && fileToken !== this.token) {
        // Try to apply the new token
        if (this.applyToken(fileToken)) {
          console.error(`${LOG_PREFIX} Found valid newer token in file, rescheduling`);
          this.scheduleRenewal();
          return;
        }
      }

      // Same token or invalid -- start recovery
      console.error(`${LOG_PREFIX} No valid newer token in file`);
      this.state = 'expired';
      this.startRecoveryLoop();
    } catch {
      // File read failed
      console.error(`${LOG_PREFIX} Failed to read token file after conflict`);
      this.state = 'expired';
      this.startRecoveryLoop();
    }
  }

  /**
   * Handle 400 TOO_EARLY: wait 30s and retry once.
   */
  private handleTooEarly(): void {
    console.error(`${LOG_PREFIX} Renewal too early, retrying in 30s`);
    this.timer = safeSetTimeout(() => {
      void this.renew();
    }, TOO_EARLY_RETRY_MS);
  }

  /**
   * Recovery loop (SMGI-D03): polls readMcpToken every 60s when expired/error.
   */
  private startRecoveryLoop(): void {
    if (this.isRecoveryRunning) {
      return;
    }
    if (!this.dataDir) {
      console.error(`${LOG_PREFIX} No dataDir, recovery loop cannot poll for token`);
      return;
    }

    this.isRecoveryRunning = true;
    console.error(`${LOG_PREFIX} Starting recovery loop (polling every 60s)`);

    this.recoveryTimer = safeSetTimeout(() => {
      void this.recoveryPoll();
    }, RECOVERY_POLL_MS);
  }

  private stopRecoveryLoop(): void {
    if (this.recoveryTimer) {
      clearTimeout(this.recoveryTimer);
      this.recoveryTimer = null;
    }
    this.isRecoveryRunning = false;
  }

  private async recoveryPoll(): Promise<void> {
    if (!this.isRecoveryRunning || !this.dataDir) return;

    try {
      const fileToken = await this.readMcpToken();

      if (fileToken && fileToken !== this.token) {
        if (this.applyToken(fileToken)) {
          console.error(`${LOG_PREFIX} Recovery: found valid token, resuming active state`);
          this.stopRecoveryLoop();
          this.scheduleRenewal();
          return;
        }
      }
    } catch {
      // File not readable, continue polling
    }

    // Schedule next poll
    if (this.isRecoveryRunning) {
      this.recoveryTimer = safeSetTimeout(() => {
        void this.recoveryPoll();
      }, RECOVERY_POLL_MS);
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

  /**
   * Async delay helper (uses real setTimeout, not safeSetTimeout).
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
