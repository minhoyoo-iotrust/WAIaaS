/**
 * E2E test harness for spawning and managing daemon processes.
 *
 * Provides utilities to:
 * - Create isolated temp data directories
 * - Start daemon in-process (real or with mock adapter)
 * - Health-check polling
 * - Fetch API convenience wrapper
 * - Clean shutdown and temp dir removal
 */

import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import type { IChainAdapter, UnsignedTransaction, SubmitResult, BalanceInfo, HealthInfo, SimulationResult, TransferRequest } from '@waiaas/core';
import type { DaemonLifecycle } from '@waiaas/daemon';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TestDaemonHarness {
  dataDir: string;
  port: number;
  baseUrl: string;
  daemon: DaemonLifecycle;
  cleanup: () => Promise<void>;
  /** Test-scoped storage for agentId, txId, etc. */
  _agentId?: string;
  _txId?: string;
}

export interface ManualHarness {
  dataDir: string;
  port: number;
  baseUrl: string;
  httpServer: { close: () => void };
  sqlite: { close: () => void };
  cleanup: () => Promise<void>;
  _agentId?: string;
  _txId?: string;
}

// ---------------------------------------------------------------------------
// Mock Chain Adapter
// ---------------------------------------------------------------------------

/**
 * MockChainAdapter implementing IChainAdapter for E2E tests.
 *
 * Returns deterministic mock data without real blockchain interaction.
 * - getBalance: returns 1 SOL (1_000_000_000 lamports)
 * - buildTransaction: returns a dummy UnsignedTransaction
 * - simulateTransaction: returns success
 * - signTransaction: returns a dummy signed tx bytes
 * - submitTransaction: returns a mock tx hash
 * - waitForConfirmation: returns confirmed immediately
 */
export class MockChainAdapter implements IChainAdapter {
  readonly chain = 'solana' as const;
  readonly network = 'devnet' as const;

  async connect(_rpcUrl: string): Promise<void> {
    // no-op
  }

  async disconnect(): Promise<void> {
    // no-op
  }

  isConnected(): boolean {
    return true;
  }

  async getHealth(): Promise<HealthInfo> {
    return { healthy: true, latencyMs: 10, blockHeight: 1000n };
  }

  async getBalance(address: string): Promise<BalanceInfo> {
    return {
      address,
      balance: 1_000_000_000n, // 1 SOL
      decimals: 9,
      symbol: 'SOL',
    };
  }

  async buildTransaction(request: TransferRequest): Promise<UnsignedTransaction> {
    return {
      chain: 'solana',
      serialized: new Uint8Array(200),
      estimatedFee: 5000n,
      metadata: { from: request.from, to: request.to },
    };
  }

  async simulateTransaction(_tx: UnsignedTransaction): Promise<SimulationResult> {
    return { success: true, logs: ['mock simulation ok'] };
  }

  async signTransaction(_tx: UnsignedTransaction, _privateKey: Uint8Array): Promise<Uint8Array> {
    return new Uint8Array(200);
  }

  async submitTransaction(_signedTx: Uint8Array): Promise<SubmitResult> {
    return {
      txHash: `mock-tx-${randomUUID().slice(0, 8)}`,
      status: 'submitted',
    };
  }

  async waitForConfirmation(txHash: string, _timeoutMs?: number): Promise<SubmitResult> {
    return {
      txHash,
      status: 'confirmed',
      confirmations: 1,
    };
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Find a free port by binding to port 0 and reading the assigned port.
 */
async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        const port = addr.port;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error('Failed to get address')));
      }
    });
  });
}

/**
 * Create an isolated temp data directory with subdirs and minimal config.toml.
 * Assigns a random free port.
 */
export async function initTestDataDir(): Promise<{ dataDir: string; port: number }> {
  const dataDir = join(tmpdir(), `waiaas-e2e-${randomUUID()}`);
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });

  // Create required subdirectories
  for (const sub of ['data', 'keystore', 'logs', 'backups']) {
    mkdirSync(join(dataDir, sub), { recursive: true, mode: 0o700 });
  }

  // Find a free port
  const port = await findFreePort();

  // Write minimal config.toml
  const config = `[daemon]
port = ${port}
hostname = "127.0.0.1"

[database]
path = "data/waiaas.db"
`;
  writeFileSync(join(dataDir, 'config.toml'), config, { mode: 0o644 });

  return { dataDir, port };
}

