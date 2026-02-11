/**
 * get_balance tool: Get the current balance of the agent wallet.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';

export function registerGetBalance(server: McpServer, apiClient: ApiClient): void {
  server.tool(
    'get_balance',
    'Get the current balance of the agent wallet.',
    async () => {
      const result = await apiClient.get('/v1/wallet/balance');
      return toToolResult(result);
    },
  );
}
