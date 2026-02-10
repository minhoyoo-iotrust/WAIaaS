/**
 * Request ID middleware: attaches a UUID v7 to every request.
 *
 * - Generates a new UUID v7 via generateId() for each request
 * - If client sends X-Request-Id header, uses that instead
 * - Sets X-Request-Id response header
 * - Stores requestId in c.set('requestId', id) for downstream use
 */

import { createMiddleware } from 'hono/factory';
import { generateId } from '../../infrastructure/database/id.js';

export const requestId = createMiddleware(async (c, next) => {
  const clientId = c.req.header('X-Request-Id');
  const id = clientId || generateId();

  c.set('requestId', id);
  c.header('X-Request-Id', id);

  await next();
});
