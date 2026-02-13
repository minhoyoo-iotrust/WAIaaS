/**
 * E2E Wallet Management tests (E-05 to E-07).
 *
 * Tests wallet creation, address lookup, and balance query via mock adapter.
 * Uses startTestDaemonWithAdapter for full pipeline support without real Solana RPC.
 *
 * Auth flow:
 * - E-05: POST /v1/wallets requires masterAuth (X-Master-Password header)
 * - E-06, E-07: GET /v1/wallet/* requires sessionAuth (Bearer token from session)
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import type { ManualHarness } from './helpers/daemon-harness.js';
import {
  initTestDataDir,
  startTestDaemonWithAdapter,
  waitForHealth,
  fetchApi,
} from './helpers/daemon-harness.js';

/**
 * Helper: create a session for the given wallet and return the JWT token.
 * Requires masterAuth (X-Master-Password) since POST /v1/sessions is admin-only.
 */
async function createTestSession(
  harness: ManualHarness,
  walletId: string,
): Promise<string> {
  const res = await fetchApi(harness, '/v1/sessions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Master-Password': harness.masterPassword,
    },
    body: JSON.stringify({ walletId }),
  });

  if (res.status !== 201) {
    const body = await res.text();
    throw new Error(`Failed to create session (${res.status}): ${body}`);
  }

  const body = (await res.json()) as { token: string };
  return body.token;
}

describe('E2E Wallet Management', () => {
  let harness: ManualHarness;
  let walletId: string;
  let sessionToken: string;

  beforeAll(async () => {
    const { dataDir } = await initTestDataDir();
    harness = await startTestDaemonWithAdapter(dataDir);
    await waitForHealth(harness);
  });

  afterAll(async () => {
    if (harness) {
      await harness.cleanup();
    }
  });

  test('E-05: POST /v1/wallets creates wallet with Solana address', async () => {
    const res = await fetchApi(harness, '/v1/wallets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Password': harness.masterPassword,
      },
      body: JSON.stringify({ name: 'test-wallet', chain: 'solana', network: 'devnet' }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      id: string;
      publicKey: string;
      chain: string;
      name: string;
      status: string;
    };
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('publicKey');
    expect(body.chain).toBe('solana');
    expect(body.name).toBe('test-wallet');
    expect(body.status).toBe('ACTIVE');

    // Store walletId for subsequent tests
    walletId = body.id;

    // Create a session for wallet/transaction endpoints (sessionAuth required)
    sessionToken = await createTestSession(harness, walletId);
  });

  test('E-06: GET /v1/wallet/address returns base58 public key', async () => {
    const res = await fetchApi(harness, '/v1/wallet/address', {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { address: string; chain: string; network: string };
    expect(body).toHaveProperty('address');
    // base58: alphanumeric string, 32-44 chars (no 0, O, I, l)
    expect(body.address).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    expect(body.chain).toBe('solana');
    expect(body.network).toBe('devnet');
  });

  test('E-07: GET /v1/wallet/balance returns SOL balance', async () => {
    const res = await fetchApi(harness, '/v1/wallet/balance', {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      balance: string;
      decimals: number;
      symbol: string;
    };
    expect(body).toHaveProperty('balance');
    // MockChainAdapter returns 1_000_000_000 (1 SOL in lamports)
    expect(body.balance).toBe('1000000000');
    expect(body.decimals).toBe(9);
    expect(body.symbol).toBe('SOL');
  });
});
