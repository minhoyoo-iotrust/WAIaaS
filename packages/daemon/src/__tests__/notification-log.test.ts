/**
 * Tests for notification_logs table migration + NotificationService delivery logging.
 *
 * A. Migration tests: table creation, schema_version, idempotency, CHECK constraints.
 * B. Logging integration tests: sent/failed logging, broadcast, fire-and-forget.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { INotificationChannel } from '@waiaas/core';
import { NotificationService } from '../notifications/notification-service.js';
import {
  createDatabase,
  pushSchema,
  notificationLogs,
  auditLog,
} from '../infrastructure/database/index.js';
import type { DatabaseConnection } from '../infrastructure/database/index.js';
import { eq } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Mock channel factory (same pattern as notification-service.test.ts)
// ---------------------------------------------------------------------------

function createMockChannel(name: string, shouldFail = false): INotificationChannel {
  return {
    name,
    initialize: vi.fn().mockResolvedValue(undefined),
    send: shouldFail
      ? vi.fn().mockRejectedValue(new Error(`${name} failed`))
      : vi.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// In-memory database helper
// ---------------------------------------------------------------------------

function createTestDb(): DatabaseConnection {
  const conn = createDatabase(':memory:');
  pushSchema(conn.sqlite);
  return conn;
}

// ---------------------------------------------------------------------------
// A. Migration tests
// ---------------------------------------------------------------------------

describe('Migration: notification_logs + schema_version', () => {
  let conn: DatabaseConnection;

  beforeEach(() => {
    conn = createTestDb();
  });

  it('pushSchema() creates notification_logs table', () => {
    const tables = conn.sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='notification_logs'",
      )
      .all() as Array<{ name: string }>;

    expect(tables).toHaveLength(1);
    expect(tables[0]!.name).toBe('notification_logs');
  });

  it('pushSchema() creates schema_version table with version=1', () => {
    const tables = conn.sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'",
      )
      .all() as Array<{ name: string }>;
    expect(tables).toHaveLength(1);

    const rows = conn.sqlite
      .prepare('SELECT version, description FROM schema_version WHERE version = 1')
      .all() as Array<{ version: number; description: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.version).toBe(1);
    expect(rows[0]!.description).toBe('Initial schema (16 tables)');
  });

  it('pushSchema() called twice is idempotent (no error)', () => {
    // Already called once in beforeEach
    expect(() => pushSchema(conn.sqlite)).not.toThrow();

    // schema_version should have versions from initial schema + migrations
    // (v1 = initial schema, v2 = EVM network CHECK expansion)
    const rows = conn.sqlite
      .prepare('SELECT version FROM schema_version ORDER BY version')
      .all() as Array<{ version: number }>;
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows[0]!.version).toBe(1);
    expect(rows[1]!.version).toBe(2);
  });

  it('notification_logs CHECK constraint rejects invalid status', () => {
    expect(() => {
      conn.sqlite
        .prepare(
          'INSERT INTO notification_logs (id, event_type, channel, status, created_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run('test-id', 'TX_CONFIRMED', 'telegram', 'invalid_status', 1000);
    }).toThrow();
  });

  it('notification_logs CHECK constraint accepts sent and failed', () => {
    conn.sqlite
      .prepare(
        'INSERT INTO notification_logs (id, event_type, channel, status, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run('id-1', 'TX_CONFIRMED', 'telegram', 'sent', 1000);
    conn.sqlite
      .prepare(
        'INSERT INTO notification_logs (id, event_type, channel, status, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run('id-2', 'TX_FAILED', 'discord', 'failed', 1001);

    const rows = conn.sqlite
      .prepare('SELECT id, status FROM notification_logs ORDER BY id')
      .all() as Array<{ id: string; status: string }>;
    expect(rows).toHaveLength(2);
    expect(rows[0]!.status).toBe('sent');
    expect(rows[1]!.status).toBe('failed');
  });

  it('notification_logs has correct columns', () => {
    const columns = conn.sqlite
      .prepare("PRAGMA table_info('notification_logs')")
      .all() as Array<{ name: string; type: string; notnull: number }>;
    const colNames = columns.map((c) => c.name);
    expect(colNames).toEqual([
      'id',
      'event_type',
      'wallet_id',
      'channel',
      'status',
      'error',
      'message',
      'created_at',
    ]);
  });
});

// ---------------------------------------------------------------------------
// B. Logging integration tests
// ---------------------------------------------------------------------------

describe('NotificationService delivery logging', () => {
  let conn: DatabaseConnection;

  beforeEach(() => {
    vi.restoreAllMocks();
    conn = createTestDb();
  });

  it('single channel success -> notification_logs has status=sent', async () => {
    const service = new NotificationService({ db: conn.db });
    const ch = createMockChannel('telegram');
    service.addChannel(ch);

    await service.notify('TX_CONFIRMED', 'wallet-1', { txId: 'tx-1', amount: '1 SOL' });

    const logs = conn.db.select().from(notificationLogs).all();
    expect(logs).toHaveLength(1);
    expect(logs[0]!.channel).toBe('telegram');
    expect(logs[0]!.status).toBe('sent');
    expect(logs[0]!.eventType).toBe('TX_CONFIRMED');
    expect(logs[0]!.walletId).toBe('wallet-1');
    expect(logs[0]!.error).toBeNull();
  });

  it('first channel fails, second succeeds -> 2 records (failed + sent)', async () => {
    const service = new NotificationService({ db: conn.db });
    const ch1 = createMockChannel('telegram', true);
    const ch2 = createMockChannel('discord');
    service.addChannel(ch1);
    service.addChannel(ch2);

    await service.notify('TX_CONFIRMED', 'wallet-1');

    const logs = conn.db
      .select()
      .from(notificationLogs)
      .orderBy(notificationLogs.channel)
      .all();
    expect(logs).toHaveLength(2);

    const discordLog = logs.find((l) => l.channel === 'discord');
    const telegramLog = logs.find((l) => l.channel === 'telegram');
    expect(discordLog!.status).toBe('sent');
    expect(telegramLog!.status).toBe('failed');
    expect(telegramLog!.error).toContain('telegram failed');
  });

  it('all channels fail -> N failed records + CRITICAL audit_log', async () => {
    const service = new NotificationService({ db: conn.db });
    service.addChannel(createMockChannel('telegram', true));
    service.addChannel(createMockChannel('discord', true));

    await service.notify('TX_CONFIRMED', 'wallet-1');

    // notification_logs: 2 failed entries
    const logs = conn.db.select().from(notificationLogs).all();
    expect(logs).toHaveLength(2);
    expect(logs.every((l) => l.status === 'failed')).toBe(true);

    // audit_log: 1 CRITICAL entry
    const auditLogs = conn.db.select().from(auditLog).all();
    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0]!.eventType).toBe('NOTIFICATION_TOTAL_FAILURE');
    expect(auditLogs[0]!.severity).toBe('critical');
  });

  it('broadcast success -> each channel gets sent record', async () => {
    const service = new NotificationService({ db: conn.db });
    const ch1 = createMockChannel('telegram');
    const ch2 = createMockChannel('discord');
    const ch3 = createMockChannel('ntfy');
    service.addChannel(ch1);
    service.addChannel(ch2);
    service.addChannel(ch3);

    await service.notify('KILL_SWITCH_ACTIVATED', 'wallet-1');

    const logs = conn.db.select().from(notificationLogs).all();
    expect(logs).toHaveLength(3);
    expect(logs.every((l) => l.status === 'sent')).toBe(true);

    const channels = logs.map((l) => l.channel).sort();
    expect(channels).toEqual(['discord', 'ntfy', 'telegram']);
  });

  it('broadcast partial failure -> failed channels get failed, success get sent', async () => {
    const service = new NotificationService({ db: conn.db });
    const ch1 = createMockChannel('telegram', true); // fails
    const ch2 = createMockChannel('discord'); // succeeds
    const ch3 = createMockChannel('ntfy'); // succeeds
    service.addChannel(ch1);
    service.addChannel(ch2);
    service.addChannel(ch3);

    await service.notify('KILL_SWITCH_ACTIVATED', 'wallet-1');

    const logs = conn.db.select().from(notificationLogs).all();
    expect(logs).toHaveLength(3);

    const telegramLog = logs.find((l) => l.channel === 'telegram');
    const discordLog = logs.find((l) => l.channel === 'discord');
    const ntfyLog = logs.find((l) => l.channel === 'ntfy');
    expect(telegramLog!.status).toBe('failed');
    expect(telegramLog!.error).toContain('telegram failed');
    expect(discordLog!.status).toBe('sent');
    expect(ntfyLog!.status).toBe('sent');
  });

  it('no DB -> logs nothing without error', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const service = new NotificationService(); // no db
    const ch = createMockChannel('telegram');
    service.addChannel(ch);

    await expect(
      service.notify('TX_CONFIRMED', 'wallet-1'),
    ).resolves.toBeUndefined();

    // Channel should still receive the notification
    expect(ch.send).toHaveBeenCalledTimes(1);
    consoleErrorSpy.mockRestore();
  });

  it('logDelivery failure does not block notification flow (fire-and-forget)', async () => {
    const service = new NotificationService({ db: conn.db });
    const ch = createMockChannel('telegram');
    service.addChannel(ch);

    // Drop the notification_logs table to force DB error in logDelivery
    conn.sqlite.exec('DROP TABLE notification_logs');

    // Notification should still succeed despite logging failure
    await expect(
      service.notify('TX_CONFIRMED', 'wallet-1'),
    ).resolves.toBeUndefined();

    expect(ch.send).toHaveBeenCalledTimes(1);
  });

  it('notification log records correct eventType and walletId', async () => {
    const service = new NotificationService({ db: conn.db });
    const ch = createMockChannel('ntfy');
    service.addChannel(ch);

    await service.notify('SESSION_EXPIRED', 'agent-42', { sessionId: 'sess-1' });

    const logs = conn.db
      .select()
      .from(notificationLogs)
      .where(eq(notificationLogs.walletId, 'agent-42'))
      .all();
    expect(logs).toHaveLength(1);
    expect(logs[0]!.eventType).toBe('SESSION_EXPIRED');
    expect(logs[0]!.walletId).toBe('agent-42');
    expect(logs[0]!.channel).toBe('ntfy');
  });

  it('failed delivery log records error message', async () => {
    const service = new NotificationService({ db: conn.db });
    const ch = createMockChannel('discord', true);
    const ch2 = createMockChannel('ntfy');
    service.addChannel(ch);
    service.addChannel(ch2);

    await service.notify('TX_FAILED', 'wallet-1', { txId: 'tx-fail' });

    const failedLogs = conn.db
      .select()
      .from(notificationLogs)
      .where(eq(notificationLogs.status, 'failed'))
      .all();
    expect(failedLogs).toHaveLength(1);
    expect(failedLogs[0]!.error).toBe('discord failed');
  });

  it('each notification log has unique UUID v7 id', async () => {
    const service = new NotificationService({ db: conn.db });
    const ch1 = createMockChannel('telegram');
    const ch2 = createMockChannel('discord');
    service.addChannel(ch1);
    service.addChannel(ch2);

    // Broadcast: both channels get logs
    await service.notify('KILL_SWITCH_ACTIVATED', 'wallet-1');

    const logs = conn.db.select().from(notificationLogs).all();
    expect(logs).toHaveLength(2);
    expect(logs[0]!.id).not.toBe(logs[1]!.id);
    // UUID v7 format check
    expect(logs[0]!.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
