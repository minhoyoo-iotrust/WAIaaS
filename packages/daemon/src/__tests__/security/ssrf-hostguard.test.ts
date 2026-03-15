/**
 * SSRF Guard + hostGuard bypass prevention security tests.
 *
 * Tests cover:
 * 1. SSRF guard blocks internal/private IPs with allowHttp option
 * 2. SSRF guard allows public HTTP URLs with allowHttp option
 * 3. hostGuard rejects prefix-based hostname bypass attempts
 * 4. hostGuard allows legitimate localhost access with ports
 *
 * @module ssrf-hostguard-security-test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { WAIaaSError } from '@waiaas/core';
import { errorHandler } from '../../api/middleware/error-handler.js';

// ---------------------------------------------------------------------------
// Mock node:dns/promises
// ---------------------------------------------------------------------------
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}));

import { lookup } from 'node:dns/promises';
const mockLookup = vi.mocked(lookup);

// ---------------------------------------------------------------------------
// Import SUT
// ---------------------------------------------------------------------------
import { validateUrlSafety } from '../../infrastructure/security/ssrf-guard.js';
import { hostGuard } from '../../api/middleware/host-guard.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockDnsIPv4(ip: string): void {
  mockLookup.mockResolvedValue([{ address: ip, family: 4 }] as never);
}

async function expectSsrfBlocked(url: string, allowHttp = true): Promise<void> {
  await expect(validateUrlSafety(url, { allowHttp })).rejects.toThrow(WAIaaSError);
  await expect(validateUrlSafety(url, { allowHttp })).rejects.toMatchObject({
    code: 'X402_SSRF_BLOCKED',
  });
}

// ---------------------------------------------------------------------------
// SSRF Guard Tests (with allowHttp)
// ---------------------------------------------------------------------------

describe('SSRF Guard - internal IP blocking with allowHttp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should block link-local IP 169.254.169.254 (AWS IMDS)', async () => {
    mockDnsIPv4('169.254.169.254');
    await expectSsrfBlocked('http://169.254.169.254/latest/meta-data/');
  });

  it('should block private IP 10.0.0.1', async () => {
    mockDnsIPv4('10.0.0.1');
    await expectSsrfBlocked('http://10.0.0.1/');
  });

  it('should block private IP 172.16.0.1', async () => {
    mockDnsIPv4('172.16.0.1');
    await expectSsrfBlocked('http://172.16.0.1/');
  });

  it('should block private IP 192.168.1.1', async () => {
    mockDnsIPv4('192.168.1.1');
    await expectSsrfBlocked('http://192.168.1.1/');
  });

  it('should block loopback IP 127.0.0.1', async () => {
    mockDnsIPv4('127.0.0.1');
    await expectSsrfBlocked('http://127.0.0.1/');
  });

  it('should allow public HTTP URL with allowHttp', async () => {
    mockDnsIPv4('93.184.216.34');
    const result = await validateUrlSafety('http://rpc.example.com:8545/', { allowHttp: true });
    expect(result).toBeInstanceOf(URL);
    expect(result.protocol).toBe('http:');
  });
});

// ---------------------------------------------------------------------------
// hostGuard Bypass Prevention Tests
// ---------------------------------------------------------------------------

describe('hostGuard - prefix bypass prevention', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.onError(errorHandler);
    app.use('*', hostGuard);
    app.get('/test', (c) => c.json({ ok: true }));
  });

  it('should reject Host: localhost.evil.com (SYSTEM_LOCKED 503)', async () => {
    const res = await app.request('/test', {
      headers: { Host: 'localhost.evil.com' },
    });
    // SYSTEM_LOCKED maps to 503
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe('SYSTEM_LOCKED');
  });

  it('should reject Host: localhost123 (SYSTEM_LOCKED 503)', async () => {
    const res = await app.request('/test', {
      headers: { Host: 'localhost123' },
    });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe('SYSTEM_LOCKED');
  });

  it('should reject Host: 127.0.0.1.evil.com (SYSTEM_LOCKED 503)', async () => {
    const res = await app.request('/test', {
      headers: { Host: '127.0.0.1.evil.com' },
    });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe('SYSTEM_LOCKED');
  });

  it('should allow Host: localhost:3000', async () => {
    const res = await app.request('/test', {
      headers: { Host: 'localhost:3000' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it('should allow Host: 127.0.0.1:8080', async () => {
    const res = await app.request('/test', {
      headers: { Host: '127.0.0.1:8080' },
    });
    expect(res.status).toBe(200);
  });

  it('should allow Host: [::1]:3000', async () => {
    const res = await app.request('/test', {
      headers: { Host: '[::1]:3000' },
    });
    expect(res.status).toBe(200);
  });
});
