/**
 * GET /health route: returns daemon status.
 *
 * Returns 200 with JSON: { status, version, uptime, timestamp }.
 * No authentication required.
 */

import { Hono } from 'hono';

const health = new Hono();

health.get('/', (c) => {
  return c.json({
    status: 'ok',
    version: '0.0.0',
    uptime: Math.floor(process.uptime()),
    timestamp: Math.floor(Date.now() / 1000),
  });
});

export { health };
