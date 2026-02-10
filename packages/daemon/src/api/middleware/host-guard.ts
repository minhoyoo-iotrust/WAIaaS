/**
 * Host guard middleware: restricts requests to localhost only.
 *
 * Checks the Host header and only allows requests where the hostname
 * starts with 127.0.0.1, localhost, or [::1].
 * Non-localhost requests are rejected with 403 SYSTEM_LOCKED.
 *
 * @see docs/29-api-framework-design.md
 */

import { createMiddleware } from 'hono/factory';
import { WAIaaSError } from '@waiaas/core';

const LOCALHOST_PATTERNS = ['127.0.0.1', 'localhost', '[::1]'];

export const hostGuard = createMiddleware(async (c, next) => {
  const host = c.req.header('Host') ?? '';
  // Extract hostname (strip port if present)
  const hostname = host.replace(/:\d+$/, '');

  const isLocalhost = LOCALHOST_PATTERNS.some(
    (pattern) => hostname === pattern || hostname.startsWith(pattern),
  );

  if (!isLocalhost) {
    throw new WAIaaSError('SYSTEM_LOCKED', {
      message: 'Only localhost access allowed',
    });
  }

  await next();
});
