/**
 * Tests for issue #159: Delay/Approval transaction cancel UX improvements.
 *
 * Tests cover:
 *   - buildCancelKeyboard: single Cancel button with txId callback_data
 *   - buildCancelKeyboard: Korean locale text
 *   - TelegramBotService cancel callback: cancels QUEUED transaction
 *   - TelegramBotService cancel callback: sends bot_tx_not_found for non-QUEUED
 *   - TelegramBotService cancel callback: writes audit log
 *   - Admin POST /admin/transactions/:id/cancel: cancels QUEUED transaction (masterAuth)
 *   - Admin POST /admin/transactions/:id/reject: rejects pending approval (masterAuth)
 *   - Admin cancel/reject: 401 without masterAuth
 *   - TelegramChannel: reply_markup passed through from payload.details
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import argon2 from 'argon2';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import { TelegramBotService } from '../infrastructure/telegram/telegram-bot-service.js';
import { buildCancelKeyboard } from '../infrastructure/telegram/telegram-keyboard.js';
import { TelegramChannel } from '../notifications/channels/telegram.js';
import type { TelegramApi } from '../infrastructure/telegram/telegram-api.js';
import type { TelegramUpdate } from '../infrastructure/telegram/telegram-types.js';
import type { Database as DatabaseType } from 'better-sqlite3';
import { getMessages } from '@waiaas/core';
import { createApp } from '../api/server.js';
import { JwtSecretManager } from '../infrastructure/jwt/index.js';
import { DefaultPolicyEngine } from '../pipeline/default-policy-engine.js';
import { generateId } from '../infrastructure/database/id.js';
import { DelayQueue } from '../workflow/delay-queue.js';
import { ApprovalWorkflow } from '../workflow/approval-workflow.js';
import { wallets } from '../infrastructure/database/schema.js';
import type { DatabaseConnection } from '../infrastructure/database/index.js';
import type { DaemonConfig } from '../infrastructure/config/loader.js';
import type { LocalKeyStore } from '../infrastructure/keystore/keystore.js';
import type { IChainAdapter, BalanceInfo, HealthInfo, AssetInfo } from '@waiaas/core';
import type { AdapterPool } from '../infrastructure/adapter-pool.js';
import type { OpenAPIHono } from '@hono/zod-openapi';

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

function makeCallbackUpdate(chatId: number, data: string, updateId = 1): TelegramUpdate {
  return {
    update_id: updateId,
    callback_query: {
      id: `cb-${updateId}`,
      from: { id: chatId, is_bot: false, first_name: 'Test' },
      data,
    },
  };
}

function registerUser(db: DatabaseType, chatId: number, role: string): void {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    'INSERT INTO telegram_users (chat_id, username, role, registered_at) VALUES (?, ?, ?, ?)',
  ).run(chatId, null, role, now);
}

function insertWallet(db: DatabaseType, id: string, name: string, status = 'ACTIVE'): void {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    'INSERT INTO wallets (id, name, chain, environment, public_key, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(id, name, 'solana', 'testnet', `pk-${id}`, status, now, now);
}

function insertQueuedTx(db: DatabaseType, txId: string, walletId: string): void {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    "INSERT INTO transactions (id, wallet_id, chain, type, amount, to_address, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'QUEUED', ?)",
  ).run(txId, walletId, 'solana', 'TRANSFER', '1.5', 'addr1', now);
}

function _insertPendingApprovalTx(db: DatabaseType, txId: string, walletId: string): void {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    "INSERT INTO transactions (id, wallet_id, chain, type, amount, to_address, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'QUEUED', ?)",
  ).run(txId, walletId, 'solana', 'TRANSFER', '1.5', 'addr1', now);
  db.prepare(
    'INSERT INTO pending_approvals (id, tx_id, required_by, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(`pa-${txId}`, txId, now + 3600, now + 3600, now);
}

const HOST = '127.0.0.1:3100';
const TEST_MASTER_PASSWORD = 'test-master-password';

function mockConfig(): DaemonConfig {
  return {
    daemon: {
      port: 3100, hostname: '127.0.0.1', log_level: 'info', log_file: 'logs/daemon.log',
      log_max_size: '50MB', log_max_files: 5, pid_file: 'daemon.pid', shutdown_timeout: 30, dev_mode: false,
      admin_ui: true, admin_timeout: 900,
    },
    keystore: { argon2_memory: 65536, argon2_time: 3, argon2_parallelism: 4, backup_on_rotate: true },
    database: { path: ':memory:', wal_checkpoint_interval: 300, busy_timeout: 5000, cache_size: 64000, mmap_size: 268435456 },
    rpc: {
      solana_mainnet: 'https://api.mainnet-beta.solana.com', solana_devnet: 'https://api.devnet.solana.com',
      solana_testnet: 'https://api.testnet.solana.com', solana_ws_mainnet: 'wss://api.mainnet-beta.solana.com',
      solana_ws_devnet: 'wss://api.devnet.solana.com',
      evm_ethereum_mainnet: '', evm_ethereum_sepolia: '', evm_polygon_mainnet: '', evm_polygon_amoy: '',
      evm_arbitrum_mainnet: '', evm_arbitrum_sepolia: '', evm_optimism_mainnet: '', evm_optimism_sepolia: '',
      evm_base_mainnet: '', evm_base_sepolia: '',
    },
    notifications: {
      enabled: false, min_channels: 2, health_check_interval: 300, log_retention_days: 30, dedup_ttl: 300,
      telegram_bot_token: '', telegram_chat_id: '', discord_webhook_url: '',
      ntfy_server: 'https://ntfy.sh', ntfy_topic: '', locale: 'en' as const, rate_limit_rpm: 20,
    },
    security: {
      jwt_secret: '', max_sessions_per_wallet: 5, max_pending_tx: 10,
      nonce_storage: 'memory' as const, nonce_cache_max: 1000, nonce_cache_ttl: 300,
      rate_limit_global_ip_rpm: 1000, rate_limit_session_rpm: 300, rate_limit_tx_rpm: 10,
      cors_origins: ['http://localhost:3100'], autostop_consecutive_failures_threshold: 5,
      policy_defaults_delay_seconds: 300, policy_defaults_approval_timeout: 3600,
      kill_switch_recovery_cooldown: 1800, kill_switch_max_recovery_attempts: 3,
    },
    walletconnect: { project_id: '' },
  };
}

let mockKeyCounter = 0;
function mockKeyStore(): LocalKeyStore {
  return {
    generateKeyPair: async () => {
      mockKeyCounter++;
      return { publicKey: `mock-public-key-${String(mockKeyCounter).padStart(20, '0')}`, encryptedPrivateKey: new Uint8Array(64) };
    },
    decryptPrivateKey: async () => new Uint8Array(64),
    releaseKey: () => {},
    hasKey: async () => true,
    deleteKey: async () => {},
    lockAll: () => {},
    sodiumAvailable: true,
  } as unknown as LocalKeyStore;
}

function mockAdapter(): IChainAdapter {
  return {
    chain: 'solana' as const, network: 'devnet' as const,
    connect: async () => {}, disconnect: async () => {}, isConnected: () => true,
    getHealth: async (): Promise<HealthInfo> => ({ healthy: true, latencyMs: 1 }),
    getBalance: async (addr: string): Promise<BalanceInfo> => ({ address: addr, balance: 1_000_000_000n, decimals: 9, symbol: 'SOL' }),
    buildTransaction: async () => { throw new Error('not implemented'); },
    simulateTransaction: async () => { throw new Error('not implemented'); },
    signTransaction: async () => { throw new Error('not implemented'); },
    submitTransaction: async () => { throw new Error('not implemented'); },
    waitForConfirmation: async () => { throw new Error('not implemented'); },
    getAssets: async (): Promise<AssetInfo[]> => [],
    estimateFee: async () => { throw new Error('not implemented'); },
    buildTokenTransfer: async () => { throw new Error('not implemented'); },
    getTokenInfo: async () => { throw new Error('not implemented'); },
    buildContractCall: async () => { throw new Error('not implemented'); },
    buildApprove: async () => { throw new Error('not implemented'); },
    buildBatch: async () => { throw new Error('not implemented'); },
    getTransactionFee: async () => { throw new Error('not implemented'); },
    getCurrentNonce: async () => 0,
    sweepAll: async () => { throw new Error('not implemented'); },
  };
}

function mockAdapterPool(): AdapterPool {
  return {
    resolve: vi.fn().mockResolvedValue(mockAdapter()),
    disconnectAll: vi.fn().mockResolvedValue(undefined),
    get size() { return 0; },
  } as unknown as AdapterPool;
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// buildCancelKeyboard tests
// ---------------------------------------------------------------------------

describe('buildCancelKeyboard', () => {
  it('builds a single Cancel button with txId in callback_data', () => {
    const en = getMessages('en');
    const keyboard = buildCancelKeyboard('TX-001-long-uuid', en.telegram);

    expect(keyboard.inline_keyboard).toHaveLength(1);
    expect(keyboard.inline_keyboard[0]).toHaveLength(1);
    expect(keyboard.inline_keyboard[0]![0]!.text).toBe('Cancel');
    expect(keyboard.inline_keyboard[0]![0]!.callback_data).toBe('cancel:TX-001-long-uuid');
  });

  it('uses Korean text when ko locale provided', () => {
    const ko = getMessages('ko');
    const keyboard = buildCancelKeyboard('TX-002', ko.telegram);

    expect(keyboard.inline_keyboard[0]![0]!.text).toContain(ko.telegram.keyboard_cancel);
    expect(keyboard.inline_keyboard[0]![0]!.callback_data).toBe('cancel:TX-002');
  });
});

// ---------------------------------------------------------------------------
// TelegramBotService cancel callback tests
// ---------------------------------------------------------------------------

describe('TelegramBotService cancel callback', () => {
  let db: DatabaseType;
  let api: TelegramApi;

  beforeEach(() => {
    db = createTestDb();
    api = createMockApi();
  });

  afterEach(() => {
    try { db.close(); } catch { /* already closed */ }
  });

  it('cancels a QUEUED transaction via cancel: callback', async () => {
    registerUser(db, 300, 'ADMIN');
    insertWallet(db, 'w-1', 'Alpha');
    insertQueuedTx(db, 'tx-cancel-1', 'w-1');

    const service = new TelegramBotService({ sqlite: db, api, locale: 'en' });

    const updates = [makeCallbackUpdate(300, 'cancel:tx-cancel-1', 1)];
    (api.getUpdates as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(updates)
      .mockImplementation(() => new Promise(() => {}));

    service.start();
    await vi.waitFor(() => {
      expect(api.sendMessage).toHaveBeenCalledTimes(1);
    }, { timeout: 3000 });
    service.stop();

    // Verify transaction status changed to CANCELLED
    const tx = db.prepare('SELECT status FROM transactions WHERE id = ?').get('tx-cancel-1') as any;
    expect(tx.status).toBe('CANCELLED');

    // Verify success message sent
    const en = getMessages('en');
    expect(api.sendMessage).toHaveBeenCalledWith(300, en.telegram.bot_cancel_success);
    expect(api.answerCallbackQuery).toHaveBeenCalledWith('cb-1', en.telegram.keyboard_cancel);
  });

  it('sends bot_tx_not_found for non-QUEUED transaction', async () => {
    registerUser(db, 300, 'ADMIN');
    insertWallet(db, 'w-1', 'Alpha');

    // Insert a CONFIRMED transaction (not QUEUED)
    const now = Math.floor(Date.now() / 1000);
    db.prepare(
      "INSERT INTO transactions (id, wallet_id, chain, type, amount, to_address, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'CONFIRMED', ?)",
    ).run('tx-done-1', 'w-1', 'solana', 'TRANSFER', '1.0', 'addr', now);

    const service = new TelegramBotService({ sqlite: db, api, locale: 'en' });

    const updates = [makeCallbackUpdate(300, 'cancel:tx-done-1', 1)];
    (api.getUpdates as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(updates)
      .mockImplementation(() => new Promise(() => {}));

    service.start();
    await vi.waitFor(() => {
      expect(api.sendMessage).toHaveBeenCalledTimes(1);
    }, { timeout: 3000 });
    service.stop();

    const en = getMessages('en');
    expect(api.sendMessage).toHaveBeenCalledWith(300, en.telegram.bot_tx_not_found);
  });

  it('writes audit log on cancel', async () => {
    registerUser(db, 300, 'ADMIN');
    insertWallet(db, 'w-1', 'Alpha');
    insertQueuedTx(db, 'tx-audit-1', 'w-1');

    const service = new TelegramBotService({ sqlite: db, api, locale: 'en' });

    const updates = [makeCallbackUpdate(300, 'cancel:tx-audit-1', 1)];
    (api.getUpdates as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(updates)
      .mockImplementation(() => new Promise(() => {}));

    service.start();
    await vi.waitFor(() => {
      expect(api.sendMessage).toHaveBeenCalledTimes(1);
    }, { timeout: 3000 });
    service.stop();

    // Verify audit log entry
    const log = db.prepare(
      "SELECT * FROM audit_log WHERE event_type = 'TX_CANCELLED_VIA_TELEGRAM' AND tx_id = ?",
    ).get('tx-audit-1') as any;
    expect(log).toBeDefined();
    expect(log.actor).toBe('telegram:300');
    expect(JSON.parse(log.details)).toEqual({ chatId: 300, action: 'cancel' });
  });

  it('denies cancel callback for non-admin users', async () => {
    registerUser(db, 400, 'READONLY');
    insertWallet(db, 'w-1', 'Alpha');
    insertQueuedTx(db, 'tx-deny-1', 'w-1');

    const service = new TelegramBotService({ sqlite: db, api, locale: 'en' });

    const updates = [makeCallbackUpdate(400, 'cancel:tx-deny-1', 1)];
    (api.getUpdates as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(updates)
      .mockImplementation(() => new Promise(() => {}));

    service.start();
    await vi.waitFor(() => {
      expect(api.answerCallbackQuery).toHaveBeenCalledTimes(1);
    }, { timeout: 3000 });
    service.stop();

    // sendMessage should NOT have been called (auth denied via answerCallbackQuery)
    expect(api.sendMessage).not.toHaveBeenCalled();

    // Transaction should remain QUEUED
    const tx = db.prepare('SELECT status FROM transactions WHERE id = ?').get('tx-deny-1') as any;
    expect(tx.status).toBe('QUEUED');
  });
});

// ---------------------------------------------------------------------------
// Admin cancel/reject endpoint tests
// ---------------------------------------------------------------------------

describe('Admin cancel/reject endpoints', () => {
  let conn: DatabaseConnection;
  let app: OpenAPIHono;
  let masterPasswordHash: string;
  let walletId: string;

  beforeEach(async () => {
    mockKeyCounter = 0;
    conn = createDatabase(':memory:');
    pushSchema(conn.sqlite);

    masterPasswordHash = await argon2.hash(TEST_MASTER_PASSWORD, {
      type: argon2.argon2id, memoryCost: 4096, timeCost: 2, parallelism: 1,
    });

    const jwtSecretManager = new JwtSecretManager(conn.db);
    await jwtSecretManager.initialize();

    const delayQueue = new DelayQueue({ db: conn.db, sqlite: conn.sqlite });
    const approvalWorkflow = new ApprovalWorkflow({
      db: conn.db,
      sqlite: conn.sqlite,
      config: { policy_defaults_approval_timeout: 3600 },
    });

    app = createApp({
      db: conn.db, sqlite: conn.sqlite, keyStore: mockKeyStore(),
      masterPassword: TEST_MASTER_PASSWORD, masterPasswordHash,
      config: mockConfig(), adapterPool: mockAdapterPool(), jwtSecretManager,
      policyEngine: new DefaultPolicyEngine(),
      startTime: Math.floor(Date.now() / 1000) - 60,
      delayQueue,
      approvalWorkflow,
    });

    // Create wallet
    walletId = generateId();
    conn.db.insert(wallets).values({
      id: walletId,
      name: 'Test Wallet',
      chain: 'solana',
      environment: 'testnet',
      publicKey: `pk-test-${walletId.slice(0, 8)}`,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    }).run();
  });

  afterEach(() => {
    try { conn.sqlite.close(); } catch { /* already closed */ }
  });

  it('POST /admin/transactions/:id/cancel cancels a QUEUED transaction', async () => {
    const txId = generateId();
    const nowSec = Math.floor(Date.now() / 1000);

    // Insert QUEUED transaction with metadata (as DelayQueue.queueDelay does)
    conn.sqlite.prepare(
      "INSERT INTO transactions (id, wallet_id, chain, type, amount, to_address, status, queued_at, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, 'QUEUED', ?, ?, ?)",
    ).run(txId, walletId, 'solana', 'TRANSFER', '2.0', 'addr1', nowSec, JSON.stringify({ delaySeconds: 300 }), nowSec);

    const res = await app.request(
      `/v1/admin/transactions/${txId}/cancel`,
      {
        method: 'POST',
        headers: {
          Host: HOST,
          'Content-Type': 'application/json',
          'X-Master-Password': TEST_MASTER_PASSWORD,
        },
      },
    );

    const body = await json(res);
    expect(res.status).toBe(200);
    expect(body.id).toBe(txId);
    expect(body.status).toBe('CANCELLED');

    // Verify DB status
    const tx = conn.sqlite.prepare('SELECT status FROM transactions WHERE id = ?').get(txId) as any;
    expect(tx.status).toBe('CANCELLED');
  });

  it('POST /admin/transactions/:id/cancel returns error for non-QUEUED transaction', async () => {
    const txId = generateId();
    const nowSec = Math.floor(Date.now() / 1000);

    conn.sqlite.prepare(
      "INSERT INTO transactions (id, wallet_id, chain, type, amount, to_address, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'CONFIRMED', ?)",
    ).run(txId, walletId, 'solana', 'TRANSFER', '2.0', 'addr1', nowSec);

    const res = await app.request(
      `/v1/admin/transactions/${txId}/cancel`,
      {
        method: 'POST',
        headers: {
          Host: HOST,
          'Content-Type': 'application/json',
          'X-Master-Password': TEST_MASTER_PASSWORD,
        },
      },
    );

    // DelayQueue.cancelDelay throws TX_ALREADY_PROCESSED for non-QUEUED
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('POST /admin/transactions/:id/reject rejects a pending approval transaction', async () => {
    const txId = generateId();
    const nowSec = Math.floor(Date.now() / 1000);

    // Insert QUEUED transaction with pending_approval
    conn.sqlite.prepare(
      "INSERT INTO transactions (id, wallet_id, chain, type, amount, to_address, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'QUEUED', ?)",
    ).run(txId, walletId, 'solana', 'TRANSFER', '2.0', 'addr1', nowSec);

    conn.sqlite.prepare(
      'INSERT INTO pending_approvals (id, tx_id, required_by, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(`pa-${txId}`, txId, nowSec + 3600, nowSec + 3600, nowSec);

    const res = await app.request(
      `/v1/admin/transactions/${txId}/reject`,
      {
        method: 'POST',
        headers: {
          Host: HOST,
          'Content-Type': 'application/json',
          'X-Master-Password': TEST_MASTER_PASSWORD,
        },
      },
    );

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.id).toBe(txId);
    expect(body.status).toBe('CANCELLED');
    expect(body.rejectedAt).toBeDefined();

    // Verify DB status
    const tx = conn.sqlite.prepare('SELECT status FROM transactions WHERE id = ?').get(txId) as any;
    expect(tx.status).toBe('CANCELLED');
  });

  it('POST /admin/transactions/:id/cancel requires masterAuth', async () => {
    const txId = generateId();
    const nowSec = Math.floor(Date.now() / 1000);

    conn.sqlite.prepare(
      "INSERT INTO transactions (id, wallet_id, chain, type, amount, to_address, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'QUEUED', ?)",
    ).run(txId, walletId, 'solana', 'TRANSFER', '2.0', 'addr1', nowSec);

    const res = await app.request(
      `/v1/admin/transactions/${txId}/cancel`,
      {
        method: 'POST',
        headers: { Host: HOST, 'Content-Type': 'application/json' },
        // No X-Master-Password header
      },
    );

    expect(res.status).toBe(401);
  });

  it('POST /admin/transactions/:id/reject requires masterAuth', async () => {
    const txId = generateId();

    const res = await app.request(
      `/v1/admin/transactions/${txId}/reject`,
      {
        method: 'POST',
        headers: { Host: HOST, 'Content-Type': 'application/json' },
        // No X-Master-Password header
      },
    );

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// TelegramChannel reply_markup tests
// ---------------------------------------------------------------------------

describe('TelegramChannel reply_markup support', () => {
  it('includes reply_markup in fetch body when provided in payload.details', async () => {
    // Capture fetch calls
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const channel = new TelegramChannel();
    await channel.initialize({
      telegram_bot_token: 'test-token',
      telegram_chat_id: '12345',
    });

    const keyboard = {
      inline_keyboard: [[{ text: 'Cancel TX-001', callback_data: 'cancel:TX-001' }]],
    };

    await channel.send({
      eventType: 'TX_QUEUED',
      walletId: 'w-1',
      title: 'Transaction Queued',
      body: 'Transaction TX-001 is queued for 300s delay.',
      message: 'Transaction Queued\nTransaction TX-001 is queued for 300s delay.',
      timestamp: Math.floor(Date.now() / 1000),
      details: { reply_markup: keyboard },
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const fetchBody = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string);
    expect(fetchBody.reply_markup).toEqual(keyboard);
    expect(fetchBody.chat_id).toBe('12345');
    expect(fetchBody.parse_mode).toBe('MarkdownV2');

    fetchSpy.mockRestore();
  });

  it('does not include reply_markup when not in payload.details', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const channel = new TelegramChannel();
    await channel.initialize({
      telegram_bot_token: 'test-token',
      telegram_chat_id: '12345',
    });

    await channel.send({
      eventType: 'TX_CONFIRMED',
      walletId: 'w-1',
      title: 'Transaction Confirmed',
      body: 'Done.',
      message: 'Transaction Confirmed\nDone.',
      timestamp: Math.floor(Date.now() / 1000),
    });

    const fetchBody = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string);
    expect(fetchBody.reply_markup).toBeUndefined();

    fetchSpy.mockRestore();
  });
});
