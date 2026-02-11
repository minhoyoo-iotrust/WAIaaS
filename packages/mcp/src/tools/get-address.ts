/**
 * get_address tool: Get the public address of the agent wallet.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';

export function registerGetAddress(server: McpServer, apiClient: ApiClient): void {
  server.tool(
    'get_address',
    'Get the public address of the agent wallet.',
    async () => {
      const result = await apiClient.get('/v1/wallet/address');
      return toToolResult(result);
    },
  );
}
