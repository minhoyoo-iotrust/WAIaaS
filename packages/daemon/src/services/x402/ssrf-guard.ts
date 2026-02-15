/**
 * SSRF Guard for x402 HTTP proxy.
 *
 * Defense layers:
 * 1. URL normalization (trailing dot, lowercase, userinfo rejection, port 443 only)
 * 2. Protocol enforcement (HTTPS only)
 * 3. DNS pre-resolution + private IP blocking (RFC 5735/6890)
 * 4. IPv4-mapped IPv6 bypass vector blocking
 * 5. Redirect re-validation (max 3 hops)
 *
 * @module ssrf-guard
 */

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { WAIaaSError } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate URL safety against SSRF attacks.
 * Performs DNS resolution and validates all resolved IPs are public.
 *
 * @throws WAIaaSError('X402_SSRF_BLOCKED') if URL targets private/reserved IP
 */
export async function validateUrlSafety(urlString: string): Promise<URL> {
  const url = normalizeUrl(urlString);

  // Protocol enforcement: HTTPS only
  if (url.protocol !== 'https:') {
    throw new WAIaaSError('X402_SSRF_BLOCKED', {
      message: `Only HTTPS URLs are allowed, got ${url.protocol}`,
    });
  }

  // Reject userinfo
  if (url.username || url.password) {
    throw new WAIaaSError('X402_SSRF_BLOCKED', {
      message: 'URLs with userinfo (@) are not allowed',
    });
  }

  // Port validation: only 443 (or default empty)
  if (url.port && url.port !== '443') {
    throw new WAIaaSError('X402_SSRF_BLOCKED', {
      message: `Non-standard port ${url.port} is not allowed`,
    });
  }

  const hostname = url.hostname;

  // Direct IP in hostname
  if (isIP(hostname)) {
    assertPublicIP(hostname);
    return url;
  }

  // DNS pre-resolution: resolve all A + AAAA records
  const addresses = await lookup(hostname, { all: true });
  for (const { address } of addresses) {
    assertPublicIP(address);
  }

  return url;
}

/**
 * Fetch with manual redirect handling and SSRF re-validation per hop.
 * Max 3 redirects. After redirect, method becomes GET and body is dropped.
 *
 * @throws WAIaaSError('X402_SSRF_BLOCKED') on private IP redirect or too many redirects
 */
export async function safeFetchWithRedirects(
  url: URL,
  method: string,
  headers?: Record<string, string>,
  body?: string,
  timeout: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  let currentUrl = url;

  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(currentUrl.toString(), {
        method: i === 0 ? method : 'GET',
        headers: i === 0 ? headers : undefined,
        body: i === 0 && method !== 'GET' ? body : undefined,
        signal: controller.signal,
        redirect: 'manual',
      });

      // Non-redirect response: return as-is
      if (response.status < 300 || response.status >= 400) {
        return response;
      }

      // Redirect: extract and validate Location
      const location = response.headers.get('Location');
      if (!location) {
        return response;
      }

      // SSRF re-validation on redirect target
      currentUrl = await validateUrlSafety(
        new URL(location, currentUrl).toString(),
      );
    } finally {
      clearTimeout(timer);
    }
  }

  throw new WAIaaSError('X402_SSRF_BLOCKED', {
    message: `Too many redirects (max ${MAX_REDIRECTS})`,
  });
}

// ---------------------------------------------------------------------------
// Internal: URL normalization
// ---------------------------------------------------------------------------

function normalizeUrl(urlString: string): URL {
  const url = new URL(urlString);
  // Remove trailing dot (FQDN normalization)
  if (url.hostname.endsWith('.')) {
    url.hostname = url.hostname.slice(0, -1);
  }
  return url;
}

// ---------------------------------------------------------------------------
// Internal: IP validation
// ---------------------------------------------------------------------------

/**
 * Assert that an IP address is public (not private/reserved).
 * Handles IPv4-mapped IPv6 normalization before checking.
 *
 * @throws WAIaaSError('X402_SSRF_BLOCKED') if IP is private/reserved
 */
function assertPublicIP(ip: string): void {
  const normalized = normalizeIPv6Mapped(ip);

  if (isPrivateIP(normalized)) {
    throw new WAIaaSError('X402_SSRF_BLOCKED', {
      message: `Resolved IP ${ip} is private/reserved`,
    });
  }
}

/**
 * Normalize IPv4-mapped IPv6 addresses to their IPv4 equivalents.
 * - ::ffff:A.B.C.D -> A.B.C.D (dotted format)
 * - ::ffff:HHHH:HHHH -> A.B.C.D (hex-encoded format)
 */
function normalizeIPv6Mapped(ip: string): string {
  const lower = ip.toLowerCase();

  // ::ffff:A.B.C.D format (dotted decimal)
  if (lower.startsWith('::ffff:') && lower.includes('.')) {
    return lower.slice(7);
  }

  // ::ffff:HHHH:HHHH format (hex-encoded IPv4)
  const match = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (match) {
    const hi = parseInt(match[1]!, 16);
    const lo = parseInt(match[2]!, 16);
    return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
  }

  return ip;
}

/**
 * Check if an IP (already normalized from IPv4-mapped IPv6) is private/reserved.
 */
function isPrivateIP(ip: string): boolean {
  // Try IPv4 first, then IPv6
  if (ip.includes('.')) {
    return isPrivateIPv4(ip);
  }
  return isPrivateIPv6(ip);
}

/**
 * RFC 5735/6890 private/reserved IPv4 ranges.
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;

  const a = Number(parts[0]);
  const b = Number(parts[1]);
  const c = Number(parts[2]);

  // 0.0.0.0/8 - This network
  if (a === 0) return true;
  // 10.0.0.0/8 - Private
  if (a === 10) return true;
  // 100.64.0.0/10 - Shared address space (CGNAT)
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 127.0.0.0/8 - Loopback
  if (a === 127) return true;
  // 169.254.0.0/16 - Link-local
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12 - Private
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.0.0.0/24 - IETF Protocol Assignments
  if (a === 192 && b === 0 && c === 0) return true;
  // 192.0.2.0/24 - Documentation (TEST-NET-1)
  if (a === 192 && b === 0 && c === 2) return true;
  // 192.168.0.0/16 - Private
  if (a === 192 && b === 168) return true;
  // 198.18.0.0/15 - Benchmarking
  if (a === 198 && (b === 18 || b === 19)) return true;
  // 198.51.100.0/24 - Documentation (TEST-NET-2)
  if (a === 198 && b === 51 && c === 100) return true;
  // 203.0.113.0/24 - Documentation (TEST-NET-3)
  if (a === 203 && b === 0 && c === 113) return true;
  // 224.0.0.0/4 - Multicast
  if (a >= 224 && a <= 239) return true;
  // 240.0.0.0/4 - Reserved + 255.255.255.255 broadcast
  if (a >= 240) return true;

  return false;
}

/**
 * Private/reserved IPv6 ranges.
 */
function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();

  // ::1 - Loopback
  if (lower === '::1') return true;
  // :: - Unspecified
  if (lower === '::') return true;
  // fe80::/10 - Link-local
  if (lower.startsWith('fe80:') || lower === 'fe80') return true;
  // fc00::/7 - Unique local (fc00::/8 + fd00::/8)
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  // ff00::/8 - Multicast
  if (lower.startsWith('ff')) return true;

  return false;
}
