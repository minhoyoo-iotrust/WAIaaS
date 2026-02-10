/**
 * E2E Agent Management tests (E-05 to E-07).
 *
 * Tests agent creation, address lookup, and balance query via mock adapter.
 * Uses startTestDaemonWithAdapter for full pipeline support without real Solana RPC.
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import type { ManualHarness } from './helpers/daemon-harness.js';
import {
  initTestDataDir,
  startTestDaemonWithAdapter,
  waitForHealth,
  fetchApi,
} from './helpers/daemon-harness.js';

describe('E2E Agent Management', () => {
  let harness: ManualHarness;
  let agentId: string;

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

  test('E-05: POST /v1/agents creates agent with Solana address', async () => {
    const res = await fetchApi(harness, '/v1/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'test-agent', chain: 'solana', network: 'devnet' }),
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
    expect(body.name).toBe('test-agent');
    expect(body.status).toBe('ACTIVE');

    // Store agentId for subsequent tests
    agentId = body.id;
  });

  test('E-06: GET /v1/wallet/address returns base58 public key', async () => {
    const res = await fetchApi(harness, '/v1/wallet/address', {
      headers: { 'X-Agent-Id': agentId },
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
      headers: { 'X-Agent-Id': agentId },
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
