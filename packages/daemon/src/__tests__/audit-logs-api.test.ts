/**
 * Integration tests for GET /v1/audit-logs API endpoint.
 *
 * 18 tests covering:
 *   1. Returns latest 50 logs (default limit) in id DESC order
 *   2. limit=5 returns exactly 5 logs
 *   3. Cursor returns logs where id < cursor
 *   4. Continuous cursor traversal retrieves all logs without gaps/duplicates
 *   5. wallet_id filter
 *   6. event_type filter
 *   7. severity filter
 *   8. from/to timestamp range filter (inclusive)
 *   9. tx_id filter
 *  10. Multiple filters combine with AND logic
 *  11. include_total=true includes total count
 *  12. include_total=false or omitted does NOT include total
 *  13. Last page: nextCursor=null, hasMore=false
 *  14. More pages: nextCursor=(last item id), hasMore=true
 *  15. Empty result: { data: [], nextCursor: null, hasMore: false }
 *  16. masterAuth required -- no X-Master-Password returns 401
 *  17. Invalid event_type returns 400
 *  18. limit > 200 rejected (400)
 *
 * @see packages/daemon/src/api/routes/audit-logs.ts
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import type { Database as DatabaseType } from 'better-sqlite3';
import argon2 from 'argon2';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import { createApp } from '../api/server.js';
import { insertAuditLog } from '../infrastructure/database/audit-helper.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_PASSWORD = 'test-master-password-audit';
const HOST = '127.0.0.1:3100';
let passwordHash: string;

// Test UUIDs
const WALLET_A = '11111111-1111-1111-1111-111111111111';
const WALLET_B = '22222222-2222-2222-2222-222222222222';
const TX_ID_1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TX_ID_2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function masterHeaders(): Record<string, string> {
  return {
    Host: HOST,
    'X-Master-Password': TEST_PASSWORD,
  };
}

interface AuditLogItem {
  id: number;
  timestamp: number;
  eventType: string;
  actor: string;
  walletId: string | null;
  sessionId: string | null;
  txId: string | null;
  details: Record<string, unknown>;
  severity: string;
  ipAddress: string | null;
}

interface AuditLogResponse {
  data: AuditLogItem[];
  nextCursor: number | null;
  hasMore: boolean;
  total?: number;
}

async function getAuditLogs(
  app: ReturnType<typeof createApp>,
  params: Record<string, string> = {},
  headers?: Record<string, string>,
): Promise<Response> {
  const qs = new URLSearchParams(params).toString();
  const url = `/v1/audit-logs${qs ? `?${qs}` : ''}`;
  return app.request(url, { headers: headers ?? masterHeaders() });
}

async function getAuditLogsJson(
  app: ReturnType<typeof createApp>,
  params: Record<string, string> = {},
): Promise<AuditLogResponse> {
  const res = await getAuditLogs(app, params);
  expect(res.status).toBe(200);
  return (await res.json()) as AuditLogResponse;
}

/**
 * Seed audit log entries. Inserts rows with sequential timestamps.
 * Returns the count of inserted rows.
 */
