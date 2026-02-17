/**
 * NOTE-11: Cursor pagination tests (5 cases).
 *
 * Tests the cursor pagination query pattern used by GET /v1/wallet/transactions.
 * Uses in-memory SQLite + direct Drizzle queries to verify the pagination logic
 * independently of the full app stack.
 *
 * Cursor pagination pattern:
 *   1. WHERE id < cursor (if cursor provided), ORDER BY id DESC, LIMIT N+1
 *   2. hasMore = rows.length > limit
 *   3. items = rows.slice(0, limit)
 *   4. nextCursor = items[items.length - 1]?.id
 *
 * @see docs/49-enum-config-consistency-verification.md NOTE-11
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDatabase, pushSchema, generateId } from '../infrastructure/database/index.js';
import type { DatabaseConnection } from '../infrastructure/database/index.js';
import { transactions } from '../infrastructure/database/schema.js';
import { eq, lt, and, desc } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let conn: DatabaseConnection;
let walletId: string;

beforeAll(() => {
  conn = createDatabase(':memory:');
  pushSchema(conn.sqlite);

  // Insert test wallet
  walletId = generateId();
  const ts = Math.floor(Date.now() / 1000);
  conn.sqlite.prepare(
    `INSERT INTO wallets (id, name, chain, environment, public_key, status, created_at, updated_at)
     VALUES (?, 'pagination-test', 'solana', 'testnet', ?, 'ACTIVE', ?, ?)`,
  ).run(walletId, `pk-${walletId}`, ts, ts);
});

afterAll(() => {
  conn?.sqlite?.close();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function insertTx(count: number): string[] {
  const ids: string[] = [];
  const ts = Math.floor(Date.now() / 1000);
  for (let i = 0; i < count; i++) {
    const id = generateId();
    ids.push(id);
    conn.sqlite.prepare(
      `INSERT INTO transactions (id, wallet_id, chain, type, status, created_at)
       VALUES (?, ?, 'solana', 'TRANSFER', 'CONFIRMED', ?)`,
    ).run(id, walletId, ts);
  }
  return ids;
}

/**
 * Cursor pagination query (same pattern as routes/transactions.ts listTransactionsRoute).
 */
async function paginatedQuery(
  wId: string,
  limit: number,
  cursor?: string,
): Promise<{ items: any[]; cursor: string | null; hasMore: boolean }> {
  const conditions = [eq(transactions.walletId, wId)];
  if (cursor) {
    conditions.push(lt(transactions.id, cursor));
  }

  const rows = await conn.db
    .select()
    .from(transactions)
    .where(and(...conditions))
    .orderBy(desc(transactions.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = items.length > 0 ? items[items.length - 1]!.id : null;

  return {
    items,
    cursor: hasMore ? nextCursor : null,
    hasMore,
  };
}

// ---------------------------------------------------------------------------
// NOTE-11: Cursor pagination tests
// ---------------------------------------------------------------------------

describe('NOTE-11: Cursor pagination', () => {
  // N11-01: Empty list
  it('N11-01: empty list -> items: [], cursor: null, hasMore: false', async () => {
    // Create a separate wallet with no transactions
    const emptyWalletId = generateId();
    const ts = Math.floor(Date.now() / 1000);
    conn.sqlite.prepare(
      `INSERT INTO wallets (id, name, chain, environment, public_key, status, created_at, updated_at)
       VALUES (?, 'empty-wallet', 'solana', 'testnet', ?, 'ACTIVE', ?, ?)`,
    ).run(emptyWalletId, `pk-${emptyWalletId}`, ts, ts);

    const result = await paginatedQuery(emptyWalletId, 10);
    expect(result.items).toEqual([]);
    expect(result.cursor).toBeNull();
    expect(result.hasMore).toBe(false);
  });

  // N11-02: Single page (1 item, limit > count)
  it('N11-02: 1 item with limit=10 -> items: [1], cursor: null, hasMore: false', async () => {
    insertTx(1);

    const result = await paginatedQuery(walletId, 10);
    expect(result.items.length).toBe(1);
    expect(result.cursor).toBeNull();
    expect(result.hasMore).toBe(false);
  });

  // N11-03: Multi-page (limit+1 items triggers hasMore)
  it('N11-03: 5 items with limit=3 -> items: [3], cursor: UUID, hasMore: true', async () => {
    // Already 1 TX from N11-02. Insert 4 more (total 5).
    insertTx(4);

    const result = await paginatedQuery(walletId, 3);
    expect(result.items.length).toBe(3);
    expect(result.hasMore).toBe(true);
    expect(result.cursor).toBeTruthy();
    expect(typeof result.cursor).toBe('string');
  });

  // N11-04: cursor navigates to next page
  it('N11-04: cursor -> next page with remaining items, no overlap', async () => {
    // Page 1: 3 items
    const page1 = await paginatedQuery(walletId, 3);
    expect(page1.hasMore).toBe(true);

    // Page 2: remaining items via cursor
    const page2 = await paginatedQuery(walletId, 3, page1.cursor!);
    expect(page2.items.length).toBe(2); // 5 total - 3 = 2 remaining
    expect(page2.hasMore).toBe(false);
    expect(page2.cursor).toBeNull();

    // Verify no overlap between pages
    const page1Ids = new Set(page1.items.map((i: any) => i.id));
    const page2Ids = page2.items.map((i: any) => i.id);
    for (const id of page2Ids) {
      expect(page1Ids.has(id)).toBe(false);
    }

    // Verify ordering: page 1 IDs > page 2 IDs (descending)
    const allIds = [...page1.items.map((i: any) => i.id), ...page2Ids];
    for (let i = 1; i < allIds.length; i++) {
      expect(allIds[i - 1]! > allIds[i]!).toBe(true);
    }
  });

  // N11-05: Invalid cursor format returns empty (no crash)
  it('N11-05: non-UUID cursor -> returns empty items (graceful handling)', async () => {
    // Using a non-UUID cursor that sorts before all UUIDs
    const result = await paginatedQuery(walletId, 10, '000');
    // '000' < all UUID v7 values, so all transactions have id > '000'
    // In our DESC query with lt(id, '000'), nothing matches -> empty result
    expect(result.items).toEqual([]);
    expect(result.hasMore).toBe(false);
    expect(result.cursor).toBeNull();
  });
});