// ---------------------------------------------------------------------------
// Start real daemon (lifecycle tests)
// ---------------------------------------------------------------------------

/**
 * Start a real daemon in-process using DaemonLifecycle.
 * Step 4 (adapter init) will fail-soft since there's no real RPC.
 * This is suitable for lifecycle and error tests.
 */
export async function startTestDaemon(
  dataDir: string,
  masterPassword = 'test-password-12345',
): Promise<TestDaemonHarness> {
  const { startDaemon } = await import('@waiaas/daemon');
  const daemon = await startDaemon(dataDir, masterPassword);

  const port = daemon.config!.daemon.port;
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    dataDir,
    port,
    baseUrl,
    daemon,
    cleanup: async () => {
      await stopTestDaemon({ dataDir, port, baseUrl, daemon, cleanup: async () => {} });
    },
  };
}

// ---------------------------------------------------------------------------
// Start daemon with mock adapter (agent/transaction tests)
// ---------------------------------------------------------------------------

/**
 * Start daemon manually with a MockChainAdapter injected.
 *
 * This bypasses DaemonLifecycle and constructs the server directly,
 * providing full pipeline support without a real Solana RPC.
 */
export async function startTestDaemonWithAdapter(
  dataDir: string,
  masterPassword = 'test-password-12345',
): Promise<ManualHarness> {
  const {
    loadConfig,
    createDatabase,
    pushSchema,
    LocalKeyStore,
    createApp,
    DefaultPolicyEngine,
  } = await import('@waiaas/daemon');
  const { serve } = await import('@hono/node-server');

  // Step 1: Load config
  const config = loadConfig(dataDir);

  // Step 2: Database init
  const dbPath = join(dataDir, config.database.path);
  const { sqlite, db } = createDatabase(dbPath);
  pushSchema(sqlite);

  // Step 3: Keystore
  const keystoreDir = join(dataDir, 'keystore');
  const keyStore = new LocalKeyStore(keystoreDir);

  // Step 4: Mock adapter
  const adapter = new MockChainAdapter();

  // Step 5: Create app with all deps
  const policyEngine = new DefaultPolicyEngine();
  const app = createApp({
    db,
    keyStore,
    masterPassword,
    config,
    adapter: adapter as unknown as IChainAdapter,
    policyEngine,
  });

  // Start HTTP server
  const httpServer = serve({
    fetch: app.fetch,
    hostname: config.daemon.hostname,
    port: config.daemon.port,
  });

  const port = config.daemon.port;
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    dataDir,
    port,
    baseUrl,
    httpServer,
    sqlite,
    cleanup: async () => {
      httpServer.close();
      sqlite.close();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

// ---------------------------------------------------------------------------
// Health check + API helpers
// ---------------------------------------------------------------------------

/**
 * Convenience wrapper for HTTP fetch to the daemon API.
 */
export async function fetchApi(
  harness: { baseUrl: string },
  path: string,
  opts?: RequestInit,
): Promise<Response> {
  return fetch(`${harness.baseUrl}${path}`, opts);
}

/**
 * Poll GET /health until 200 or timeout.
 */
export async function waitForHealth(
  harness: { baseUrl: string },
  timeoutMs = 10_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${harness.baseUrl}/health`);
      if (res.status === 200) return;
    } catch {
      // Connection refused, server not ready yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Health check timeout after ${timeoutMs}ms`);
}

// ---------------------------------------------------------------------------
// Stop / cleanup
// ---------------------------------------------------------------------------

/**
 * Stop a daemon started via startTestDaemon and clean up temp directory.
 */
export async function stopTestDaemon(harness: TestDaemonHarness): Promise<void> {
  try {
    if (!harness.daemon.isShuttingDown) {
      await harness.daemon.shutdown('TEST');
    }
  } catch {
    // Ignore shutdown errors in tests
  }
  try {
    rmSync(harness.dataDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}
