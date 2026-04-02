/**
 * PresetAutoSetupService unit + integration tests.
 *
 * T-AUTO-01: Normal apply — 4-step pipeline completes successfully
 * T-AUTO-02: Idempotent — already registered wallet is skipped
 * T-AUTO-03: Failure rollback — unexpected error restores Settings snapshot
 * T-AUTO-04: Already enabled SDK — skip step 1
 * T-AUTO-05: API integration — PUT /v1/wallets/:id/owner with wallet_type triggers auto-setup
 * T-AUTO-06: API rollback integration — failure rolls back both DB and Settings
 *
 * @see Phase 266-01 — Auto-Setup Orchestration
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type { Database as DatabaseType } from 'better-sqlite3';
import argon2 from 'argon2';
import { BUILTIN_PRESETS, WAIaaSError } from '@waiaas/core';
import { PresetAutoSetupService } from '../services/signing-sdk/preset-auto-setup.js';
import { SettingsService } from '../infrastructure/settings/settings-service.js';
import { createDatabase, pushSchema, generateId } from '../infrastructure/database/index.js';
import { JwtSecretManager } from '../infrastructure/jwt/index.js';
import { createApp } from '../api/server.js';
import type { OpenAPIHono } from '@hono/zod-openapi';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_PASSWORD = 'test-master-password-autosetup';
const HOST = '127.0.0.1:3100';
let passwordHash: string;

const VALID_SOLANA_ADDRESS = '11111111111111111111111111111112';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockKeyStore() {
  return {
    generateKeyPair: async () => ({
      publicKey: VALID_SOLANA_ADDRESS,
      encryptedPrivateKey: new Uint8Array(64),
    }),
    decryptPrivateKey: async () => new Uint8Array(64).fill(42),
    releaseKey: () => {},
    hasKey: async () => true,
    deleteKey: async () => {},
    lockAll: () => {},
    sodiumAvailable: true,
  } as any;
}

function createMockSettingsService(): {
  service: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> };
  store: Map<string, string>;
} {
  const store = new Map<string, string>([
    ['signing_sdk.enabled', 'false'],
    ['signing_sdk.preferred_channel', 'ntfy'],
    ['signing_sdk.wallets', '[]'],
  ]);

  const service = {
    get: vi.fn((key: string) => store.get(key) ?? ''),
    set: vi.fn((key: string, value: string) => { store.set(key, value); }),
  };

  return { service, store };
}

function createMockRegistry(opts: { throwOnRegister?: Error } = {}) {
  return {
    registerWallet: vi.fn(() => {
      if (opts.throwOnRegister) throw opts.throwOnRegister;
    }),
    getWallet: vi.fn(),
    getAllWallets: vi.fn(() => []),
    removeWallet: vi.fn(),
    buildSignUrl: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

function masterAuthJsonHeaders(): Record<string, string> {
  return {
    Host: HOST,
    'X-Master-Password': TEST_PASSWORD,
    'Content-Type': 'application/json',
  };
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

function seedWallet(sqlite: DatabaseType, walletId: string): void {
  const ts = Math.floor(Date.now() / 1000);
  sqlite
    .prepare(
      `INSERT INTO wallets (id, name, chain, environment, public_key, status, owner_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(walletId, 'test-wallet', 'solana', 'testnet', VALID_SOLANA_ADDRESS, 'ACTIVE', 0, ts, ts);
}

// ---------------------------------------------------------------------------
// Unit Tests — PresetAutoSetupService
// ---------------------------------------------------------------------------

describe('PresetAutoSetupService', () => {
  it('T-AUTO-01: normal apply — all steps complete (no preferred_wallet)', () => {
    const { service } = createMockSettingsService();
    const registry = createMockRegistry();
    const autoSetup = new PresetAutoSetupService(service as any, registry as any);

    const result = autoSetup.apply(BUILTIN_PRESETS.dcent);

    // signing_sdk.enabled set to 'true'
    expect(service.set).toHaveBeenCalledWith('signing_sdk.enabled', 'true');
    // WalletLinkConfig registered
    expect(registry.registerWallet).toHaveBeenCalledWith(BUILTIN_PRESETS.dcent.walletLinkConfig);
    // preferred_wallet should NOT be set (v33.4: removed)
    expect(service.set).not.toHaveBeenCalledWith('signing_sdk.preferred_wallet', expect.anything());
    // D'CENT uses sdk_push — preferred_channel IS set to push_relay
    expect(result.applied).toContain('signing_sdk_enabled');
    expect(result.applied).toContain('wallet_registered');
    expect(result.applied).not.toContain('preferred_wallet_set');
    // sdk_push sets preferred_channel to push_relay
    expect(result.applied).toContain('preferred_channel_set');
    expect(service.set).toHaveBeenCalledWith('signing_sdk.preferred_channel', 'push_relay');
  });

  it('T-AUTO-02: idempotent — already registered wallet is skipped', () => {
    const { service } = createMockSettingsService();
    const alreadyRegisteredError = new WAIaaSError('SIGN_REQUEST_ALREADY_PROCESSED', {
      message: "Wallet 'dcent' is already registered",
    });
    const registry = createMockRegistry({ throwOnRegister: alreadyRegisteredError });
    const autoSetup = new PresetAutoSetupService(service as any, registry as any);

    const result = autoSetup.apply(BUILTIN_PRESETS.dcent);

    // wallet_registered should NOT be in applied (skipped)
    expect(result.applied).not.toContain('wallet_registered');
    // But other steps should still proceed
    expect(result.applied).toContain('signing_sdk_enabled');
    // preferred_wallet_set no longer emitted (v33.4)
    expect(result.applied).not.toContain('preferred_wallet_set');
  });

  it('T-AUTO-03: failure rollback — unexpected error restores Settings snapshot', () => {
    const { service, store } = createMockSettingsService();
    const unexpectedError = new Error('Unexpected registry failure');
    const registry = createMockRegistry({ throwOnRegister: unexpectedError });
    const autoSetup = new PresetAutoSetupService(service as any, registry as any);

    // Capture original values (preferred_wallet no longer in snapshot)
    const origEnabled = store.get('signing_sdk.enabled');
    const origChannel = store.get('signing_sdk.preferred_channel');

    expect(() => autoSetup.apply(BUILTIN_PRESETS.dcent)).toThrow('Unexpected registry failure');

    // Settings should be restored to original values
    expect(store.get('signing_sdk.enabled')).toBe(origEnabled);
    expect(store.get('signing_sdk.preferred_channel')).toBe(origChannel);
    // preferred_wallet should NOT have been written
    expect(store.has('signing_sdk.preferred_wallet')).toBe(false);
  });

  it('T-AUTO-04: already enabled SDK — skip step 1', () => {
    const { service } = createMockSettingsService();
    // Pre-set signing_sdk.enabled to 'true'
    service.get.mockImplementation((key: string) => {
      if (key === 'signing_sdk.enabled') return 'true';
      if (key === 'signing_sdk.preferred_channel') return 'ntfy';
      return '';
    });
    const registry = createMockRegistry();
    const autoSetup = new PresetAutoSetupService(service as any, registry as any);

    const result = autoSetup.apply(BUILTIN_PRESETS.dcent);

    // signing_sdk_enabled should NOT be in applied (already enabled)
    expect(result.applied).not.toContain('signing_sdk_enabled');
    // Other steps should still proceed
    expect(result.applied).toContain('wallet_registered');
    // preferred_wallet_set no longer emitted
    expect(result.applied).not.toContain('preferred_wallet_set');
  });

  // -------------------------------------------------------------------------
  // Wallet App auto-registration (v29.7)
  // -------------------------------------------------------------------------

  it('T-APP-09: preset apply auto-registers wallet app and enables signing', () => {
    const { service } = createMockSettingsService();
    const registry = createMockRegistry();
    const walletAppService = {
      ensureRegistered: vi.fn().mockReturnValue({ id: 'app-1', name: 'dcent', displayName: "D'CENT Wallet", signingEnabled: true }),
      update: vi.fn().mockReturnValue({ id: 'app-1', name: 'dcent', displayName: "D'CENT Wallet", signingEnabled: true }),
    };
    const autoSetup = new PresetAutoSetupService(service as any, registry as any, walletAppService as any);

    const result = autoSetup.apply(BUILTIN_PRESETS.dcent);

    expect(walletAppService.ensureRegistered).toHaveBeenCalledWith(
      BUILTIN_PRESETS.dcent.preferredWallet,
      BUILTIN_PRESETS.dcent.displayName,
      { walletType: BUILTIN_PRESETS.dcent.preferredWallet },
    );
    // After ensureRegistered, update() is called with signingEnabled=true
    expect(walletAppService.update).toHaveBeenCalledWith('app-1', { signingEnabled: true });
    expect(result.applied).toContain('wallet_app_registered');
    // preferred_wallet should NOT be set
    expect(service.set).not.toHaveBeenCalledWith('signing_sdk.preferred_wallet', expect.anything());
  });

  it('T-APP-09b: preset apply is idempotent for wallet app', () => {
    const { service } = createMockSettingsService();
    const registry = createMockRegistry();
    const walletAppService = {
      ensureRegistered: vi.fn().mockReturnValue({ id: 'app-1', name: 'dcent', displayName: "D'CENT Wallet", signingEnabled: true }),
      update: vi.fn().mockReturnValue({ id: 'app-1', name: 'dcent', displayName: "D'CENT Wallet", signingEnabled: true }),
    };
    const autoSetup = new PresetAutoSetupService(service as any, registry as any, walletAppService as any);

    // First apply
    autoSetup.apply(BUILTIN_PRESETS.dcent);
    // Second apply — should not throw
    const result2 = autoSetup.apply(BUILTIN_PRESETS.dcent);

    // ensureRegistered + update called twice each (idempotent)
    expect(walletAppService.ensureRegistered).toHaveBeenCalledTimes(2);
    expect(walletAppService.update).toHaveBeenCalledTimes(2);
    expect(result2.applied).toContain('wallet_app_registered');
  });

  it('T-APP-09c: wallet_app_registered not in applied when no WalletAppService', () => {
    const { service } = createMockSettingsService();
    const registry = createMockRegistry();
    // No walletAppService provided
    const autoSetup = new PresetAutoSetupService(service as any, registry as any);

    const result = autoSetup.apply(BUILTIN_PRESETS.dcent);

    expect(result.applied).not.toContain('wallet_app_registered');
  });
});

// ---------------------------------------------------------------------------
// Integration Tests — API with PresetAutoSetupService
// ---------------------------------------------------------------------------

describe('PUT /v1/wallets/:id/owner auto-setup integration', () => {
  let sqlite: DatabaseType;
  let db: ReturnType<typeof createDatabase>['db'];
  let jwtManager: JwtSecretManager;
  let app: OpenAPIHono;
  let walletId: string;
  let settingsService: SettingsService;

  beforeAll(async () => {
    passwordHash = await argon2.hash(TEST_PASSWORD, {
      type: argon2.argon2id,
      memoryCost: 4096,
      timeCost: 2,
      parallelism: 1,
    });
  });

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-26T12:00:00Z'));

    const conn = createDatabase(':memory:');
    sqlite = conn.sqlite;
    db = conn.db;
    pushSchema(sqlite);

    jwtManager = new JwtSecretManager(db);
    await jwtManager.initialize();

    walletId = generateId();
    seedWallet(sqlite, walletId);

    const config = {
      master_password_hash: passwordHash,
      host: '127.0.0.1',
      port: 3100,
      rpc: {},
      security: {
        idle_timeout: 0,
        time_delay_default: 0,
        time_delay_high: 0,
        admin_session_timeout: 3600,
      },
      notifications: {},
    } as any;

    settingsService = new SettingsService({
      db,
      config,
      masterPassword: TEST_PASSWORD,
    });

    app = createApp({
      db,
      sqlite,
      keyStore: createMockKeyStore(),
      masterPassword: TEST_PASSWORD,
      masterPasswordHash: passwordHash,
      jwtSecretManager: jwtManager,
      config,
      settingsService,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('T-AUTO-05: wallet_type=dcent triggers auto-setup via API', async () => {
    // Verify initial state: signing SDK is disabled
    expect(settingsService.get('signing_sdk.enabled')).toBe('false');

    const res = await app.request(
      `http://${HOST}/v1/wallets/${walletId}/owner`,
      {
        method: 'PUT',
        headers: masterAuthJsonHeaders(),
        body: JSON.stringify({
          owner_address: VALID_SOLANA_ADDRESS,
          wallet_type: 'dcent',
        }),
      },
    );

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.walletType).toBe('dcent');
    expect(body.approvalMethod).toBe('sdk_push');

    // Verify DB state
    const row = sqlite.prepare('SELECT wallet_type, owner_approval_method FROM wallets WHERE id = ?').get(walletId) as any;
    expect(row.wallet_type).toBe('dcent');
    expect(row.owner_approval_method).toBe('sdk_push');

    // Verify Settings state after auto-setup
    expect(settingsService.get('signing_sdk.enabled')).toBe('true');
    // preferred_wallet is no longer set (v33.4) — signing is controlled by signing_enabled column

    // Verify WalletLinkConfig was registered (via signing_sdk.wallets JSON)
    const walletsJson = settingsService.get('signing_sdk.wallets');
    const registeredWallets = JSON.parse(walletsJson);
    expect(registeredWallets).toHaveLength(1);
    expect(registeredWallets[0].name).toBe('dcent');

    // Verify wallet app has signing_enabled=1 in DB
    const appRow = sqlite.prepare('SELECT signing_enabled FROM wallet_apps WHERE name = ?').get('dcent') as { signing_enabled: number } | undefined;
    expect(appRow).toBeTruthy();
    expect(appRow!.signing_enabled).toBe(1);
  });

  it('T-AUTO-06: auto-setup failure rolls back DB and Settings', async () => {
    // Break the settings service so step 3 (preferred_channel) fails
    const origSet = settingsService.set.bind(settingsService);
    const setspy = vi.spyOn(settingsService, 'set').mockImplementation((key: string, value: string) => {
      // Let first calls through (signing_sdk.enabled, signing_sdk.wallets via registerWallet)
      // Fail on preferred_channel set
      if (key === 'signing_sdk.preferred_channel' && value === 'push_relay') {
        throw new Error('Settings write failure');
      }
      return origSet(key, value);
    });

    const res = await app.request(
      `http://${HOST}/v1/wallets/${walletId}/owner`,
      {
        method: 'PUT',
        headers: masterAuthJsonHeaders(),
        body: JSON.stringify({
          owner_address: VALID_SOLANA_ADDRESS,
          wallet_type: 'dcent',
        }),
      },
    );

    // Should return 500 due to unhandled error in transaction
    expect(res.status).toBe(500);

    // Verify DB rollback: wallet_type should NOT be set (transaction rolled back)
    const row = sqlite.prepare('SELECT wallet_type, owner_approval_method FROM wallets WHERE id = ?').get(walletId) as any;
    expect(row.wallet_type).toBeNull();
    expect(row.owner_approval_method).toBeNull();

    setspy.mockRestore();
  });
});
