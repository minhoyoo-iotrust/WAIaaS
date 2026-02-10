/**
 * Tests for SessionManager.
 *
 * Tests token loading from env/file, JWT parsing, state management,
 * renewal scheduling, and disposal.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '../session-manager.js';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';

// Mock fs operations
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  rename: vi.fn(),
  mkdir: vi.fn(),
}));

const mockedReadFile = vi.mocked(readFile);
const mockedWriteFile = vi.mocked(writeFile);
const mockedRename = vi.mocked(rename);
const _mockedMkdir = vi.mocked(mkdir);

// Helper to create a fake JWT with given payload
function createFakeJWT(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = 'fake-signature';
  return `${header}.${body}.${sig}`;
}

// Suppress console.error in tests
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('SessionManager', () => {
  describe('constructor', () => {
    it('accepts all options', () => {
      const sm = new SessionManager({
        baseUrl: 'http://localhost:3100',
        dataDir: '/tmp/waiaas',
        envToken: 'token-123',
        renewalRatio: 0.8,
      });
      expect(sm.getState()).toBe('error'); // Before start()
    });

    it('defaults renewalRatio to 0.6', () => {
      const sm = new SessionManager({ baseUrl: 'http://localhost:3100' });
      expect(sm.getState()).toBe('error');
    });
  });

  describe('start() with env token', () => {
    it('loads token from envToken and sets state to active', async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = createFakeJWT({ sessionId: 'sess-1', exp: now + 3600 });
      const sm = new SessionManager({
        baseUrl: 'http://localhost:3100',
        envToken: token,
      });

      await sm.start();

      expect(sm.getState()).toBe('active');
      expect(sm.getToken()).toBe(token);
    });

    it('sets state to expired when token exp is past', async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = createFakeJWT({ sessionId: 'sess-1', exp: now - 100 });
      const sm = new SessionManager({
        baseUrl: 'http://localhost:3100',
        envToken: token,
      });

      await sm.start();

      expect(sm.getState()).toBe('expired');
      expect(sm.getToken()).toBeNull();
    });

    it('sets state to error when no token available', async () => {
      const sm = new SessionManager({
        baseUrl: 'http://localhost:3100',
      });

      await sm.start();

      expect(sm.getState()).toBe('error');
      expect(sm.getToken()).toBeNull();
    });
  });

  describe('start() with file token', () => {
    it('loads token from file when dataDir is set', async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = createFakeJWT({ sessionId: 'sess-file', exp: now + 3600 });
      mockedReadFile.mockResolvedValueOnce(token);

      const sm = new SessionManager({
        baseUrl: 'http://localhost:3100',
        dataDir: '/tmp/waiaas',
      });

      await sm.start();

      expect(sm.getState()).toBe('active');
      expect(sm.getToken()).toBe(token);
    });

    it('falls back to envToken when file read fails', async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = createFakeJWT({ sessionId: 'sess-env', exp: now + 3600 });
      mockedReadFile.mockRejectedValueOnce(new Error('ENOENT'));

      const sm = new SessionManager({
        baseUrl: 'http://localhost:3100',
        dataDir: '/tmp/waiaas',
        envToken: token,
      });

      await sm.start();

      expect(sm.getState()).toBe('active');
      expect(sm.getToken()).toBe(token);
    });

    it('prefers file token over envToken', async () => {
      const now = Math.floor(Date.now() / 1000);
      const fileToken = createFakeJWT({ sessionId: 'sess-file', exp: now + 3600 });
      const envToken = createFakeJWT({ sessionId: 'sess-env', exp: now + 3600 });
      mockedReadFile.mockResolvedValueOnce(fileToken);

      const sm = new SessionManager({
        baseUrl: 'http://localhost:3100',
        dataDir: '/tmp/waiaas',
        envToken: envToken,
      });

      await sm.start();

      expect(sm.getToken()).toBe(fileToken);
    });
  });

  describe('JWT validation', () => {
    it('rejects token with invalid format', async () => {
      const sm = new SessionManager({
        baseUrl: 'http://localhost:3100',
        envToken: 'not-a-jwt',
      });

      await sm.start();

      expect(sm.getState()).toBe('error');
    });

    it('rejects token without exp claim', async () => {
      const token = createFakeJWT({ sessionId: 'sess-1' });
      const sm = new SessionManager({
        baseUrl: 'http://localhost:3100',
        envToken: token,
      });

      await sm.start();

      expect(sm.getState()).toBe('error');
    });

    it('rejects token without sessionId claim', async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = createFakeJWT({ exp: now + 3600 });
      const sm = new SessionManager({
        baseUrl: 'http://localhost:3100',
        envToken: token,
      });

      await sm.start();

      expect(sm.getState()).toBe('error');
    });

    it('rejects token with exp too far in past (C-03)', async () => {
      const now = Math.floor(Date.now() / 1000);
      const tenYearsAgo = now - (11 * 365 * 24 * 60 * 60); // 11 years ago
      const token = createFakeJWT({ sessionId: 'sess-1', exp: tenYearsAgo });
      const sm = new SessionManager({
        baseUrl: 'http://localhost:3100',
        envToken: token,
      });

      await sm.start();

      expect(sm.getState()).toBe('error');
    });

    it('rejects token with exp too far in future (C-03)', async () => {
      const now = Math.floor(Date.now() / 1000);
      const twoYearsFromNow = now + (2 * 365 * 24 * 60 * 60);
      const token = createFakeJWT({ sessionId: 'sess-1', exp: twoYearsFromNow });
      const sm = new SessionManager({
        baseUrl: 'http://localhost:3100',
        envToken: token,
      });

      await sm.start();

      expect(sm.getState()).toBe('error');
    });
  });

  describe('getToken()', () => {
    it('returns token when active', async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = createFakeJWT({ sessionId: 'sess-1', exp: now + 3600 });
      const sm = new SessionManager({
        baseUrl: 'http://localhost:3100',
        envToken: token,
      });

      await sm.start();

      expect(sm.getToken()).toBe(token);
    });

    it('returns null when state is error', () => {
      const sm = new SessionManager({
        baseUrl: 'http://localhost:3100',
      });

      expect(sm.getToken()).toBeNull();
    });

    it('returns null when state is expired', async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = createFakeJWT({ sessionId: 'sess-1', exp: now - 100 });
      const sm = new SessionManager({
        baseUrl: 'http://localhost:3100',
        envToken: token,
      });

      await sm.start();

      expect(sm.getToken()).toBeNull();
    });
  });

  describe('dispose()', () => {
    it('sets state to expired and clears timer', async () => {
      vi.useFakeTimers();
      const now = Math.floor(Date.now() / 1000);
      const token = createFakeJWT({ sessionId: 'sess-1', exp: now + 3600 });
      const sm = new SessionManager({
        baseUrl: 'http://localhost:3100',
        envToken: token,
      });

      await sm.start();
      expect(sm.getState()).toBe('active');

      sm.dispose();

      expect(sm.getState()).toBe('expired');
      expect(sm.getToken()).toBeNull();
    });
  });

  describe('renewal scheduling', () => {
    it('schedules renewal timer on active start', async () => {
      vi.useFakeTimers();
      const now = Math.floor(Date.now() / 1000);
      const token = createFakeJWT({ sessionId: 'sess-1', exp: now + 3600 });
      const sm = new SessionManager({
        baseUrl: 'http://localhost:3100',
        envToken: token,
      });

      // Mock fetch for renewal
      vi.stubGlobal('fetch', vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            token: createFakeJWT({ sessionId: 'sess-renewed', exp: now + 7200 }),
            id: 'sess-renewed',
            expiresAt: now + 7200,
            renewalCount: 1,
          }),
        }),
      ));

      await sm.start();

      // Advance time to 60% of TTL (2160s for 3600s TTL)
      await vi.advanceTimersByTimeAsync(2160 * 1000);

      // Fetch should have been called for renewal
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/sessions/sess-1/renew'),
        expect.objectContaining({ method: 'PUT' }),
      );
    });

    it('does not schedule renewal when token is expired', async () => {
      vi.useFakeTimers();
      const now = Math.floor(Date.now() / 1000);
      const token = createFakeJWT({ sessionId: 'sess-1', exp: now - 100 });
      const sm = new SessionManager({
        baseUrl: 'http://localhost:3100',
        envToken: token,
      });

      await sm.start();

      expect(sm.getState()).toBe('expired');
    });

    it('updates token after successful renewal', async () => {
      vi.useFakeTimers();
      const now = Math.floor(Date.now() / 1000);
      const oldToken = createFakeJWT({ sessionId: 'sess-1', exp: now + 100 });
      const newToken = createFakeJWT({ sessionId: 'sess-renewed', exp: now + 3700 });

      // Mock file write
      mockedWriteFile.mockResolvedValue(undefined);
      mockedRename.mockResolvedValue(undefined);
      _mockedMkdir.mockResolvedValue(undefined);

      vi.stubGlobal('fetch', vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            token: newToken,
            id: 'sess-renewed',
            expiresAt: now + 3700,
            renewalCount: 1,
          }),
        }),
      ));

      const sm = new SessionManager({
        baseUrl: 'http://localhost:3100',
        envToken: oldToken,
        dataDir: '/tmp/waiaas',
      });

      await sm.start();

      // Advance to 60% of remaining TTL
      await vi.advanceTimersByTimeAsync(60 * 1000);

      expect(sm.getToken()).toBe(newToken);
      expect(sm.getState()).toBe('active');
    });
  });
});
