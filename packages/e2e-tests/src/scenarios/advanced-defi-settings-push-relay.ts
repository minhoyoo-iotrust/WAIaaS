/**
 * E2E Scenario registration: DeFi Admin Settings CRUD, Push Relay Device Lifecycle.
 *
 * Registers 2 offchain scenarios in the global ScenarioRegistry:
 * - defi-admin-settings: DeFi protocol Admin Settings CRUD (set/get/update)
 * - push-relay-device-lifecycle: Push Relay server device register/query/unregister
 *
 * @see ADV-07, ADV-08
 */

import { registry } from '../types.js';

registry.register({
  id: 'defi-admin-settings',
  name: 'DeFi Admin Settings CRUD',
  track: 'offchain',
  category: 'advanced',
  description: 'Set/read/update DeFi protocol settings (swap slippage, staking, bridge, lending) via Admin Settings API',
});

registry.register({
  id: 'push-relay-device-lifecycle',
  name: 'Push Relay Device Lifecycle',
  track: 'offchain',
  category: 'advanced',
  description: 'Push Relay server start -> device register -> subscription token -> health check -> unregister -> confirm 404',
});
