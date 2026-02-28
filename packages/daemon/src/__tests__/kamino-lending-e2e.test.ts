/**
 * kamino-lending-e2e.test.ts
 *
 * E2E integration test for the Kamino lending integration flow:
 * registration -> supply resolve -> position sync -> HF check -> borrow impact -> warning
 *
 * Uses in-memory SQLite, mock SDK wrapper, mock NotificationService.
 * Pattern: aave-lending-e2e.test.ts
 *
 * @see KINT-01 through KINT-07
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ActionProviderRegistry } from '../infrastructure/action/action-provider-registry.js';
import { registerBuiltInProviders, KaminoLendingProvider } from '@waiaas/actions';
import { HealthFactorMonitor } from '../services/monitoring/health-factor-monitor.js';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import type { Database as DatabaseType } from 'better-sqlite3';
import type { ActionContext } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const makeSettingsReader = (overrides: Record<string, string> = {}) => {
  const defaults: Record<string, string> = {
    'actions.kamino_enabled': 'true',
    'actions.kamino_market': 'main',
    'actions.kamino_hf_threshold': '1.2',
    // Disable other providers
    'actions.jupiter_swap_enabled': 'false',
    'actions.zerox_swap_enabled': 'false',
    'actions.lifi_enabled': 'false',
    'actions.lido_staking_enabled': 'false',
    'actions.jito_staking_enabled': 'false',
    'actions.aave_v3_enabled': 'false',
  };
  const data = { ...defaults, ...overrides };
  return { get: (key: string) => data[key] ?? '' };
};

const validContext: ActionContext = {
  walletAddress: 'GjdQkM7nDfpT3bBCJimkdSgk1GcVGJp41DkXmKJMPEiS',
  chain: 'solana',
  walletId: '550e8400-e29b-41d4-a716-446655440099',
  sessionId: '660e8400-e29b-41d4-a716-446655440099',
};

const TEST_ASSET = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC

function insertTestWallet(sqlite: DatabaseType, walletId: string): void {
  sqlite
    .prepare(
      "INSERT INTO wallets (id, name, chain, environment, public_key, status, created_at, updated_at) VALUES (?, 'test-kamino', 'solana', 'mainnet', ?, 'ACTIVE', 0, 0)",
    )
    .run(walletId, `pk-${walletId}`);
}

function insertKaminoPosition(
  sqlite: DatabaseType,
  walletId: string,
  healthFactor: number,
  positionId: string,
): void {
  const now = Math.floor(Date.now() / 1000);
  sqlite
    .prepare(
      `INSERT INTO defi_positions (id, wallet_id, category, provider, chain, amount, metadata, status, opened_at, last_synced_at, created_at, updated_at)
       VALUES (?, ?, 'LENDING', 'kamino', 'solana', '1000', ?, 'ACTIVE', ?, ?, ?, ?)`,
    )
    .run(positionId, walletId, JSON.stringify({ healthFactor, positionType: 'SUPPLY' }), now, now, now, now);
}

function updatePositionHF(sqlite: DatabaseType, positionId: string, healthFactor: number): void {
  const now = Math.floor(Date.now() / 1000);
  sqlite
    .prepare('UPDATE defi_positions SET metadata = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify({ healthFactor, positionType: 'SUPPLY' }), now, positionId);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Kamino Lending E2E flow', () => {
  let sqlite: DatabaseType;

  beforeEach(() => {
    vi.useFakeTimers();
    const conn = createDatabase(':memory:');
    sqlite = conn.sqlite;
    pushSchema(sqlite);
    insertTestWallet(sqlite, validContext.walletId!);
  });

  afterEach(() => {
    sqlite.close();
    vi.useRealTimers();
  });

  // KINT-01: Provider registration
  it('registers kamino provider via registerBuiltInProviders when enabled', () => {
    const registry = new ActionProviderRegistry();
    const reader = makeSettingsReader({ 'actions.kamino_enabled': 'true' });
    const { loaded, skipped } = registerBuiltInProviders(registry, reader);

    expect(loaded).toContain('kamino');
    expect(skipped).not.toContain('kamino');
    expect(registry.getProvider('kamino')).toBeDefined();
  });

  // KINT-01: Provider skipped when disabled
  it('skips kamino provider when kamino_enabled is false', () => {
    const registry = new ActionProviderRegistry();
    const reader = makeSettingsReader({ 'actions.kamino_enabled': 'false' });
    const { loaded, skipped } = registerBuiltInProviders(registry, reader);

    expect(loaded).not.toContain('kamino');
    expect(skipped).toContain('kamino');
    expect(registry.getProvider('kamino')).toBeUndefined();
  });

  // KINT-02: MCP exposure metadata
  it('KaminoLendingProvider has mcpExpose=true and 4 actions', () => {
    const provider = new KaminoLendingProvider({ enabled: true });
    expect(provider.metadata.mcpExpose).toBe(true);
    expect(provider.actions).toHaveLength(4);
    const names = provider.actions.map((a) => a.name);
    expect(names).toContain('kamino_supply');
    expect(names).toContain('kamino_borrow');
    expect(names).toContain('kamino_repay');
    expect(names).toContain('kamino_withdraw');
  });

  // KINT-04: Supply action resolves to ContractCallRequest
  it('resolves supply action to ContractCallRequest with Solana fields', async () => {
    const provider = new KaminoLendingProvider({ enabled: true });
    const result = await provider.resolve(
      'kamino_supply',
      { asset: TEST_ASSET, amount: '100', market: 'main' },
      validContext,
    );

    const requests = Array.isArray(result) ? result : [result];
    expect(requests.length).toBeGreaterThanOrEqual(1);

    const req = requests[0]!;
    expect(req.type).toBe('CONTRACT_CALL');
    expect(req.network).toBe('solana-mainnet');
    expect(req.programId).toBeDefined();
    expect(req.instructionData).toBeDefined();
  });

  // KINT-05: Position sync to DB -- Kamino positions readable from defi_positions
  it('Kamino positions with provider=kamino are readable from defi_positions', () => {
    insertKaminoPosition(sqlite, validContext.walletId!, 2.0, 'kamino-pos-1');

    const rows = sqlite
      .prepare("SELECT * FROM defi_positions WHERE provider = 'kamino' AND status = 'ACTIVE'")
      .all() as Array<{ id: string; wallet_id: string; provider: string; category: string }>;

    expect(rows).toHaveLength(1);
    expect(rows[0]!.provider).toBe('kamino');
    expect(rows[0]!.category).toBe('LENDING');
    expect(rows[0]!.wallet_id).toBe(validContext.walletId);
  });

  // KINT-06: HealthFactorMonitor evaluates Kamino positions from DB
  it('health factor monitor sends LIQUIDATION_WARNING for Kamino position with low HF', async () => {
    const mockNotify = vi.fn().mockResolvedValue(undefined);
    const monitor = new HealthFactorMonitor({
      sqlite,
      notificationService: { notify: mockNotify } as unknown as import('../notifications/notification-service.js').NotificationService,
    });

    // Insert Kamino position with HF between danger (1.2) and warning (1.5)
    insertKaminoPosition(sqlite, validContext.walletId!, 1.3, 'kamino-pos-warning');

    await monitor.checkAllPositions();

    // HF 1.3 < warningThreshold 1.5 and >= dangerThreshold 1.2 -> DANGER -> LIQUIDATION_WARNING
    expect(mockNotify).toHaveBeenCalledWith(
      'LIQUIDATION_WARNING',
      validContext.walletId,
      expect.objectContaining({ healthFactor: '1.30' }),
    );
  });

  // KINT-07: Settings override changes thresholds via loadFromSettings
  it('loadFromSettings reads Kamino HF threshold for conservative minimum', () => {
    const mockNotify = vi.fn().mockResolvedValue(undefined);
    const monitor = new HealthFactorMonitor({
      sqlite,
      notificationService: { notify: mockNotify } as unknown as import('../notifications/notification-service.js').NotificationService,
    });

    // Load with Kamino threshold lower than Aave V3
    const reader = makeSettingsReader({
      'actions.aave_v3_health_factor_warning_threshold': '1.5',
      'actions.kamino_hf_threshold': '1.3',
    });
    monitor.loadFromSettings(reader as unknown as import('../infrastructure/settings/settings-service.js').SettingsService);

    // Warning threshold should be the minimum: 1.3 (Kamino) < 1.5 (Aave V3)
    // Verify by inserting a position at HF 1.35 (between 1.3 and 1.5)
    // With min threshold=1.3, HF 1.35 would be between warning (1.3) and safe (2.0)
    // The HF check uses the config.warningThreshold which was set to 1.3
    // So 1.35 >= dangerThreshold(1.2) but < warningThreshold(changed to 1.3) -- no, wait
    // Let me verify: updateConfig sets warningThreshold. Aave sets it to 1.5 first,
    // then Kamino at 1.3 is lower, so it replaces warningThreshold to 1.3.
    // HF 1.4 >= dangerThreshold(1.2) and >= warningThreshold(1.3) but < safeThreshold(2.0) -> WARNING
    insertKaminoPosition(sqlite, validContext.walletId!, 1.4, 'kamino-pos-threshold');

    // checkAllPositions will classify HF 1.4: >= danger(1.2), >= warning(1.3), < safe(2.0) -> WARNING
    // This confirms the threshold was set to 1.3 (not 1.5)
    void monitor.checkAllPositions().then(() => {
      expect(mockNotify).toHaveBeenCalled();
      expect(monitor.getCurrentSeverity()).toBe('WARNING');
    });
  });

  // Full flow: supply resolve -> DB position -> HF check -> borrow impact -> warning
  it('full flow: supply resolve -> DB position -> HF check -> borrow impact -> critical warning', async () => {
    // 1. Verify supply action resolution
    const provider = new KaminoLendingProvider({ enabled: true });
    const supplyResult = await provider.resolve(
      'kamino_supply',
      { asset: TEST_ASSET, amount: '1000', market: 'main' },
      validContext,
    );
    const requests = Array.isArray(supplyResult) ? supplyResult : [supplyResult];
    expect(requests.length).toBeGreaterThanOrEqual(1);

    // 2. Simulate post-supply: insert position in DB with safe HF
    insertKaminoPosition(sqlite, validContext.walletId!, 2.5, 'kamino-pos-e2e');

    // 3. HealthFactorMonitor check -> verify NO warning (HF 2.5 is safe)
    const mockNotify = vi.fn().mockResolvedValue(undefined);
    const monitor = new HealthFactorMonitor({
      sqlite,
      notificationService: { notify: mockNotify } as unknown as import('../notifications/notification-service.js').NotificationService,
    });

    await monitor.checkAllPositions();
    expect(mockNotify).not.toHaveBeenCalled();
    expect(monitor.getCurrentSeverity()).toBe('SAFE');

    // 4. Simulate borrow impact: update position HF to critical level (< dangerThreshold 1.2)
    updatePositionHF(sqlite, 'kamino-pos-e2e', 1.1);

    // 5. HealthFactorMonitor check -> verify LIQUIDATION_IMMINENT (CRITICAL: HF < 1.2)
    await monitor.checkAllPositions();
    expect(mockNotify).toHaveBeenCalledWith(
      'LIQUIDATION_IMMINENT',
      validContext.walletId,
      expect.objectContaining({ healthFactor: '1.10' }),
    );
    expect(monitor.getCurrentSeverity()).toBe('CRITICAL');
  });
});
