/**
 * E2E Error Handling tests (E-10 to E-12).
 *
 * Tests error conditions: bad config, non-existent wallet, duplicate daemon start.
 */

import { describe, test, expect } from 'vitest';
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  initTestDataDir,
  startTestDaemon,
  stopTestDaemon,
  waitForHealth,
  fetchApi,
} from './helpers/daemon-harness.js';

describe('E2E Error Handling', () => {
  test('E-10: invalid config.toml causes daemon start failure', async () => {
    const { dataDir } = await initTestDataDir();

    // Overwrite with invalid config (unknown section)
    writeFileSync(join(dataDir, 'config.toml'), '[invalid_section]\nfoo = "bar"');

    try {
      await expect(startTestDaemon(dataDir)).rejects.toThrow();
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test('E-11: non-existent wallet returns 404', async () => {
    const masterPassword = 'test-password-12345';
    const { dataDir } = await initTestDataDir();
    const harness = await startTestDaemon(dataDir, masterPassword);

    try {
      await waitForHealth(harness);

      const res = await fetchApi(harness, '/v1/wallets/00000000-0000-0000-0000-000000000000', {
        headers: { 'X-Master-Password': masterPassword },
      });

      expect(res.status).toBe(404);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe('WALLET_NOT_FOUND');
    } finally {
      await stopTestDaemon(harness);
    }
  });

  test('E-12: duplicate daemon start fails with lock error', async () => {
    const { dataDir } = await initTestDataDir();
    const harness = await startTestDaemon(dataDir);

    try {
      await waitForHealth(harness);

      // Try to start a second daemon on the same dataDir
      await expect(startTestDaemon(dataDir)).rejects.toThrow(
        /already running|ELOCKED|SYSTEM_LOCKED|already being held/,
      );
    } finally {
      await stopTestDaemon(harness);
    }
  });
});
