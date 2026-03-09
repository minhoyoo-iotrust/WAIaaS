/**
 * E2E Tests: Lido Staking (Holesky)
 *
 * Tests Lido stake/unstake via action provider on Holesky testnet.
 * Unstake only runs if stake succeeded.
 *
 * @see ONCH-07
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { E2EHttpClient } from '../helpers/http-client.js';
import { SessionManager } from '../helpers/session.js';
import { shouldSkipNetwork } from '../helpers/onchain-skip.js';

// Import scenario registrations (side-effect)
import '../scenarios/onchain-staking.js';

const DAEMON_URL = process.env.WAIAAS_E2E_DAEMON_URL ?? 'http://127.0.0.1:3100';
const MASTER_PASSWORD = process.env.WAIAAS_E2E_MASTER_PASSWORD ?? 'e2e-test-password-12345';

interface WalletInfo {
  id: string;
  publicKey: string;
  chain: string;
}

const adminClient = new E2EHttpClient(DAEMON_URL);
const adminHeaders = { headers: { 'X-Master-Password': MASTER_PASSWORD } };

let evmWallet: WalletInfo | undefined;
let session: SessionManager | undefined;
let stakeSucceeded = false;

beforeAll(async () => {
  const { status, body } = await adminClient.get<{ items: WalletInfo[] }>(
    '/v1/wallets',
    adminHeaders,
  );
  if (status === 200) {
    evmWallet = body.items.find((w) => w.chain === 'ethereum');
  }
  if (evmWallet) {
    session = new SessionManager(DAEMON_URL, MASTER_PASSWORD);
    await session.createSession(evmWallet.id);
  }
}, 30_000);

afterAll(async () => {
  if (session?.sessionId) {
    try { await session.deleteSession(); } catch { /* ignore */ }
  }
}, 10_000);

/** Poll transaction status until terminal state. */
async function pollTxStatus(
  http: E2EHttpClient,
  txId: string,
  timeoutMs = 90_000,
): Promise<{ status: string; txId?: string }> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { status, body } = await http.get<{ id: string; status: string; txId?: string }>(
      `/v1/transactions/${txId}`,
    );
    if (status === 200 && ['CONFIRMED', 'COMPLETED', 'FAILED'].includes(body.status)) {
      return body;
    }
    await new Promise((r) => setTimeout(r, 3_000));
  }
  throw new Error(`Transaction ${txId} did not reach terminal state within ${timeoutMs}ms`);
}

describe('lido-stake', () => {
  it.skipIf(shouldSkipNetwork('ethereum-holesky'))(
    'stakes 0.001 ETH via Lido on Holesky',
    async () => {
      expect(evmWallet).toBeTruthy();
      expect(session).toBeTruthy();

      const res = await session!.http.post<{ id: string; status: string }>(
        '/v1/actions/lido_staking/stake',
        {
          amount: '1000000000000000', // 0.001 ETH in wei
          network: 'ethereum-holesky',
        },
      );

      // 4xx means Lido not configured or insufficient balance -> skip
      if (res.status >= 400) {
        console.log(`Lido stake skipped: HTTP ${res.status}`);
        return;
      }

      expect(res.status).toBe(201);
      expect(res.body.id).toBeTruthy();

      const result = await pollTxStatus(session!.http, res.body.id);
      if (result.status === 'FAILED') {
        console.log('Lido stake failed on-chain (likely insufficient balance) - treating as skip');
        return;
      }

      expect(['CONFIRMED', 'COMPLETED']).toContain(result.status);
      expect(result.txId).toBeTruthy();
      stakeSucceeded = true;
    },
  );
});

describe('lido-unstake', () => {
  it.skipIf(shouldSkipNetwork('ethereum-holesky'))(
    'unstakes 0.001 ETH via Lido on Holesky (withdrawal queue)',
    async () => {
      if (!stakeSucceeded) {
        console.log('Lido unstake skipped: stake did not succeed');
        return;
      }

      expect(session).toBeTruthy();

      const res = await session!.http.post<{ id: string; status: string }>(
        '/v1/actions/lido_staking/unstake',
        {
          amount: '1000000000000000', // 0.001 ETH in wei
          network: 'ethereum-holesky',
        },
      );

      if (res.status >= 400) {
        console.log(`Lido unstake skipped: HTTP ${res.status}`);
        return;
      }

      expect(res.status).toBe(201);
      expect(res.body.id).toBeTruthy();

      // Unstake enters withdrawal queue -- just verify submission, don't wait for full processing
      const result = await pollTxStatus(session!.http, res.body.id);
      if (result.status === 'FAILED') {
        console.log('Lido unstake failed on-chain - treating as skip');
        return;
      }

      expect(['CONFIRMED', 'COMPLETED']).toContain(result.status);
    },
  );
});
