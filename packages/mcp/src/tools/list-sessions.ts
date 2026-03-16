/**
 * list_sessions tool: List active sessions with pagination.
 * Requires master auth (admin-only operation).
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';

export function registerListSessions(server: McpServer, apiClient: ApiClient): void {
  server.tool(
    'list_sessions',
    'List active sessions with pagination. Admin operation requiring master auth.',
    {
      wallet_id: z.string().optional().describe('Filter by wallet ID'),
      limit: z.number().int().min(1).max(200).optional().describe('Max items to return (default: 50)'),
      offset: z.number().int().min(0).optional().describe('Number of items to skip (default: 0)'),
    },
    async (args) => {
      const params = new URLSearchParams();
      if (args.wallet_id) params.set('walletId', args.wallet_id);
      if (args.limit !== undefined) params.set('limit', String(args.limit));
      if (args.offset !== undefined) params.set('offset', String(args.offset));
      const qs = params.toString();
      const result = await apiClient.get('/v1/sessions' + (qs ? '?' + qs : ''));
      return toToolResult(result);
    },
  );
}
