/**
 * Daemon lifecycle integration test.
 *
 * Starts a real daemon process, verifies health check, and stops cleanly.
 * Requires CLI to be built first: pnpm turbo run build --filter=@waiaas/cli
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DaemonManager } from '../helpers/daemon-lifecycle.js';

// __tests__/ -> src/ -> e2e-tests/ -> packages/cli/bin/waiaas
const CLI_BIN = resolve(
  new URL('.', import.meta.url).pathname,
  '..', '..', '..', 'cli', 'bin', 'waiaas',
);
const skipReason = !existsSync(CLI_BIN)
  ? 'CLI not built (run pnpm turbo run build --filter=@waiaas/cli first)'
  : undefined;

describe.skipIf(!!skipReason)('DaemonManager lifecycle', { timeout: 30_000 }, () => {
  let manager: DaemonManager;

  beforeEach(() => {
    manager = new DaemonManager();
  });

  afterEach(async () => {
    await manager.stop().catch(() => {});
  });

  it('starts daemon, passes health check, and stops cleanly', async () => {
    const instance = await manager.start();
    expect(instance.port).toBeGreaterThan(0);
    expect(instance.baseUrl).toContain('http://127.0.0.1');

    // Health check should already pass (start() waits for it)
    const res = await fetch(`${instance.baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['status']).toBe('ok');

    // Stop
    await manager.stop();

    // Process should be gone -- health check should fail
    await expect(
      fetch(`${instance.baseUrl}/health`).then((r) => r.status),
    ).rejects.toThrow();
  });
});
