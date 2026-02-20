/**
 * TelegramSigningChannel + /sign_response command unit tests.
 *
 * Tests cover:
 *   - TelegramSigningChannel.sendRequest() calls signRequestBuilder.buildRequest()
 *   - sendRequest() sends Telegram message with inline_keyboard containing universal link
 *   - sendRequest() registers request with signResponseHandler
 *   - sendRequest() handles missing telegram chat_id (throws error)
 *   - shutdown() is callable without error
 *   - /sign_response: valid base64url SignResponse decoded and delegated to handler
 *   - /sign_response: missing encoded response returns usage message
 *   - /sign_response: invalid base64url returns error message
 *   - /sign_response: signResponseHandler not configured returns "not enabled" message
 *
 * @see packages/daemon/src/services/signing-sdk/channels/telegram-signing-channel.ts
 * @see packages/daemon/src/infrastructure/telegram/telegram-bot-service.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import { TelegramSigningChannel } from '../services/signing-sdk/channels/telegram-signing-channel.js';
import { TelegramBotService, escapeMarkdownV2 } from '../infrastructure/telegram/telegram-bot-service.js';
import type { TelegramApi } from '../infrastructure/telegram/telegram-api.js';
import type { TelegramUpdate } from '../infrastructure/telegram/telegram-types.js';
import type { SignRequestBuilder } from '../services/signing-sdk/sign-request-builder.js';
import type { SignResponseHandler } from '../services/signing-sdk/sign-response-handler.js';
import type { SettingsService } from '../infrastructure/settings/settings-service.js';
import type { Database as DatabaseType } from 'better-sqlite3';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockApi(): TelegramApi {
  return {
    getUpdates: vi.fn().mockResolvedValue([]),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
  } as unknown as TelegramApi;
}

function createTestDb(): DatabaseType {
  const conn = createDatabase(':memory:');
  pushSchema(conn.sqlite);
  return conn.sqlite;
}

function makeUpdate(chatId: number, text: string, updateId = 1, username?: string): TelegramUpdate {
  return {
    update_id: updateId,
    message: {
      message_id: 1,
      from: { id: chatId, is_bot: false, first_name: 'Test', username },
      chat: { id: chatId, type: 'private' },
      text,
      date: Math.floor(Date.now() / 1000),
    },
  };
}

function createMockSignRequestBuilder(): SignRequestBuilder {
  return {
    buildRequest: vi.fn().mockReturnValue({
      request: {
        version: '1',
        requestId: '01234567-abcd-7000-8000-000000000001',
        chain: 'solana',
        network: 'devnet',
        message: 'WAIaaS Transaction Approval\n\nTx: test-tx-id',
        displayMessage: 'TRANSFER 1.0 SOL from abcd1234... to efgh5678...',
        metadata: {
          txId: '01234567-abcd-7000-8000-000000000002',
          type: 'TRANSFER',
          from: 'abcd1234abcd1234',
          to: 'efgh5678efgh5678',
          amount: '1.0',
          symbol: 'SOL',
          policyTier: 'APPROVAL',
        },
        responseChannel: { type: 'telegram', botUsername: 'waiaas_bot' },
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      },
      universalLinkUrl: 'https://wallet.example.com/sign?data=encoded123',
      requestTopic: 'waiaas-req-test',
    }),
  } as unknown as SignRequestBuilder;
}

function createMockSignResponseHandler(): SignResponseHandler {
  return {
    registerRequest: vi.fn(),
    handle: vi.fn().mockResolvedValue({ action: 'approved', txId: 'test-tx-id' }),
    destroy: vi.fn(),
  } as unknown as SignResponseHandler;
}

function createMockSettings(overrides: Record<string, string> = {}): SettingsService {
  const defaults: Record<string, string> = {
    'notifications.telegram_chat_id': '12345',
    ...overrides,
  };
  return {
    get: vi.fn((key: string) => defaults[key] ?? ''),
  } as unknown as SettingsService;
}

// ---------------------------------------------------------------------------
// TelegramSigningChannel Tests
// ---------------------------------------------------------------------------

describe('TelegramSigningChannel', () => {
  let api: TelegramApi;
  let builder: SignRequestBuilder;
  let handler: SignResponseHandler;
  let settings: SettingsService;
  let channel: TelegramSigningChannel;

  beforeEach(() => {
    api = createMockApi();
    builder = createMockSignRequestBuilder();
    handler = createMockSignResponseHandler();
    settings = createMockSettings();
    channel = new TelegramSigningChannel({
      signRequestBuilder: builder,
      signResponseHandler: handler,
      settingsService: settings,
      telegramApi: api,
    });
  });

  it('sendRequest() calls signRequestBuilder.buildRequest() and returns requestId', async () => {
    const params = {
      walletId: 'wallet-1',
      txId: '01234567-abcd-7000-8000-000000000002',
      chain: 'solana' as const,
      network: 'devnet',
      type: 'TRANSFER',
      from: 'abcd1234abcd1234',
      to: 'efgh5678efgh5678',
      amount: '1.0',
      symbol: 'SOL',
      policyTier: 'APPROVAL' as const,
    };

    const result = await channel.sendRequest(params);

    expect(builder.buildRequest).toHaveBeenCalledWith(params);
    expect(result.requestId).toBe('01234567-abcd-7000-8000-000000000001');
    expect(result.responseTopic).toBe('');
  });

  it('sendRequest() sends Telegram message with inline_keyboard containing universal link', async () => {
    const params = {
      walletId: 'wallet-1',
      txId: '01234567-abcd-7000-8000-000000000002',
      chain: 'solana' as const,
      network: 'devnet',
      type: 'TRANSFER',
      from: 'abcd1234abcd1234',
      to: 'efgh5678efgh5678',
      policyTier: 'APPROVAL' as const,
    };

    await channel.sendRequest(params);

    expect(api.sendMessage).toHaveBeenCalledTimes(1);
    const call = (api.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0]!;

    // Check chat_id
    expect(call[0]).toBe(12345);

    // Check message text contains display info
    const text = call[1] as string;
    expect(text).toContain('WAIaaS Sign Request');

    // Check reply_markup has inline keyboard with URL button
    const replyMarkup = call[2];
    expect(replyMarkup).toBeDefined();
    expect(replyMarkup.inline_keyboard).toBeDefined();
    expect(replyMarkup.inline_keyboard[0][0].text).toBe('Open in Wallet');
    expect(replyMarkup.inline_keyboard[0][0].url).toBe('https://wallet.example.com/sign?data=encoded123');
  });

  it('sendRequest() registers request with signResponseHandler', async () => {
    const params = {
      walletId: 'wallet-1',
      txId: '01234567-abcd-7000-8000-000000000002',
      chain: 'solana' as const,
      network: 'devnet',
      type: 'TRANSFER',
      from: 'abcd1234abcd1234',
      to: 'efgh5678efgh5678',
      policyTier: 'APPROVAL' as const,
    };

    await channel.sendRequest(params);

    expect(handler.registerRequest).toHaveBeenCalledTimes(1);
    const registeredRequest = (handler.registerRequest as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(registeredRequest.requestId).toBe('01234567-abcd-7000-8000-000000000001');
  });

  it('sendRequest() throws when telegram chat_id is not configured', async () => {
    const noSettings = createMockSettings({ 'notifications.telegram_chat_id': '' });
    const noChannel = new TelegramSigningChannel({
      signRequestBuilder: builder,
      signResponseHandler: handler,
      settingsService: noSettings,
      telegramApi: api,
    });

    const params = {
      walletId: 'wallet-1',
      txId: '01234567-abcd-7000-8000-000000000002',
      chain: 'solana' as const,
      network: 'devnet',
      type: 'TRANSFER',
      from: 'abcd1234abcd1234',
      to: 'efgh5678efgh5678',
      policyTier: 'APPROVAL' as const,
    };

    await expect(noChannel.sendRequest(params)).rejects.toThrow(
      'Telegram chat_id is not configured',
    );
  });

  it('shutdown() is callable without error', () => {
    expect(() => channel.shutdown()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// /sign_response command integration tests
// ---------------------------------------------------------------------------

describe('/sign_response command', () => {
  let db: DatabaseType;
  let api: TelegramApi;
  let handler: SignResponseHandler;
  let service: TelegramBotService;

  beforeEach(() => {
    db = createTestDb();
    api = createMockApi();
    handler = createMockSignResponseHandler();

    // Register user as ADMIN so /sign_response is allowed
    const now = Math.floor(Date.now() / 1000);
    db.prepare(
      'INSERT INTO telegram_users (chat_id, username, role, registered_at) VALUES (?, ?, ?, ?)',
    ).run(12345, 'admin', 'ADMIN', now);
  });

  afterEach(() => {
    try { db.close(); } catch { /* already closed */ }
  });

  it('valid base64url SignResponse is decoded and passed to signResponseHandler.handle()', async () => {
    service = new TelegramBotService({
      sqlite: db,
      api,
      locale: 'en',
      signResponseHandler: handler,
    });

    const signResponse = {
      version: '1',
      requestId: '01234567-abcd-7000-8000-000000000001',
      action: 'approve',
      signature: '0xabcdef',
      signerAddress: '0x1234567890abcdef1234567890abcdef12345678',
      signedAt: new Date().toISOString(),
    };
    const encoded = Buffer.from(JSON.stringify(signResponse), 'utf-8').toString('base64url');

    const updates = [makeUpdate(12345, `/sign_response ${encoded}`, 1)];
    (api.getUpdates as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(updates)
      .mockImplementation(() => new Promise(() => {}));

    service.start();
    await vi.waitFor(() => {
      expect(api.sendMessage).toHaveBeenCalledTimes(1);
    }, { timeout: 3000 });
    service.stop();

    // Verify handler was called
    expect(handler.handle).toHaveBeenCalledTimes(1);

    // Verify confirmation message sent
    const call = (api.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const text = call[1] as string;
    expect(text).toContain('Sign response processed');
    expect(text).toContain('approved');
  });

  it('missing encoded response returns usage message', async () => {
    service = new TelegramBotService({
      sqlite: db,
      api,
      locale: 'en',
      signResponseHandler: handler,
    });

    const updates = [makeUpdate(12345, '/sign_response', 1)];
    (api.getUpdates as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(updates)
      .mockImplementation(() => new Promise(() => {}));

    service.start();
    await vi.waitFor(() => {
      expect(api.sendMessage).toHaveBeenCalledTimes(1);
    }, { timeout: 3000 });
    service.stop();

    const call = (api.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const text = call[1] as string;
    expect(text).toContain('Usage');
    expect(text).toContain('sign\\_response');
  });

  it('invalid base64url returns error message', async () => {
    service = new TelegramBotService({
      sqlite: db,
      api,
      locale: 'en',
      signResponseHandler: handler,
    });

    const updates = [makeUpdate(12345, '/sign_response not-valid-base64url!!!', 1)];
    (api.getUpdates as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(updates)
      .mockImplementation(() => new Promise(() => {}));

    service.start();
    await vi.waitFor(() => {
      expect(api.sendMessage).toHaveBeenCalledTimes(1);
    }, { timeout: 3000 });
    service.stop();

    const call = (api.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const text = call[1] as string;
    expect(text).toContain('Error');
  });

  it('signResponseHandler not configured returns "not enabled" message', async () => {
    service = new TelegramBotService({
      sqlite: db,
      api,
      locale: 'en',
      // no signResponseHandler
    });

    const signResponse = {
      version: '1',
      requestId: '01234567-abcd-7000-8000-000000000001',
      action: 'approve',
      signerAddress: '0x1234567890abcdef1234567890abcdef12345678',
      signedAt: new Date().toISOString(),
    };
    const encoded = Buffer.from(JSON.stringify(signResponse), 'utf-8').toString('base64url');

    const updates = [makeUpdate(12345, `/sign_response ${encoded}`, 1)];
    (api.getUpdates as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(updates)
      .mockImplementation(() => new Promise(() => {}));

    service.start();
    await vi.waitFor(() => {
      expect(api.sendMessage).toHaveBeenCalledTimes(1);
    }, { timeout: 3000 });
    service.stop();

    const call = (api.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const text = call[1] as string;
    expect(text).toContain('Signing SDK is not enabled');
  });
});
