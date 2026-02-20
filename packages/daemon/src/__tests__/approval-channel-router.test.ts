/**
 * ApprovalChannelRouter unit tests.
 *
 * Tests cover:
 *   1. Explicit method routing (CHAN-05): wallet's owner_approval_method routes to correct channel
 *   2. Global fallback (CHAN-06): 5-priority order when method is null
 *   3. SDK disabled fallback (CHAN-07): SDK channels skipped when signing_sdk.enabled=false
 *   4. Edge cases: wallet not found, SDK channel errors propagate
 *
 * All DB calls and SettingsService are mocked -- no actual DB or settings.
 *
 * @see packages/daemon/src/services/signing-sdk/approval-channel-router.ts
 */

import { describe, it, expect, vi } from 'vitest';
import { ApprovalChannelRouter } from '../services/signing-sdk/approval-channel-router.js';
import type { NtfySigningChannel } from '../services/signing-sdk/channels/ntfy-signing-channel.js';
import type { TelegramSigningChannel } from '../services/signing-sdk/channels/telegram-signing-channel.js';
import type { SettingsService } from '../infrastructure/settings/settings-service.js';
import type { SendRequestParams } from '../services/signing-sdk/channels/ntfy-signing-channel.js';
import type { Database } from 'better-sqlite3';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockSqlite(ownerApprovalMethod: string | null = null, walletExists = true): Database {
  const stmt = {
    get: vi.fn().mockReturnValue(
      walletExists ? { owner_approval_method: ownerApprovalMethod } : undefined,
    ),
  };
  return {
    prepare: vi.fn().mockReturnValue(stmt),
  } as unknown as Database;
}

function createMockSettings(overrides: Record<string, string> = {}): SettingsService {
  const defaults: Record<string, string> = {
    'signing_sdk.enabled': 'false',
    'walletconnect.project_id': '',
    'telegram.enabled': 'false',
    'telegram.bot_token': '',
    ...overrides,
  };
  return {
    get: vi.fn((key: string) => defaults[key] ?? ''),
  } as unknown as SettingsService;
}

function createMockNtfyChannel(): NtfySigningChannel {
  return {
    sendRequest: vi.fn().mockResolvedValue({
      requestId: 'ntfy-req-001',
      requestTopic: 'waiaas-sign-test',
      responseTopic: 'waiaas-response-ntfy-req-001',
    }),
    shutdown: vi.fn(),
  } as unknown as NtfySigningChannel;
}

function createMockTelegramChannel(): TelegramSigningChannel {
  return {
    sendRequest: vi.fn().mockResolvedValue({
      requestId: 'telegram-req-001',
      requestTopic: 'waiaas-req-telegram',
      responseTopic: '',
    }),
    shutdown: vi.fn(),
  } as unknown as TelegramSigningChannel;
}

const defaultParams: SendRequestParams = {
  walletId: 'wallet-1',
  txId: '01234567-abcd-7000-8000-000000000001',
  chain: 'solana' as const,
  network: 'devnet',
  type: 'TRANSFER',
  from: 'abcd1234',
  to: 'efgh5678',
  amount: '1.0',
  symbol: 'SOL',
  policyTier: 'APPROVAL' as const,
};

// ---------------------------------------------------------------------------
// Explicit method routing (CHAN-05)
// ---------------------------------------------------------------------------

