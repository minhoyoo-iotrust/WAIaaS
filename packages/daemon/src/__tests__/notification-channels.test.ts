/**
 * Tests for notification channel adapters (Telegram, Discord, ntfy),
 * NotificationEventType enum, and message templates.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { NotificationPayload } from '@waiaas/core';
import { NOTIFICATION_EVENT_TYPES } from '@waiaas/core';
import { TelegramChannel } from '../notifications/channels/telegram.js';
import { DiscordChannel } from '../notifications/channels/discord.js';
import { NtfyChannel } from '../notifications/channels/ntfy.js';
import { getNotificationMessage } from '../notifications/templates/message-templates.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makePayload(overrides?: Partial<NotificationPayload>): NotificationPayload {
  return {
    eventType: 'TX_CONFIRMED',
    agentId: 'agent-001',
    message: 'Transaction abc123 confirmed. Amount: 1.5 SOL',
    details: { txId: 'abc123', amount: '1.5 SOL' },
    timestamp: 1700000000,
    ...overrides,
  };
}

const mockFetch = vi.fn<typeof fetch>();
vi.stubGlobal('fetch', mockFetch);

afterEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal('fetch', mockFetch);
});

// ---------------------------------------------------------------------------
// NotificationEventType enum tests
// ---------------------------------------------------------------------------

describe('NotificationEventType', () => {
  it('has exactly 21 event types', () => {
    expect(NOTIFICATION_EVENT_TYPES).toHaveLength(21);
  });

  it('contains the 5 new event types added in v1.3', () => {
    const newTypes = [
      'TX_APPROVAL_REQUIRED',
      'TX_APPROVAL_EXPIRED',
      'AUTO_STOP_TRIGGERED',
      'SESSION_CREATED',
      'DAILY_SUMMARY',
    ];
    for (const t of newTypes) {
      expect(NOTIFICATION_EVENT_TYPES).toContain(t);
    }
  });

  it('contains all 16 original event types', () => {
    const originalTypes = [
      'TX_REQUESTED', 'TX_QUEUED', 'TX_SUBMITTED', 'TX_CONFIRMED',
      'TX_FAILED', 'TX_CANCELLED', 'TX_DOWNGRADED_DELAY',
      'POLICY_VIOLATION', 'AGENT_SUSPENDED',
      'KILL_SWITCH_ACTIVATED', 'KILL_SWITCH_RECOVERED',
      'SESSION_EXPIRING_SOON', 'SESSION_EXPIRED',
      'OWNER_SET', 'OWNER_REMOVED', 'OWNER_VERIFIED',
    ];
    for (const t of originalTypes) {
      expect(NOTIFICATION_EVENT_TYPES).toContain(t);
    }
  });
});

// ---------------------------------------------------------------------------
// Message template tests
// ---------------------------------------------------------------------------

describe('getNotificationMessage', () => {
  it('returns English template for TX_CONFIRMED', () => {
    const msg = getNotificationMessage('TX_CONFIRMED', 'en');
    expect(msg.title).toBe('Transaction Confirmed');
    expect(msg.body).toContain('{txId}');
  });

  it('returns Korean template for KILL_SWITCH_ACTIVATED', () => {
    const msg = getNotificationMessage('KILL_SWITCH_ACTIVATED', 'ko');
    expect(msg.title).toBe('Kill Switch 발동');
    expect(msg.body).toContain('{activatedBy}');
  });

  it('interpolates variables in title and body', () => {
    const msg = getNotificationMessage('TX_CONFIRMED', 'en', {
      txId: 'tx-999',
      amount: '2.0 SOL',
    });
    expect(msg.title).toBe('Transaction Confirmed');
    expect(msg.body).toBe('Transaction tx-999 confirmed. Amount: 2.0 SOL');
  });

  it('returns template with unresolved vars when vars not provided', () => {
    const msg = getNotificationMessage('DAILY_SUMMARY', 'en');
    expect(msg.body).toContain('{agentCount}');
    expect(msg.body).toContain('{txCount}');
    expect(msg.body).toContain('{sessionCount}');
  });

  it('returns Korean template for DAILY_SUMMARY', () => {
    const msg = getNotificationMessage('DAILY_SUMMARY', 'ko', {
      agentCount: '5',
      txCount: '42',
      sessionCount: '10',
    });
    expect(msg.title).toBe('일일 요약');
    expect(msg.body).toContain('5');
    expect(msg.body).toContain('42');
    expect(msg.body).toContain('10');
  });
});

// ---------------------------------------------------------------------------
// TelegramChannel tests
// ---------------------------------------------------------------------------

describe('TelegramChannel', () => {
  let channel: TelegramChannel;

  beforeEach(() => {
    channel = new TelegramChannel();
    mockFetch.mockResolvedValue(new Response('{}', { status: 200 }));
  });

  it('has name "telegram"', () => {
    expect(channel.name).toBe('telegram');
  });

  it('initialize() with valid config succeeds', async () => {
    await expect(
      channel.initialize({ telegram_bot_token: 'token123', telegram_chat_id: '456' }),
    ).resolves.toBeUndefined();
  });

  it('initialize() throws with missing token', async () => {
    await expect(channel.initialize({ telegram_chat_id: '456' })).rejects.toThrow(
      'telegram_bot_token and telegram_chat_id required',
    );
  });

  it('initialize() throws with missing chat_id', async () => {
    await expect(channel.initialize({ telegram_bot_token: 'token123' })).rejects.toThrow(
      'telegram_bot_token and telegram_chat_id required',
    );
  });

  it('send() calls Telegram Bot API with correct URL and MarkdownV2', async () => {
    await channel.initialize({ telegram_bot_token: 'bot-token', telegram_chat_id: '12345' });
    await channel.send(makePayload());

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0]!;
    expect(url).toBe('https://api.telegram.org/botbot-token/sendMessage');
    const body = JSON.parse(options!.body as string);
    expect(body.chat_id).toBe('12345');
    expect(body.parse_mode).toBe('MarkdownV2');
  });

  it('send() formats message with MarkdownV2 escaping', async () => {
    await channel.initialize({ telegram_bot_token: 'tok', telegram_chat_id: '1' });
    // Message with special chars that need escaping
    await channel.send(makePayload({ message: 'Amount: 1.5 SOL (test)' }));

    const body = JSON.parse((mockFetch.mock.calls[0]![1]!.body as string));
    // MarkdownV2 should escape . and ( )
    expect(body.text).toContain('\\.');
    expect(body.text).toContain('\\(');
    expect(body.text).toContain('\\)');
  });

  it('send() throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce(new Response('Bad Request', { status: 400 }));
    await channel.initialize({ telegram_bot_token: 'tok', telegram_chat_id: '1' });
    await expect(channel.send(makePayload())).rejects.toThrow('TelegramChannel: 400');
  });

  it('send() includes chat_id in body', async () => {
    await channel.initialize({ telegram_bot_token: 'tok', telegram_chat_id: '99999' });
    await channel.send(makePayload());

    const body = JSON.parse((mockFetch.mock.calls[0]![1]!.body as string));
    expect(body.chat_id).toBe('99999');
  });
});

// ---------------------------------------------------------------------------
// DiscordChannel tests
// ---------------------------------------------------------------------------

describe('DiscordChannel', () => {
  let channel: DiscordChannel;

  beforeEach(() => {
    channel = new DiscordChannel();
    mockFetch.mockResolvedValue(new Response(null, { status: 200 }));
  });

  it('has name "discord"', () => {
    expect(channel.name).toBe('discord');
  });

  it('initialize() with valid webhook_url succeeds', async () => {
    await expect(
      channel.initialize({ discord_webhook_url: 'https://discord.com/api/webhooks/123/abc' }),
    ).resolves.toBeUndefined();
  });

  it('initialize() throws with missing URL', async () => {
    await expect(channel.initialize({})).rejects.toThrow('discord_webhook_url required');
  });

  it('send() calls webhook URL with Embed payload', async () => {
    await channel.initialize({ discord_webhook_url: 'https://discord.com/api/webhooks/1/x' });
    await channel.send(makePayload());

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0]!;
    expect(url).toBe('https://discord.com/api/webhooks/1/x');
    const body = JSON.parse(options!.body as string);
    expect(body.embeds).toHaveLength(1);
    expect(body.embeds[0].description).toBe('Transaction abc123 confirmed. Amount: 1.5 SOL');
  });

  it('send() maps critical events to red color (0xff0000)', async () => {
    await channel.initialize({ discord_webhook_url: 'https://discord.com/api/webhooks/1/x' });
    await channel.send(makePayload({ eventType: 'KILL_SWITCH_ACTIVATED' }));

    const body = JSON.parse((mockFetch.mock.calls[0]![1]!.body as string));
    expect(body.embeds[0].color).toBe(0xff0000);
  });

  it('send() maps success events to green color (0x00ff00)', async () => {
    await channel.initialize({ discord_webhook_url: 'https://discord.com/api/webhooks/1/x' });
    await channel.send(makePayload({ eventType: 'TX_CONFIRMED' }));

    const body = JSON.parse((mockFetch.mock.calls[0]![1]!.body as string));
    expect(body.embeds[0].color).toBe(0x00ff00);
  });

  it('send() maps failure events to orange color (0xff8c00)', async () => {
    await channel.initialize({ discord_webhook_url: 'https://discord.com/api/webhooks/1/x' });
    await channel.send(makePayload({ eventType: 'TX_FAILED' }));

    const body = JSON.parse((mockFetch.mock.calls[0]![1]!.body as string));
    expect(body.embeds[0].color).toBe(0xff8c00);
  });

  it('send() uses blue color for informational events', async () => {
    await channel.initialize({ discord_webhook_url: 'https://discord.com/api/webhooks/1/x' });
    await channel.send(makePayload({ eventType: 'TX_REQUESTED' }));

    const body = JSON.parse((mockFetch.mock.calls[0]![1]!.body as string));
    expect(body.embeds[0].color).toBe(0x0099ff);
  });

  it('send() includes details as embed fields', async () => {
    await channel.initialize({ discord_webhook_url: 'https://discord.com/api/webhooks/1/x' });
    await channel.send(makePayload({ details: { txHash: 'hash123', chain: 'solana' } }));

    const body = JSON.parse((mockFetch.mock.calls[0]![1]!.body as string));
    const fields = body.embeds[0].fields;
    // 2 default fields (Agent, Event) + 2 detail fields
    expect(fields).toHaveLength(4);
    expect(fields[2].name).toBe('txHash');
    expect(fields[2].value).toBe('hash123');
    expect(fields[3].name).toBe('chain');
    expect(fields[3].value).toBe('solana');
  });

  it('send() throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce(new Response('Rate limited', { status: 429 }));
    await channel.initialize({ discord_webhook_url: 'https://discord.com/api/webhooks/1/x' });
    await expect(channel.send(makePayload())).rejects.toThrow('DiscordChannel: 429');
  });
});

// ---------------------------------------------------------------------------
// NtfyChannel tests
// ---------------------------------------------------------------------------

describe('NtfyChannel', () => {
  let channel: NtfyChannel;

  beforeEach(() => {
    channel = new NtfyChannel();
    mockFetch.mockResolvedValue(new Response('{}', { status: 200 }));
  });

  it('has name "ntfy"', () => {
    expect(channel.name).toBe('ntfy');
  });

  it('initialize() with valid topic succeeds', async () => {
    await expect(channel.initialize({ ntfy_topic: 'waiaas-alerts' })).resolves.toBeUndefined();
  });

  it('initialize() throws with missing topic', async () => {
    await expect(channel.initialize({})).rejects.toThrow('ntfy_topic required');
  });

  it('initialize() uses custom server when provided', async () => {
    await channel.initialize({ ntfy_topic: 'test', ntfy_server: 'https://my-ntfy.example.com' });
    await channel.send(makePayload());

    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toBe('https://my-ntfy.example.com/test');
  });

  it('initialize() defaults to ntfy.sh server', async () => {
    await channel.initialize({ ntfy_topic: 'waiaas' });
    await channel.send(makePayload());

    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toBe('https://ntfy.sh/waiaas');
  });

  it('send() sets Priority header to 5 for KILL_SWITCH_ACTIVATED', async () => {
    await channel.initialize({ ntfy_topic: 'alerts' });
    await channel.send(makePayload({ eventType: 'KILL_SWITCH_ACTIVATED' }));

    const options = mockFetch.mock.calls[0]![1]!;
    expect((options.headers as Record<string, string>)['Priority']).toBe('5');
  });

  it('send() sets Priority header to 4 for TX_FAILED', async () => {
    await channel.initialize({ ntfy_topic: 'alerts' });
    await channel.send(makePayload({ eventType: 'TX_FAILED' }));

    const options = mockFetch.mock.calls[0]![1]!;
    expect((options.headers as Record<string, string>)['Priority']).toBe('4');
  });

  it('send() sets Priority header to 2 for informational events', async () => {
    await channel.initialize({ ntfy_topic: 'alerts' });
    await channel.send(makePayload({ eventType: 'TX_REQUESTED' }));

    const options = mockFetch.mock.calls[0]![1]!;
    expect((options.headers as Record<string, string>)['Priority']).toBe('2');
  });

  it('send() sets Tags header with rotating_light for KILL_SWITCH', async () => {
    await channel.initialize({ ntfy_topic: 'alerts' });
    await channel.send(makePayload({ eventType: 'KILL_SWITCH_ACTIVATED' }));

    const options = mockFetch.mock.calls[0]![1]!;
    expect((options.headers as Record<string, string>)['Tags']).toBe('rotating_light,warning');
  });

  it('send() sets Tags header with key for SESSION events', async () => {
    await channel.initialize({ ntfy_topic: 'alerts' });
    await channel.send(makePayload({ eventType: 'SESSION_CREATED' }));

    const options = mockFetch.mock.calls[0]![1]!;
    expect((options.headers as Record<string, string>)['Tags']).toBe('key');
  });

  it('send() sends plain text body with agent and timestamp', async () => {
    await channel.initialize({ ntfy_topic: 'alerts' });
    const payload = makePayload({ agentId: 'test-agent' });
    await channel.send(payload);

    const body = mockFetch.mock.calls[0]![1]!.body as string;
    expect(body).toContain('Transaction abc123 confirmed. Amount: 1.5 SOL');
    expect(body).toContain('Agent: test-agent');
    expect(body).toContain('Time:');
  });

  it('send() throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce(new Response('Server Error', { status: 500 }));
    await channel.initialize({ ntfy_topic: 'alerts' });
    await expect(channel.send(makePayload())).rejects.toThrow('NtfyChannel: 500');
  });

  it('send() sets Title header with event type', async () => {
    await channel.initialize({ ntfy_topic: 'alerts' });
    await channel.send(makePayload({ eventType: 'TX_CONFIRMED' }));

    const options = mockFetch.mock.calls[0]![1]!;
    expect((options.headers as Record<string, string>)['Title']).toBe('[WAIaaS] TX CONFIRMED');
  });
});
