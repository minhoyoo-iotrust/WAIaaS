/**
 * get_policies tool: Get policies applied to the wallet.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type WalletContext, withWalletPrefix } from '../server.js';

export function registerGetPolicies(server: McpServer, apiClient: ApiClient, walletContext?: WalletContext): void {
  server.tool(
    'get_policies',
    withWalletPrefix('Get policies applied to the wallet. Shows spending limits, whitelists, rate limits, and other rules.', walletContext?.walletName),
    {
      wallet_id: z.string().optional().describe('Target wallet ID. Required for multi-wallet sessions; auto-resolved when session has a single wallet.'),
      limit: z.number().int().min(1).max(200).optional().describe('Max items to return (default: 50)'),
      offset: z.number().int().min(0).optional().describe('Number of items to skip (default: 0)'),
    },
    async (args) => {
      const params = new URLSearchParams();
      if (args.wallet_id) params.set('walletId', args.wallet_id);
      if (args.limit !== undefined) params.set('limit', String(args.limit));
      if (args.offset !== undefined) params.set('offset', String(args.offset));
      const qs = params.toString();
      const result = await apiClient.get('/v1/policies' + (qs ? '?' + qs : ''));
      return toToolResult(result);
    },
  );
}
