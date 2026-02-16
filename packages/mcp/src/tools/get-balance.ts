/**
 * get_balance tool: Get the current balance of the wallet.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type WalletContext, withWalletPrefix } from '../server.js';

export function registerGetBalance(server: McpServer, apiClient: ApiClient, walletContext?: WalletContext): void {
  server.tool(
    'get_balance',
    withWalletPrefix('Get the current balance of the wallet.', walletContext?.walletName),
    {
      network: z.string().optional().describe("Query balance for specific network. Use 'all' to get balances for all networks in the wallet's environment. Defaults to wallet default network."),
      display_currency: z.string().optional().describe('Display currency for balance conversion (e.g. KRW, EUR). Defaults to server setting.'),
    },
    async (args) => {
      const params = new URLSearchParams();
      if (args.network) params.set('network', args.network);
      if (args.display_currency) params.set('display_currency', args.display_currency);
      const qs = params.toString();
      const result = await apiClient.get('/v1/wallet/balance' + (qs ? '?' + qs : ''));
      return toToolResult(result);
    },
  );
}
