/**
 * CSP middleware: Content-Security-Policy header for Admin UI paths.
 *
 * Applied to /admin/* routes only. Uses strict CSP:
 * - default-src 'none'
 * - script-src 'self'
 * - style-src 'self' 'unsafe-inline'
 * - connect-src 'self'
 * - img-src 'self' data:
 * - font-src 'self'
 * - base-uri 'self'
 * - form-action 'self'
 *
 * @see docs/67-admin-web-ui-spec.md section 3
 */

import { createMiddleware } from 'hono/factory';

const CSP_VALUE = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

export const cspMiddleware = createMiddleware(async (c, next) => {
  await next();
  c.res.headers.set('Content-Security-Policy', CSP_VALUE);
});
