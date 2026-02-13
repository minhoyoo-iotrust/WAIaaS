/**
 * get_balance tool: Get the current balance of the wallet.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type WalletContext, withWalletPrefix } from '../server.js';

export function registerGetBalance(server: McpServer, apiClient: ApiClient, walletContext?: WalletContext): void {
  server.tool(
    'get_balance',
    withWalletPrefix('Get the current balance of the wallet.', walletContext?.walletName),
    async () => {
      const result = await apiClient.get('/v1/wallet/balance');
      return toToolResult(result);
    },
  );
}
