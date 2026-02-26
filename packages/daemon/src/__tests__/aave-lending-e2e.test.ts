/**
 * aave-lending-e2e.test.ts
 *
 * E2E integration test for the full Aave V3 lending flow:
 * supply -> position-sync -> health-check -> borrow -> HF-warning
 *
 * Uses in-memory SQLite, mock RPC responses, mock NotificationService.
 * Pattern: lido-staking-integration.test.ts + health-factor-monitor.test.ts
 *
 * @see ADMN-01, ADMN-02, ADMN-03, ADMN-04, ADMN-05
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ActionProviderRegistry } from '../infrastructure/action/action-provider-registry.js';
import { registerBuiltInProviders, AaveV3LendingProvider } from '@waiaas/actions';
import { HealthFactorMonitor } from '../services/monitoring/health-factor-monitor.js';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import type { Database as DatabaseType } from 'better-sqlite3';
import type { ActionContext, ContractCallRequest } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const makeSettingsReader = (overrides: Record<string, string> = {}) => {
  const defaults: Record<string, string> = {
    'rpc.evm_default_network': 'ethereum-mainnet',
    'actions.aave_v3_enabled': 'true',
    'actions.aave_v3_health_factor_warning_threshold': '1.2',
    'actions.aave_v3_position_sync_interval_sec': '300',
    'actions.aave_v3_max_ltv_pct': '0.8',
    // Disable other providers to prevent interference
    'actions.jupiter_swap_enabled': 'false',
    'actions.zerox_swap_enabled': 'false',
    'actions.lifi_enabled': 'false',
    'actions.lido_staking_enabled': 'false',
    'actions.jito_staking_enabled': 'false',
  };
  const data = { ...defaults, ...overrides };
  return { get: (key: string) => data[key] ?? '' };
};

const validContext: ActionContext = {
  walletAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
  chain: 'ethereum',
  walletId: '550e8400-e29b-41d4-a716-446655440000',
  sessionId: '660e8400-e29b-41d4-a716-446655440001',
};

const TEST_ASSET = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'; // USDC-like

function insertTestWallet(sqlite: DatabaseType, walletId: string): void {
  sqlite
    .prepare(
      "INSERT INTO wallets (id, name, chain, environment, public_key, status, created_at, updated_at) VALUES (?, 'test', 'ethereum', 'testnet', ?, 'ACTIVE', 0, 0)",
    )
    .run(walletId, `pk-${walletId}`);
}

function insertPosition(
  sqlite: DatabaseType,
  walletId: string,
  healthFactor: number,
  positionId: string,
): void {
  const now = Math.floor(Date.now() / 1000);
  sqlite
    .prepare(
      `INSERT INTO defi_positions (id, wallet_id, category, provider, chain, amount, metadata, status, opened_at, last_synced_at, created_at, updated_at)
       VALUES (?, ?, 'LENDING', 'aave_v3', 'ethereum', '1000', ?, 'ACTIVE', ?, ?, ?, ?)`,
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

describe('Aave V3 Lending E2E flow', () => {
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

  it('resolves supply action to ContractCallRequest with approve step', async () => {
    // Use the provider directly (no RPC needed for supply resolve)
    const provider = new AaveV3LendingProvider({ enabled: true });
    const result = await provider.resolve(
      'aave_supply',
      { asset: TEST_ASSET, amount: '100', network: 'ethereum-mainnet' },
      validContext,
    );

    const requests = Array.isArray(result) ? result : [result];

    // Supply should return 2-element array: [approve, supply]
    expect(requests).toHaveLength(2);

    // First element: ERC-20 approve (selector 0x095ea7b3)
    const approveReq = requests[0]!;
    expect(approveReq.to).toBe(TEST_ASSET);
    expect(approveReq.calldata!.startsWith('0x095ea7b3')).toBe(true);

    // Second element: Pool.supply() (selector 0x617ba037)
    const supplyReq = requests[1]!;
    expect(supplyReq.calldata!.startsWith('0x617ba037')).toBe(true);
  });

  it('registers aave_v3 provider via registerBuiltInProviders when enabled', () => {
    const registry = new ActionProviderRegistry();
    const reader = makeSettingsReader({ 'actions.aave_v3_enabled': 'true' });
    const { loaded, skipped } = registerBuiltInProviders(registry, reader);

    expect(loaded).toContain('aave_v3');
    expect(skipped).not.toContain('aave_v3');
    expect(registry.getProvider('aave_v3')).toBeDefined();
  });

  it('health factor monitor sends LIQUIDATION_WARNING when HF < threshold', async () => {
    const mockNotify = vi.fn().mockResolvedValue(undefined);
    const monitor = new HealthFactorMonitor({
      sqlite,
      notificationService: { notify: mockNotify } as unknown as import('../notifications/notification-service.js').NotificationService,
    });

    // Load settings with higher warning threshold
    const reader = makeSettingsReader({ 'actions.aave_v3_health_factor_warning_threshold': '1.5' });
    monitor.loadFromSettings(reader as unknown as import('../infrastructure/settings/settings-service.js').SettingsService);

    // Insert position with HF between danger (1.2) and new warning (1.5)
    insertPosition(sqlite, validContext.walletId!, 1.3, 'pos-warning');

    await monitor.checkAllPositions();

    // HF 1.3 < warningThreshold 1.5 and >= dangerThreshold 1.2 -> DANGER severity -> LIQUIDATION_WARNING
    expect(mockNotify).toHaveBeenCalledWith(
      'LIQUIDATION_WARNING',
      validContext.walletId,
      expect.objectContaining({ healthFactor: '1.30' }),
    );
  });

  it('health factor monitor does NOT warn when HF >= safe threshold', async () => {
    const mockNotify = vi.fn().mockResolvedValue(undefined);
    const monitor = new HealthFactorMonitor({
      sqlite,
      notificationService: { notify: mockNotify } as unknown as import('../notifications/notification-service.js').NotificationService,
    });

    // Insert position with safe HF
    insertPosition(sqlite, validContext.walletId!, 2.5, 'pos-safe');

    await monitor.checkAllPositions();

    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('settings override changes HealthFactorMonitor thresholds via loadFromSettings', async () => {
    const mockNotify = vi.fn().mockResolvedValue(undefined);
    const monitor = new HealthFactorMonitor({
      sqlite,
      notificationService: { notify: mockNotify } as unknown as import('../notifications/notification-service.js').NotificationService,
    });

    const reader = makeSettingsReader({
      'actions.aave_v3_health_factor_warning_threshold': '1.8',
      'actions.aave_v3_max_ltv_pct': '0.75',
    });
    monitor.loadFromSettings(reader as unknown as import('../infrastructure/settings/settings-service.js').SettingsService);

    // With warningThreshold=1.8, HF=1.6 should be DANGER (< 1.8 warning, >= 1.2 danger)
    insertPosition(sqlite, validContext.walletId!, 1.6, 'pos-threshold');
    await monitor.checkAllPositions();

    // Should receive alert because HF=1.6 < warningThreshold=1.8
    expect(mockNotify).toHaveBeenCalled();
    expect(monitor.getCurrentSeverity()).toBe('DANGER');
  });

  it('full flow: supply resolve -> DB position -> HF check -> borrow impact -> warning', async () => {
    // 1. Verify supply action resolution
    const provider = new AaveV3LendingProvider({ enabled: true });
    const supplyResult = await provider.resolve(
      'aave_supply',
      { asset: TEST_ASSET, amount: '1000', network: 'ethereum-mainnet' },
      validContext,
    );
    const requests = Array.isArray(supplyResult) ? supplyResult : [supplyResult];
    expect(requests).toHaveLength(2); // approve + supply

    // 2. Simulate post-supply: insert position in DB with safe HF
    insertPosition(sqlite, validContext.walletId!, 2.5, 'pos-e2e');

    // 3. HealthFactorMonitor check -> verify NO warning
    const mockNotify = vi.fn().mockResolvedValue(undefined);
    const monitor = new HealthFactorMonitor({
      sqlite,
      notificationService: { notify: mockNotify } as unknown as import('../notifications/notification-service.js').NotificationService,
    });

    await monitor.checkAllPositions();
    expect(mockNotify).not.toHaveBeenCalled();
    expect(monitor.getCurrentSeverity()).toBe('SAFE');

    // 4. Simulate borrow impact: update position HF to critical level (< dangerThreshold 1.2)
    updatePositionHF(sqlite, 'pos-e2e', 1.15);

    // 5. HealthFactorMonitor check -> verify LIQUIDATION_IMMINENT (CRITICAL: HF < 1.2)
    await monitor.checkAllPositions();
    expect(mockNotify).toHaveBeenCalledWith(
      'LIQUIDATION_IMMINENT',
      validContext.walletId,
      expect.objectContaining({ healthFactor: '1.15' }),
    );
    expect(monitor.getCurrentSeverity()).toBe('CRITICAL');

    // 6. Verify notification includes correct wallet ID and HF value
    const call = mockNotify.mock.calls[0];
    expect(call![1]).toBe(validContext.walletId);
    expect(call![2]).toEqual(expect.objectContaining({ healthFactor: '1.15' }));
  });
});
