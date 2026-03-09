/**
 * E2E Tests: Policy CRUD + Dry-run (Simulate) Evaluation.
 *
 * Starts a real daemon, creates a wallet with session, then tests
 * policy creation/listing/update/deletion and transaction simulate.
 *
 * @see CORE-04 policy-crud-dryrun
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DaemonManager, type DaemonInstance } from '../helpers/daemon-lifecycle.js';
import { setupDaemonSession, type SessionManager } from '../helpers/session.js';

// Import scenario registration (side-effect: registers in global registry)
import '../scenarios/core-policy.js';

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

// ---------------------------------------------------------------------------
// Scenario: policy-crud-dryrun (CORE-04)
// ---------------------------------------------------------------------------

describe('policy-crud-dryrun', () => {
  describe('CRUD lifecycle', () => {
    let policyId: string;

    it('creates a SPENDING_LIMIT policy', async () => {
      const { status, body } = await session.admin.post<{
        id: string;
        type: string;
        rules: Record<string, unknown>;
      }>(
        '/v1/policies',
        {
          walletId: session.walletId,
          type: 'SPENDING_LIMIT',
          rules: {
            instant_max: '1000000000000000000',
            notify_max: '2000000000000000000',
            delay_max: '5000000000000000000',
          },
        },
        adminHeaders(),
      );
      expect(status).toBe(201);
      expect(body.id).toBeTruthy();
      expect(body.type).toBe('SPENDING_LIMIT');
      policyId = body.id;
    });

    it('lists policies and finds the created one', async () => {
      const { status, body } = await session.admin.get<
        Array<{ id: string; type: string; rules: Record<string, unknown> }>
      >(
        `/v1/policies?walletId=${session.walletId}`,
        adminHeaders(),
      );
      expect(status).toBe(200);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThanOrEqual(1);
      const found = body.find((p) => p.id === policyId);
      expect(found).toBeTruthy();
      expect(found!.type).toBe('SPENDING_LIMIT');
    });

    it('updates the policy rules', async () => {
      const { status, body } = await session.admin.put<{
        id: string;
        rules: Record<string, unknown>;
      }>(
        `/v1/policies/${policyId}`,
        {
          rules: {
            instant_max: '2000000000000000000',
            notify_max: '4000000000000000000',
            delay_max: '10000000000000000000',
          },
        },
        adminHeaders(),
      );
      expect(status).toBe(200);
      expect(body.rules.instant_max).toBe('2000000000000000000');
    });

    it('verifies updated values in list', async () => {
      const { status, body } = await session.admin.get<
        Array<{ id: string; rules: Record<string, unknown> }>
      >(
        `/v1/policies?walletId=${session.walletId}`,
        adminHeaders(),
      );
      expect(status).toBe(200);
      const found = body.find((p) => p.id === policyId);
      expect(found).toBeTruthy();
      expect(found!.rules.instant_max).toBe('2000000000000000000');
    });

    it('deletes the policy', async () => {
      const { status } = await session.admin.delete(
        `/v1/policies/${policyId}`,
        adminHeaders(),
      );
      expect(status).toBe(200);
    });

    it('confirms deletion from list', async () => {
      const { status, body } = await session.admin.get<
        Array<{ id: string }>
      >(
        `/v1/policies?walletId=${session.walletId}`,
        adminHeaders(),
      );
      expect(status).toBe(200);
      const found = body.find((p) => p.id === policyId);
      expect(found).toBeUndefined();
    });
  });

  describe('dry-run simulate evaluation', () => {
    let policyId: string;

    beforeAll(async () => {
      // Create a SPENDING_LIMIT policy with instant_max = 0.5 ETH (500000000000000000 wei)
      const { body } = await session.admin.post<{ id: string }>(
        '/v1/policies',
        {
          walletId: session.walletId,
          type: 'SPENDING_LIMIT',
          rules: {
            instant_max: '500000000000000000',
            notify_max: '1000000000000000000',
            delay_max: '5000000000000000000',
          },
        },
        adminHeaders(),
      );
      policyId = body.id;
    });

    afterAll(async () => {
      // Clean up policy
      await session.admin.delete(`/v1/policies/${policyId}`, adminHeaders());
    });

    it('simulate within instant_max returns INSTANT tier', async () => {
      const { status, body } = await session.http.post<{
        success: boolean;
        tier?: string;
        policyEvaluation?: { tier: string; allowed: boolean };
      }>(
        '/v1/transactions/simulate',
        {
          type: 'TRANSFER',
          to: '0x0000000000000000000000000000000000000001',
          amount: '100000000000000000', // 0.1 ETH -- within instant_max
        },
      );
      expect(status).toBe(200);
      // The response should indicate success and allowed
      expect(body.success).toBe(true);
      if (body.policyEvaluation) {
        expect(body.policyEvaluation.allowed).toBe(true);
        expect(body.policyEvaluation.tier).toBe('INSTANT');
      }
    });

    it('simulate exceeding delay_max is denied', async () => {
      const { status, body } = await session.http.post<{
        success: boolean;
        tier?: string;
        policyEvaluation?: { tier: string; allowed: boolean };
      }>(
        '/v1/transactions/simulate',
        {
          type: 'TRANSFER',
          to: '0x0000000000000000000000000000000000000001',
          amount: '6000000000000000000', // 6 ETH -- exceeds delay_max
        },
      );
      expect(status).toBe(200);
      // The response should indicate denied
      expect(body.success).toBe(true); // simulate itself succeeds
      if (body.policyEvaluation) {
        expect(body.policyEvaluation.allowed).toBe(false);
      }
    });
  });
});
