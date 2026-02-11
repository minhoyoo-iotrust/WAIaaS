/**
 * get_balance tool: Get the current balance of the agent wallet.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type AgentContext, withAgentPrefix } from '../server.js';

export function registerGetBalance(server: McpServer, apiClient: ApiClient, agentContext?: AgentContext): void {
  server.tool(
    'get_balance',
    withAgentPrefix('Get the current balance of the agent wallet.', agentContext?.agentName),
    async () => {
      const result = await apiClient.get('/v1/wallet/balance');
      return toToolResult(result);
    },
  );
}
