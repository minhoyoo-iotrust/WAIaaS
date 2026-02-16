/**
 * Platform tests for `waiaas status` command.
 *
 * Tests status reporting: stopped / running / starting.
 * Also includes Windows-specific conditional tests.
 *
 * PLAT-01-STATUS-01 ~ PLAT-01-STATUS-03, PLAT-01-WIN-01 ~ PLAT-01-WIN-02
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  const dir = join(tmpdir(), `waiaas-plat-status-${randomUUID()}`);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

function rmrf(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Ignore
  }
}

// ---------------------------------------------------------------------------
// Status tests
// ---------------------------------------------------------------------------

describe('PLAT-01 status platform tests', () => {
  let testDir: string;
  let mockStdout: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    testDir = makeTmpDir();
    mockStdout = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    rmrf(testDir);
    mockStdout.mockRestore();
    vi.restoreAllMocks();
  });

  it('PLAT-01-STATUS-01: no PID file -> "Status: stopped"', async () => {
    const { statusCommand } = await import('../../commands/status.js');
    await statusCommand(testDir);

    expect(mockStdout).toHaveBeenCalledWith('Status: stopped');
  });

  it('PLAT-01-STATUS-02: PID alive + /health 200 -> "Status: running (PID: X, Port: Y)"', async () => {
    // Spin up a simple HTTP health endpoint
    const server = createServer((_, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"status":"ok"}');
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const port = (server.address() as { port: number }).port;

    // Write PID file with current process PID (alive)
    writeFileSync(join(testDir, 'daemon.pid'), String(process.pid));

    // Write config.toml pointing to the ephemeral port
    writeFileSync(
      join(testDir, 'config.toml'),
      `[daemon]\nport = ${port}\nhostname = "127.0.0.1"\n`,
    );

    const { statusCommand } = await import('../../commands/status.js');
    await statusCommand(testDir);

    expect(mockStdout).toHaveBeenCalledWith(
      `Status: running (PID: ${process.pid}, Port: ${port})`,
    );

    server.close();
  });

  it('PLAT-01-STATUS-03: PID alive + /health fails -> "Status: starting (PID: X)"', async () => {
    // Write PID file with current process PID (alive) but no HTTP server
    writeFileSync(join(testDir, 'daemon.pid'), String(process.pid));

    // Write config pointing to a port with nothing listening
    const unusedPort = 19999;
    writeFileSync(
      join(testDir, 'config.toml'),
      `[daemon]\nport = ${unusedPort}\nhostname = "127.0.0.1"\n`,
    );

    const { statusCommand } = await import('../../commands/status.js');
    await statusCommand(testDir);

    expect(mockStdout).toHaveBeenCalledWith(
      `Status: starting (PID: ${process.pid})`,
    );
  });
});

// ---------------------------------------------------------------------------
// Windows-specific tests
// ---------------------------------------------------------------------------

describe('PLAT-01 Windows platform tests', () => {
  it('PLAT-01-WIN-01: registerSignalHandlers registers SIGBREAK on win32', async () => {
    // We verify the signal-handler source code handles win32 platform branch.
    // On non-Windows, we test that SIGBREAK is NOT registered, and the branch
    // exists by inspecting the handler function.
    const { registerSignalHandlers } = await import('@waiaas/daemon');

    // Create a mock DaemonLifecycle
    const mockDaemon = {
      shutdown: vi.fn().mockResolvedValue(undefined),
      isShuttingDown: false,
    };

    // Capture all process.on calls
    const processOnSpy = vi.spyOn(process, 'on');

    registerSignalHandlers(mockDaemon as any);

    const registeredEvents = processOnSpy.mock.calls.map((c) => c[0]);

    // SIGINT and SIGTERM are always registered
    expect(registeredEvents).toContain('SIGINT');
    expect(registeredEvents).toContain('SIGTERM');

    // SIGBREAK only on win32
    if (process.platform === 'win32') {
      expect(registeredEvents).toContain('SIGBREAK');
    } else {
      expect(registeredEvents).not.toContain('SIGBREAK');
    }

    // uncaughtException and unhandledRejection are always registered
    expect(registeredEvents).toContain('uncaughtException');
    expect(registeredEvents).toContain('unhandledRejection');

    processOnSpy.mockRestore();
  });

  it('PLAT-01-WIN-02: path.join handles platform separators correctly for PID paths', () => {
    // path.join always uses the platform separator.
    // On any platform, join('dir', 'daemon.pid') should produce a valid path.
    const testPath = join('/some/path', 'daemon.pid');
    expect(testPath).toBeTruthy();

    // On Windows, path.join would use backslashes.
    // On Unix, forward slashes. Both should work with existsSync/readFileSync.
    // Verify the pattern used in status.ts works:
    const tmpDir = join(tmpdir(), `waiaas-win-test-${randomUUID()}`);
    mkdirSync(tmpDir, { recursive: true });
    const pidPath = join(tmpDir, 'daemon.pid');
    writeFileSync(pidPath, '12345');

    // Reading back should work regardless of separator style
    expect(existsSync(pidPath)).toBe(true);
    const { readFileSync } = require('node:fs');
    const content = readFileSync(pidPath, 'utf-8').trim();
    expect(content).toBe('12345');

    rmSync(tmpDir, { recursive: true, force: true });
  });
});
