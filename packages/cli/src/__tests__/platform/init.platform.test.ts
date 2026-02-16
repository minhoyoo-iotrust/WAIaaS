/**
 * Platform tests for `waiaas init` command.
 *
 * Focuses on filesystem-level behavior: directory creation, permissions, config content.
 * Complements unit tests in cli-commands.test.ts with platform-specific assertions.
 *
 * PLAT-01-INIT-01 ~ PLAT-01-INIT-04
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  existsSync,
  statSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  return join(tmpdir(), `waiaas-plat-init-${randomUUID()}`);
}

function rmrf(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Ignore
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PLAT-01 init platform tests', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs) rmrf(d);
    dirs.length = 0;
  });

  it('PLAT-01-INIT-01: creates 4 subdirs + config.toml in a fresh directory', async () => {
    const dataDir = makeTmpDir();
    dirs.push(dataDir);

    const { initCommand } = await import('../../commands/init.js');
    await initCommand(dataDir);

    // Verify 4 subdirectories
    for (const sub of ['keystore', 'data', 'logs', 'backups']) {
      expect(existsSync(join(dataDir, sub))).toBe(true);
    }

    // Verify config.toml
    expect(existsSync(join(dataDir, 'config.toml'))).toBe(true);
  });

  it('PLAT-01-INIT-02: re-run on initialized directory prints "Already initialized" and preserves config', async () => {
    const dataDir = makeTmpDir();
    dirs.push(dataDir);

    const { initCommand } = await import('../../commands/init.js');

    // First init
    await initCommand(dataDir);
    const originalConfig = readFileSync(join(dataDir, 'config.toml'), 'utf-8');

    // Capture console output
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    };

    // Second init
    await initCommand(dataDir);

    console.log = origLog;

    // Should output "Already initialized"
    expect(logs.some((l) => l.includes('Already initialized'))).toBe(true);

    // Config should be unchanged
    const afterConfig = readFileSync(join(dataDir, 'config.toml'), 'utf-8');
    expect(afterConfig).toBe(originalConfig);
  });

  it('PLAT-01-INIT-03: directory permission is 0o700', async () => {
    const dataDir = makeTmpDir();
    dirs.push(dataDir);

    const { initCommand } = await import('../../commands/init.js');
    await initCommand(dataDir);

    const mode = statSync(dataDir).mode & 0o777;
    expect(mode).toBe(0o700);

    // Subdirectories should also be 0o700
    for (const sub of ['keystore', 'data', 'logs', 'backups']) {
      const subMode = statSync(join(dataDir, sub)).mode & 0o777;
      expect(subMode).toBe(0o700);
    }
  });

  it('PLAT-01-INIT-04: config.toml contains [daemon] port=3100, hostname, [database] path', async () => {
    const dataDir = makeTmpDir();
    dirs.push(dataDir);

    const { initCommand } = await import('../../commands/init.js');
    await initCommand(dataDir);

    const content = readFileSync(join(dataDir, 'config.toml'), 'utf-8');

    expect(content).toContain('[daemon]');
    expect(content).toContain('port = 3100');
    expect(content).toContain('hostname = "127.0.0.1"');
    expect(content).toContain('[database]');
    expect(content).toContain('path = "data/waiaas.db"');
  });
});
