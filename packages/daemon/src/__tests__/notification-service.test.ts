/**
 * Tests for NotificationService orchestrator: priority delivery, fallback chain,
 * broadcast mode, rate limiting, CRITICAL audit_log, and message template integration.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { INotificationChannel, NotificationPayload } from '@waiaas/core';
import { NotificationService } from '../notifications/notification-service.js';
import { createDatabase, pushSchema, auditLog } from '../infrastructure/database/index.js';
import { DaemonConfigSchema } from '../infrastructure/config/loader.js';

// ---------------------------------------------------------------------------
// Mock channel factory
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

function createTestDb() {
  const conn = createDatabase(':memory:');
  pushSchema(conn.sqlite);
  return conn;
}

// ---------------------------------------------------------------------------
// 1. Priority delivery tests
// ---------------------------------------------------------------------------

describe('Priority delivery', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('notify() with single channel sends to it', async () => {
    const service = new NotificationService();
    const ch = createMockChannel('telegram');
    service.addChannel(ch);

    await service.notify('TX_CONFIRMED', 'wallet-1', { txId: 'tx-1', amount: '1 SOL' });

    expect(ch.send).toHaveBeenCalledTimes(1);
    const payload = (ch.send as ReturnType<typeof vi.fn>).mock.calls[0]![0] as NotificationPayload;
    expect(payload.eventType).toBe('TX_CONFIRMED');
    expect(payload.walletId).toBe('wallet-1');
  });

  it('notify() with 2 channels sends to first only (on success)', async () => {
    const service = new NotificationService();
    const ch1 = createMockChannel('telegram');
    const ch2 = createMockChannel('discord');
    service.addChannel(ch1);
    service.addChannel(ch2);

    await service.notify('TX_CONFIRMED', 'wallet-1');

    expect(ch1.send).toHaveBeenCalledTimes(1);
    expect(ch2.send).not.toHaveBeenCalled();
  });

  it('no channels configured -- no error (silent no-op)', async () => {
    const service = new NotificationService();
    // Should not throw
    await expect(service.notify('TX_CONFIRMED', 'wallet-1')).resolves.toBeUndefined();
  });

  it('getChannelNames() returns configured channel names', () => {
    const service = new NotificationService();
    service.addChannel(createMockChannel('telegram'));
    service.addChannel(createMockChannel('discord'));
    service.addChannel(createMockChannel('ntfy'));

    expect(service.getChannelNames()).toEqual(['telegram', 'discord', 'ntfy']);
  });

  it('notify() passes correct payload structure to channel', async () => {
    const service = new NotificationService();
    const ch = createMockChannel('telegram');
    service.addChannel(ch);

    await service.notify('TX_FAILED', 'agent-2', { txId: 'tx-fail' }, { error: 'timeout' });

    const payload = (ch.send as ReturnType<typeof vi.fn>).mock.calls[0]![0] as NotificationPayload;
    expect(payload.eventType).toBe('TX_FAILED');
    expect(payload.walletId).toBe('agent-2');
    expect(payload.message).toContain('Transaction Failed');
    expect(payload.details).toEqual({ error: 'timeout' });
    expect(typeof payload.timestamp).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// 2. Fallback chain tests
// ---------------------------------------------------------------------------

describe('Fallback chain', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('first channel fails -> second channel receives', async () => {
    const service = new NotificationService();
    const ch1 = createMockChannel('telegram', true);
    const ch2 = createMockChannel('discord');
    service.addChannel(ch1);
    service.addChannel(ch2);

    await service.notify('TX_CONFIRMED', 'wallet-1');

    expect(ch1.send).toHaveBeenCalledTimes(1);
    expect(ch2.send).toHaveBeenCalledTimes(1);
  });

  it('first two fail -> third succeeds', async () => {
    const service = new NotificationService();
    const ch1 = createMockChannel('telegram', true);
    const ch2 = createMockChannel('discord', true);
    const ch3 = createMockChannel('ntfy');
    service.addChannel(ch1);
    service.addChannel(ch2);
    service.addChannel(ch3);

    await service.notify('TX_CONFIRMED', 'wallet-1');

    expect(ch1.send).toHaveBeenCalledTimes(1);
    expect(ch2.send).toHaveBeenCalledTimes(1);
    expect(ch3.send).toHaveBeenCalledTimes(1);
  });

  it('channel failure is caught and retried on next channel', async () => {
    const service = new NotificationService();
    const ch1 = createMockChannel('telegram', true);
    const ch2 = createMockChannel('discord');
    service.addChannel(ch1);
    service.addChannel(ch2);

    // Should not throw despite ch1 failing
    await expect(service.notify('TX_REQUESTED', 'wallet-1')).resolves.toBeUndefined();
  });

  it('fallback preserves same payload across attempts', async () => {
    const service = new NotificationService();
    const ch1 = createMockChannel('telegram', true);
    const ch2 = createMockChannel('discord');
    service.addChannel(ch1);
    service.addChannel(ch2);

    await service.notify('TX_CONFIRMED', 'wallet-1', { txId: 'tx-99' });

    const p1 = (ch1.send as ReturnType<typeof vi.fn>).mock.calls[0]![0] as NotificationPayload;
    const p2 = (ch2.send as ReturnType<typeof vi.fn>).mock.calls[0]![0] as NotificationPayload;
    expect(p1.eventType).toBe(p2.eventType);
    expect(p1.walletId).toBe(p2.walletId);
    expect(p1.message).toBe(p2.message);
    expect(p1.timestamp).toBe(p2.timestamp);
  });

  it('stops trying after first successful channel', async () => {
    const service = new NotificationService();
    const ch1 = createMockChannel('telegram', true);
    const ch2 = createMockChannel('discord');
    const ch3 = createMockChannel('ntfy');
    service.addChannel(ch1);
    service.addChannel(ch2);
    service.addChannel(ch3);

    await service.notify('TX_CONFIRMED', 'wallet-1');

    expect(ch1.send).toHaveBeenCalledTimes(1);
    expect(ch2.send).toHaveBeenCalledTimes(1);
    expect(ch3.send).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 3. Broadcast tests
// ---------------------------------------------------------------------------

describe('Broadcast', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('KILL_SWITCH_ACTIVATED sends to ALL channels', async () => {
    const service = new NotificationService();
    const ch1 = createMockChannel('telegram');
    const ch2 = createMockChannel('discord');
    const ch3 = createMockChannel('ntfy');
    service.addChannel(ch1);
    service.addChannel(ch2);
    service.addChannel(ch3);

    await service.notify('KILL_SWITCH_ACTIVATED', 'wallet-1');

    expect(ch1.send).toHaveBeenCalledTimes(1);
    expect(ch2.send).toHaveBeenCalledTimes(1);
    expect(ch3.send).toHaveBeenCalledTimes(1);
  });

  it('KILL_SWITCH_RECOVERED sends to ALL channels', async () => {
    const service = new NotificationService();
    const ch1 = createMockChannel('telegram');
    const ch2 = createMockChannel('discord');
    service.addChannel(ch1);
    service.addChannel(ch2);

    await service.notify('KILL_SWITCH_RECOVERED', 'wallet-1');

    expect(ch1.send).toHaveBeenCalledTimes(1);
    expect(ch2.send).toHaveBeenCalledTimes(1);
  });

  it('AUTO_STOP_TRIGGERED sends to ALL channels', async () => {
    const service = new NotificationService();
    const ch1 = createMockChannel('telegram');
    const ch2 = createMockChannel('discord');
    service.addChannel(ch1);
    service.addChannel(ch2);

    await service.notify('AUTO_STOP_TRIGGERED', 'wallet-1');

    expect(ch1.send).toHaveBeenCalledTimes(1);
    expect(ch2.send).toHaveBeenCalledTimes(1);
  });

  it('non-broadcast event does NOT send to all channels', async () => {
    const service = new NotificationService();
    const ch1 = createMockChannel('telegram');
    const ch2 = createMockChannel('discord');
    service.addChannel(ch1);
    service.addChannel(ch2);

    await service.notify('TX_CONFIRMED', 'wallet-1');

    expect(ch1.send).toHaveBeenCalledTimes(1);
    // Non-broadcast: should NOT fall through to ch2 if ch1 succeeds
    expect(ch2.send).not.toHaveBeenCalled();
  });

  it('broadcast with partial failure still sends to working channels', async () => {
    const service = new NotificationService();
    const ch1 = createMockChannel('telegram', true); // fails
    const ch2 = createMockChannel('discord');
    const ch3 = createMockChannel('ntfy');
    service.addChannel(ch1);
    service.addChannel(ch2);
    service.addChannel(ch3);

    await service.notify('KILL_SWITCH_ACTIVATED', 'wallet-1');

    expect(ch1.send).toHaveBeenCalledTimes(1);
    expect(ch2.send).toHaveBeenCalledTimes(1);
    expect(ch3.send).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// 4. Total failure + audit_log tests
// ---------------------------------------------------------------------------

describe('Total failure + audit_log', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('all channels fail in fallback -> CRITICAL audit_log entry', async () => {
    const { db } = createTestDb();
    const service = new NotificationService({ db });
    service.addChannel(createMockChannel('telegram', true));
    service.addChannel(createMockChannel('discord', true));

    await service.notify('TX_CONFIRMED', 'wallet-1');

    const logs = db.select().from(auditLog).all();
    expect(logs).toHaveLength(1);
    expect(logs[0]!.eventType).toBe('NOTIFICATION_TOTAL_FAILURE');
    expect(logs[0]!.severity).toBe('critical');
    expect(logs[0]!.actor).toBe('system');
    expect(logs[0]!.walletId).toBe('wallet-1');
  });

  it('all channels fail in broadcast -> CRITICAL audit_log entry', async () => {
    const { db } = createTestDb();
    const service = new NotificationService({ db });
    service.addChannel(createMockChannel('telegram', true));
    service.addChannel(createMockChannel('discord', true));

    await service.notify('KILL_SWITCH_ACTIVATED', 'wallet-1');

    const logs = db.select().from(auditLog).all();
    expect(logs).toHaveLength(1);
    expect(logs[0]!.eventType).toBe('NOTIFICATION_TOTAL_FAILURE');
    expect(logs[0]!.severity).toBe('critical');
  });

  it('audit log entry contains originalEvent, message, errors', async () => {
    const { db } = createTestDb();
    const service = new NotificationService({ db });
    service.addChannel(createMockChannel('telegram', true));

    await service.notify('TX_FAILED', 'agent-2', { txId: 'tx-fail-1' });

    const logs = db.select().from(auditLog).all();
    expect(logs).toHaveLength(1);
    const details = JSON.parse(logs[0]!.details);
    expect(details.originalEvent).toBe('TX_FAILED');
    expect(details.message).toBeTruthy();
    expect(details.errors).toBe('All channels failed');
  });

  it('audit log severity = critical', async () => {
    const { db } = createTestDb();
    const service = new NotificationService({ db });
    service.addChannel(createMockChannel('ch1', true));

    await service.notify('TX_CONFIRMED', 'wallet-1');

    const logs = db.select().from(auditLog).all();
    expect(logs[0]!.severity).toBe('critical');
  });

  it('no DB available -> logs to console.error (no crash)', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const service = new NotificationService(); // no db
    service.addChannel(createMockChannel('telegram', true));

    await expect(service.notify('TX_CONFIRMED', 'wallet-1')).resolves.toBeUndefined();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('CRITICAL'),
      expect.objectContaining({ eventType: 'TX_CONFIRMED', walletId: 'wallet-1' }),
    );
    consoleErrorSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// 5. Rate limiter tests
// ---------------------------------------------------------------------------

describe('Rate limiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('channel under limit -> sends successfully', async () => {
    const service = new NotificationService({ config: { rateLimitRpm: 5 } });
    const ch = createMockChannel('telegram');
    service.addChannel(ch);

    await service.notify('TX_CONFIRMED', 'wallet-1');

    expect(ch.send).toHaveBeenCalledTimes(1);
  });

  it('channel at limit -> throws rate limit error -> triggers fallback', async () => {
    const service = new NotificationService({ config: { rateLimitRpm: 2 } });
    const ch1 = createMockChannel('telegram');
    const ch2 = createMockChannel('discord');
    service.addChannel(ch1);
    service.addChannel(ch2);

    // Send 2 (at limit)
    await service.notify('TX_CONFIRMED', 'wallet-1');
    await service.notify('TX_REQUESTED', 'wallet-1');

    // 3rd should be rate limited on ch1, falls back to ch2
    await service.notify('TX_SUBMITTED', 'wallet-1');

    expect(ch1.send).toHaveBeenCalledTimes(2);
    expect(ch2.send).toHaveBeenCalledTimes(1);
  });

  it('rate limit resets after window passes', async () => {
    const service = new NotificationService({ config: { rateLimitRpm: 1 } });
    const ch = createMockChannel('telegram');
    service.addChannel(ch);

    await service.notify('TX_CONFIRMED', 'wallet-1');
    expect(ch.send).toHaveBeenCalledTimes(1);

    // Advance past the 1-minute window
    vi.advanceTimersByTime(61_000);

    await service.notify('TX_REQUESTED', 'wallet-1');
    expect(ch.send).toHaveBeenCalledTimes(2);
  });

  it('different channels have independent rate limits', async () => {
    const service = new NotificationService({ config: { rateLimitRpm: 1 } });
    const ch1 = createMockChannel('telegram');
    const ch2 = createMockChannel('discord');
    service.addChannel(ch1);
    service.addChannel(ch2);

    // First notify goes to ch1 (succeeds, non-broadcast)
    await service.notify('TX_CONFIRMED', 'wallet-1');
    expect(ch1.send).toHaveBeenCalledTimes(1);

    // Second notify: ch1 is rate limited, falls back to ch2
    await service.notify('TX_REQUESTED', 'wallet-1');
    expect(ch1.send).toHaveBeenCalledTimes(1); // still 1 (rate limited)
    expect(ch2.send).toHaveBeenCalledTimes(1); // fallback worked
  });

  it('rate limit config is respected (custom RPM)', async () => {
    const service = new NotificationService({ config: { rateLimitRpm: 3 } });
    const ch1 = createMockChannel('telegram');
    const ch2 = createMockChannel('discord');
    service.addChannel(ch1);
    service.addChannel(ch2);

    // Send 3 times (at limit)
    await service.notify('TX_CONFIRMED', 'wallet-1');
    await service.notify('TX_REQUESTED', 'wallet-1');
    await service.notify('TX_SUBMITTED', 'wallet-1');

    expect(ch1.send).toHaveBeenCalledTimes(3);

    // 4th should fall back
    await service.notify('TX_QUEUED', 'wallet-1');
    expect(ch1.send).toHaveBeenCalledTimes(3); // still 3
    expect(ch2.send).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// 6. Message template integration tests
// ---------------------------------------------------------------------------

describe('Message template integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('notify() with locale=en produces English message', async () => {
    const service = new NotificationService({ config: { locale: 'en' } });
    const ch = createMockChannel('telegram');
    service.addChannel(ch);

    await service.notify('TX_CONFIRMED', 'wallet-1', { txId: 'tx-123', amount: '1 SOL' });

    const payload = (ch.send as ReturnType<typeof vi.fn>).mock.calls[0]![0] as NotificationPayload;
    expect(payload.message).toContain('Transaction Confirmed');
    expect(payload.message).toContain('tx-123');
    expect(payload.message).toContain('1 SOL');
  });

  it('notify() with locale=ko produces Korean message', async () => {
    const service = new NotificationService({ config: { locale: 'ko' } });
    const ch = createMockChannel('telegram');
    service.addChannel(ch);

    await service.notify('KILL_SWITCH_ACTIVATED', 'wallet-1', { activatedBy: 'owner' });

    const payload = (ch.send as ReturnType<typeof vi.fn>).mock.calls[0]![0] as NotificationPayload;
    expect(payload.message).toContain('Kill Switch');
  });

  it('notify() interpolates vars into message body', async () => {
    const service = new NotificationService({ config: { locale: 'en' } });
    const ch = createMockChannel('telegram');
    service.addChannel(ch);

    await service.notify('SESSION_EXPIRED', 'wallet-1', { sessionId: 'sess-abc' });

    const payload = (ch.send as ReturnType<typeof vi.fn>).mock.calls[0]![0] as NotificationPayload;
    expect(payload.message).toContain('sess-abc');
  });
});

// ---------------------------------------------------------------------------
// 7. Config integration tests (DaemonConfigSchema new fields)
// ---------------------------------------------------------------------------

describe('Config integration', () => {
  it('DaemonConfigSchema defaults locale to en', () => {
    const config = DaemonConfigSchema.parse({});
    expect(config.notifications.locale).toBe('en');
  });

  it('DaemonConfigSchema defaults rate_limit_rpm to 20', () => {
    const config = DaemonConfigSchema.parse({});
    expect(config.notifications.rate_limit_rpm).toBe(20);
  });

  it('DaemonConfigSchema notifications section parses all fields', () => {
    const config = DaemonConfigSchema.parse({
      notifications: {
        enabled: true,
        locale: 'ko',
        rate_limit_rpm: 10,
        telegram_bot_token: 'tok',
        telegram_chat_id: '123',
        discord_webhook_url: 'https://discord.com/api/webhooks/1/x',
        ntfy_server: 'https://custom.ntfy.sh',
        ntfy_topic: 'waiaas',
      },
    });
    expect(config.notifications.enabled).toBe(true);
    expect(config.notifications.locale).toBe('ko');
    expect(config.notifications.rate_limit_rpm).toBe(10);
    expect(config.notifications.telegram_bot_token).toBe('tok');
    expect(config.notifications.discord_webhook_url).toBe('https://discord.com/api/webhooks/1/x');
    expect(config.notifications.ntfy_topic).toBe('waiaas');
  });
});
