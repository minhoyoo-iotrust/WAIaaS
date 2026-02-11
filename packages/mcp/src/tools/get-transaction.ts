/**
 * get_transaction tool: Get details of a specific transaction by ID.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type AgentContext, withAgentPrefix } from '../server.js';

export function registerGetTransaction(server: McpServer, apiClient: ApiClient, agentContext?: AgentContext): void {
  server.tool(
    'get_transaction',
    withAgentPrefix('Get details of a specific transaction by ID.', agentContext?.agentName),
    {
      transaction_id: z.string().describe('Transaction ID to retrieve'),
    },
    async (args) => {
      const result = await apiClient.get(`/v1/transactions/${args.transaction_id}`);
      return toToolResult(result);
    },
  );
}
