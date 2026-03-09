/**
 * Session + HTTP helpers integration test.
 *
 * Starts a real daemon and tests:
 * - setupDaemonSession one-line convenience
 * - E2EHttpClient auto auth token attachment
 * - Session lifecycle: create -> renew -> delete
 *
 * WAIaaS auth model:
 * - masterAuth: X-Master-Password header
 * - sessionAuth: Authorization: Bearer wai_sess_<jwt>
 * - POST /v1/wallets (masterAuth, createSession: true) -> wallet + session token
 * - PUT /v1/sessions/:id/renew (sessionAuth) -> renewed token
 * - DELETE /v1/sessions/:id (masterAuth) -> revoke
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DaemonManager, type DaemonInstance } from '../helpers/daemon-lifecycle.js';
import { E2EHttpClient } from '../helpers/http-client.js';
import { SessionManager, setupDaemonSession } from '../helpers/session.js';

// __tests__/ -> src/ -> e2e-tests/ -> packages/cli/bin/waiaas
const CLI_BIN = resolve(
  new URL('.', import.meta.url).pathname,
  '..', '..', '..', 'cli', 'bin', 'waiaas',
);
const skipReason = !existsSync(CLI_BIN)
  ? 'CLI not built (run pnpm turbo run build --filter=@waiaas/cli first)'
  : undefined;

describe.skipIf(!!skipReason)('Session + HTTP helpers', { timeout: 30_000 }, () => {
  let daemon: DaemonManager;
  let instance: DaemonInstance;

  beforeAll(async () => {
    daemon = new DaemonManager();
    instance = await daemon.start();
  });

  afterAll(async () => {
    await daemon.stop().catch(() => {});
  });

  it('setupDaemonSession: creates wallet + session in one call', async () => {
    const { session, http, token } = await setupDaemonSession(
      instance.baseUrl,
      instance.masterPassword,
    );

    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');
    // Token should have wai_sess_ prefix + JWT (3 dot-separated parts)
    expect(token.startsWith('wai_sess_')).toBe(true);

    // Authenticated API call via sessionAuth
    const { status, body } = await http.get<{ address: string }>('/v1/wallet/address');
    expect(status).toBe(200);
    expect(body).toHaveProperty('address');

    // Cleanup
    await session.deleteSession();
  });

  it('HTTP client auto-attaches auth token', async () => {
    const { http, session } = await setupDaemonSession(
      instance.baseUrl,
      instance.masterPassword,
    );

    // Without token -> 401
    const noAuth = new E2EHttpClient(instance.baseUrl);
    const { status: unauthed } = await noAuth.get('/v1/wallet/address');
    expect(unauthed).toBe(401);

    // With token -> 200
    const { status: authed } = await http.get('/v1/wallet/address');
    expect(authed).toBe(200);

    await session.deleteSession();
  });

  it('session lifecycle: create -> rotate -> delete', async () => {
    // First create a wallet via setupDaemonSession
    const { session: initialSession } = await setupDaemonSession(
      instance.baseUrl,
      instance.masterPassword,
    );
    const walletId = initialSession.walletId!;
    await initialSession.deleteSession();

    // Create a new session for that wallet
    const session = new SessionManager(instance.baseUrl, instance.masterPassword);
    const token = await session.createSession(walletId);
    expect(token).toBeTruthy();
    expect(token.startsWith('wai_sess_')).toBe(true);

    // Rotate token (immediate replacement, no timing constraint)
    const newToken = await session.rotateToken();
    expect(newToken).toBeTruthy();
    expect(newToken.startsWith('wai_sess_')).toBe(true);

    // Rotated token works for API calls
    const { status } = await session.http.get('/v1/wallet/address');
    expect(status).toBe(200);

    // Delete
    await session.deleteSession();
    expect(session.token).toBeUndefined();
  });
});
