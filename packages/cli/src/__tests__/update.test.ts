/**
 * Tests for `waiaas update` command.
 *
 * Covers: --check mode, 7-step sequence, --to version, --rollback,
 * --no-start, error scenarios, npm registry interaction.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ── Mocks ──────────────────────────────────────────────────────────────────

// Mock child_process.execSync
const mockExecSync = vi.fn();
vi.mock('node:child_process', () => ({
  execSync: (...args: unknown[]) => mockExecSync(...args),
}));

// Mock BackupService
const mockCreateBackup = vi.fn().mockReturnValue('/tmp/backup-dir');
const mockRestoreLatest = vi.fn().mockReturnValue('/tmp/backup-dir');

vi.mock('@waiaas/daemon', () => ({
  BackupService: vi.fn().mockImplementation(() => ({
    createBackup: mockCreateBackup,
    restoreLatest: mockRestoreLatest,
  })),
}));

// Mock the package.json version read via createRequire
vi.mock('node:module', () => ({
  createRequire: () => {
    return (id: string) => {
      if (id === '../../package.json') {
        return { version: '1.7.0' };
      }
      throw new Error(`Unexpected require: ${id}`);
    };
  },
}));

import { updateCommand } from '../commands/update.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeTempDataDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'waiaas-update-test-'));
  mkdirSync(join(dir, 'data'), { recursive: true });
  return dir;
}

/** Mock global.fetch to return npm registry response with given latest version. */
function mockRegistryResponse(latest: string) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ 'dist-tags': { latest } }),
  });
}

/** Mock global.fetch to reject. */
function mockRegistryFailure() {
  return vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
}

// ── Test Suite ─────────────────────────────────────────────────────────────

