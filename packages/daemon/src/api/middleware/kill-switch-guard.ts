/**
 * Kill switch guard middleware: blocks requests when kill switch is
 * SUSPENDED or LOCKED (3-state model).
 *
 * Accepts a factory function `getKillSwitchState` that returns the current
 * kill switch state string. If SUSPENDED or LOCKED, rejects with 503
 * SYSTEM_LOCKED.
 *
 * Bypass paths:
 *   - /health (always public)
 *   - /v1/admin/* (admin API for management/recovery)
 *   - /admin/* (Admin SPA for UI)
 *   - /v1/owner/* (owner kill-switch activation + recovery)
 *
 * @see docs/36-killswitch-evm-freeze.md
 */

import { createMiddleware } from 'hono/factory';
import { WAIaaSError } from '@waiaas/core';

export type GetKillSwitchState = () => string;

const DEFAULT_GET_STATE: GetKillSwitchState = () => 'ACTIVE';

export function createKillSwitchGuard(getState: GetKillSwitchState = DEFAULT_GET_STATE) {
  return createMiddleware(async (c, next) => {
    // /health always bypasses kill switch
    if (c.req.path === '/health') {
      await next();
      return;
    }

    // Admin API paths bypass kill switch (need to manage kill switch state)
    if (c.req.path.startsWith('/v1/admin/')) {
      await next();
      return;
    }

    // Admin SPA paths bypass kill switch (need to serve UI for recovery)
    if (c.req.path === '/admin' || c.req.path.startsWith('/admin/')) {
      await next();
      return;
    }

    // Owner API paths bypass kill switch (owner kill-switch activation + recovery)
    if (c.req.path.startsWith('/v1/owner/')) {
      await next();
      return;
    }

    const state = getState();
    if (state === 'SUSPENDED' || state === 'LOCKED') {
      throw new WAIaaSError('SYSTEM_LOCKED');
    }

    await next();
  });
}
