/**
 * E2E Scenario registration: Wallet Suspend/Resume/Purge lifecycle.
 *
 * Registers 4 offchain scenarios in the global ScenarioRegistry:
 * - wallet-suspend-blocks-session: Suspend wallet -> session API calls blocked
 * - wallet-resume-restores-session: Resume wallet -> session API calls work again
 * - wallet-purge-removes-wallet: Purge wallet -> GET returns 404
 * - wallet-purge-cascades-data: Purge -> related data (sessions, policies, transactions) deleted
 *
 * @see CORE-04, CORE-05, CORE-06, CORE-07
 */

import { registry } from '../types.js';

registry.register({
  id: 'wallet-suspend-blocks-session',
  name: 'Wallet Suspend Blocks Session',
  track: 'offchain',
  category: 'core',
  description: 'Suspend wallet -> verify status is SUSPENDED via admin GET',
});

registry.register({
  id: 'wallet-resume-restores-session',
  name: 'Wallet Resume Restores Session',
  track: 'offchain',
  category: 'core',
  description: 'Resume suspended wallet -> verify status returns to ACTIVE',
});

registry.register({
  id: 'wallet-purge-removes-wallet',
  name: 'Wallet Purge Removes Wallet',
  track: 'offchain',
  category: 'core',
  description: 'Terminate + purge wallet -> GET /v1/wallets/{id} returns 404',
});

registry.register({
  id: 'wallet-purge-cascades-data',
  name: 'Wallet Purge Cascades Data',
  track: 'offchain',
  category: 'core',
  description: 'Purge wallet -> related sessions/policies/transactions deleted from DB',
});