describe('ApprovalChannelRouter - Explicit method routing (CHAN-05)', () => {
  it('routes to NtfySigningChannel when owner_approval_method = sdk_ntfy', async () => {
    const sqlite = createMockSqlite('sdk_ntfy');
    const settings = createMockSettings({ 'signing_sdk.enabled': 'true' });
    const ntfyChannel = createMockNtfyChannel();

    const router = new ApprovalChannelRouter({ sqlite, settingsService: settings, ntfyChannel });
    const result = await router.route('wallet-1', defaultParams);

    expect(result.method).toBe('sdk_ntfy');
    expect(result.channelResult).toEqual({ requestId: 'ntfy-req-001' });
    expect(ntfyChannel.sendRequest).toHaveBeenCalledWith(defaultParams);
  });

  it('routes to TelegramSigningChannel when owner_approval_method = sdk_telegram', async () => {
    const sqlite = createMockSqlite('sdk_telegram');
    const settings = createMockSettings({ 'signing_sdk.enabled': 'true' });
    const telegramChannel = createMockTelegramChannel();

    const router = new ApprovalChannelRouter({ sqlite, settingsService: settings, telegramChannel });
    const result = await router.route('wallet-1', defaultParams);

    expect(result.method).toBe('sdk_telegram');
    expect(result.channelResult).toEqual({ requestId: 'telegram-req-001' });
    expect(telegramChannel.sendRequest).toHaveBeenCalledWith(defaultParams);
  });

  it('returns walletconnect with null channelResult when owner_approval_method = walletconnect', async () => {
    const sqlite = createMockSqlite('walletconnect');
    const settings = createMockSettings();

    const router = new ApprovalChannelRouter({ sqlite, settingsService: settings });
    const result = await router.route('wallet-1', defaultParams);

    expect(result.method).toBe('walletconnect');
    expect(result.channelResult).toBeNull();
  });

  it('returns telegram_bot with null channelResult when owner_approval_method = telegram_bot', async () => {
    const sqlite = createMockSqlite('telegram_bot');
    const settings = createMockSettings();

    const router = new ApprovalChannelRouter({ sqlite, settingsService: settings });
    const result = await router.route('wallet-1', defaultParams);

    expect(result.method).toBe('telegram_bot');
    expect(result.channelResult).toBeNull();
  });

  it('returns rest with null channelResult when owner_approval_method = rest', async () => {
    const sqlite = createMockSqlite('rest');
    const settings = createMockSettings();

    const router = new ApprovalChannelRouter({ sqlite, settingsService: settings });
    const result = await router.route('wallet-1', defaultParams);

    expect(result.method).toBe('rest');
    expect(result.channelResult).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Global fallback (CHAN-06)
// ---------------------------------------------------------------------------

describe('ApprovalChannelRouter - Global fallback (CHAN-06)', () => {
  it('falls back to sdk_ntfy when method is null, SDK enabled, ntfy available', async () => {
    const sqlite = createMockSqlite(null);
    const settings = createMockSettings({ 'signing_sdk.enabled': 'true' });
    const ntfyChannel = createMockNtfyChannel();
    const telegramChannel = createMockTelegramChannel();

    const router = new ApprovalChannelRouter({
      sqlite, settingsService: settings, ntfyChannel, telegramChannel,
    });
    const result = await router.route('wallet-1', defaultParams);

    expect(result.method).toBe('sdk_ntfy');
    expect(result.channelResult).toEqual({ requestId: 'ntfy-req-001' });
    expect(ntfyChannel.sendRequest).toHaveBeenCalledWith(defaultParams);
    expect(telegramChannel.sendRequest).not.toHaveBeenCalled();
  });

  it('falls back to sdk_telegram when method is null, SDK enabled, no ntfy, telegram available', async () => {
    const sqlite = createMockSqlite(null);
    const settings = createMockSettings({ 'signing_sdk.enabled': 'true' });
    const telegramChannel = createMockTelegramChannel();

    const router = new ApprovalChannelRouter({
      sqlite, settingsService: settings, telegramChannel,
    });
    const result = await router.route('wallet-1', defaultParams);

    expect(result.method).toBe('sdk_telegram');
    expect(result.channelResult).toEqual({ requestId: 'telegram-req-001' });
    expect(telegramChannel.sendRequest).toHaveBeenCalledWith(defaultParams);
  });

  it('falls back to walletconnect when SDK disabled, walletconnect configured', async () => {
    const sqlite = createMockSqlite(null);
    const settings = createMockSettings({
      'signing_sdk.enabled': 'false',
      'walletconnect.project_id': 'my-wc-project-id',
    });

    const router = new ApprovalChannelRouter({ sqlite, settingsService: settings });
    const result = await router.route('wallet-1', defaultParams);

    expect(result.method).toBe('walletconnect');
    expect(result.channelResult).toBeNull();
  });

  it('falls back to telegram_bot when SDK+WC disabled, telegram bot enabled', async () => {
    const sqlite = createMockSqlite(null);
    const settings = createMockSettings({
      'signing_sdk.enabled': 'false',
      'walletconnect.project_id': '',
      'telegram.enabled': 'true',
      'telegram.bot_token': 'bot123:token',
    });

    const router = new ApprovalChannelRouter({ sqlite, settingsService: settings });
    const result = await router.route('wallet-1', defaultParams);

    expect(result.method).toBe('telegram_bot');
    expect(result.channelResult).toBeNull();
  });

  it('falls back to rest when nothing else is configured (final fallback)', async () => {
    const sqlite = createMockSqlite(null);
    const settings = createMockSettings({
      'signing_sdk.enabled': 'false',
      'walletconnect.project_id': '',
      'telegram.enabled': 'false',
      'telegram.bot_token': '',
    });

    const router = new ApprovalChannelRouter({ sqlite, settingsService: settings });
    const result = await router.route('wallet-1', defaultParams);

    expect(result.method).toBe('rest');
    expect(result.channelResult).toBeNull();
  });

  it('respects priority: ntfy > telegram when both SDK channels available', async () => {
    const sqlite = createMockSqlite(null);
    const settings = createMockSettings({ 'signing_sdk.enabled': 'true' });
    const ntfyChannel = createMockNtfyChannel();
    const telegramChannel = createMockTelegramChannel();

    const router = new ApprovalChannelRouter({
      sqlite, settingsService: settings, ntfyChannel, telegramChannel,
    });
    const result = await router.route('wallet-1', defaultParams);

    expect(result.method).toBe('sdk_ntfy');
    expect(ntfyChannel.sendRequest).toHaveBeenCalled();
    expect(telegramChannel.sendRequest).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// SDK disabled fallback (CHAN-07)
// ---------------------------------------------------------------------------

describe('ApprovalChannelRouter - SDK disabled fallback (CHAN-07)', () => {
  it('falls through to global fallback when sdk_ntfy set but SDK disabled', async () => {
    const sqlite = createMockSqlite('sdk_ntfy');
    const settings = createMockSettings({
      'signing_sdk.enabled': 'false',
      'walletconnect.project_id': 'wc-id',
    });
    const ntfyChannel = createMockNtfyChannel();

    const router = new ApprovalChannelRouter({
      sqlite, settingsService: settings, ntfyChannel,
    });
    const result = await router.route('wallet-1', defaultParams);

    // Should NOT use ntfy (SDK disabled), should fall through to walletconnect
    expect(result.method).toBe('walletconnect');
    expect(result.channelResult).toBeNull();
    expect(ntfyChannel.sendRequest).not.toHaveBeenCalled();
  });

  it('falls through to global fallback when sdk_telegram set but SDK disabled', async () => {
    const sqlite = createMockSqlite('sdk_telegram');
    const settings = createMockSettings({
      'signing_sdk.enabled': 'false',
      'telegram.enabled': 'true',
      'telegram.bot_token': 'bot123:token',
    });
    const telegramChannel = createMockTelegramChannel();

    const router = new ApprovalChannelRouter({
      sqlite, settingsService: settings, telegramChannel,
    });
    const result = await router.route('wallet-1', defaultParams);

    // Should NOT use telegram channel (SDK disabled), fall through to telegram_bot
    expect(result.method).toBe('telegram_bot');
    expect(result.channelResult).toBeNull();
    expect(telegramChannel.sendRequest).not.toHaveBeenCalled();
  });

  it('skips SDK channels in global fallback when SDK disabled', async () => {
    const sqlite = createMockSqlite(null);
    const settings = createMockSettings({
      'signing_sdk.enabled': 'false',
      'walletconnect.project_id': '',
      'telegram.enabled': 'false',
    });
    const ntfyChannel = createMockNtfyChannel();
    const telegramChannel = createMockTelegramChannel();

    const router = new ApprovalChannelRouter({
      sqlite, settingsService: settings, ntfyChannel, telegramChannel,
    });
    const result = await router.route('wallet-1', defaultParams);

    // SDK disabled -> skip ntfy and telegram -> no WC -> no telegram_bot -> rest
    expect(result.method).toBe('rest');
    expect(result.channelResult).toBeNull();
    expect(ntfyChannel.sendRequest).not.toHaveBeenCalled();
    expect(telegramChannel.sendRequest).not.toHaveBeenCalled();
  });

  it('SDK disabled falls to rest when only SDK channels exist and nothing else configured', async () => {
    const sqlite = createMockSqlite('sdk_ntfy');
    const settings = createMockSettings({
      'signing_sdk.enabled': 'false',
      'walletconnect.project_id': '',
      'telegram.enabled': 'false',
      'telegram.bot_token': '',
    });
    const ntfyChannel = createMockNtfyChannel();

    const router = new ApprovalChannelRouter({
      sqlite, settingsService: settings, ntfyChannel,
    });
    const result = await router.route('wallet-1', defaultParams);

    expect(result.method).toBe('rest');
    expect(result.channelResult).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('ApprovalChannelRouter - Edge cases', () => {
  it('throws error when wallet not found in DB', async () => {
    const sqlite = createMockSqlite(null, false);
    const settings = createMockSettings();

    const router = new ApprovalChannelRouter({ sqlite, settingsService: settings });
    await expect(router.route('nonexistent-wallet', defaultParams))
      .rejects.toThrow('Wallet not found: nonexistent-wallet');
  });

  it('propagates error when SDK channel sendRequest throws (explicit method)', async () => {
    const sqlite = createMockSqlite('sdk_ntfy');
    const settings = createMockSettings({ 'signing_sdk.enabled': 'true' });
    const ntfyChannel = createMockNtfyChannel();
    (ntfyChannel.sendRequest as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('ntfy publish failed'),
    );

    const router = new ApprovalChannelRouter({
      sqlite, settingsService: settings, ntfyChannel,
    });
    await expect(router.route('wallet-1', defaultParams))
      .rejects.toThrow('ntfy publish failed');
  });

  it('propagates error when SDK channel sendRequest throws (global fallback)', async () => {
    const sqlite = createMockSqlite(null);
    const settings = createMockSettings({ 'signing_sdk.enabled': 'true' });
    const ntfyChannel = createMockNtfyChannel();
    (ntfyChannel.sendRequest as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('ntfy server unreachable'),
    );

    const router = new ApprovalChannelRouter({
      sqlite, settingsService: settings, ntfyChannel,
    });
    await expect(router.route('wallet-1', defaultParams))
      .rejects.toThrow('ntfy server unreachable');
  });

  it('shutdown() calls shutdown on both channels', () => {
    const ntfyChannel = createMockNtfyChannel();
    const telegramChannel = createMockTelegramChannel();
    const sqlite = createMockSqlite(null);
    const settings = createMockSettings();

    const router = new ApprovalChannelRouter({
      sqlite, settingsService: settings, ntfyChannel, telegramChannel,
    });
    router.shutdown();

    expect(ntfyChannel.shutdown).toHaveBeenCalledTimes(1);
    expect(telegramChannel.shutdown).toHaveBeenCalledTimes(1);
  });

  it('shutdown() works when no channels are provided', () => {
    const sqlite = createMockSqlite(null);
    const settings = createMockSettings();

    const router = new ApprovalChannelRouter({ sqlite, settingsService: settings });
    expect(() => router.shutdown()).not.toThrow();
  });

  it('telegram_bot fallback requires both enabled=true AND bot_token set', async () => {
    // Only enabled but no token -> skip
    const sqlite = createMockSqlite(null);
    const settings = createMockSettings({
      'signing_sdk.enabled': 'false',
      'walletconnect.project_id': '',
      'telegram.enabled': 'true',
      'telegram.bot_token': '',
    });

    const router = new ApprovalChannelRouter({ sqlite, settingsService: settings });
    const result = await router.route('wallet-1', defaultParams);

    expect(result.method).toBe('rest');
  });

  it('walletconnect fallback requires non-empty project_id', async () => {
    const sqlite = createMockSqlite(null);
    const settings = createMockSettings({
      'signing_sdk.enabled': 'false',
      'walletconnect.project_id': '   ',  // whitespace only
      'telegram.enabled': 'false',
    });

    const router = new ApprovalChannelRouter({ sqlite, settingsService: settings });
    const result = await router.route('wallet-1', defaultParams);

    // Whitespace-only project_id should be treated as not configured
    expect(result.method).toBe('rest');
  });
});
