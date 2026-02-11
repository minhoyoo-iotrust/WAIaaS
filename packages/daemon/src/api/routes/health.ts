/**
 * GET /health route: returns daemon status.
 *
 * Returns 200 with JSON: { status, version, uptime, timestamp }.
 * No authentication required.
 */

import { createRequire } from 'node:module';
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { HealthResponseSchema } from './openapi-schemas.js';

const require = createRequire(import.meta.url);
const { version: DAEMON_VERSION } = require('../../../package.json') as { version: string };

const healthRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Health'],
  summary: 'Health check',
  responses: {
    200: {
      description: 'Daemon health status',
      content: { 'application/json': { schema: HealthResponseSchema } },
    },
  },
});

const health = new OpenAPIHono();

health.openapi(healthRoute, (c) => {
  return c.json(
    {
      status: 'ok',
      version: DAEMON_VERSION,
      uptime: Math.floor(process.uptime()),
      timestamp: Math.floor(Date.now() / 1000),
    },
    200,
  );
});

export { health };
