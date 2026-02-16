/**
 * Platform E2E test: full init -> start -> status -> stop flow.
 *
 * PLAT-01-E2E-01
 */

import { describe, it, expect, vi, afterAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import type { TestDaemonHarness } from '../helpers/daemon-harness.js';
import {
  initTestDataDir,
  startTestDaemon,
  stopTestDaemon,
  waitForHealth,
} from '../helpers/daemon-harness.js';

describe('PLAT-01 E2E full flow', { timeout: 60_000 }, () => {
  let harness: TestDaemonHarness | null = null;
  let dataDir: string = '';

  afterAll(async () => {
    if (harness) {
      try {
        await stopTestDaemon(harness);
      } catch {
        // Ignore
      }
      harness = null;
    }
    if (dataDir) {
      try {
        rmSync(dataDir, { recursive: true, force: true });
      } catch {
        // Ignore
      }
    }
  });

  it('PLAT-01-E2E-01: init -> start -> health -> status(running) -> shutdown -> status(stopped)', async () => {
    // Step 1: Init
    const result = await initTestDataDir();
    dataDir = result.dataDir;

    // Verify init created config.toml and subdirs
    expect(existsSync(join(dataDir, 'config.toml'))).toBe(true);
    expect(existsSync(join(dataDir, 'keystore'))).toBe(true);

    // Also run initCommand to ensure idempotent second call
    const { initCommand } = await import('../../commands/init.js');
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    };
    await initCommand(dataDir);
    console.log = origLog;
    expect(logs.some((l) => l.includes('Already initialized'))).toBe(true);

    // Step 2: Start
    harness = await startTestDaemon(dataDir);
    await waitForHealth(harness);

    // Step 3: Verify health
    const healthRes = await fetch(`${harness.baseUrl}/health`);
    expect(healthRes.status).toBe(200);

    // Step 4: Verify PID file exists (status=running proxy)
    const pidPath = join(dataDir, 'daemon.pid');
    expect(existsSync(pidPath)).toBe(true);
    const pid = parseInt(readFileSync(pidPath, 'utf-8').trim(), 10);
    expect(pid).toBe(process.pid);

    // Step 5: Shutdown
    await harness.daemon.shutdown('TEST');
    expect(harness.daemon.isShuttingDown).toBe(true);

    // Step 6: Verify stopped (PID file removed)
    expect(existsSync(pidPath)).toBe(false);

    // Prevent double-cleanup in afterAll
    harness = null;
  });
});
