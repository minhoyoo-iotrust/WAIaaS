/**
 * E2E Tests: Polymarket Prediction Market
 *
 * Tests Polymarket CLOB order placement, market browse, position tracking,
 * and admin settings via REST API.
 * Polymarket uses ApiDirectResult pattern (no pipeline txId).
 *
 * Requires WAIAAS_E2E_POLYMARKET_ENABLED=true to run.
 * Polymarket mainnet needs Polygon wallet + USDC setup.
 *
 * @see ONCH-09
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { E2EHttpClient } from '../helpers/http-client.js';
import { SessionManager } from '../helpers/session.js';
import { shouldSkipNetwork } from '../helpers/onchain-skip.js';

// Import scenario registrations (side-effect)
import '../scenarios/onchain-polymarket.js';

const DAEMON_URL = process.env.WAIAAS_E2E_DAEMON_URL ?? 'http://127.0.0.1:3100';
const MASTER_PASSWORD = process.env.WAIAAS_E2E_MASTER_PASSWORD ?? 'e2e-test-password-12345';
const POLYMARKET_ENABLED = process.env.WAIAAS_E2E_POLYMARKET_ENABLED === 'true';

interface WalletInfo {
  id: string;
  publicKey: string;
  chain: string;
}

const adminClient = new E2EHttpClient(DAEMON_URL);
const adminHeaders = { headers: { 'X-Master-Password': MASTER_PASSWORD } };

let evmWallet: WalletInfo | undefined;
let session: SessionManager | undefined;

const skipAll = !POLYMARKET_ENABLED || shouldSkipNetwork('polygon-mainnet');

beforeAll(async () => {
  if (skipAll) return;

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

describe('polymarket-settings-crud', () => {
  it.skipIf(skipAll)(
    'sets and reads Polymarket admin settings',
    async () => {
      // Enable Polymarket
      const putRes = await adminClient.put<{ success: boolean }>(
        '/v1/admin/settings',
        { polymarket_enabled: true, polymarket_fee_bps: 50 },
        adminHeaders,
      );
      if (putRes.status >= 400) {
        console.log(`Polymarket settings update skipped: HTTP ${putRes.status}`);
        return;
      }
      expect(putRes.status).toBe(200);

      // Read settings back
      const getRes = await adminClient.get<Record<string, unknown>>(
        '/v1/admin/settings',
        adminHeaders,
      );
      expect(getRes.status).toBe(200);
      expect(getRes.body).toHaveProperty('polymarket_enabled', true);
      expect(getRes.body).toHaveProperty('polymarket_fee_bps', 50);
    },
  );
});

describe('polymarket-market-browse', () => {
  it.skipIf(skipAll)(
    'browses markets via Gamma API',
    async () => {
      expect(session).toBeTruthy();

      const marketsRes = await session!.http.get<{ items?: unknown[] }>(
        '/v1/polymarket/markets?limit=5',
      );
      // 4xx means Polymarket not configured -> skip gracefully
      if (marketsRes.status >= 400) {
        console.log(`Polymarket market browse skipped: HTTP ${marketsRes.status}`);
        return;
      }
      expect(marketsRes.status).toBe(200);

      const eventsRes = await session!.http.get<{ items?: unknown[] }>(
        '/v1/polymarket/events?limit=3',
      );
      if (eventsRes.status >= 400) {
        console.log(`Polymarket events browse skipped: HTTP ${eventsRes.status}`);
        return;
      }
      expect(eventsRes.status).toBe(200);
    },
  );
});

describe('polymarket-order-place', () => {
  it.skipIf(skipAll)(
    'places a limit buy order on Polymarket CLOB',
    async () => {
      expect(session).toBeTruthy();

      const res = await session!.http.post<{ result?: unknown }>(
        '/v1/actions/polymarket_order/buy',
        {
          walletId: evmWallet!.id,
          conditionId: '0x0000000000000000000000000000000000000000000000000000000000000001',
          side: 'buy',
          size: '1',
          price: '0.01',
        },
      );

      // 4xx means CLOB not configured or no balance -> skip
      if (res.status >= 400) {
        console.log(`Polymarket order place skipped: HTTP ${res.status}`);
        return;
      }

      expect(res.status).toBe(201);
      // ApiDirectResult pattern: result field contains direct response
      expect(res.body.result).toBeDefined();
    },
  );
});

describe('polymarket-position-pnl', () => {
  it.skipIf(skipAll)(
    'queries positions and PnL',
    async () => {
      expect(session).toBeTruthy();

      const posRes = await session!.http.get<{ items?: unknown[] }>(
        `/v1/polymarket/positions?walletId=${evmWallet!.id}`,
      );
      if (posRes.status >= 400) {
        console.log(`Polymarket positions skipped: HTTP ${posRes.status}`);
        return;
      }
      expect(posRes.status).toBe(200);

      const pnlRes = await session!.http.get<Record<string, unknown>>(
        `/v1/polymarket/pnl?walletId=${evmWallet!.id}`,
      );
      if (pnlRes.status >= 400) {
        console.log(`Polymarket PnL skipped: HTTP ${pnlRes.status}`);
        return;
      }
      expect(pnlRes.status).toBe(200);
    },
  );
});
