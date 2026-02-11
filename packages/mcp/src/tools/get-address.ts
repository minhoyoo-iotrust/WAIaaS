/**
 * get_address tool: Get the public address of the agent wallet.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type AgentContext, withAgentPrefix } from '../server.js';

export function registerGetAddress(server: McpServer, apiClient: ApiClient, agentContext?: AgentContext): void {
  server.tool(
    'get_address',
    withAgentPrefix('Get the public address of the agent wallet.', agentContext?.agentName),
    async () => {
      const result = await apiClient.get('/v1/wallet/address');
      return toToolResult(result);
    },
  );
}
