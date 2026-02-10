/**
 * list_transactions tool: List transaction history with cursor-based pagination.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';

export function registerListTransactions(server: McpServer, apiClient: ApiClient): void {
  server.tool(
    'list_transactions',
    'List transaction history with cursor-based pagination.',
    {
      limit: z.number().optional().describe('Maximum number of transactions to return'),
      cursor: z.string().optional().describe('Pagination cursor from previous response'),
    },
    async (args) => {
      const params = new URLSearchParams();
      if (args.limit !== undefined) params.set('limit', String(args.limit));
      if (args.cursor !== undefined) params.set('cursor', args.cursor);
      const qs = params.toString();
      const result = await apiClient.get(`/v1/transactions${qs ? `?${qs}` : ''}`);
      return toToolResult(result);
    },
  );
}
