/**
 * E2E Scenario registration: Admin UI + Settings, MCP stdio, SDK connectivity.
 *
 * Registers 3 offchain scenarios in the global ScenarioRegistry:
 * - admin-ui-settings: Admin UI HTTP 200 + Settings CRUD
 * - mcp-stdio-tools: MCP server stdio connection + tool listing + basic call
 * - sdk-connectivity: SDK session + getWalletInfo + getConnectInfo
 *
 * @see IFACE-01, IFACE-02, IFACE-03
 */

import { registry } from '../types.js';

registry.register({
  id: 'admin-ui-settings',
  name: 'Admin UI + Settings',
  track: 'offchain',
  category: 'interface',
  description: 'Admin UI HTTP 200 access + Settings GET/PUT CRUD',
});

registry.register({
  id: 'mcp-stdio-tools',
  name: 'MCP stdio Tools',
  track: 'offchain',
  category: 'interface',
  description: 'MCP server stdio connection -> tools/list -> basic tool call',
});

registry.register({
  id: 'sdk-connectivity',
  name: 'SDK Connectivity',
  track: 'offchain',
  category: 'interface',
  description: 'SDK createSession -> getWalletInfo -> getConnectInfo',
});
