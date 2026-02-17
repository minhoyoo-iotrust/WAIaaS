/**
 * GET /health route: returns daemon status with version check and schema info.
 *
 * Returns 200 with JSON: { status, version, latestVersion, updateAvailable, schemaVersion, uptime, timestamp }.
 * No authentication required.
 */

import { createRequire } from 'node:module';
import semver from 'semver';
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { HealthResponseSchema } from './openapi-schemas.js';
import { LATEST_SCHEMA_VERSION } from '../../infrastructure/database/index.js';
import type { VersionCheckService } from '../../infrastructure/version/index.js';

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

export function createHealthRoute(deps: { versionCheckService?: VersionCheckService | null } = {}) {
  const healthApp = new OpenAPIHono();

  healthApp.openapi(healthRoute, (c) => {
    const latestVersion = deps.versionCheckService?.getLatest() ?? null;
    const current = DAEMON_VERSION;
    const updateAvailable = latestVersion !== null && semver.gt(latestVersion, current);

    return c.json(
      {
        status: 'ok',
        version: current,
        latestVersion,
        updateAvailable,
        schemaVersion: LATEST_SCHEMA_VERSION,
        uptime: Math.floor(process.uptime()),
        timestamp: Math.floor(Date.now() / 1000),
      },
      200,
    );
  });

  return healthApp;
}

// Backward compatibility: default export for existing imports
const health = createHealthRoute();
export { health };
