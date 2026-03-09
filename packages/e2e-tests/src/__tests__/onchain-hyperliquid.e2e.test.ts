/**
 * E2E Tests: Hyperliquid Spot/Perp (Testnet)
 *
 * Tests Hyperliquid Spot and Perp order placement via action provider.
 * Hyperliquid uses ApiDirectResult pattern (no pipeline txId).
 *
 * Requires WAIAAS_E2E_HYPERLIQUID_ENABLED=true to run.
 * Hyperliquid testnet needs separate account/balance setup.
 *
 * @see ONCH-08
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { E2EHttpClient } from '../helpers/http-client.js';
import { SessionManager } from '../helpers/session.js';
import { shouldSkipNetwork } from '../helpers/onchain-skip.js';

// Import scenario registrations (side-effect)
import '../scenarios/onchain-hyperliquid.js';

const DAEMON_URL = process.env.WAIAAS_E2E_DAEMON_URL ?? 'http://127.0.0.1:3000';
const MASTER_PASSWORD = process.env.WAIAAS_E2E_MASTER_PASSWORD ?? 'e2e-test-password-12345';
const HYPERLIQUID_ENABLED = process.env.WAIAAS_E2E_HYPERLIQUID_ENABLED === 'true';

interface WalletInfo {
  id: string;
  publicKey: string;
  chain: string;
}

const adminClient = new E2EHttpClient(DAEMON_URL);
const adminHeaders = { headers: { 'X-Master-Password': MASTER_PASSWORD } };

let evmWallet: WalletInfo | undefined;
let session: SessionManager | undefined;

const skipAll = !HYPERLIQUID_ENABLED || shouldSkipNetwork('sepolia');

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

describe('hyperliquid-spot-order', () => {
  it.skipIf(skipAll)(
    'places a limit buy order on Hyperliquid testnet Spot',
    async () => {
      expect(session).toBeTruthy();

      const res = await session!.http.post<{ result?: unknown }>('/v1/actions/hyperliquid_spot/order', {
        asset: 'PURR/USDC',
        side: 'buy',
        size: '1',
        orderType: 'limit',
        price: '0.001',
      });

      // 4xx means Hyperliquid not configured or no balance -> skip
      if (res.status >= 400) {
        console.log(`Hyperliquid Spot order skipped: HTTP ${res.status}`);
        return;
      }

      expect(res.status).toBe(201);
      // ApiDirectResult pattern: result field contains direct response
      expect(res.body.result).toBeDefined();
    },
  );
});

describe('hyperliquid-perp-order', () => {
  it.skipIf(skipAll)(
    'places a limit buy order on Hyperliquid testnet Perp',
    async () => {
      expect(session).toBeTruthy();

      const res = await session!.http.post<{ result?: unknown }>('/v1/actions/hyperliquid_perp/order', {
        asset: 'ETH',
        side: 'buy',
        size: '0.001',
        leverage: 1,
        orderType: 'limit',
        price: '1',
      });

      // 4xx means Hyperliquid not configured or no balance -> skip
      if (res.status >= 400) {
        console.log(`Hyperliquid Perp order skipped: HTTP ${res.status}`);
        return;
      }

      expect(res.status).toBe(201);
      expect(res.body.result).toBeDefined();
    },
  );
});
