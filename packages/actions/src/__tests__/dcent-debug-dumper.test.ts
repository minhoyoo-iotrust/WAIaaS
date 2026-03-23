/**
 * DCent debug dumper unit tests (#419).
 * Verifies file dump, auto-flush, header masking, and session file creation.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DcentDebugDumper, type DcentDebugDumpFile } from '../providers/dcent-swap/debug-dumper.js';

describe('DcentDebugDumper', () => {
  let dumpDir: string;

  beforeEach(() => {
    dumpDir = mkdtempSync(join(tmpdir(), 'dcent-dump-'));
  });

  afterEach(() => {
    rmSync(dumpDir, { recursive: true, force: true });
  });

  it('creates dump directory on construction', () => {
    const nested = join(dumpDir, 'sub', 'dir');
    const dumper = new DcentDebugDumper(nested, 'https://api.example.com');
    expect(existsSync(nested)).toBe(true);
    expect(dumper.callCount).toBe(0);
  });

  it('records API call and auto-flushes to session file', () => {
    const dumper = new DcentDebugDumper(dumpDir, 'https://api.example.com');

    dumper.record({
      method: 'POST',
      url: 'api/swap/v3/get_quotes',
      request: { fromId: 'ETHEREUM', toId: 'SOLANA', amount: '1000' },
      response: { status: 'success', quotes: [] },
      status: 200,
      duration_ms: 150,
    });

    expect(dumper.callCount).toBe(1);
    expect(existsSync(dumper.filePath)).toBe(true);

    const dump: DcentDebugDumpFile = JSON.parse(readFileSync(dumper.filePath, 'utf-8'));
    expect(dump.api_base_url).toBe('https://api.example.com');
    expect(dump.calls).toHaveLength(1);
    expect(dump.calls[0]!.seq).toBe(1);
    expect(dump.calls[0]!.method).toBe('POST');
    expect(dump.calls[0]!.url).toBe('api/swap/v3/get_quotes');
    expect(dump.calls[0]!.request).toEqual({ fromId: 'ETHEREUM', toId: 'SOLANA', amount: '1000' });
    expect(dump.calls[0]!.response).toEqual({ status: 'success', quotes: [] });
    expect(dump.calls[0]!.duration_ms).toBe(150);
    expect(dump.calls[0]!.timestamp).toBeTruthy();
  });

  it('records error calls', () => {
    const dumper = new DcentDebugDumper(dumpDir, 'https://api.example.com');

    dumper.record({
      method: 'POST',
      url: 'api/swap/v3/get_dex_swap_transaction_data',
      request: { fromId: 'ETHEREUM', toId: 'SOLANA' },
      error: 'API error 500: Internal Server Error',
      duration_ms: 340,
    });

    const dump: DcentDebugDumpFile = JSON.parse(readFileSync(dumper.filePath, 'utf-8'));
    expect(dump.calls[0]!.error).toBe('API error 500: Internal Server Error');
    expect(dump.calls[0]!.response).toBeUndefined();
  });

  it('accumulates multiple calls in session file', () => {
    const dumper = new DcentDebugDumper(dumpDir, 'https://api.example.com');

    dumper.record({ method: 'GET', url: 'currencies', request: null, status: 200, response: { count: 3 }, duration_ms: 100 });
    dumper.record({ method: 'POST', url: 'get_quotes', request: { fromId: 'ETH' }, status: 200, response: {}, duration_ms: 200 });
    dumper.record({ method: 'POST', url: 'get_tx_data', request: { fromId: 'ETH' }, error: 'timeout', duration_ms: 15000 });

    expect(dumper.callCount).toBe(3);
    const dump: DcentDebugDumpFile = JSON.parse(readFileSync(dumper.filePath, 'utf-8'));
    expect(dump.calls).toHaveLength(3);
    expect(dump.calls[0]!.seq).toBe(1);
    expect(dump.calls[1]!.seq).toBe(2);
    expect(dump.calls[2]!.seq).toBe(3);
  });

  it('uses "unknown" when npm_package_version is not set', () => {
    const orig = process.env.npm_package_version;
    delete process.env.npm_package_version;
    try {
      const dumper = new DcentDebugDumper(dumpDir, 'https://api.example.com');
      dumper.record({ method: 'GET', url: 'test', request: null, status: 200, response: {}, duration_ms: 1 });
      const dump: DcentDebugDumpFile = JSON.parse(readFileSync(dumper.filePath, 'utf-8'));
      expect(dump.daemon_version).toBe('unknown');
    } finally {
      if (orig !== undefined) process.env.npm_package_version = orig;
    }
  });

  it('does not write file when no calls recorded', () => {
    const dumper = new DcentDebugDumper(dumpDir, 'https://api.example.com');
    dumper.flush();
    expect(existsSync(dumper.filePath)).toBe(false);
  });

  describe('maskHeaders', () => {
    it('masks API key and authorization headers', () => {
      const masked = DcentDebugDumper.maskHeaders({
        'Content-Type': 'application/json',
        'X-Api-Key': 'sk-1234567890abcdef',
        Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.long-token',
        'X-Custom-Token': 'short',
      });

      expect(masked['Content-Type']).toBe('application/json');
      expect(masked['X-Api-Key']).toBe('sk-1...cdef');
      expect(masked.Authorization).toBe('Bear...oken');
      expect(masked['X-Custom-Token']).toBe('****');
    });
  });
});
