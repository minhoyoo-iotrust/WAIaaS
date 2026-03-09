/**
 * E2E Scenario registration: Notification Channel, Token Registry CRUD, Connect-Info.
 *
 * Registers 3 offchain scenarios in the global ScenarioRegistry:
 * - notification-channel: Notification status/test/log endpoint smoke
 * - token-registry-crud: Add/list/delete custom token
 * - connect-info-discovery: Session connect-info with wallets and capabilities
 *
 * @see IFACE-04, IFACE-05, IFACE-06
 */

import { registry } from '../types.js';

registry.register({
  id: 'notification-channel',
  name: 'Notification Channel',
  track: 'offchain',
  category: 'interface',
  description: 'Notification status query + test notification send + log check',
});

registry.register({
  id: 'token-registry-crud',
  name: 'Token Registry CRUD',
  track: 'offchain',
  category: 'interface',
  description: 'Add custom ERC-20 token -> list -> delete -> confirm removal',
});

registry.register({
  id: 'connect-info-discovery',
  name: 'Connect-Info Discovery',
  track: 'offchain',
  category: 'interface',
  description: 'Session connect-info returns wallets, capabilities, userop status',
});
