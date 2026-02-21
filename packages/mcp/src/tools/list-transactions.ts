/**
 * list_transactions tool: List transaction history with cursor-based pagination.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type WalletContext, withWalletPrefix } from '../server.js';

export function registerListTransactions(server: McpServer, apiClient: ApiClient, walletContext?: WalletContext): void {
  server.tool(
    'list_transactions',
    withWalletPrefix('List transaction history with cursor-based pagination.', walletContext?.walletName),
    {
      limit: z.number().optional().describe('Maximum number of transactions to return'),
      cursor: z.string().optional().describe('Pagination cursor from previous response'),
      display_currency: z.string().optional().describe('Display currency for amount conversion (e.g. KRW, EUR). Defaults to server setting.'),
      wallet_id: z.string().optional().describe('Target wallet ID. Omit to use the default wallet.'),
    },
    async (args) => {
      const params = new URLSearchParams();
      if (args.limit !== undefined) params.set('limit', String(args.limit));
      if (args.cursor !== undefined) params.set('cursor', args.cursor);
      if (args.display_currency !== undefined) params.set('display_currency', args.display_currency);
      if (args.wallet_id) params.set('walletId', args.wallet_id);
      const qs = params.toString();
      const result = await apiClient.get(`/v1/transactions${qs ? `?${qs}` : ''}`);
      return toToolResult(result);
    },
  );
}
