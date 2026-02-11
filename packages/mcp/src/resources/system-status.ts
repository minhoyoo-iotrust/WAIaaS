/**
 * waiaas://system/status resource: WAIaaS daemon system status.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toResourceResult } from '../api-client.js';
import { type AgentContext, withAgentPrefix } from '../server.js';

const RESOURCE_URI = 'waiaas://system/status';

export function registerSystemStatus(server: McpServer, apiClient: ApiClient, agentContext?: AgentContext): void {
  server.resource(
    'System Status',
    RESOURCE_URI,
    {
      description: withAgentPrefix('WAIaaS daemon system status', agentContext?.agentName),
      mimeType: 'application/json',
    },
    async () => {
      const result = await apiClient.get('/v1/admin/status');
      return toResourceResult(RESOURCE_URI, result);
    },
  );
}
