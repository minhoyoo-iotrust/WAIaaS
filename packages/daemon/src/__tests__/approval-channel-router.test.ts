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
import type { PushRelaySigningChannel } from '../services/signing-sdk/channels/push-relay-signing-channel.js';
import type { TelegramSigningChannel } from '../services/signing-sdk/channels/telegram-signing-channel.js';
import type { SettingsService } from '../infrastructure/settings/settings-service.js';
import type { SendRequestParams } from '../services/signing-sdk/channels/push-relay-signing-channel.js';
import type { Database } from 'better-sqlite3';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockSqlite(
  ownerApprovalMethod: string | null = null,
  walletExists = true,
  walletType: string | null = null,
): Database {
  const stmt = {
    get: vi.fn().mockReturnValue(
      walletExists
        ? { owner_approval_method: ownerApprovalMethod, wallet_type: walletType }
        : undefined,
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
    'telegram.bot_token': '',
    ...overrides,
  };
  return {
    get: vi.fn((key: string) => defaults[key] ?? ''),
  } as unknown as SettingsService;
}

function createMockPushRelayChannel(): PushRelaySigningChannel {
  return {
    sendRequest: vi.fn().mockResolvedValue({
      requestId: 'push-req-001',
      requestTopic: 'dcent',
      responseTopic: '',
    }),
    shutdown: vi.fn(),
  } as unknown as PushRelaySigningChannel;
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
  it('routes to PushRelaySigningChannel when owner_approval_method = sdk_push', async () => {
    const sqlite = createMockSqlite('sdk_push');
    const settings = createMockSettings({ 'signing_sdk.enabled': 'true' });
    const pushRelayChannel = createMockPushRelayChannel();

    const router = new ApprovalChannelRouter({ sqlite, settingsService: settings, pushRelayChannel });
    const result = await router.route('wallet-1', defaultParams);

    expect(result.method).toBe('sdk_push');
    expect(result.channelResult).toEqual({ requestId: 'push-req-001' });
    expect(pushRelayChannel.sendRequest).toHaveBeenCalledWith(defaultParams);
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
  it('falls back to sdk_push when method is null, SDK enabled, push relay available', async () => {
    const sqlite = createMockSqlite(null);
    const settings = createMockSettings({ 'signing_sdk.enabled': 'true' });
    const pushRelayChannel = createMockPushRelayChannel();
    const telegramChannel = createMockTelegramChannel();

    const router = new ApprovalChannelRouter({
      sqlite, settingsService: settings, pushRelayChannel, telegramChannel,
    });
    const result = await router.route('wallet-1', defaultParams);

    expect(result.method).toBe('sdk_push');
    expect(result.channelResult).toEqual({ requestId: 'push-req-001' });
    expect(pushRelayChannel.sendRequest).toHaveBeenCalledWith(defaultParams);
    expect(telegramChannel.sendRequest).not.toHaveBeenCalled();
  });

  it('falls back to sdk_telegram when method is null, SDK enabled, no push relay, telegram available', async () => {
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
      'telegram.bot_token': '',
    });

    const router = new ApprovalChannelRouter({ sqlite, settingsService: settings });
    const result = await router.route('wallet-1', defaultParams);

    expect(result.method).toBe('rest');
    expect(result.channelResult).toBeNull();
  });

  it('respects priority: push relay > telegram when both SDK channels available', async () => {
    const sqlite = createMockSqlite(null);
    const settings = createMockSettings({ 'signing_sdk.enabled': 'true' });
    const pushRelayChannel = createMockPushRelayChannel();
    const telegramChannel = createMockTelegramChannel();

    const router = new ApprovalChannelRouter({
      sqlite, settingsService: settings, pushRelayChannel, telegramChannel,
    });
    const result = await router.route('wallet-1', defaultParams);

    expect(result.method).toBe('sdk_push');
    expect(pushRelayChannel.sendRequest).toHaveBeenCalled();
    expect(telegramChannel.sendRequest).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// SDK disabled fallback (CHAN-07)
// ---------------------------------------------------------------------------

describe('ApprovalChannelRouter - SDK disabled fallback (CHAN-07)', () => {
  it('falls through to global fallback when sdk_push set but SDK disabled', async () => {
    const sqlite = createMockSqlite('sdk_push');
    const settings = createMockSettings({
      'signing_sdk.enabled': 'false',
      'walletconnect.project_id': 'wc-id',
    });
    const pushRelayChannel = createMockPushRelayChannel();

    const router = new ApprovalChannelRouter({
      sqlite, settingsService: settings, pushRelayChannel,
    });
    const result = await router.route('wallet-1', defaultParams);

    // Should NOT use push relay (SDK disabled), should fall through to walletconnect
    expect(result.method).toBe('walletconnect');
    expect(result.channelResult).toBeNull();
    expect(pushRelayChannel.sendRequest).not.toHaveBeenCalled();
  });

  it('falls through to global fallback when sdk_telegram set but SDK disabled', async () => {
    const sqlite = createMockSqlite('sdk_telegram');
    const settings = createMockSettings({
      'signing_sdk.enabled': 'false',
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
    });
    const pushRelayChannel = createMockPushRelayChannel();
    const telegramChannel = createMockTelegramChannel();

    const router = new ApprovalChannelRouter({
      sqlite, settingsService: settings, pushRelayChannel, telegramChannel,
    });
    const result = await router.route('wallet-1', defaultParams);

    // SDK disabled -> skip push relay and telegram -> no WC -> no telegram_bot -> rest
    expect(result.method).toBe('rest');
    expect(result.channelResult).toBeNull();
    expect(pushRelayChannel.sendRequest).not.toHaveBeenCalled();
    expect(telegramChannel.sendRequest).not.toHaveBeenCalled();
  });

  it('SDK disabled falls to rest when only SDK channels exist and nothing else configured', async () => {
    const sqlite = createMockSqlite('sdk_push');
    const settings = createMockSettings({
      'signing_sdk.enabled': 'false',
      'walletconnect.project_id': '',
      'telegram.bot_token': '',
    });
    const pushRelayChannel = createMockPushRelayChannel();

    const router = new ApprovalChannelRouter({
      sqlite, settingsService: settings, pushRelayChannel,
    });
    const result = await router.route('wallet-1', defaultParams);

    expect(result.method).toBe('rest');
    expect(result.channelResult).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// wallet_type topic routing (SIGN-03, SIGN-04, SIGN-05)
// ---------------------------------------------------------------------------

describe('ApprovalChannelRouter - wallet_type topic routing (SIGN-03, SIGN-04, SIGN-05)', () => {
  it('SIGN-03: enriches walletName from wallet_type when routing to sdk_push channel', async () => {
    const sqlite = createMockSqlite('sdk_push', true, 'dcent');
    const settings = createMockSettings({ 'signing_sdk.enabled': 'true' });
    const pushRelayChannel = createMockPushRelayChannel();

    const router = new ApprovalChannelRouter({ sqlite, settingsService: settings, pushRelayChannel });
    const result = await router.route('wallet-1', defaultParams);

    expect(result.method).toBe('sdk_push');
    // Verify pushRelayChannel received enriched params with walletName from wallet_type
    expect(pushRelayChannel.sendRequest).toHaveBeenCalledWith(
      expect.objectContaining({ walletName: 'dcent' }),
    );
  });

  it('SIGN-03: enriches walletName from wallet_type for non-dcent wallet types', async () => {
    const sqlite = createMockSqlite('sdk_push', true, 'other-wallet');
    const settings = createMockSettings({ 'signing_sdk.enabled': 'true' });
    const pushRelayChannel = createMockPushRelayChannel();

    const router = new ApprovalChannelRouter({ sqlite, settingsService: settings, pushRelayChannel });
    await router.route('wallet-1', defaultParams);

    expect(pushRelayChannel.sendRequest).toHaveBeenCalledWith(
      expect.objectContaining({ walletName: 'other-wallet' }),
    );
  });

  it('SIGN-04: does not set walletName when wallet_type is NULL (global fallback)', async () => {
    const sqlite = createMockSqlite('sdk_push', true, null);
    const settings = createMockSettings({ 'signing_sdk.enabled': 'true' });
    const pushRelayChannel = createMockPushRelayChannel();

    const router = new ApprovalChannelRouter({ sqlite, settingsService: settings, pushRelayChannel });
    await router.route('wallet-1', defaultParams);

    // walletName should be undefined (not enriched), letting SignRequestBuilder use preferred_wallet
    const calledParams = (pushRelayChannel.sendRequest as ReturnType<typeof vi.fn>).mock.calls[0]![0] as SendRequestParams;
    expect(calledParams.walletName).toBeUndefined();
  });

  it('SIGN-03: enriches walletName from wallet_type even when falling through to global fallback', async () => {
    // No explicit approval_method set, but wallet_type is set
    const sqlite = createMockSqlite(null, true, 'dcent');
    const settings = createMockSettings({ 'signing_sdk.enabled': 'true' });
    const pushRelayChannel = createMockPushRelayChannel();

    const router = new ApprovalChannelRouter({ sqlite, settingsService: settings, pushRelayChannel });
    await router.route('wallet-1', defaultParams);

    expect(pushRelayChannel.sendRequest).toHaveBeenCalledWith(
      expect.objectContaining({ walletName: 'dcent' }),
    );
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
    const sqlite = createMockSqlite('sdk_push');
    const settings = createMockSettings({ 'signing_sdk.enabled': 'true' });
    const pushRelayChannel = createMockPushRelayChannel();
    (pushRelayChannel.sendRequest as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Push Relay unreachable'),
    );

    const router = new ApprovalChannelRouter({
      sqlite, settingsService: settings, pushRelayChannel,
    });
    await expect(router.route('wallet-1', defaultParams))
      .rejects.toThrow('Push Relay unreachable');
  });

  it('propagates error when SDK channel sendRequest throws (global fallback)', async () => {
    const sqlite = createMockSqlite(null);
    const settings = createMockSettings({ 'signing_sdk.enabled': 'true' });
    const pushRelayChannel = createMockPushRelayChannel();
    (pushRelayChannel.sendRequest as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Push Relay server unreachable'),
    );

    const router = new ApprovalChannelRouter({
      sqlite, settingsService: settings, pushRelayChannel,
    });
    await expect(router.route('wallet-1', defaultParams))
      .rejects.toThrow('Push Relay server unreachable');
  });

  it('shutdown() calls shutdown on both channels', () => {
    const pushRelayChannel = createMockPushRelayChannel();
    const telegramChannel = createMockTelegramChannel();
    const sqlite = createMockSqlite(null);
    const settings = createMockSettings();

    const router = new ApprovalChannelRouter({
      sqlite, settingsService: settings, pushRelayChannel, telegramChannel,
    });
    router.shutdown();

    expect(pushRelayChannel.shutdown).toHaveBeenCalledTimes(1);
    expect(telegramChannel.shutdown).toHaveBeenCalledTimes(1);
  });

  it('shutdown() works when no channels are provided', () => {
    const sqlite = createMockSqlite(null);
    const settings = createMockSettings();

    const router = new ApprovalChannelRouter({ sqlite, settingsService: settings });
    expect(() => router.shutdown()).not.toThrow();
  });

  it('telegram_bot fallback requires bot_token to be set', async () => {
    // No token -> skip telegram_bot
    const sqlite = createMockSqlite(null);
    const settings = createMockSettings({
      'signing_sdk.enabled': 'false',
      'walletconnect.project_id': '',
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
    });

    const router = new ApprovalChannelRouter({ sqlite, settingsService: settings });
    const result = await router.route('wallet-1', defaultParams);

    // Whitespace-only project_id should be treated as not configured
    expect(result.method).toBe('rest');
  });
});

// ---------------------------------------------------------------------------
// signing_enabled blocking (APP-08, v29.7)
// ---------------------------------------------------------------------------

describe('ApprovalChannelRouter - signing_enabled blocking (APP-08)', () => {
  it('T-APP-08: signing_enabled=0 blocks signing with SIGNING_DISABLED error', async () => {
    // Mock: wallet has wallet_type='dcent', wallet_apps has signing_enabled=0
    const stmtGet = vi.fn()
      .mockReturnValueOnce({ owner_approval_method: 'sdk_push', wallet_type: 'dcent' }) // wallet lookup
      .mockReturnValueOnce(undefined) // wallet_apps lookup (no app with signing_enabled=1)
      .mockReturnValueOnce({ id: 'app-dcent-001' }); // anyApp lookup (app exists -> block)
    const sqlite = {
      prepare: vi.fn().mockReturnValue({ get: stmtGet }),
    } as unknown as Database;
    const settings = createMockSettings({ 'signing_sdk.enabled': 'true' });
    const pushRelayChannel = createMockPushRelayChannel();

    const router = new ApprovalChannelRouter({ sqlite, settingsService: settings, pushRelayChannel });
    await expect(router.route('wallet-1', defaultParams))
      .rejects.toThrow('SIGNING_DISABLED');
  });

  it('T-APP-08b: signing_enabled=1 allows signing', async () => {
    const stmtGet = vi.fn()
      .mockReturnValueOnce({ owner_approval_method: 'sdk_push', wallet_type: 'dcent' })
      .mockReturnValueOnce({ signing_enabled: 1 });
    const sqlite = {
      prepare: vi.fn().mockReturnValue({ get: stmtGet }),
    } as unknown as Database;
    const settings = createMockSettings({ 'signing_sdk.enabled': 'true' });
    const pushRelayChannel = createMockPushRelayChannel();

    const router = new ApprovalChannelRouter({ sqlite, settingsService: settings, pushRelayChannel });
    const result = await router.route('wallet-1', defaultParams);

    expect(result.method).toBe('sdk_push');
    expect(pushRelayChannel.sendRequest).toHaveBeenCalled();
  });

  it('T-APP-08c: no wallet_apps row allows signing (passthrough)', async () => {
    const stmtGet = vi.fn()
      .mockReturnValueOnce({ owner_approval_method: 'sdk_push', wallet_type: 'dcent' })
      .mockReturnValueOnce(undefined); // no wallet_apps row
    const sqlite = {
      prepare: vi.fn().mockReturnValue({ get: stmtGet }),
    } as unknown as Database;
    const settings = createMockSettings({ 'signing_sdk.enabled': 'true' });
    const pushRelayChannel = createMockPushRelayChannel();

    const router = new ApprovalChannelRouter({ sqlite, settingsService: settings, pushRelayChannel });
    const result = await router.route('wallet-1', defaultParams);

    expect(result.method).toBe('sdk_push');
    expect(pushRelayChannel.sendRequest).toHaveBeenCalled();
  });
});
