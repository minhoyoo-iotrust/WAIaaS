/**
 * SSRF Guard unit tests.
 *
 * Tests cover:
 * 1. URL normalization (trailing dot, lowercase, userinfo rejection, port validation)
 * 2. Protocol enforcement (HTTPS only)
 * 3. Private IPv4 blocking (RFC 5735/6890 full range)
 * 4. Private IPv6 blocking (loopback, link-local, unique local, multicast)
 * 5. Bypass vector blocking (IPv4-mapped IPv6 dotted/hex)
 * 6. Public IP allowance
 * 7. Mixed IP (public + private) blocking
 * 8. Redirect re-validation (safeFetchWithRedirects)
 *
 * Mocking: node:dns/promises lookup + global fetch
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WAIaaSError } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Mock node:dns/promises
// ---------------------------------------------------------------------------
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}));

import { lookup } from 'node:dns/promises';
const mockLookup = vi.mocked(lookup);

// ---------------------------------------------------------------------------
// Mock global fetch (for safeFetchWithRedirects)
// ---------------------------------------------------------------------------
const mockFetch = vi.fn<typeof globalThis.fetch>();
vi.stubGlobal('fetch', mockFetch);

// ---------------------------------------------------------------------------
// Import SUT (stubs for now -- RED phase)
// ---------------------------------------------------------------------------
import {
  validateUrlSafety,
  safeFetchWithRedirects,
} from '../services/x402/ssrf-guard.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Configure mockLookup to return given addresses for any hostname. */
function mockDnsLookup(addresses: Array<{ address: string; family: 4 | 6 }>): void {
  mockLookup.mockResolvedValue(addresses as never);
}

/** Configure mockLookup to return a single IPv4 address. */
function mockDnsIPv4(ip: string): void {
  mockDnsLookup([{ address: ip, family: 4 }]);
}

/** Configure mockLookup to return a single IPv6 address. */
function mockDnsIPv6(ip: string): void {
  mockDnsLookup([{ address: ip, family: 6 }]);
}

/** Assert that validateUrlSafety throws WAIaaSError with X402_SSRF_BLOCKED. */
async function expectSsrfBlocked(url: string): Promise<void> {
  await expect(validateUrlSafety(url)).rejects.toThrow(WAIaaSError);
  await expect(validateUrlSafety(url)).rejects.toMatchObject({
    code: 'X402_SSRF_BLOCKED',
  });
}

