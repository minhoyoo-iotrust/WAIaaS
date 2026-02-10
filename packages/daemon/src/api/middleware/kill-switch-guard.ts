/**
 * Kill switch guard middleware: blocks requests when kill switch is activated.
 *
 * Accepts a factory function `getKillSwitchState` that returns the current
 * kill switch state. If 'ACTIVATED', rejects with 409 KILL_SWITCH_ACTIVE.
 *
 * The /health endpoint always bypasses the guard.
 *
 * v1.1: Factory default returns 'NORMAL' (no kill switch state management yet).
 *
 * @see docs/36-killswitch-evm-freeze.md
 */

import { createMiddleware } from 'hono/factory';
import { WAIaaSError } from '@waiaas/core';

export type GetKillSwitchState = () => string;

const DEFAULT_GET_STATE: GetKillSwitchState = () => 'NORMAL';

export function createKillSwitchGuard(getState: GetKillSwitchState = DEFAULT_GET_STATE) {
  return createMiddleware(async (c, next) => {
    // /health always bypasses kill switch
    if (c.req.path === '/health') {
      await next();
      return;
    }

    const state = getState();
    if (state === 'ACTIVATED') {
      throw new WAIaaSError('KILL_SWITCH_ACTIVE');
    }

    await next();
  });
}
