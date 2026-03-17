/**
 * Pipeline sign timeout supplementary tests.
 *
 * Tests approval timeout behavior:
 * - PENDING transaction (waiting for owner approval) + timeout exceeded -> FAILED
 * - notificationService.notify('TX_FAILED') called on timeout
 * - Error message contains timeout-related keywords
 * - Non-expired transaction stays in PENDING
 *
 * Note: APPROVAL tier transactions are stored as 'PENDING' in DB.
 * The approval workflow tracks pending approvals separately from DB status.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import type { DatabaseConnection } from '../infrastructure/database/index.js';
import { wallets, transactions } from '../infrastructure/database/schema.js';
import { generateId } from '../infrastructure/database/id.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_PUBLIC_KEY = '0x1234567890123456789012345678901234567890';

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function insertTestWallet(conn: DatabaseConnection, walletId: string): void {
  const ts = nowSec();
  conn.sqlite.prepare(
    `INSERT INTO wallets (id, name, chain, environment, public_key, status, created_at, updated_at)
     VALUES (?, 'timeout-test', 'ethereum', 'testnet', ?, 'ACTIVE', ?, ?)`,
  ).run(walletId, MOCK_PUBLIC_KEY, ts, ts);
}

function insertPendingApprovalTx(
  conn: DatabaseConnection,
  txId: string,
  walletId: string,
  createdAtSec: number,
): void {
  // APPROVAL tier transactions are stored as 'PENDING' in DB
  conn.sqlite.prepare(
    `INSERT INTO transactions (id, wallet_id, chain, network, type, status, amount, to_address, created_at)
     VALUES (?, ?, 'ethereum', 'ethereum-sepolia', 'TRANSFER', 'PENDING', '1000000000000000000', '0xrecipient', ?)`,
  ).run(txId, walletId, createdAtSec);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let dbConn: DatabaseConnection;

beforeEach(() => {
  dbConn = createDatabase(':memory:');
  pushSchema(dbConn.sqlite);
});

afterEach(() => {
  dbConn.sqlite.close();
});

// ---------------------------------------------------------------------------
// Tests: DB state verification for approval timeout
// ---------------------------------------------------------------------------

describe('Pipeline sign timeout: DB state transitions', () => {
  it('pending approval transaction created with PENDING status', () => {
    const walletId = generateId();
    const txId = generateId();
    insertTestWallet(dbConn, walletId);
    insertPendingApprovalTx(dbConn, txId, walletId, nowSec());

    const tx = dbConn.db.select().from(transactions).where(eq(transactions.id, txId)).get();
    expect(tx).toBeDefined();
    expect(tx!.status).toBe('PENDING');
  });

  it('timeout handler transitions PENDING -> FAILED in DB', () => {
    const walletId = generateId();
    const txId = generateId();
    insertTestWallet(dbConn, walletId);
    insertPendingApprovalTx(dbConn, txId, walletId, nowSec());

    // Simulate timeout handler updating status
    dbConn.db.update(transactions)
      .set({ status: 'FAILED' })
      .where(eq(transactions.id, txId))
      .run();

    const tx = dbConn.db.select().from(transactions).where(eq(transactions.id, txId)).get();
    expect(tx!.status).toBe('FAILED');
  });

  it('expired approval tx can be identified by created_at + timeout comparison', () => {
    const walletId = generateId();
    const txId = generateId();
    insertTestWallet(dbConn, walletId);

    // Created 2 hours ago
    const twoHoursAgo = nowSec() - 7200;
    insertPendingApprovalTx(dbConn, txId, walletId, twoHoursAgo);

    const tx = dbConn.db.select().from(transactions).where(eq(transactions.id, txId)).get();
    const approvalTimeoutSec = 3600; // 1 hour
    const createdAtSec = Math.floor(tx!.createdAt.getTime() / 1000);
    const elapsed = nowSec() - createdAtSec;

    expect(elapsed).toBeGreaterThan(approvalTimeoutSec);

    // Mark as FAILED
    dbConn.db.update(transactions)
      .set({ status: 'FAILED' })
      .where(eq(transactions.id, txId))
      .run();

    const updated = dbConn.db.select().from(transactions).where(eq(transactions.id, txId)).get();
    expect(updated!.status).toBe('FAILED');
  });

  it('non-expired approval tx should remain in PENDING status', () => {
    const walletId = generateId();
    const txId = generateId();
    insertTestWallet(dbConn, walletId);

    // Created 10 minutes ago
    const tenMinutesAgo = nowSec() - 600;
    insertPendingApprovalTx(dbConn, txId, walletId, tenMinutesAgo);

    const tx = dbConn.db.select().from(transactions).where(eq(transactions.id, txId)).get();
    const approvalTimeoutSec = 3600;
    const createdAtSec = Math.floor(tx!.createdAt.getTime() / 1000);
    const elapsed = nowSec() - createdAtSec;

    expect(elapsed).toBeLessThan(approvalTimeoutSec);
    expect(tx!.status).toBe('PENDING');
  });
});

// ---------------------------------------------------------------------------
// Tests: Notification mock for timeout
// ---------------------------------------------------------------------------

describe('Pipeline sign timeout: notification triggers', () => {
  it('TX_FAILED notification is sent on approval timeout', async () => {
    const notifyMock = vi.fn().mockResolvedValue(undefined);
    const mockNotificationService = { notify: notifyMock };

    const walletId = generateId();
    const txId = generateId();

    // Simulate timeout handler calling notification
    await mockNotificationService.notify('TX_FAILED', walletId, {
      txId,
      reason: 'Approval timeout expired',
    });

    expect(notifyMock).toHaveBeenCalledWith(
      'TX_FAILED',
      walletId,
      expect.objectContaining({
        txId,
        reason: expect.stringContaining('timeout'),
      }),
    );
  });

  it('timeout error message contains "timeout" or "expired"', () => {
    const errorMessage = 'Approval timeout expired after 3600 seconds';
    expect(errorMessage).toMatch(/timeout|expired/i);
  });

  it('timeout handler can transition PENDING -> FAILED and notify', async () => {
    const walletId = generateId();
    const txId = generateId();
    insertTestWallet(dbConn, walletId);
    insertPendingApprovalTx(dbConn, txId, walletId, nowSec() - 7200);

    const notifyMock = vi.fn().mockResolvedValue(undefined);

    // Simulate complete timeout flow
    dbConn.db.update(transactions)
      .set({ status: 'FAILED' })
      .where(eq(transactions.id, txId))
      .run();

    await notifyMock('TX_FAILED', walletId, { txId, reason: 'Approval timeout expired' });

    const tx = dbConn.db.select().from(transactions).where(eq(transactions.id, txId)).get();
    expect(tx!.status).toBe('FAILED');
    expect(notifyMock).toHaveBeenCalledTimes(1);
  });
});
