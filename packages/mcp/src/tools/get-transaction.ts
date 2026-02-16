/**
 * get_transaction tool: Get details of a specific transaction by ID.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type WalletContext, withWalletPrefix } from '../server.js';

export function registerGetTransaction(server: McpServer, apiClient: ApiClient, walletContext?: WalletContext): void {
  server.tool(
    'get_transaction',
    withWalletPrefix('Get details of a specific transaction by ID.', walletContext?.walletName),
    {
      transaction_id: z.string().describe('Transaction ID to retrieve'),
      display_currency: z.string().optional().describe('Display currency for amount conversion (e.g. KRW, EUR). Defaults to server setting.'),
    },
    async (args) => {
      const qs = args.display_currency ? '?display_currency=' + encodeURIComponent(args.display_currency) : '';
      const result = await apiClient.get(`/v1/transactions/${args.transaction_id}${qs}`);
      return toToolResult(result);
    },
  );
}