describe('update command', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
    originalFetch = globalThis.fetch;
    mockExecSync.mockReset();
    mockCreateBackup.mockReset().mockReturnValue('/tmp/backup-dir');
    mockRestoreLatest.mockReset().mockReturnValue('/tmp/backup-dir');
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    exitSpy.mockRestore();
    globalThis.fetch = originalFetch;
  });

  // ── --check mode ────────────────────────────────────────────────────────

  describe('update --check', () => {
    it('reports update available when newer version exists', async () => {
      globalThis.fetch = mockRegistryResponse('2.0.0');
      const dataDir = makeTempDataDir();

      await updateCommand({ dataDir, check: true });

      const output = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(output).toContain('Update available');
      expect(output).toContain('1.7.0');
      expect(output).toContain('2.0.0');
      expect(output).toContain('waiaas update');
      // npm install should NOT be called
      expect(mockExecSync).not.toHaveBeenCalled();
    });

    it('reports already up to date when on latest version', async () => {
      globalThis.fetch = mockRegistryResponse('1.7.0');
      const dataDir = makeTempDataDir();

      await updateCommand({ dataDir, check: true });

      const output = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(output).toContain('Already up to date');
      expect(output).toContain('1.7.0');
      expect(mockExecSync).not.toHaveBeenCalled();
    });

    it('reports error when registry is unreachable', async () => {
      globalThis.fetch = mockRegistryFailure();
      const dataDir = makeTempDataDir();

      await expect(updateCommand({ dataDir, check: true }))
        .rejects.toThrow('process.exit called');

      const output = errorSpy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(output).toContain('Failed to check for updates');
    });
  });

  // ── Default 7-step mode ─────────────────────────────────────────────────

  describe('update (7-step sequence)', () => {
    it('executes all 7 steps in order', async () => {
      globalThis.fetch = mockRegistryResponse('2.0.0');
      const dataDir = makeTempDataDir();
      // Mock execSync for Step 4 (npm install) and Step 6 (version check)
      mockExecSync.mockImplementation((cmd: string) => {
        if (typeof cmd === 'string' && cmd.includes('--version')) {
          return Buffer.from('2.0.0\n');
        }
        return Buffer.from('');
      });

      await updateCommand({ dataDir, noStart: true });

      const allOutput = logSpy.mock.calls.map((c) => String(c[0]));
      const stepLogs = allOutput.filter((line) => /^\[\d\/7\]/.test(line));

      expect(stepLogs.length).toBe(7);
      expect(stepLogs[0]).toContain('[1/7]');
      expect(stepLogs[1]).toContain('[2/7]');
      expect(stepLogs[2]).toContain('[3/7]');
      expect(stepLogs[3]).toContain('[4/7]');
      expect(stepLogs[4]).toContain('[5/7]');
      expect(stepLogs[5]).toContain('[6/7]');
      expect(stepLogs[6]).toContain('[7/7]');
    });

    it('calls npm install -g @waiaas/cli@{version}', async () => {
      globalThis.fetch = mockRegistryResponse('2.0.0');
      const dataDir = makeTempDataDir();
      mockExecSync.mockImplementation((cmd: string) => {
        if (typeof cmd === 'string' && cmd.includes('--version')) {
          return Buffer.from('2.0.0\n');
        }
        return Buffer.from('');
      });

      await updateCommand({ dataDir, noStart: true });

      expect(mockExecSync).toHaveBeenCalledWith(
        'npm install -g @waiaas/cli@2.0.0',
        expect.objectContaining({ stdio: 'inherit' }),
      );
    });

    it('calls BackupService.createBackup with current version', async () => {
      globalThis.fetch = mockRegistryResponse('2.0.0');
      const dataDir = makeTempDataDir();
      mockExecSync.mockImplementation((cmd: string) => {
        if (typeof cmd === 'string' && cmd.includes('--version')) {
          return Buffer.from('2.0.0\n');
        }
        return Buffer.from('');
      });

      await updateCommand({ dataDir, noStart: true });

      expect(mockCreateBackup).toHaveBeenCalledWith('1.7.0');
    });

    it('skips npm when already up to date', async () => {
      globalThis.fetch = mockRegistryResponse('1.7.0');
      const dataDir = makeTempDataDir();

      await updateCommand({ dataDir });

      const output = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(output).toContain('Already up to date');
      expect(mockExecSync).not.toHaveBeenCalled();
      expect(mockCreateBackup).not.toHaveBeenCalled();
    });
  });

  // ── --to mode ───────────────────────────────────────────────────────────

  describe('update --to', () => {
    it('updates to a specific version', async () => {
      const dataDir = makeTempDataDir();
      mockExecSync.mockImplementation((cmd: string) => {
        if (typeof cmd === 'string' && cmd.includes('--version')) {
          return Buffer.from('1.8.0\n');
        }
        return Buffer.from('');
      });

      await updateCommand({ dataDir, to: '1.8.0', noStart: true });

      expect(mockExecSync).toHaveBeenCalledWith(
        'npm install -g @waiaas/cli@1.8.0',
        expect.objectContaining({ stdio: 'inherit' }),
      );

      const output = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(output).toContain('1.8.0');
    });

    it('rejects invalid semver version', async () => {
      const dataDir = makeTempDataDir();

      await expect(updateCommand({ dataDir, to: 'not-a-version' }))
        .rejects.toThrow('process.exit called');

      const output = errorSpy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(output).toContain('Invalid version');
    });
  });

  // ── --rollback mode ─────────────────────────────────────────────────────

  describe('update --rollback', () => {
    it('calls BackupService.restoreLatest', async () => {
      const dataDir = makeTempDataDir();

      await updateCommand({ dataDir, rollback: true });

      expect(mockRestoreLatest).toHaveBeenCalled();
      const output = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(output).toContain('Restored from backup');
    });

    it('reports error when no backups exist', async () => {
      const dataDir = makeTempDataDir();
      mockRestoreLatest.mockImplementation(() => {
        throw new Error('No backups found');
      });

      await expect(updateCommand({ dataDir, rollback: true }))
        .rejects.toThrow('process.exit called');

      const output = errorSpy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(output).toContain('Rollback failed');
    });
  });

  // ── --no-start mode ─────────────────────────────────────────────────────

  describe('update --no-start', () => {
    it('skips daemon restart in Step 7', async () => {
      globalThis.fetch = mockRegistryResponse('2.0.0');
      const dataDir = makeTempDataDir();
      mockExecSync.mockImplementation((cmd: string) => {
        if (typeof cmd === 'string' && cmd.includes('--version')) {
          return Buffer.from('2.0.0\n');
        }
        return Buffer.from('');
      });

      await updateCommand({ dataDir, noStart: true });

      const output = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(output).toContain('Skipping daemon restart (--no-start)');
      // Ensure 'waiaas start' was NOT called
      const startCalls = mockExecSync.mock.calls.filter(
        (c) => typeof c[0] === 'string' && c[0].includes('waiaas start'),
      );
      expect(startCalls).toHaveLength(0);
    });
  });

  // ── Failure scenarios ───────────────────────────────────────────────────

  describe('update failure', () => {
    it('shows rollback instructions when npm install fails', async () => {
      globalThis.fetch = mockRegistryResponse('2.0.0');
      const dataDir = makeTempDataDir();
      mockExecSync.mockImplementation((cmd: string) => {
        if (typeof cmd === 'string' && cmd.includes('npm install')) {
          throw new Error('npm ERR!');
        }
        return Buffer.from('');
      });

      await expect(updateCommand({ dataDir, noStart: true }))
        .rejects.toThrow('process.exit called');

      const output = errorSpy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(output).toContain('Package update failed');
      expect(output).toContain('waiaas update --rollback');
    });

    it('warns when installed version does not match target', async () => {
      globalThis.fetch = mockRegistryResponse('2.0.0');
      const dataDir = makeTempDataDir();
      mockExecSync.mockImplementation((cmd: string) => {
        if (typeof cmd === 'string' && cmd.includes('--version')) {
          return Buffer.from('1.9.0\n');
        }
        return Buffer.from('');
      });

      await updateCommand({ dataDir, noStart: true });

      const warnOutput = warnSpy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(warnOutput).toContain('Warning');
      expect(warnOutput).toContain('Expected 2.0.0');
    });
  });

  // ── Daemon stop ─────────────────────────────────────────────────────────

  describe('daemon stop during update', () => {
    it('skips stop when no PID file exists', async () => {
      globalThis.fetch = mockRegistryResponse('2.0.0');
      const dataDir = makeTempDataDir();
      mockExecSync.mockImplementation((cmd: string) => {
        if (typeof cmd === 'string' && cmd.includes('--version')) {
          return Buffer.from('2.0.0\n');
        }
        return Buffer.from('');
      });

      await updateCommand({ dataDir, noStart: true });

      const output = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(output).toContain('Daemon not running, skipping');
    });
  });
});
