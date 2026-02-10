/**
 * Request logger middleware: logs method, path, status, and duration.
 *
 * Format: [REQ] GET /health 200 12ms
 *
 * Uses console.log for now; structured logger deferred to later milestone.
 */

import { createMiddleware } from 'hono/factory';

export const requestLogger = createMiddleware(async (c, next) => {
  const start = Date.now();

  await next();

  const duration = Date.now() - start;
  const method = c.req.method;
  const path = c.req.path;
  const status = c.res.status;

  console.log(`[REQ] ${method} ${path} ${status} ${duration}ms`);
});
