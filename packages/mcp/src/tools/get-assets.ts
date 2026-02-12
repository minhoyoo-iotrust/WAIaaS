/**
 * get_assets tool: Get all assets (native + tokens) held by the agent wallet.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type AgentContext, withAgentPrefix } from '../server.js';

export function registerGetAssets(server: McpServer, apiClient: ApiClient, agentContext?: AgentContext): void {
  server.tool(
    'get_assets',
    withAgentPrefix('Get all assets (native + tokens) held by the agent wallet.', agentContext?.agentName),
    async () => {
      const result = await apiClient.get('/v1/wallet/assets');
      return toToolResult(result);
    },
  );
}