function seedAuditLogs(sqlite: DatabaseType, count: number): void {
  const baseTime = 1700000000; // fixed base timestamp
  for (let i = 0; i < count; i++) {
    // Alternate event types, severities, wallet_ids for filter testing
    const eventTypes = [
      'WALLET_CREATED',
      'TX_SUBMITTED',
      'TX_CONFIRMED',
      'MASTER_AUTH_FAILED',
      'POLICY_DENIED',
    ] as const;
    const severities = ['info', 'warning', 'critical'] as const;

    const eventType = eventTypes[i % eventTypes.length]!;
    const severity = severities[i % severities.length]!;
    const walletId = i % 3 === 0 ? WALLET_A : i % 3 === 1 ? WALLET_B : undefined;
    const txId = i % 7 === 0 ? TX_ID_1 : i % 7 === 1 ? TX_ID_2 : undefined;

    insertAuditLog(sqlite, {
      eventType,
      actor: `actor-${i}`,
      walletId,
      txId,
      details: { index: i },
      severity,
    });

    // Override timestamp to be deterministic (insertAuditLog uses Date.now())
    const lastId = (
      sqlite.prepare('SELECT MAX(id) as maxId FROM audit_log').get() as {
        maxId: number;
      }
    ).maxId;
    sqlite
      .prepare('UPDATE audit_log SET timestamp = ? WHERE id = ?')
      .run(baseTime + i, lastId);
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let sqlite: DatabaseType;
let db: ReturnType<typeof createDatabase>['db'];

beforeAll(async () => {
  passwordHash = await argon2.hash(TEST_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 4096,
    timeCost: 2,
    parallelism: 1,
  });
});

beforeEach(() => {
  const conn = createDatabase(':memory:');
  sqlite = conn.sqlite;
  db = conn.db;
  pushSchema(sqlite);
});

afterEach(() => {
  try {
    sqlite.close();
  } catch {
    // already closed
  }
});

// ---------------------------------------------------------------------------
// Helper to create app
// ---------------------------------------------------------------------------

function makeApp() {
  return createApp({
    db,
    sqlite,
    masterPasswordHash: passwordHash,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /v1/audit-logs', () => {
  // Test 1: Default limit returns latest 50 logs in id DESC order
  it('returns latest 50 logs (default limit) in id DESC order', async () => {
    seedAuditLogs(sqlite, 60);
    const app = makeApp();
    const body = await getAuditLogsJson(app);

    expect(body.data).toHaveLength(50);
    expect(body.hasMore).toBe(true);
    expect(body.nextCursor).toBeTypeOf('number');
    // Verify DESC order
    for (let i = 1; i < body.data.length; i++) {
      expect(body.data[i - 1]!.id).toBeGreaterThan(body.data[i]!.id);
    }
  });

  // Test 2: limit=5 returns exactly 5 logs
  it('limit=5 returns exactly 5 logs', async () => {
    seedAuditLogs(sqlite, 20);
    const app = makeApp();
    const body = await getAuditLogsJson(app, { limit: '5' });

    expect(body.data).toHaveLength(5);
    expect(body.hasMore).toBe(true);
  });

  // Test 3: Cursor returns logs where id < cursor
  it('cursor returns logs where id < cursor', async () => {
    seedAuditLogs(sqlite, 10);
    const app = makeApp();

    // First request
    const first = await getAuditLogsJson(app, { limit: '3' });
    expect(first.data).toHaveLength(3);
    expect(first.nextCursor).toBeTypeOf('number');

    // Second request with cursor
    const second = await getAuditLogsJson(app, {
      limit: '3',
      cursor: String(first.nextCursor),
    });
    expect(second.data).toHaveLength(3);
    // All IDs in second page should be less than cursor
    for (const item of second.data) {
      expect(item.id).toBeLessThan(first.nextCursor!);
    }
  });

  // Test 4: Continuous cursor traversal retrieves all logs without gaps or duplicates
  it('continuous cursor traversal retrieves all logs without gaps/duplicates', async () => {
    seedAuditLogs(sqlite, 17);
    const app = makeApp();

    const allIds: number[] = [];
    let cursor: string | undefined;
    const pageSize = '5';

    for (;;) {
      const params: Record<string, string> = { limit: pageSize };
      if (cursor) params.cursor = cursor;
      const body = await getAuditLogsJson(app, params);
      allIds.push(...body.data.map((d) => d.id));
      if (!body.hasMore) break;
      cursor = String(body.nextCursor);
    }

    // Should have exactly 17 unique IDs
    expect(allIds).toHaveLength(17);
    expect(new Set(allIds).size).toBe(17);
    // Should be in DESC order
    for (let i = 1; i < allIds.length; i++) {
      expect(allIds[i - 1]!).toBeGreaterThan(allIds[i]!);
    }
  });

  // Test 5: wallet_id filter
  it('wallet_id filter returns only logs for that wallet', async () => {
    seedAuditLogs(sqlite, 30);
    const app = makeApp();
    const body = await getAuditLogsJson(app, { wallet_id: WALLET_A });

    expect(body.data.length).toBeGreaterThan(0);
    for (const item of body.data) {
      expect(item.walletId).toBe(WALLET_A);
    }
  });

  // Test 6: event_type filter
  it('event_type filter returns only matching events', async () => {
    seedAuditLogs(sqlite, 30);
    const app = makeApp();
    const body = await getAuditLogsJson(app, {
      event_type: 'MASTER_AUTH_FAILED',
    });

    expect(body.data.length).toBeGreaterThan(0);
    for (const item of body.data) {
      expect(item.eventType).toBe('MASTER_AUTH_FAILED');
    }
  });

  // Test 7: severity filter
  it('severity filter returns only matching severity', async () => {
    seedAuditLogs(sqlite, 30);
    const app = makeApp();
    const body = await getAuditLogsJson(app, { severity: 'critical' });

    expect(body.data.length).toBeGreaterThan(0);
    for (const item of body.data) {
      expect(item.severity).toBe('critical');
    }
  });

  // Test 8: from/to timestamp range filter (inclusive)
  it('from/to timestamp range filter (inclusive)', async () => {
    seedAuditLogs(sqlite, 20);
    const app = makeApp();
    const fromTs = 1700000005;
    const toTs = 1700000010;
    const body = await getAuditLogsJson(app, {
      from: String(fromTs),
      to: String(toTs),
    });

    expect(body.data.length).toBeGreaterThan(0);
    for (const item of body.data) {
      expect(item.timestamp).toBeGreaterThanOrEqual(fromTs);
      expect(item.timestamp).toBeLessThanOrEqual(toTs);
    }
  });

  // Test 9: tx_id filter
  it('tx_id filter returns only logs with that tx_id', async () => {
    seedAuditLogs(sqlite, 30);
    const app = makeApp();
    const body = await getAuditLogsJson(app, { tx_id: TX_ID_1 });

    expect(body.data.length).toBeGreaterThan(0);
    for (const item of body.data) {
      expect(item.txId).toBe(TX_ID_1);
    }
  });

  // Test 10: Multiple filters combine with AND logic
  it('multiple filters combine with AND logic', async () => {
    seedAuditLogs(sqlite, 60);
    const app = makeApp();
    const body = await getAuditLogsJson(app, {
      wallet_id: WALLET_A,
      severity: 'info',
    });

    // All items must match BOTH filters
    for (const item of body.data) {
      expect(item.walletId).toBe(WALLET_A);
      expect(item.severity).toBe('info');
    }
  });

  // Test 11: include_total=true includes total count
  it('include_total=true includes total count in response', async () => {
    seedAuditLogs(sqlite, 20);
    const app = makeApp();
    const body = await getAuditLogsJson(app, {
      include_total: 'true',
      limit: '5',
    });

    expect(body.total).toBe(20);
    expect(body.data).toHaveLength(5);
  });

  // Test 12: include_total=false or omitted does NOT include total
  it('include_total omitted does not include total in response', async () => {
    seedAuditLogs(sqlite, 10);
    const app = makeApp();
    const body = await getAuditLogsJson(app);

    expect(body.total).toBeUndefined();
  });

  // Test 13: Last page: nextCursor=null, hasMore=false
  it('last page returns nextCursor=null and hasMore=false', async () => {
    seedAuditLogs(sqlite, 3);
    const app = makeApp();
    const body = await getAuditLogsJson(app, { limit: '10' });

    expect(body.data).toHaveLength(3);
    expect(body.nextCursor).toBeNull();
    expect(body.hasMore).toBe(false);
  });

  // Test 14: More pages: nextCursor=(last item id), hasMore=true
  it('more pages returns nextCursor and hasMore=true', async () => {
    seedAuditLogs(sqlite, 10);
    const app = makeApp();
    const body = await getAuditLogsJson(app, { limit: '3' });

    expect(body.data).toHaveLength(3);
    expect(body.hasMore).toBe(true);
    expect(body.nextCursor).toBe(body.data[body.data.length - 1]!.id);
  });

  // Test 15: Empty result
  it('empty result returns data=[], nextCursor=null, hasMore=false', async () => {
    const app = makeApp();
    const body = await getAuditLogsJson(app);

    expect(body.data).toEqual([]);
    expect(body.nextCursor).toBeNull();
    expect(body.hasMore).toBe(false);
  });

  // Test 16: masterAuth required
  it('returns 401 without X-Master-Password header', async () => {
    const app = makeApp();
    const res = await getAuditLogs(app, {}, { Host: HOST });

    expect(res.status).toBe(401);
  });

  // Test 17: Invalid event_type returns 400
  it('invalid event_type returns 400 validation error', async () => {
    seedAuditLogs(sqlite, 5);
    const app = makeApp();
    const res = await getAuditLogs(app, { event_type: 'INVALID_EVENT' });

    expect(res.status).toBe(400);
  });

  // Test 18: limit > 200 rejected
  it('limit > 200 is rejected with 400', async () => {
    seedAuditLogs(sqlite, 5);
    const app = makeApp();
    const res = await getAuditLogs(app, { limit: '201' });

    expect(res.status).toBe(400);
  });
});
