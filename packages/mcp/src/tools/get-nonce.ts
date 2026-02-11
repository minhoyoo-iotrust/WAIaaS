/**
 * get_nonce tool: Get a nonce for owner wallet signature verification.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type AgentContext, withAgentPrefix } from '../server.js';

export function registerGetNonce(server: McpServer, apiClient: ApiClient, agentContext?: AgentContext): void {
  server.tool(
    'get_nonce',
    withAgentPrefix('Get a nonce for owner wallet signature verification.', agentContext?.agentName),
    async () => {
      const result = await apiClient.get('/v1/nonce');
      return toToolResult(result);
    },
  );
}