/** Create a minimal Response object for fetch mock. */
function mockResponse(status: number, headers?: Record<string, string>): Response {
  return new Response(null, {
    status,
    headers: new Headers(headers),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Default: DNS resolves to public IP
  mockDnsIPv4('93.184.216.34');
});

// =========================================================================
// 1. URL Normalization
// =========================================================================

describe('URL normalization', () => {
  it('should remove trailing dot from hostname', async () => {
    mockDnsIPv4('93.184.216.34');
    const result = await validateUrlSafety('https://example.com./path');
    expect(result.hostname).toBe('example.com');
  });

  it('should lowercase hostname', async () => {
    mockDnsIPv4('93.184.216.34');
    const result = await validateUrlSafety('https://EXAMPLE.COM/');
    expect(result.hostname).toBe('example.com');
  });

  it('should reject URL with userinfo (@)', async () => {
    await expectSsrfBlocked('https://user:pass@example.com/');
  });

  it('should reject non-443 port', async () => {
    await expectSsrfBlocked('https://example.com:8443/');
  });

  it('should allow default port (no port specified)', async () => {
    mockDnsIPv4('93.184.216.34');
    const result = await validateUrlSafety('https://example.com/path');
    expect(result.hostname).toBe('example.com');
  });

  it('should allow explicit port 443', async () => {
    mockDnsIPv4('93.184.216.34');
    const result = await validateUrlSafety('https://example.com:443/path');
    expect(result.hostname).toBe('example.com');
  });
});

// =========================================================================
// 2. Protocol enforcement (HTTPS only)
// =========================================================================

describe('Protocol enforcement', () => {
  it('should reject HTTP URLs', async () => {
    await expectSsrfBlocked('http://example.com/');
  });

  it('should allow HTTPS URLs', async () => {
    mockDnsIPv4('93.184.216.34');
    const result = await validateUrlSafety('https://example.com/');
    expect(result.protocol).toBe('https:');
  });
});

// =========================================================================
// 3. Private IPv4 blocking (RFC 5735/6890)
// =========================================================================

describe('Private IPv4 blocking', () => {
  const privateIPv4Cases: Array<[string, string]> = [
    ['10.0.0.1', '10.0.0.0/8 private'],
    ['10.255.255.255', '10.0.0.0/8 upper bound'],
    ['172.16.0.1', '172.16.0.0/12 lower bound'],
    ['172.31.255.255', '172.16.0.0/12 upper bound'],
    ['192.168.1.1', '192.168.0.0/16 private'],
    ['192.168.0.0', '192.168.0.0/16 base'],
    ['127.0.0.1', 'loopback'],
    ['127.255.255.255', 'loopback upper bound'],
    ['169.254.1.1', 'link-local'],
    ['0.0.0.0', 'this network'],
    ['100.64.0.1', 'CGNAT 100.64.0.0/10'],
    ['100.127.255.255', 'CGNAT upper bound'],
    ['224.0.0.1', 'multicast'],
    ['239.255.255.255', 'multicast upper bound'],
    ['240.0.0.1', 'reserved'],
    ['255.255.255.255', 'broadcast'],
    ['192.0.0.1', 'IETF protocol assignments 192.0.0.0/24'],
    ['192.0.2.1', 'TEST-NET-1 192.0.2.0/24'],
    ['198.18.0.1', 'benchmarking 198.18.0.0/15'],
    ['198.19.0.1', 'benchmarking upper'],
    ['198.51.100.1', 'TEST-NET-2 198.51.100.0/24'],
    ['203.0.113.1', 'TEST-NET-3 203.0.113.0/24'],
  ];

  for (const [ip, description] of privateIPv4Cases) {
    it(`should block ${ip} (${description})`, async () => {
      mockDnsIPv4(ip);
      await expectSsrfBlocked(`https://evil.example.com/`);
    });
  }
});

// =========================================================================
// 4. Private IPv6 blocking
// =========================================================================

describe('Private IPv6 blocking', () => {
  const privateIPv6Cases: Array<[string, string]> = [
    ['::1', 'loopback'],
    ['::', 'unspecified'],
    ['fe80::1', 'link-local'],
    ['fc00::1', 'unique local fc'],
    ['fd00::1', 'unique local fd'],
    ['ff02::1', 'multicast'],
  ];

  for (const [ip, description] of privateIPv6Cases) {
    it(`should block ${ip} (${description})`, async () => {
      mockDnsIPv6(ip);
      await expectSsrfBlocked(`https://evil6.example.com/`);
    });
  }
});

// =========================================================================
// 5. Bypass vector blocking (IPv4-mapped IPv6)
// =========================================================================

describe('Bypass vector blocking', () => {
  it('should block IPv4-mapped IPv6 dotted loopback (::ffff:127.0.0.1)', async () => {
    mockDnsIPv6('::ffff:127.0.0.1');
    await expectSsrfBlocked('https://bypass1.example.com/');
  });

  it('should block IPv4-mapped IPv6 dotted private (::ffff:10.0.0.1)', async () => {
    mockDnsIPv6('::ffff:10.0.0.1');
    await expectSsrfBlocked('https://bypass2.example.com/');
  });

  it('should block IPv4-mapped IPv6 hex loopback (::ffff:7f00:0001)', async () => {
    mockDnsIPv6('::ffff:7f00:0001');
    await expectSsrfBlocked('https://bypass3.example.com/');
  });

  it('should block IPv4-mapped IPv6 hex private (::ffff:0a00:0001)', async () => {
    mockDnsIPv6('::ffff:0a00:0001');
    await expectSsrfBlocked('https://bypass4.example.com/');
  });

  it('should block when DNS resolves to private IP (decimal hostname scenario)', async () => {
    // DNS server resolves "2130706433" (decimal for 127.0.0.1) to 127.0.0.1
    mockDnsIPv4('127.0.0.1');
    await expectSsrfBlocked('https://decimal-host.example.com/');
  });

  it('should block when DNS resolves to private IP (hex hostname scenario)', async () => {
    // DNS server resolves hex-encoded hostname to 10.0.0.1
    mockDnsIPv4('10.0.0.1');
    await expectSsrfBlocked('https://hex-host.example.com/');
  });
});

// =========================================================================
// 6. Public IP allowance
// =========================================================================

describe('Public IP allowance', () => {
  it('should allow public IPv4 (8.8.8.8)', async () => {
    mockDnsIPv4('8.8.8.8');
    const result = await validateUrlSafety('https://dns.google/');
    expect(result).toBeInstanceOf(URL);
  });

  it('should allow public IPv6 (2001:4860:4860::8888)', async () => {
    mockDnsIPv6('2001:4860:4860::8888');
    const result = await validateUrlSafety('https://dns.google/');
    expect(result).toBeInstanceOf(URL);
  });

  it('should allow when all resolved IPs are public', async () => {
    mockDnsLookup([
      { address: '93.184.216.34', family: 4 },
      { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
    ]);
    const result = await validateUrlSafety('https://example.com/');
    expect(result).toBeInstanceOf(URL);
  });
});

// =========================================================================
// 7. Mixed IP (some private) blocking
// =========================================================================

describe('Mixed IP blocking', () => {
  it('should block when any resolved IP is private (public + private mix)', async () => {
    mockDnsLookup([
      { address: '8.8.8.8', family: 4 },
      { address: '10.0.0.1', family: 4 },
    ]);
    await expectSsrfBlocked('https://mixed.example.com/');
  });

  it('should block when any IPv6 is private in mix', async () => {
    mockDnsLookup([
      { address: '93.184.216.34', family: 4 },
      { address: '::1', family: 6 },
    ]);
    await expectSsrfBlocked('https://mixed6.example.com/');
  });
});

// =========================================================================
// 8. Redirect re-validation (safeFetchWithRedirects)
// =========================================================================

describe('safeFetchWithRedirects', () => {
  it('should follow valid redirect (public IP -> public IP)', async () => {
    // First request: 301 redirect
    mockFetch.mockResolvedValueOnce(
      mockResponse(301, { Location: 'https://redirect-target.example.com/new' }),
    );
    // After redirect validation, second request: 200
    mockFetch.mockResolvedValueOnce(mockResponse(200));

    // DNS resolves to public for both
    mockDnsIPv4('93.184.216.34');

    const result = await safeFetchWithRedirects(
      new URL('https://start.example.com/'),
      'GET',
    );
    expect(result.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should block redirect to private IP', async () => {
    // First request: 301 redirect to private
    mockFetch.mockResolvedValueOnce(
      mockResponse(301, { Location: 'https://internal.example.com/secret' }),
    );

    // First call to validateUrlSafety (for initial URL) resolves to public
    mockLookup
      .mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }] as never)
      // Second call (for redirect target) resolves to private
      .mockResolvedValueOnce([{ address: '10.0.0.1', family: 4 }] as never);

    await expect(
      safeFetchWithRedirects(new URL('https://start.example.com/'), 'GET'),
    ).rejects.toThrow(WAIaaSError);
  });

  it('should block redirect to HTTP URL', async () => {
    // First request: 301 redirect to HTTP
    mockFetch.mockResolvedValueOnce(
      mockResponse(301, { Location: 'http://insecure.example.com/' }),
    );

    mockDnsIPv4('93.184.216.34');

    await expect(
      safeFetchWithRedirects(new URL('https://start.example.com/'), 'GET'),
    ).rejects.toThrow(WAIaaSError);
  });

  it('should block after max 3 redirects', async () => {
    // 4 consecutive redirects (1 initial + 3 redirects allowed, 4th should fail)
    for (let i = 0; i < 4; i++) {
      mockFetch.mockResolvedValueOnce(
        mockResponse(301, { Location: `https://hop${i + 1}.example.com/` }),
      );
    }
    mockDnsIPv4('93.184.216.34');

    await expect(
      safeFetchWithRedirects(new URL('https://start.example.com/'), 'GET'),
    ).rejects.toThrow(WAIaaSError);

    await expect(
      safeFetchWithRedirects(new URL('https://start.example.com/'), 'GET'),
    ).rejects.toMatchObject({ code: 'X402_SSRF_BLOCKED' });
  });

  it('should return non-redirect response directly (200)', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(200));

    const result = await safeFetchWithRedirects(
      new URL('https://api.example.com/'),
      'GET',
    );
    expect(result.status).toBe(200);
  });

  it('should return 402 response directly (for x402 handling)', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(402));

    const result = await safeFetchWithRedirects(
      new URL('https://paid.example.com/'),
      'GET',
    );
    expect(result.status).toBe(402);
  });

  it('should return 500 response directly', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(500));

    const result = await safeFetchWithRedirects(
      new URL('https://error.example.com/'),
      'GET',
    );
    expect(result.status).toBe(500);
  });
});
