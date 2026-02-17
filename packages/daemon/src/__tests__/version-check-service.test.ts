/**
 * Tests for VersionCheckService: npm registry latest version check + key_value_store storage.
 *
 * Uses vi.stubGlobal('fetch') for fetch mocking and better-sqlite3 in-memory DB.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type DatabaseType from 'better-sqlite3';
import { VersionCheckService } from '../infrastructure/version/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createInMemoryDb(): DatabaseType.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE IF NOT EXISTS key_value_store (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  return db;
}

// ---------------------------------------------------------------------------
// VersionCheckService tests
// ---------------------------------------------------------------------------

describe('VersionCheckService', () => {
  let db: DatabaseType.Database;
  let service: VersionCheckService;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    db = createInMemoryDb();
    service = new VersionCheckService(db);
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    db.close();
  });

  describe('check()', () => {
    it('fetches latest version from npm and stores in key_value_store', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          'dist-tags': { latest: '2.0.0' },
        }),
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      const result = await service.check();

      expect(result.latest).toBe('2.0.0');
      expect(result.current).toBeTruthy();

      // Verify stored in DB
      const latestRow = db.prepare("SELECT value FROM key_value_store WHERE key = 'version_check_latest'").get() as { value: string } | undefined;
      expect(latestRow?.value).toBe('2.0.0');

      const checkedAtRow = db.prepare("SELECT value FROM key_value_store WHERE key = 'version_check_checked_at'").get() as { value: string } | undefined;
      expect(checkedAtRow).toBeTruthy();
      expect(Number(checkedAtRow?.value)).toBeGreaterThan(0);
    });

    it('returns null for latest on fetch error (fail-soft)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

      const result = await service.check();

      expect(result.latest).toBeNull();
      expect(result.current).toBeTruthy();
    });

    it('returns null for latest on timeout (fail-soft)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('The operation was aborted', 'AbortError')));

      const result = await service.check();

      expect(result.latest).toBeNull();
      expect(result.current).toBeTruthy();
    });

    it('returns null for latest on invalid JSON response (fail-soft)', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ unexpected: 'format' }),
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      const result = await service.check();

      expect(result.latest).toBeNull();
      expect(result.current).toBeTruthy();
    });

    it('returns null for latest on non-ok HTTP response (fail-soft)', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found',
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      const result = await service.check();

      expect(result.latest).toBeNull();
      expect(result.current).toBeTruthy();
    });

    it('sends correct User-Agent header and timeout', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          'dist-tags': { latest: '1.0.0' },
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await service.check();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit & { signal?: AbortSignal }];
      expect(url).toBe('https://registry.npmjs.org/@waiaas/cli');
      expect(options.headers).toBeDefined();
      expect((options.headers as Record<string, string>)['User-Agent']).toMatch(/^waiaas\//);
      expect(options.signal).toBeDefined();
    });

    it('overwrites existing version in key_value_store (INSERT OR REPLACE)', async () => {
      // Pre-populate
      db.prepare("INSERT INTO key_value_store (key, value, updated_at) VALUES ('version_check_latest', '1.0.0', 0)").run();

      const mockResponse = {
        ok: true,
        json: async () => ({
          'dist-tags': { latest: '2.0.0' },
        }),
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      await service.check();

      const row = db.prepare("SELECT value FROM key_value_store WHERE key = 'version_check_latest'").get() as { value: string };
      expect(row.value).toBe('2.0.0');
    });
  });

  describe('getLatest()', () => {
    it('returns null when no value stored', () => {
      expect(service.getLatest()).toBeNull();
    });

    it('returns stored latest version', () => {
      db.prepare("INSERT INTO key_value_store (key, value, updated_at) VALUES ('version_check_latest', '2.0.0', 1000)").run();
      expect(service.getLatest()).toBe('2.0.0');
    });
  });

  describe('getCheckedAt()', () => {
    it('returns null when no value stored', () => {
      expect(service.getCheckedAt()).toBeNull();
    });

    it('returns stored checked_at timestamp', () => {
      db.prepare("INSERT INTO key_value_store (key, value, updated_at) VALUES ('version_check_checked_at', '1700000000', 1000)").run();
      expect(service.getCheckedAt()).toBe(1700000000);
    });
  });
});
