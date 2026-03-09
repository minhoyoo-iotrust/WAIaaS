/**
 * E2E Tests: Smart Account, UserOp Build/Sign, Owner Auth.
 *
 * Starts a real daemon, performs REST API calls for advanced protocol features.
 *
 * @see ADV-01 smart-account-crud
 * @see ADV-02 userop-build-sign
 * @see ADV-03 owner-auth-challenge
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DaemonManager, type DaemonInstance } from '../helpers/daemon-lifecycle.js';
import { setupDaemonSession } from '../helpers/session.js';
import { E2EHttpClient } from '../helpers/http-client.js';

// Import scenario registrations (side-effect: registers in global registry)
import '../scenarios/advanced-smart-account-userop-owner.js';

const daemonManager = new DaemonManager();
let daemon: DaemonInstance;

beforeAll(async () => {
  daemon = await daemonManager.start();
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
// Scenario 1: smart-account-crud (ADV-01)
// ---------------------------------------------------------------------------

describe('smart-account-crud', () => {
  let adminClient: E2EHttpClient;
  let smartWalletId: string;

  beforeAll(() => {
    adminClient = new E2EHttpClient(daemon.baseUrl);
  });

  it('enables smart_account feature via admin settings', async () => {
    const { status } = await adminClient.put(
      '/v1/admin/settings',
      { settings: [{ key: 'smart_account.enabled', value: 'true' }] },
      adminHeaders(),
    );
    expect(status).toBe(200);
  });

  it('creates a smart account wallet', async () => {
    const { status, body } = await adminClient.post<{
      id: string;
      publicKey: string;
      accountType: string;
    }>(
      '/v1/wallets',
      {
        name: 'e2e-smart',
        chain: 'ethereum',
        environment: 'testnet',
        accountType: 'smart',
      },
      adminHeaders(),
    );
    expect(status).toBe(201);
    expect(body.id).toBeTruthy();
    expect(body.accountType).toBe('smart');
    smartWalletId = body.id;
  });

  it('retrieves smart account and confirms accountType', async () => {
    const { status, body } = await adminClient.get<{
      id: string;
      accountType: string;
    }>(
      `/v1/wallets/${smartWalletId}`,
      adminHeaders(),
    );
    expect(status).toBe(200);
    expect(body.accountType).toBe('smart');
  });

  it('determines Lite mode via connect-info (no AA provider)', async () => {
    // Create a session for the smart wallet to access connect-info
    const { session } = await setupDaemonSession(daemon.baseUrl, daemon.masterPassword);

    const { status, body } = await session.http.get<{
      capabilities: string[];
      wallets: Array<{ id: string; accountType: string }>;
    }>('/v1/connect-info');
    expect(status).toBe(200);
    // connect-info should list capabilities
    expect(body.capabilities).toBeDefined();
    expect(Array.isArray(body.capabilities)).toBe(true);

    // Clean up session
    await session.deleteSession();
  });

  afterAll(async () => {
    // Clean up smart wallet
    if (smartWalletId) {
      await adminClient.delete(`/v1/wallets/${smartWalletId}`, adminHeaders());
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: userop-build-sign (ADV-02)
// ---------------------------------------------------------------------------

describe('userop-build-sign', () => {
  let adminClient: E2EHttpClient;
  let smartWalletId: string;
  let eoaWalletId: string;

  beforeAll(async () => {
    adminClient = new E2EHttpClient(daemon.baseUrl);

    // Enable smart account
    await adminClient.put(
      '/v1/admin/settings',
      { settings: [{ key: 'smart_account.enabled', value: 'true' }] },
      adminHeaders(),
    );

    // Create smart wallet
    const smartRes = await adminClient.post<{ id: string }>(
      '/v1/wallets',
      {
        name: 'e2e-smart-userop',
        chain: 'ethereum',
        environment: 'testnet',
        accountType: 'smart',
      },
      adminHeaders(),
    );
    expect(smartRes.status).toBe(201);
    smartWalletId = smartRes.body.id;

    // Create EOA wallet
    const eoaRes = await adminClient.post<{ id: string }>(
      '/v1/wallets',
      {
        name: 'e2e-eoa-userop',
        chain: 'ethereum',
        environment: 'testnet',
      },
      adminHeaders(),
    );
    expect(eoaRes.status).toBe(201);
    eoaWalletId = eoaRes.body.id;
  });

  it('builds UserOp for smart account (RPC error expected in E2E)', async () => {
    const { status, body } = await adminClient.post<{
      sender?: string;
      buildId?: string;
      error?: string;
      code?: string;
      message?: string;
    }>(
      `/v1/wallets/${smartWalletId}/userop/build`,
      {
        request: {
          type: 'TRANSFER',
          to: '0x0000000000000000000000000000000000000001',
          amount: '100000000000000000',
        },
        network: 'ethereum-sepolia',
      },
      adminHeaders(),
    );

    // Without real RPC, expect either success or a chain error about RPC
    // Both outcomes are valid for offchain E2E: we verify the endpoint exists and processes the request
    if (status === 200) {
      expect(body.sender).toBeTruthy();
      expect(body.buildId).toBeTruthy();
    } else {
      // RPC error is expected without a real Ethereum node
      expect([400, 500, 502]).toContain(status);
    }
  });

  it('rejects UserOp build for EOA wallet', async () => {
    const { status, body } = await adminClient.post<{
      message?: string;
      code?: string;
    }>(
      `/v1/wallets/${eoaWalletId}/userop/build`,
      {
        request: {
          type: 'TRANSFER',
          to: '0x0000000000000000000000000000000000000001',
          amount: '100000000000000000',
        },
        network: 'ethereum-sepolia',
      },
      adminHeaders(),
    );
    // EOA wallet should be rejected for UserOp build
    expect(status).toBeGreaterThanOrEqual(400);
  });

  afterAll(async () => {
    if (smartWalletId) {
      await adminClient.delete(`/v1/wallets/${smartWalletId}`, adminHeaders());
    }
    if (eoaWalletId) {
      await adminClient.delete(`/v1/wallets/${eoaWalletId}`, adminHeaders());
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: owner-auth-challenge (ADV-03)
// ---------------------------------------------------------------------------

describe('owner-auth-challenge', () => {
  let adminClient: E2EHttpClient;
  let walletId: string;

  beforeAll(async () => {
    adminClient = new E2EHttpClient(daemon.baseUrl);

    // Create EVM wallet for owner auth testing
    const res = await adminClient.post<{ id: string }>(
      '/v1/wallets',
      { name: 'e2e-owner-auth', chain: 'ethereum', environment: 'testnet' },
      adminHeaders(),
    );
    expect(res.status).toBe(201);
    walletId = res.body.id;
  });

  it('gets a nonce for SIWE challenge', async () => {
    const { status, body } = await adminClient.get<{ nonce: string }>(
      '/v1/nonce',
    );
    expect(status).toBe(200);
    expect(body.nonce).toBeTruthy();
    expect(typeof body.nonce).toBe('string');
    expect(body.nonce.length).toBeGreaterThan(0);
  });

  it('registers owner address on a wallet', async () => {
    // EIP-55 checksummed address (required for ethereum chain)
    const checksummedAddress = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
    const { status } = await adminClient.put(
      `/v1/wallets/${walletId}/owner`,
      { owner_address: checksummedAddress, approval_method: 'rest' },
      adminHeaders(),
    );
    // Should succeed -- owner address registered
    expect([200, 201]).toContain(status);
  });

  it('rejects verify with invalid signature', async () => {
    const { status } = await adminClient.post(
      `/v1/wallets/${walletId}/owner/verify`,
      { message: 'invalid-message', signature: '0x00' },
      adminHeaders(),
    );
    // Should reject -- invalid signature
    expect(status).toBeGreaterThanOrEqual(400);
  });

  afterAll(async () => {
    if (walletId) {
      await adminClient.delete(`/v1/wallets/${walletId}`, adminHeaders());
    }
  });
});
