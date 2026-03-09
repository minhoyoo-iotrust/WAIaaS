/**
 * E2E Tests: Notification Channel, Token Registry CRUD, Connect-Info.
 *
 * Starts a real daemon, then verifies operational features:
 * - Notification status/test/log endpoints respond
 * - Token registry add/list/delete cycle
 * - Connect-info self-discovery returns session, wallets, capabilities
 *
 * @see IFACE-04 notification-channel
 * @see IFACE-05 token-registry-crud
 * @see IFACE-06 connect-info-discovery
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DaemonManager, type DaemonInstance } from '../helpers/daemon-lifecycle.js';
import { setupDaemonSession, type SessionManager } from '../helpers/session.js';
import { E2EHttpClient } from '../helpers/http-client.js';

// Import scenario registrations (side-effect: registers in global registry)
import '../scenarios/ops-notification-token-connectinfo.js';

const daemonManager = new DaemonManager();
let daemon: DaemonInstance;
let session: SessionManager;

beforeAll(async () => {
  daemon = await daemonManager.start();
  const result = await setupDaemonSession(daemon.baseUrl, daemon.masterPassword);
  session = result.session;
}, 30_000);

afterAll(async () => {
  await daemonManager.stop();
}, 10_000);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function adminHeaders(): { headers: Record<string, string> } {
  return { headers: { 'X-Master-Password': daemon.masterPassword } };
}

/**
 * DELETE with JSON body -- E2EHttpClient.delete does not support body,
 * so we use raw fetch for the token registry delete.
 */
async function deleteWithBody(
  url: string,
  body: unknown,
  headers: Record<string, string>,
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const contentType = res.headers.get('content-type') ?? '';
  const respBody = contentType.includes('application/json')
    ? await res.json()
    : await res.text();
  return { status: res.status, body: respBody };
}

// ---------------------------------------------------------------------------
// Scenario 1: notification-channel (IFACE-04)
// ---------------------------------------------------------------------------

describe('notification-channel', () => {
  it('queries notification status', async () => {
    const { status, body } = await session.admin.get<{
      channels?: unknown[];
      enabled?: boolean;
    }>('/v1/admin/notifications/status', adminHeaders());
    expect(status).toBe(200);
    expect(body).toBeDefined();
    // channels may be empty array if no channel configured
  });

  it('sends test notification (may fail gracefully if no channel configured)', async () => {
    const { status } = await session.admin.post(
      '/v1/admin/notifications/test',
      { message: 'e2e-test' },
      adminHeaders(),
    );
    // Accept 200 (success) or 400/422 (no channel configured) -- both are valid smoke outcomes
    expect([200, 400, 422]).toContain(status);
  });

  it('queries notification log', async () => {
    const { status, body } = await session.admin.get<{
      items?: unknown[];
      total?: number;
    }>('/v1/admin/notifications/log', adminHeaders());
    expect(status).toBe(200);
    expect(body).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: token-registry-crud (IFACE-05)
// ---------------------------------------------------------------------------

describe('token-registry-crud', () => {
  const testAddress = '0x1234567890abcdef1234567890abcdef12345678';
  const testNetwork = 'ethereum-sepolia';

  it('adds a custom token to registry', async () => {
    const { status, body } = await session.admin.post<{
      success?: boolean;
      token?: unknown;
    }>(
      '/v1/tokens',
      {
        network: testNetwork,
        address: testAddress,
        symbol: 'E2ETKN',
        name: 'E2E Test Token',
        decimals: 18,
      },
      adminHeaders(),
    );
    expect([200, 201]).toContain(status);
  });

  it('lists tokens and finds the custom token', async () => {
    const { status, body } = await session.admin.get<{
      tokens?: Array<{ symbol: string; address: string }>;
    }>(`/v1/tokens?network=${testNetwork}`, adminHeaders());
    expect(status).toBe(200);

    // Find the custom token in the list
    const tokens = body.tokens ?? (body as unknown as Array<{ symbol: string }>);
    const found = Array.isArray(tokens)
      ? tokens.find((t) => t.symbol === 'E2ETKN')
      : undefined;
    expect(found).toBeTruthy();
  });

  it('deletes the custom token and confirms removal', async () => {
    // DELETE /v1/tokens requires body: { network, address }
    const delResult = await deleteWithBody(
      `${daemon.baseUrl}/v1/tokens`,
      { network: testNetwork, address: testAddress },
      { 'X-Master-Password': daemon.masterPassword },
    );
    expect(delResult.status).toBe(200);

    // Confirm removal from list
    const { status, body } = await session.admin.get<{
      tokens?: Array<{ symbol: string }>;
    }>(`/v1/tokens?network=${testNetwork}`, adminHeaders());
    expect(status).toBe(200);
    const tokens = body.tokens ?? (body as unknown as Array<{ symbol: string }>);
    if (Array.isArray(tokens)) {
      const found = tokens.find((t) => t.symbol === 'E2ETKN');
      expect(found).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: connect-info-discovery (IFACE-06)
// ---------------------------------------------------------------------------

describe('connect-info-discovery', () => {
  it('returns session and wallets from connect-info', async () => {
    const { status, body } = await session.http.get<{
      session?: { id: string };
      wallets?: Array<{ id: string }>;
    }>('/v1/connect-info');
    expect(status).toBe(200);
    expect(body.session).toBeDefined();
    expect(body.session?.id).toBeTruthy();
    expect(body.wallets).toBeDefined();
    expect(Array.isArray(body.wallets)).toBe(true);
    expect(body.wallets!.length).toBeGreaterThanOrEqual(1);
  });

  it('includes capabilities in connect-info', async () => {
    const { status, body } = await session.http.get<{
      capabilities?: Record<string, unknown>;
      daemon?: Record<string, unknown>;
    }>('/v1/connect-info');
    expect(status).toBe(200);
    // Check that some form of capability or daemon info is present
    const hasCapabilities = body.capabilities !== undefined || body.daemon !== undefined;
    expect(hasCapabilities).toBe(true);
  });
});
