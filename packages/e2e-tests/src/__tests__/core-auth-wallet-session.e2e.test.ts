/**
 * E2E Tests: Core Auth, Wallet CRUD, Multi-wallet Session.
 *
 * Starts a real daemon, performs REST API calls, verifies full lifecycle.
 * Uses DaemonManager for process lifecycle and SessionManager for auth.
 *
 * @see CORE-01 auth-session-crud
 * @see CORE-02 wallet-crud
 * @see CORE-03 multi-wallet-session
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DaemonManager, type DaemonInstance } from '../helpers/daemon-lifecycle.js';
import { setupDaemonSession } from '../helpers/session.js';
import { E2EHttpClient } from '../helpers/http-client.js';

// Import scenario registrations (side-effect: registers in global registry)
import '../scenarios/core-auth-wallet-session.js';

const daemonManager = new DaemonManager();
let daemon: DaemonInstance;

beforeAll(async () => {
  daemon = await daemonManager.start();
}, 30_000);

afterAll(async () => {
  await daemonManager.stop();
}, 10_000);

// ---------------------------------------------------------------------------
// Scenario 1: auth-session-crud (CORE-01)
// ---------------------------------------------------------------------------

describe('auth-session-crud', () => {
  it('creates a session via setupDaemonSession', async () => {
    const { session, token } = await setupDaemonSession(daemon.baseUrl, daemon.masterPassword);
    expect(token).toBeTruthy();
    expect(session.sessionId).toBeTruthy();
    expect(session.walletId).toBeTruthy();

    // List sessions via masterAuth -- should have at least 1
    const { status, body } = await session.admin.get<{
      data: Array<{ id: string }>;
      total: number;
      limit: number;
      offset: number;
    }>(
      '/v1/sessions',
      { headers: { 'X-Master-Password': daemon.masterPassword } },
    );
    expect(status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(1);

    // Clean up
    await session.deleteSession();
  });

  it('rotates token and validates new token works', async () => {
    const { session } = await setupDaemonSession(daemon.baseUrl, daemon.masterPassword);

    // Small delay to ensure iat changes (JWT iat is seconds-precision)
    await new Promise((r) => setTimeout(r, 1100));

    // Rotate token (masterAuth)
    const newToken = await session.rotateToken();
    expect(newToken).toBeTruthy();

    // New token should work for session-auth requests (GET /v1/wallet/address uses sessionAuth)
    const { status } = await session.http.get('/v1/wallet/address');
    expect(status).toBe(200);

    // Clean up
    await session.deleteSession();
  });

  it('deletes session and confirms old token is invalid', async () => {
    const { session, token } = await setupDaemonSession(daemon.baseUrl, daemon.masterPassword);
    const sessionId = session.sessionId!;
    expect(sessionId).toBeTruthy();

    // Delete session
    await session.deleteSession();

    // Old token should now be invalid (401)
    const staleClient = new E2EHttpClient(daemon.baseUrl, token);
    const { status } = await staleClient.get('/v1/wallet/address');
    expect(status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: wallet-crud (CORE-02)
// ---------------------------------------------------------------------------

describe('wallet-crud', () => {
  let adminHeaders: { headers: Record<string, string> };
  let adminClient: E2EHttpClient;

  beforeAll(() => {
    adminHeaders = { headers: { 'X-Master-Password': daemon.masterPassword } };
    adminClient = new E2EHttpClient(daemon.baseUrl);
  });

  it('creates EVM and Solana wallets', async () => {
    // Create EVM wallet (chain is 'ethereum', not 'evm')
    const evmRes = await adminClient.post<{ id: string; publicKey: string; chain: string }>(
      '/v1/wallets',
      { name: 'e2e-evm', chain: 'ethereum', environment: 'testnet' },
      adminHeaders,
    );
    expect(evmRes.status).toBe(201);
    expect(evmRes.body.id).toBeTruthy();
    expect(evmRes.body.publicKey).toBeTruthy();

    // Create Solana wallet
    const solRes = await adminClient.post<{ id: string; publicKey: string; chain: string }>(
      '/v1/wallets',
      { name: 'e2e-solana', chain: 'solana', environment: 'testnet' },
      adminHeaders,
    );
    expect(solRes.status).toBe(201);
    expect(solRes.body.id).toBeTruthy();

    // Clean up
    await adminClient.delete(`/v1/wallets/${evmRes.body.id}`, adminHeaders);
    await adminClient.delete(`/v1/wallets/${solRes.body.id}`, adminHeaders);
  });

  it('lists wallets and retrieves single wallet', async () => {
    // Create test wallets
    const evmRes = await adminClient.post<{ id: string; chain: string }>(
      '/v1/wallets',
      { name: 'e2e-evm-list', chain: 'ethereum', environment: 'testnet' },
      adminHeaders,
    );
    expect(evmRes.status).toBe(201);

    const solRes = await adminClient.post<{ id: string; chain: string }>(
      '/v1/wallets',
      { name: 'e2e-sol-list', chain: 'solana', environment: 'testnet' },
      adminHeaders,
    );
    expect(solRes.status).toBe(201);

    // List wallets -- response is { items: [...] }
    const listRes = await adminClient.get<{ items: Array<{ id: string; chain: string }> }>(
      '/v1/wallets',
      adminHeaders,
    );
    expect(listRes.status).toBe(200);
    expect(listRes.body.items.length).toBeGreaterThanOrEqual(2);

    const ids = listRes.body.items.map((w) => w.id);
    expect(ids).toContain(evmRes.body.id);
    expect(ids).toContain(solRes.body.id);

    // Single get
    const singleRes = await adminClient.get<{ id: string; chain: string }>(
      `/v1/wallets/${evmRes.body.id}`,
      adminHeaders,
    );
    expect(singleRes.status).toBe(200);
    expect(singleRes.body.chain).toBe('ethereum');

    // Clean up
    await adminClient.delete(`/v1/wallets/${evmRes.body.id}`, adminHeaders);
    await adminClient.delete(`/v1/wallets/${solRes.body.id}`, adminHeaders);
  });

  it('deletes wallets and confirms removal from list', async () => {
    const createRes = await adminClient.post<{ id: string }>(
      '/v1/wallets',
      { name: 'e2e-delete-test', chain: 'ethereum', environment: 'testnet' },
      adminHeaders,
    );
    expect(createRes.status).toBe(201);
    const walletId = createRes.body.id;

    // Delete (terminate)
    const deleteRes = await adminClient.delete(`/v1/wallets/${walletId}`, adminHeaders);
    expect(deleteRes.status).toBe(200);

    // Confirm gone from list (terminated wallets may still appear but with TERMINATED status)
    const listRes = await adminClient.get<{ items: Array<{ id: string; status: string }> }>(
      '/v1/wallets',
      adminHeaders,
    );
    // Check that the wallet is either absent or has TERMINATED status
    const wallet = listRes.body.items.find((w) => w.id === walletId);
    if (wallet) {
      expect(wallet.status).toBe('TERMINATED');
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: multi-wallet-session (CORE-03)
// ---------------------------------------------------------------------------

describe('multi-wallet-session', () => {
  let adminHeaders: { headers: Record<string, string> };
  let adminClient: E2EHttpClient;

  beforeAll(() => {
    adminHeaders = { headers: { 'X-Master-Password': daemon.masterPassword } };
    adminClient = new E2EHttpClient(daemon.baseUrl);
  });

  it('attaches and detaches wallets from a session', async () => {
    // Create 2 wallets
    const walletARes = await adminClient.post<{ id: string }>(
      '/v1/wallets',
      { name: 'wallet-a', chain: 'ethereum', environment: 'testnet' },
      adminHeaders,
    );
    expect(walletARes.status).toBe(201);
    const walletBRes = await adminClient.post<{ id: string }>(
      '/v1/wallets',
      { name: 'wallet-b', chain: 'ethereum', environment: 'testnet' },
      adminHeaders,
    );
    expect(walletBRes.status).toBe(201);
    const walletAId = walletARes.body.id;
    const walletBId = walletBRes.body.id;

    // Create session for wallet-a
    const sessionRes = await adminClient.post<{ id: string; token: string }>(
      '/v1/sessions',
      { walletId: walletAId },
      adminHeaders,
    );
    expect(sessionRes.status).toBe(201);
    const sessionId = sessionRes.body.id;

    // List session wallets -- response is { wallets: [...] }
    const list1 = await adminClient.get<{ wallets: Array<{ id: string }> }>(
      `/v1/sessions/${sessionId}/wallets`,
      adminHeaders,
    );
    expect(list1.status).toBe(200);
    expect(list1.body.wallets.length).toBe(1);
    expect(list1.body.wallets[0]!.id).toBe(walletAId);

    // Attach wallet-b (returns 201)
    const attachRes = await adminClient.post(
      `/v1/sessions/${sessionId}/wallets`,
      { walletId: walletBId },
      adminHeaders,
    );
    expect(attachRes.status).toBe(201);

    // List session wallets -- should have 2
    const list2 = await adminClient.get<{ wallets: Array<{ id: string }> }>(
      `/v1/sessions/${sessionId}/wallets`,
      adminHeaders,
    );
    expect(list2.status).toBe(200);
    expect(list2.body.wallets.length).toBe(2);
    const walletIds2 = list2.body.wallets.map((w) => w.id);
    expect(walletIds2).toContain(walletAId);
    expect(walletIds2).toContain(walletBId);

    // Detach wallet-b (returns 204)
    const detachRes = await adminClient.delete(
      `/v1/sessions/${sessionId}/wallets/${walletBId}`,
      adminHeaders,
    );
    expect(detachRes.status).toBe(204);

    // List session wallets -- should have only wallet-a
    const list3 = await adminClient.get<{ wallets: Array<{ id: string }> }>(
      `/v1/sessions/${sessionId}/wallets`,
      adminHeaders,
    );
    expect(list3.status).toBe(200);
    expect(list3.body.wallets.length).toBe(1);
    expect(list3.body.wallets[0]!.id).toBe(walletAId);

    // Clean up
    await adminClient.delete(`/v1/sessions/${sessionId}`, adminHeaders);
    await adminClient.delete(`/v1/wallets/${walletAId}`, adminHeaders);
    await adminClient.delete(`/v1/wallets/${walletBId}`, adminHeaders);
  });
});
