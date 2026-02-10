/**
 * E2E Transaction tests (E-08 to E-09).
 *
 * Tests transaction send and status polling via mock adapter.
 * Uses startTestDaemonWithAdapter for full pipeline support without real Solana RPC.
 *
 * Auth flow:
 * - Agent creation: masterAuth (X-Master-Password header)
 * - Session creation: masterAuth (X-Master-Password header)
 * - Transaction endpoints: sessionAuth (Bearer token from session)
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import type { ManualHarness } from './helpers/daemon-harness.js';
import {
  initTestDataDir,
  startTestDaemonWithAdapter,
  waitForHealth,
  fetchApi,
} from './helpers/daemon-harness.js';

describe('E2E Transaction', () => {
  let harness: ManualHarness;
  let agentId: string;
  let sessionToken: string;
  let txId: string;

  beforeAll(async () => {
    const { dataDir } = await initTestDataDir();
    harness = await startTestDaemonWithAdapter(dataDir);
    await waitForHealth(harness);

    // Create agent with masterAuth
    const agentRes = await fetchApi(harness, '/v1/agents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Password': harness.masterPassword,
      },
      body: JSON.stringify({ name: 'tx-test-agent', chain: 'solana', network: 'devnet' }),
    });
    const agentBody = (await agentRes.json()) as { id: string };
    agentId = agentBody.id;

    // Create session for sessionAuth on wallet/transaction endpoints
    const sessionRes = await fetchApi(harness, '/v1/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Password': harness.masterPassword,
      },
      body: JSON.stringify({ agentId }),
    });
    const sessionBody = (await sessionRes.json()) as { token: string };
    sessionToken = sessionBody.token;
  });

  afterAll(async () => {
    if (harness) {
      await harness.cleanup();
    }
  });

  test('E-08: POST /v1/transactions/send returns 201 with transaction ID', async () => {
    const res = await fetchApi(harness, '/v1/transactions/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        to: '11111111111111111111111111111112', // System program address as dummy recipient
        amount: '100000', // 0.0001 SOL in lamports
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; status: string };
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('status');
    expect(body.status).toBe('PENDING');

    txId = body.id;
  });

  test('E-09: GET /v1/transactions/:id shows status progression (poll to terminal)', async () => {
    // Poll for the transaction to reach a terminal state
    // With MockChainAdapter, it should reach CONFIRMED
    let status = '';
    let attempts = 0;
    const maxAttempts = 30; // 30 * 500ms = 15s max

    while (attempts < maxAttempts) {
      const res = await fetchApi(harness, `/v1/transactions/${txId}`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string };
      status = body.status;

      if (status === 'CONFIRMED' || status === 'FAILED' || status === 'CANCELLED') {
        break;
      }

      await new Promise((r) => setTimeout(r, 500));
      attempts++;
    }

    // With MockChainAdapter, pipeline should complete successfully
    expect(status).toBe('CONFIRMED');
  });
});
