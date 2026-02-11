/**
 * get_nonce tool: Get a nonce for owner wallet signature verification.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';

export function registerGetNonce(server: McpServer, apiClient: ApiClient): void {
  server.tool(
    'get_nonce',
    'Get a nonce for owner wallet signature verification.',
    async () => {
      const result = await apiClient.get('/v1/nonce');
      return toToolResult(result);
    },
  );
}
