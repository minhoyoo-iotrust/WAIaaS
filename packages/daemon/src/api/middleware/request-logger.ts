/**
 * Request logger middleware: logs method, path, status, and duration.
 *
 * Format: [REQ] GET /health 200 12ms
 *
 * Respects daemon log_level via ILogger instance.
 */

import { createMiddleware } from 'hono/factory';
import type { ILogger } from '@waiaas/core';

export function createRequestLogger(logger?: ILogger) {
  return createMiddleware(async (c, next) => {
    const start = Date.now();

    await next();

    const duration = Date.now() - start;
    const method = c.req.method;
    const path = c.req.path;
    const status = c.res.status;

    const msg = `[REQ] ${method} ${path} ${status} ${duration}ms`;
    if (logger) {
      logger.info(msg);
    } else {
      console.log(msg);
    }
  });
}

/** Default request logger (backward compat) */
export const requestLogger = createRequestLogger();
