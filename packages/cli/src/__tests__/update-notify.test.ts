/**
 * Tests for CLI upgrade notification utility.
 *
 * Covers: update detection, stderr output, 24-hour dedup,
 * quiet mode, env-var suppression, error resilience.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, existsSync, utimesSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { checkAndNotifyUpdate } from '../utils/update-notify.js';

/** Helper: create a temporary data directory with optional config.toml. */
function makeTempDataDir(port?: number): string {
  const dir = mkdtempSync(join(tmpdir(), 'waiaas-update-notify-'));
  if (port !== undefined) {
    writeFileSync(join(dir, 'config.toml'), `port = ${port}\n`, 'utf-8');
  }
  return dir;
}

/** Helper: mock global fetch to return a health response. */
function mockFetch(body: Record<string, unknown>, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    json: () => Promise.resolve(body),
  });
}

describe('checkAndNotifyUpdate', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let originalFetch: typeof globalThis.fetch;
  let originalEnv: string | undefined;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    originalFetch = globalThis.fetch;
    originalEnv = process.env['WAIAAS_NO_UPDATE_NOTIFY'];
    delete process.env['WAIAAS_NO_UPDATE_NOTIFY'];
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    globalThis.fetch = originalFetch;
    if (originalEnv !== undefined) {
      process.env['WAIAAS_NO_UPDATE_NOTIFY'] = originalEnv;
    } else {
      delete process.env['WAIAAS_NO_UPDATE_NOTIFY'];
    }
  });

  it('prints update notification to stderr when updateAvailable is true', async () => {
    const dataDir = makeTempDataDir();
    globalThis.fetch = mockFetch({
      updateAvailable: true,
      version: '1.7.0',
      latestVersion: '2.0.0',
    });

    await checkAndNotifyUpdate({ dataDir });

    expect(stderrSpy).toHaveBeenCalled();
    const output = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(output).toContain('Update available');
    expect(output).toContain('1.7.0');
    expect(output).toContain('2.0.0');
    expect(output).toContain('waiaas upgrade');
  });

  it('does not print when updateAvailable is false', async () => {
    const dataDir = makeTempDataDir();
    globalThis.fetch = mockFetch({
      updateAvailable: false,
      version: '1.7.0',
      latestVersion: '1.7.0',
    });

    await checkAndNotifyUpdate({ dataDir });

    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('does not throw and prints nothing on fetch failure', async () => {
    const dataDir = makeTempDataDir();
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(checkAndNotifyUpdate({ dataDir })).resolves.toBeUndefined();
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('suppresses notification when .last-update-notify exists within 24 hours', async () => {
    const dataDir = makeTempDataDir();
    // Create dedup file with current timestamp
    writeFileSync(join(dataDir, '.last-update-notify'), '', 'utf-8');

    globalThis.fetch = mockFetch({
      updateAvailable: true,
      version: '1.7.0',
      latestVersion: '2.0.0',
    });

    await checkAndNotifyUpdate({ dataDir });

    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('shows notification when .last-update-notify is older than 24 hours', async () => {
    const dataDir = makeTempDataDir();
    const notifyPath = join(dataDir, '.last-update-notify');
    writeFileSync(notifyPath, '', 'utf-8');

    // Set mtime to 25 hours ago
    const past = new Date(Date.now() - 25 * 60 * 60 * 1000);
    utimesSync(notifyPath, past, past);

    globalThis.fetch = mockFetch({
      updateAvailable: true,
      version: '1.7.0',
      latestVersion: '2.0.0',
    });

    await checkAndNotifyUpdate({ dataDir });

    expect(stderrSpy).toHaveBeenCalled();
    const output = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(output).toContain('Update available');
  });

  it('does not call fetch when quiet is true', async () => {
    const dataDir = makeTempDataDir();
    const fetchMock = mockFetch({ updateAvailable: true });
    globalThis.fetch = fetchMock;

    await checkAndNotifyUpdate({ dataDir, quiet: true });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('does not call fetch when WAIAAS_NO_UPDATE_NOTIFY=1', async () => {
    const dataDir = makeTempDataDir();
    process.env['WAIAAS_NO_UPDATE_NOTIFY'] = '1';
    const fetchMock = mockFetch({ updateAvailable: true });
    globalThis.fetch = fetchMock;

    await checkAndNotifyUpdate({ dataDir });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('creates/updates .last-update-notify file after notification', async () => {
    const dataDir = makeTempDataDir();
    globalThis.fetch = mockFetch({
      updateAvailable: true,
      version: '1.7.0',
      latestVersion: '2.0.0',
    });

    const notifyPath = join(dataDir, '.last-update-notify');
    expect(existsSync(notifyPath)).toBe(false);

    await checkAndNotifyUpdate({ dataDir });

    expect(existsSync(notifyPath)).toBe(true);
    // Verify the file was recently modified
    const stat = statSync(notifyPath);
    const age = Date.now() - stat.mtimeMs;
    expect(age).toBeLessThan(5000); // less than 5 seconds ago
  });

  it('reads port from config.toml when present', async () => {
    const dataDir = makeTempDataDir(4200);
    const fetchMock = mockFetch({
      updateAvailable: true,
      version: '1.0.0',
      latestVersion: '2.0.0',
    });
    globalThis.fetch = fetchMock;

    await checkAndNotifyUpdate({ dataDir });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:4200/health',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('uses default port 3100 when config.toml is absent', async () => {
    const dataDir = makeTempDataDir(); // no config.toml
    const fetchMock = mockFetch({
      updateAvailable: false,
      version: '1.0.0',
    });
    globalThis.fetch = fetchMock;

    await checkAndNotifyUpdate({ dataDir });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3100/health',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('does not print when health response is not ok (non-200)', async () => {
    const dataDir = makeTempDataDir();
    globalThis.fetch = mockFetch({}, false);

    await checkAndNotifyUpdate({ dataDir });

    expect(stderrSpy).not.toHaveBeenCalled();
  });
});
