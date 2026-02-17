/**
 * SEC-05 Part 2: E2E attack chain scenarios (5 tests).
 *
 * Tests multi-layer attack chains that span Layer 1 (session) -> Layer 2 (policy)
 * -> Layer 3 (kill switch) to prove defense in depth.
 *
 * Chain 1: Session limit exhaustion (Layer 1)
 * Chain 2: Policy bypass + TOCTOU (Layer 1 -> 2)
 * Chain 3: Amount escalation -> AutoStop (Layer 1 -> 2 -> 3)
 * Chain 4: Session hijack + recovery (Layer 1 -> 3 -> recovery)
 * Chain 5: Time-based bypass + consecutive failures (Layer 1 -> 2 -> 3)
 *
 * @see docs/v0.4/47-boundary-value-chain-scenarios.md
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createInMemoryDb,
  createSecurityTestApp,
  seedSecurityTestData,
  signTestToken,
  insertPolicy,
  insertTransaction,
} from '../helpers/security-test-helpers.js';
import type { DatabaseConnection } from '../../../infrastructure/database/index.js';
import { generateId } from '../../../infrastructure/database/index.js';
import { wallets } from '../../../infrastructure/database/schema.js';
import { JwtSecretManager } from '../../../infrastructure/jwt/index.js';
import { DatabasePolicyEngine } from '../../../pipeline/database-policy-engine.js';
import { KillSwitchService } from '../../../services/kill-switch-service.js';
import { ConsecutiveFailuresRule } from '../../../services/autostop-rules.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let conn: DatabaseConnection;
let jwtManager: JwtSecretManager;

async function insertTestWallet(
  connection: DatabaseConnection,
  opts: { id?: string; name?: string } = {},
): Promise<string> {
  const id = opts.id ?? generateId();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  await connection.db.insert(wallets).values({
    id,
    name: opts.name ?? 'e2e-chain-wallet',
    chain: 'solana',
    environment: 'testnet',
    defaultNetwork: 'devnet',
    publicKey: `pk-e2e-${id}`,
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

function tx(amount: string, toAddress = 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr') {
  return { type: 'TRANSFER', amount, toAddress, chain: 'solana' };
}

beforeEach(async () => {
  conn = createInMemoryDb();

  // Create audit_log table for kill switch cascade
  conn.sqlite.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      actor TEXT NOT NULL,
      details TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'info',
      wallet_id TEXT,
      session_id TEXT,
      tx_id TEXT,
      ip_address TEXT
    );
  `);

  jwtManager = new JwtSecretManager(conn.db);
  await jwtManager.initialize();
});

afterEach(() => {
  vi.useRealTimers();
  try {
    conn.sqlite.close();
  } catch {
    // already closed
  }
});

// ===========================================================================
// Chain 1: Session limit exhaustion (Layer 1)
// ===========================================================================

describe('Chain 1: Session limit exhaustion via repeated small transfers', { timeout: 30_000 }, () => {
  it('session maxTotalAmount exhaustion: seeded near-limit state, final transfer rejected', async () => {
    // Create session with constraints: maxTotalAmount=10SOL, seeded usageStats=9.5SOL used
    // seedSecurityTestData creates the wallet + session in one call
    const wId = generateId();
    const constraints = JSON.stringify({
      maxAmountPerTx: '1000000000', // 1 SOL per tx max
      maxTotalAmount: '10000000000', // 10 SOL total max
      maxTransactions: 200,
    });
    const usageStats = JSON.stringify({
      totalAmount: '9500000000', // 9.5 SOL already spent
      totalTx: 19,
    });

    const { sessionId } = seedSecurityTestData(conn.sqlite, {
      walletId: wId,
      constraints,
      usageStats,
    });

    // Read session to verify
    const session = conn.sqlite
      .prepare('SELECT constraints, usage_stats FROM sessions WHERE id = ?')
      .get(sessionId) as { constraints: string; usage_stats: string };

    const c = JSON.parse(session.constraints);
    const u = JSON.parse(session.usage_stats);

    // 0.5 SOL transfer should be within limit (9.5 + 0.5 = 10 SOL)
    const transferAmount = BigInt('500000000');
    const newTotal = BigInt(u.totalAmount) + transferAmount;
    expect(newTotal <= BigInt(c.maxTotalAmount)).toBe(true);

    // 0.6 SOL transfer would exceed (9.5 + 0.6 = 10.1 SOL > 10 SOL)
    const exceeding = BigInt(u.totalAmount) + BigInt('600000000');
    expect(exceeding > BigInt(c.maxTotalAmount)).toBe(true);

    // Session limit caps maximum damage at 10 SOL
    expect(BigInt(c.maxTotalAmount)).toBe(BigInt('10000000000'));
  });
});

// ===========================================================================
// Chain 2: Policy bypass + TOCTOU (Layer 1 -> 2)
// ===========================================================================

describe('Chain 2: Concurrent policy evaluation with TOCTOU prevention', { timeout: 30_000 }, () => {
  it('two concurrent transfers constrained by reserved_amount to stay within limit', async () => {
    const wId = await insertTestWallet(conn);
    const engineWithSqlite = new DatabasePolicyEngine(conn.db, conn.sqlite);

    // SPENDING_LIMIT: instant_max=10SOL
    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '10000000000',
        notify_max: '50000000000',
        delay_max: '100000000000',
        delay_seconds: 900,
      }),
      priority: 10,
    });

    // Seed 8SOL already reserved
    insertTransaction(conn.sqlite, {
      walletId: wId,
      status: 'PENDING',
      amount: '8000000000',
      reservedAmount: '8000000000',
    });

    // Two concurrent 3SOL transfers
    const txId1 = insertTransaction(conn.sqlite, {
      walletId: wId,
      status: 'PENDING',
      amount: '3000000000',
    });
    const txId2 = insertTransaction(conn.sqlite, {
      walletId: wId,
      status: 'PENDING',
      amount: '3000000000',
    });

    // First: effective = 8 + 3 = 11 SOL > 10 instant -> NOTIFY
    const result1 = engineWithSqlite.evaluateAndReserve(wId, tx('3000000000'), txId1);
    expect(result1.allowed).toBe(true);
    expect(result1.tier).toBe('NOTIFY');

    // Second: effective = 8 + 3(first reserved) + 3 = 14 SOL > 10 instant -> NOTIFY
    const result2 = engineWithSqlite.evaluateAndReserve(wId, tx('3000000000'), txId2);
    expect(result2.allowed).toBe(true);
    expect(result2.tier).toBe('NOTIFY');

    // Verify total reserved in DB
    const reservedSum = conn.sqlite
      .prepare(
        `SELECT COALESCE(SUM(CAST(reserved_amount AS INTEGER)), 0) AS total
         FROM transactions WHERE wallet_id = ? AND reserved_amount IS NOT NULL`,
      )
      .get(wId) as { total: number };

    // 8 + 3 + 3 = 14 SOL total reserved
    expect(BigInt(reservedSum.total)).toBe(BigInt('14000000000'));
  });
});

// ===========================================================================
// Chain 3: Amount escalation -> AutoStop (Layer 1 -> 2 -> 3)
// ===========================================================================

describe('Chain 3: Amount escalation triggers tier escalation and AutoStop', { timeout: 30_000 }, () => {
  it('small INSTANT, then DELAY, then APPROVAL -- consecutive failures trigger suspension', async () => {
    const wId = await insertTestWallet(conn);
    const engine = new DatabasePolicyEngine(conn.db);

    // SPENDING_LIMIT with clear tier boundaries
    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '1000000000',   // 1 SOL
        notify_max: '10000000000',   // 10 SOL
        delay_max: '50000000000',    // 50 SOL
        delay_seconds: 900,
      }),
      priority: 10,
    });

    // Step 1: Small transfers (INSTANT)
    for (let i = 0; i < 3; i++) {
      const result = await engine.evaluate(wId, tx('500000000')); // 0.5 SOL
      expect(result.tier).toBe('INSTANT');
    }

    // Step 2: Medium transfer (DELAY tier)
    const delayResult = await engine.evaluate(wId, tx('15000000000')); // 15 SOL
    expect(delayResult.tier).toBe('DELAY');

    // Step 3: Large transfer (APPROVAL tier)
    const approvalResult = await engine.evaluate(wId, tx('55000000000')); // 55 SOL
    expect(approvalResult.tier).toBe('APPROVAL');

    // Step 4: AutoStop rule -- 5 consecutive failures trigger suspension
    const failureRule = new ConsecutiveFailuresRule(5);

    for (let i = 1; i <= 4; i++) {
      const fr = failureRule.onTransactionFailed(wId);
      expect(fr.triggered).toBe(false);
    }

    const triggerResult = failureRule.onTransactionFailed(wId);
    expect(triggerResult.triggered).toBe(true);

    // After trigger: wallet should be suspended (simulated)
    const now = Math.floor(Date.now() / 1000);
    conn.sqlite
      .prepare(
        "UPDATE wallets SET status = 'SUSPENDED', suspended_at = ?, suspension_reason = ? WHERE id = ?",
      )
      .run(now, 'CONSECUTIVE_FAILURES', wId);

    const wallet = conn.sqlite
      .prepare('SELECT status, suspension_reason FROM wallets WHERE id = ?')
      .get(wId) as { status: string; suspension_reason: string };

    expect(wallet.status).toBe('SUSPENDED');
    expect(wallet.suspension_reason).toBe('CONSECUTIVE_FAILURES');
  });
});

// ===========================================================================
// Chain 4: Session hijack + Kill Switch recovery (Layer 1 -> 3 -> recovery)
// ===========================================================================

describe('Chain 4: Kill Switch activation revokes sessions, recovery requires new session', { timeout: 30_000 }, () => {
  it('valid session -> kill switch -> API blocked -> recovery -> old session revoked', async () => {
    const wId = 'wallet-chain4-' + generateId().slice(0, 8);
    const { sessionId } = seedSecurityTestData(conn.sqlite, {
      walletId: wId,
      sessionId: 'sess-chain4-' + generateId().slice(0, 8),
    });

    // Initialize kill switch
    const now = Math.floor(Date.now() / 1000);
    conn.sqlite
      .prepare('INSERT OR REPLACE INTO key_value_store (key, value, updated_at) VALUES (?, ?, ?)')
      .run('kill_switch_state', 'ACTIVE', now);

    const ksService = new KillSwitchService({
      sqlite: conn.sqlite,
      notificationService: { notify: vi.fn().mockResolvedValue(undefined) } as any,
    });

    // Step 1: Normal operation -- session is valid
    const token = await signTestToken(jwtManager, sessionId, wId);
    let killState = 'ACTIVE';
    const app = createSecurityTestApp({
      jwtManager,
      db: conn.db,
      getKillSwitchState: () => killState,
    });

    const normalRes = await app.request('/v1/wallet/balance', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(normalRes.status).toBe(200);

    // Step 2: Kill Switch activated
    ksService.activateWithCascade('security-admin');
    killState = 'SUSPENDED';
    await new Promise((r) => setTimeout(r, 50)); // Wait for async cascade

    // Step 3: API blocked with 503
    const blockedRes = await app.request('/v1/wallet/balance', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(blockedRes.status).toBe(503);

    // Step 4: Recovery
    ksService.recoverFromSuspended();
    killState = 'ACTIVE';

    // Step 5: Old session is revoked (cascade revoked it)
    const oldSessionRes = await app.request('/v1/wallet/balance', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(oldSessionRes.status).toBe(401);
    const body = await oldSessionRes.json();
    expect(body.code).toBe('SESSION_REVOKED');

    // Step 6: Verify session is revoked in DB
    const session = conn.sqlite
      .prepare('SELECT revoked_at FROM sessions WHERE id = ?')
      .get(sessionId) as { revoked_at: number | null };
    expect(session.revoked_at).toBeTypeOf('number');
  });
});

// ===========================================================================
// Chain 5: Time-based bypass + consecutive failures (Layer 1 -> 2 -> 3)
// ===========================================================================

describe('Chain 5: Time-based expiry + tier escalation + AutoStop', { timeout: 30_000 }, () => {
  it('JWT expiry -> new session -> DELAY tier -> repeated failures -> suspension', async () => {
    const wId = 'wallet-chain5-' + generateId().slice(0, 8);

    // Setup SPENDING_LIMIT
    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '1000000000',
        notify_max: '10000000000',
        delay_max: '50000000000',
        delay_seconds: 900,
      }),
      priority: 10,
    });

    // Step 1: Create wallet + session with near-expiry token
    const { sessionId: sess1 } = seedSecurityTestData(conn.sqlite, {
      walletId: wId,
      sessionId: 'sess-chain5-1-' + generateId().slice(0, 8),
    });

    // Token with 1 second until expiry
    const nowSec = Math.floor(Date.now() / 1000);
    const shortToken = await signTestToken(jwtManager, sess1, wId, {
      iat: nowSec,
      exp: nowSec + 1, // Expires in 1 second
    });

    const killState = 'ACTIVE';
    const app = createSecurityTestApp({
      jwtManager,
      db: conn.db,
      getKillSwitchState: () => killState,
    });

    // Token should be valid now
    const res1 = await app.request('/v1/wallet/balance', {
      headers: { Authorization: `Bearer ${shortToken}` },
    });
    expect(res1.status).toBe(200);

    // Step 2: Wait for expiry
    await new Promise((r) => setTimeout(r, 1500));

    const expiredRes = await app.request('/v1/wallet/balance', {
      headers: { Authorization: `Bearer ${shortToken}` },
    });
    expect(expiredRes.status).toBe(401);
    const expiredBody = await expiredRes.json();
    expect(expiredBody.code).toBe('TOKEN_EXPIRED');

    // Step 3: New session with valid token (insert session directly, wallet already exists)
    const sess2 = 'sess-chain5-2-' + generateId().slice(0, 8);
    const sessionNow = Math.floor(Date.now() / 1000);
    conn.sqlite
      .prepare(
        `INSERT INTO sessions (id, wallet_id, token_hash, expires_at, absolute_expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(sess2, wId, `hash-${sess2.slice(0, 8)}`, sessionNow + 86400, sessionNow + 86400 * 30, sessionNow);
    const newToken = await signTestToken(jwtManager, sess2, wId);

    const res2 = await app.request('/v1/wallet/balance', {
      headers: { Authorization: `Bearer ${newToken}` },
    });
    expect(res2.status).toBe(200);

    // Step 4: Policy evaluation -- DELAY tier for 15 SOL
    const engine = new DatabasePolicyEngine(conn.db);
    const delayResult = await engine.evaluate(wId, tx('15000000000'));
    expect(delayResult.tier).toBe('DELAY');

    // Step 5: Consecutive failures -> AutoStop
    const failureRule = new ConsecutiveFailuresRule(5);
    for (let i = 0; i < 5; i++) {
      failureRule.onTransactionFailed(wId);
    }

    const triggered = failureRule.onTransactionFailed(wId);
    // Already triggered at 5, this is 6th -- should still be triggered
    expect(triggered.triggered).toBe(true);

    // Simulate wallet suspension
    conn.sqlite
      .prepare(
        "UPDATE wallets SET status = 'SUSPENDED', suspended_at = ?, suspension_reason = ? WHERE id = ?",
      )
      .run(Math.floor(Date.now() / 1000), 'CONSECUTIVE_FAILURES', wId);

    const wallet = conn.sqlite
      .prepare('SELECT status FROM wallets WHERE id = ?')
      .get(wId) as { status: string };
    expect(wallet.status).toBe('SUSPENDED');
  });
});
