/**
 * connect_info tool: Get self-discovery info for multi-wallet environments.
 *
 * Wraps GET /v1/connect-info. Returns accessible wallets, policies,
 * capabilities, and an AI-ready prompt. Call this first to understand
 * your environment.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';

export function registerConnectInfo(server: McpServer, apiClient: ApiClient): void {
  server.tool(
    'connect_info',
    'Get self-discovery info: accessible wallets, policies, capabilities, and AI-ready prompt. Call this first to understand your environment.',
    {},
    async () => {
      const result = await apiClient.get('/v1/connect-info');
      return toToolResult(result);
    },
  );
}
