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

// Stub -- implementation in Task 2
export async function validateUrlSafety(_urlString: string): Promise<URL> {
  throw new Error('Not implemented');
}

export async function safeFetchWithRedirects(
  _url: URL,
  _method: string,
  _headers?: Record<string, string>,
  _body?: string,
  _timeout?: number,
): Promise<Response> {
  throw new Error('Not implemented');
}
