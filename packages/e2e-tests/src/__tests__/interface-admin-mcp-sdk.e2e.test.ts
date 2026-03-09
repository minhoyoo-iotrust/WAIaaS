/**
 * E2E Tests: Admin UI + Settings, MCP stdio, SDK connectivity.
 *
 * Starts a real daemon, then verifies non-REST interfaces:
 * - Admin UI serves HTML at root
 * - Admin Settings CRUD (GET/PUT) works
 * - MCP server starts via stdio and responds to tools/list + tool call
 * - SDK creates session, calls getWalletInfo + getConnectInfo
 *
 * @see IFACE-01 admin-ui-settings
 * @see IFACE-02 mcp-stdio-tools
 * @see IFACE-03 sdk-connectivity
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'node:path';
import { DaemonManager, type DaemonInstance } from '../helpers/daemon-lifecycle.js';
import { setupDaemonSession, type SessionManager } from '../helpers/session.js';
import { E2EHttpClient } from '../helpers/http-client.js';

// Import scenario registrations (side-effect: registers in global registry)
import '../scenarios/interface-admin-mcp-sdk.js';

const daemonManager = new DaemonManager();
let daemon: DaemonInstance;
let session: SessionManager;
let token: string;

beforeAll(async () => {
  daemon = await daemonManager.start();
  const result = await setupDaemonSession(daemon.baseUrl, daemon.masterPassword);
  session = result.session;
  token = result.token;
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

// ---------------------------------------------------------------------------
// Scenario 1: admin-ui-settings (IFACE-01)
// ---------------------------------------------------------------------------

describe('admin-ui-settings', () => {
  it('serves Admin UI at root path', async () => {
    const res = await fetch(daemon.baseUrl);
    expect(res.status).toBe(200);
    const contentType = res.headers.get('content-type') ?? '';
    expect(contentType).toContain('text/html');
  });

  it('reads current settings via GET /v1/admin/settings', async () => {
    const adminClient = new E2EHttpClient(daemon.baseUrl);
    const { status, body } = await adminClient.get<Record<string, unknown>>(
      '/v1/admin/settings',
      adminHeaders(),
    );
    expect(status).toBe(200);
    expect(typeof body).toBe('object');
    expect(body).not.toBeNull();
  });

  it('updates a setting via PUT and reads back', async () => {
    const adminClient = new E2EHttpClient(daemon.baseUrl);

    // Update display_currency to KRW
    const putRes = await adminClient.put(
      '/v1/admin/settings',
      { display_currency: 'KRW' },
      adminHeaders(),
    );
    expect(putRes.status).toBe(200);

    // Read back and verify
    const getRes = await adminClient.get<Record<string, unknown>>(
      '/v1/admin/settings',
      adminHeaders(),
    );
    expect(getRes.status).toBe(200);
    expect(getRes.body['display_currency']).toBe('KRW');

    // Reset to USD
    await adminClient.put(
      '/v1/admin/settings',
      { display_currency: 'USD' },
      adminHeaders(),
    );
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: mcp-stdio-tools (IFACE-02)
// ---------------------------------------------------------------------------

describe('mcp-stdio-tools', () => {
  it('connects via stdio, lists tools, and calls get-balance', async () => {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');

    // Resolve MCP server path (monorepo: packages/mcp/dist/index.js)
    const mcpPath = join(
      new URL('.', import.meta.url).pathname,
      '..', '..', '..', 'mcp', 'dist', 'index.js',
    );

    const transport = new StdioClientTransport({
      command: 'node',
      args: [mcpPath],
      env: {
        ...process.env,
        WAIAAS_BASE_URL: daemon.baseUrl,
        WAIAAS_SESSION_TOKEN: token,
      } as Record<string, string>,
    });

    const client = new Client({ name: 'e2e-test', version: '1.0.0' });

    try {
      await client.connect(transport);

      // List tools -- should have tools registered
      const result = await client.listTools();
      expect(result.tools).toBeDefined();
      expect(Array.isArray(result.tools)).toBe(true);
      expect(result.tools.length).toBeGreaterThan(0);

      // Call get-balance -- may error (no wallet associated with network) but should not crash
      const callResult = await client.callTool({ name: 'get-balance', arguments: {} });
      expect(callResult).toBeDefined();
    } finally {
      try {
        await client.close();
      } catch {
        // Ignore close errors
      }
    }
  }, 15_000);
});

// ---------------------------------------------------------------------------
// Scenario 3: sdk-connectivity (IFACE-03)
// ---------------------------------------------------------------------------

describe('sdk-connectivity', () => {
  it('creates SDK client and calls getWalletInfo + getConnectInfo', async () => {
    const { WAIaaSClient } = await import('@waiaas/sdk');

    const sdkClient = new WAIaaSClient({
      baseUrl: daemon.baseUrl,
      sessionToken: token,
    });

    // getWalletInfo -- returns wallet address info
    const walletInfo = await sdkClient.getWalletInfo();
    expect(walletInfo).toBeDefined();
    expect(walletInfo.walletId).toBeTruthy();

    // getConnectInfo -- returns session + wallets + capabilities
    const connectInfo = await sdkClient.getConnectInfo();
    expect(connectInfo).toBeDefined();
    expect(connectInfo.session).toBeDefined();
    expect(connectInfo.wallets).toBeDefined();
    expect(Array.isArray(connectInfo.wallets)).toBe(true);
    expect(connectInfo.wallets.length).toBeGreaterThanOrEqual(1);
  });
});
