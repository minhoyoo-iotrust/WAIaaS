/**
 * E2E Lifecycle tests (E-01 to E-04).
 *
 * Tests the full daemon lifecycle: init -> start -> health check -> stop.
 * Uses a real daemon process (in-process) with real SQLite DB but no chain adapter.
 */

import { describe, test, expect, afterEach } from 'vitest';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { TestDaemonHarness } from './helpers/daemon-harness.js';
import {
  initTestDataDir,
  startTestDaemon,
  stopTestDaemon,
  waitForHealth,
  fetchApi,
} from './helpers/daemon-harness.js';

describe('E2E Lifecycle', () => {
  let harness: TestDaemonHarness | null = null;

  afterEach(async () => {
    if (harness) {
      await stopTestDaemon(harness);
      harness = null;
    }
  });

  test('E-01: init creates data directory, config.toml, and keystore/', async () => {
    // Create a fresh temp dir (not using initTestDataDir, testing initCommand directly)
    const dataDir = join(tmpdir(), `waiaas-e2e-${randomUUID()}`);

    try {
      const { initCommand } = await import('../commands/init.js');
      await initCommand(dataDir);

      // Assert: dataDir exists, config.toml exists, keystore/ exists, data/ exists
      expect(existsSync(dataDir)).toBe(true);
      expect(existsSync(join(dataDir, 'config.toml'))).toBe(true);
      expect(existsSync(join(dataDir, 'keystore'))).toBe(true);
      expect(existsSync(join(dataDir, 'data'))).toBe(true);
      expect(existsSync(join(dataDir, 'logs'))).toBe(true);
      expect(existsSync(join(dataDir, 'backups'))).toBe(true);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test('E-02: start boots daemon, health check returns 200', async () => {
    const { dataDir } = await initTestDataDir();
    harness = await startTestDaemon(dataDir);
    await waitForHealth(harness);

    const res = await fetchApi(harness, '/health');
    expect(res.status).toBe(200);

    const body = (await res.json()) as { status: string };
    expect(body).toHaveProperty('status', 'ok');
  });

  test('E-03: stop shuts down daemon, PID file removed', async () => {
    const { dataDir } = await initTestDataDir();
    harness = await startTestDaemon(dataDir);
    await waitForHealth(harness);

    // Verify PID file exists before stop
    expect(existsSync(join(dataDir, 'daemon.pid'))).toBe(true);

    await harness.daemon.shutdown('TEST');

    // Verify PID file removed after shutdown
    expect(existsSync(join(dataDir, 'daemon.pid'))).toBe(false);

    // Clean up (already shut down, prevent double shutdown in afterEach)
    rmSync(dataDir, { recursive: true, force: true });
    harness = null;
  });

  test('E-04: status shows running (programmatic PID check)', async () => {
    const { dataDir } = await initTestDataDir();
    harness = await startTestDaemon(dataDir);
    await waitForHealth(harness);

    // Verify PID file exists with correct PID
    const pidContent = readFileSync(join(dataDir, 'daemon.pid'), 'utf-8');
    expect(parseInt(pidContent, 10)).toBe(process.pid);

    // Health check confirms running
    const res = await fetchApi(harness, '/health');
    expect(res.status).toBe(200);
  });
});
