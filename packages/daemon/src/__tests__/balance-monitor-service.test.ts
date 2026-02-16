/**
 * BalanceMonitorService unit tests: periodic balance check + LOW_BALANCE alerts.
 *
 * Tests cover:
 * - BMON-01: Active wallet balance checking via adapter.getBalance
 * - BMON-02: Chain-specific threshold comparison (SOL 0.01, ETH 0.005)
 * - BMON-03: 24-hour duplicate alert prevention (cooldown)
 * - BMON-04: Recovery detection + re-drop alert
 * - Per-wallet error isolation
 * - disabled mode, stop(), updateConfig
 *
 * @see packages/daemon/src/services/monitoring/balance-monitor-service.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createDatabase } from '../infrastructure/database/connection.js';
import type { Database as DatabaseType } from 'better-sqlite3';
import {
  BalanceMonitorService,
  DEFAULT_BALANCE_MONITOR_CONFIG,
} from '../services/monitoring/balance-monitor-service.js';
import type { NotificationService } from '../notifications/notification-service.js';
import type { AdapterPool } from '../infrastructure/adapter-pool.js';

// ---------------------------------------------------------------------------
// Helper: create in-memory DB with wallets table
// ---------------------------------------------------------------------------

function createTestDb(): DatabaseType {
  const conn = createDatabase(':memory:');
  const db = conn.sqlite;

  db.exec(`CREATE TABLE IF NOT EXISTS wallets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    chain TEXT NOT NULL,
    environment TEXT NOT NULL DEFAULT 'testnet',
    default_network TEXT,
    public_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    owner_address TEXT,
    owner_verified INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    suspended_at INTEGER,
    suspension_reason TEXT
  )`);

  return db;
}

// ---------------------------------------------------------------------------
// Helper: insert test wallet
// ---------------------------------------------------------------------------

function insertWallet(
  db: DatabaseType,
  id: string,
  opts: {
    chain?: string;
    environment?: string;
    defaultNetwork?: string | null;
    publicKey?: string;
    status?: string;
  } = {},
): void {
  const now = Math.floor(Date.now() / 1000);
  const chain = opts.chain ?? 'solana';
  const env = opts.environment ?? 'testnet';
  const network = opts.defaultNetwork === undefined ? null : opts.defaultNetwork;
  const pk = opts.publicKey ?? `pk-${id}`;
  const status = opts.status ?? 'ACTIVE';

  db.prepare(
    'INSERT INTO wallets (id, name, chain, environment, default_network, public_key, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(id, `wallet-${id}`, chain, env, network, pk, status, now, now);
}

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockAdapter(balance: bigint, decimals: number, symbol: string) {
  return {
    getBalance: vi.fn().mockResolvedValue({
      address: 'testAddr',
      balance,
      decimals,
      symbol,
    }),
    connect: vi.fn(),
    disconnect: vi.fn(),
    isConnected: vi.fn().mockReturnValue(true),
  };
}

function createMockAdapterPool(mockAdapter: ReturnType<typeof createMockAdapter>) {
  return {
    resolve: vi.fn().mockResolvedValue(mockAdapter),
    disconnectAll: vi.fn(),
    evict: vi.fn(),
    evictAll: vi.fn(),
    size: 0,
  } as unknown as AdapterPool;
}

function createMockNotificationService() {
  const notify = vi.fn().mockResolvedValue(undefined);
  return {
    notify,
    service: { notify } as unknown as NotificationService,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BalanceMonitorService', () => {
  let db: DatabaseType;
  let mockAdapter: ReturnType<typeof createMockAdapter>;
  let mockAdapterPool: AdapterPool;
  let mockNotify: ReturnType<typeof vi.fn>;
  let mockNotificationService: NotificationService;
  let service: BalanceMonitorService;

  beforeEach(() => {
    db = createTestDb();

    // Default: SOL with low balance (0.005 SOL = 5_000_000 lamports, 9 decimals)
    mockAdapter = createMockAdapter(5_000_000n, 9, 'SOL');
    mockAdapterPool = createMockAdapterPool(mockAdapter);
    const ns = createMockNotificationService();
    mockNotify = ns.notify;
    mockNotificationService = ns.service;

    service = new BalanceMonitorService({
      sqlite: db,
      adapterPool: mockAdapterPool,
      config: {
        rpc: {
          solana_devnet: 'https://api.devnet.solana.com',
          evm_ethereum_sepolia: 'https://sepolia.drpc.org',
        },
      },
      notificationService: mockNotificationService,
      monitorConfig: {
        checkIntervalSec: 60,
        lowBalanceThresholdSol: 0.01,
        lowBalanceThresholdEth: 0.005,
        cooldownHours: 24,
        enabled: true,
      },
    });
  });

  afterEach(() => {
    service.stop();
    try {
      db.close();
    } catch {
      /* already closed */
    }
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // BMON-01: Active wallet balance checking
  // -----------------------------------------------------------------------

  describe('BMON-01: active wallet balance check', () => {
    it('ACTIVE 월렛에 대해 adapter.getBalance 호출', async () => {
      insertWallet(db, 'w1');

      await service.checkAllWallets();

      expect(mockAdapter.getBalance).toHaveBeenCalledWith('pk-w1');
    });

    it('SUSPENDED 월렛은 체크하지 않음', async () => {
      insertWallet(db, 'w-suspended', { status: 'SUSPENDED' });

      await service.checkAllWallets();

      expect(mockAdapter.getBalance).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // BMON-02: SOL threshold
  // -----------------------------------------------------------------------

  describe('BMON-02: SOL threshold', () => {
    it('SOL 잔액 0.005 (임계값 0.01 이하) -> LOW_BALANCE notify 호출', async () => {
      insertWallet(db, 'w-sol-low', { chain: 'solana' });
      // mockAdapter already returns 5_000_000 lamports = 0.005 SOL

      await service.checkAllWallets();

      expect(mockNotify).toHaveBeenCalledWith(
        'LOW_BALANCE',
        'w-sol-low',
        expect.objectContaining({
          walletId: 'w-sol-low',
          balance: '0.005',
          currency: 'SOL',
          threshold: '0.01',
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // BMON-02: ETH threshold
  // -----------------------------------------------------------------------

  describe('BMON-02: ETH threshold', () => {
    it('ETH 잔액 0.003 (임계값 0.005 이하) -> LOW_BALANCE notify 호출', async () => {
      // Override adapter for ETH: 0.003 ETH = 3_000_000_000_000_000 wei (18 decimals)
      const ethAdapter = createMockAdapter(3_000_000_000_000_000n, 18, 'ETH');
      const ethPool = createMockAdapterPool(ethAdapter);

      const ethService = new BalanceMonitorService({
        sqlite: db,
        adapterPool: ethPool,
        config: {
          rpc: { evm_ethereum_sepolia: 'https://sepolia.drpc.org' },
        },
        notificationService: mockNotificationService,
        monitorConfig: {
          lowBalanceThresholdEth: 0.005,
          enabled: true,
        },
      });

      insertWallet(db, 'w-eth-low', {
        chain: 'ethereum',
        environment: 'testnet',
      });

      await ethService.checkAllWallets();

      expect(mockNotify).toHaveBeenCalledWith(
        'LOW_BALANCE',
        'w-eth-low',
        expect.objectContaining({
          walletId: 'w-eth-low',
          balance: '0.003',
          currency: 'ETH',
          threshold: '0.005',
        }),
      );

      ethService.stop();
    });
  });

  // -----------------------------------------------------------------------
  // Threshold above: no notification
  // -----------------------------------------------------------------------

  describe('threshold above', () => {
    it('SOL 잔액 1.0 (임계값 이상) -> notify 미호출', async () => {
      // 1.0 SOL = 1_000_000_000 lamports
      const highAdapter = createMockAdapter(1_000_000_000n, 9, 'SOL');
      const highPool = createMockAdapterPool(highAdapter);

      const highService = new BalanceMonitorService({
        sqlite: db,
        adapterPool: highPool,
        config: { rpc: { solana_devnet: 'https://api.devnet.solana.com' } },
        notificationService: mockNotificationService,
        monitorConfig: { enabled: true },
      });

      insertWallet(db, 'w-sol-high');

      await highService.checkAllWallets();

      expect(mockNotify).not.toHaveBeenCalled();

      highService.stop();
    });
  });

  // -----------------------------------------------------------------------
  // BMON-03: Duplicate alert prevention (cooldown)
  // -----------------------------------------------------------------------

  describe('BMON-03: cooldown duplicate prevention', () => {
    it('첫 번째 체크에서 알림 후, 두 번째 체크에서 미발송 (24시간 이내)', async () => {
      insertWallet(db, 'w-cooldown');

      // First check: should notify
      await service.checkAllWallets();
      expect(mockNotify).toHaveBeenCalledTimes(1);

      // Second check: should NOT notify (within cooldown)
      mockNotify.mockClear();
      await service.checkAllWallets();
      expect(mockNotify).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // BMON-04: Recovery then re-drop
  // -----------------------------------------------------------------------

  describe('BMON-04: recovery then re-drop', () => {
    it('임계값 이하 -> 알림 -> 임계값 초과(회복) -> 임계값 이하 -> 새 알림', async () => {
      insertWallet(db, 'w-recover');

      // Step 1: Low balance -> notify
      await service.checkAllWallets();
      expect(mockNotify).toHaveBeenCalledTimes(1);
      mockNotify.mockClear();

      // Step 2: Balance recovers (1.0 SOL)
      mockAdapter.getBalance.mockResolvedValueOnce({
        address: 'testAddr',
        balance: 1_000_000_000n,
        decimals: 9,
        symbol: 'SOL',
      });
      await service.checkAllWallets();
      expect(mockNotify).not.toHaveBeenCalled(); // No alert for good balance

      // Step 3: Balance drops again (0.005 SOL)
      mockAdapter.getBalance.mockResolvedValueOnce({
        address: 'testAddr',
        balance: 5_000_000n,
        decimals: 9,
        symbol: 'SOL',
      });
      await service.checkAllWallets();
      expect(mockNotify).toHaveBeenCalledTimes(1); // New alert after recovery
    });
  });

  // -----------------------------------------------------------------------
  // disabled mode
  // -----------------------------------------------------------------------

  describe('disabled mode', () => {
    it('config.enabled=false -> start() 시 타이머 미등록', () => {
      vi.useFakeTimers();

      const disabledService = new BalanceMonitorService({
        sqlite: db,
        adapterPool: mockAdapterPool,
        config: { rpc: {} },
        notificationService: mockNotificationService,
        monitorConfig: { enabled: false },
      });

      disabledService.start();

      // Advance time -- no check should happen
      vi.advanceTimersByTime(600_000);
      expect(mockAdapter.getBalance).not.toHaveBeenCalled();

      disabledService.stop();
      vi.useRealTimers();
    });
  });

  // -----------------------------------------------------------------------
  // stop()
  // -----------------------------------------------------------------------

  describe('stop()', () => {
    it('stop() 후 타이머 정리 -> 더 이상 체크 안 함', () => {
      vi.useFakeTimers();

      insertWallet(db, 'w-stop');

      service.start();
      service.stop();

      // Advance time past check interval
      vi.advanceTimersByTime(120_000);
      expect(mockAdapter.getBalance).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  // -----------------------------------------------------------------------
  // Per-wallet error isolation
  // -----------------------------------------------------------------------

  describe('per-wallet error isolation', () => {
    it('adapter.getBalance 실패 월렛이 있어도 나머지 월렛은 정상 체크', async () => {
      insertWallet(db, 'w-fail', { publicKey: 'pk-fail' });
      insertWallet(db, 'w-ok', { publicKey: 'pk-ok' });

      // First call fails, second succeeds
      let callCount = 0;
      mockAdapter.getBalance.mockImplementation(async (addr: string) => {
        callCount++;
        if (addr === 'pk-fail') {
          throw new Error('RPC error');
        }
        return {
          address: addr,
          balance: 5_000_000n,
          decimals: 9,
          symbol: 'SOL',
        };
      });

      await service.checkAllWallets();

      // Both wallets were attempted
      expect(callCount).toBe(2);
      // Notification sent for the successful wallet (low balance)
      expect(mockNotify).toHaveBeenCalledWith(
        'LOW_BALANCE',
        'w-ok',
        expect.objectContaining({ walletId: 'w-ok' }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // updateConfig
  // -----------------------------------------------------------------------

  describe('updateConfig', () => {
    it('임계값 런타임 변경 반영', async () => {
      // 0.005 SOL -- below default threshold 0.01 -> would notify
      insertWallet(db, 'w-config');

      // Raise threshold to 0.001 -- 0.005 is now ABOVE threshold
      service.updateConfig({ lowBalanceThresholdSol: 0.001 });

      await service.checkAllWallets();

      // Should NOT notify because 0.005 > 0.001
      expect(mockNotify).not.toHaveBeenCalled();
    });

    it('checkIntervalSec 변경 시 타이머 재시작', async () => {
      vi.useFakeTimers();

      insertWallet(db, 'w-interval');

      service.start(); // starts with 60s interval

      // Change to 10s interval
      service.updateConfig({ checkIntervalSec: 10 });

      // Advance 15 seconds -- should trigger with new 10s interval
      await vi.advanceTimersByTimeAsync(15_000);

      // getBalance should have been called (timer restarted with 10s interval)
      expect(mockAdapter.getBalance).toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  // -----------------------------------------------------------------------
  // getStatus()
  // -----------------------------------------------------------------------

  describe('getStatus', () => {
    it('현재 모니터링 상태를 반환', () => {
      const status = service.getStatus();
      expect(status.enabled).toBe(true);
      expect(status.config.lowBalanceThresholdSol).toBe(0.01);
      expect(status.config.lowBalanceThresholdEth).toBe(0.005);
      expect(status.trackedWallets).toBe(0);
    });

    it('체크 후 trackedWallets가 증가', async () => {
      insertWallet(db, 'w-tracked');

      await service.checkAllWallets();

      const status = service.getStatus();
      expect(status.trackedWallets).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // DEFAULT_BALANCE_MONITOR_CONFIG export
  // -----------------------------------------------------------------------

  describe('DEFAULT_BALANCE_MONITOR_CONFIG', () => {
    it('기본값이 올바르게 정의됨', () => {
      expect(DEFAULT_BALANCE_MONITOR_CONFIG.checkIntervalSec).toBe(300);
      expect(DEFAULT_BALANCE_MONITOR_CONFIG.lowBalanceThresholdSol).toBe(0.01);
      expect(DEFAULT_BALANCE_MONITOR_CONFIG.lowBalanceThresholdEth).toBe(0.005);
      expect(DEFAULT_BALANCE_MONITOR_CONFIG.cooldownHours).toBe(24);
      expect(DEFAULT_BALANCE_MONITOR_CONFIG.enabled).toBe(true);
    });
  });
});
