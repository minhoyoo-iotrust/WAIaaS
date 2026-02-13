/**
 * get_address tool: Get the public address of the wallet.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type WalletContext, withWalletPrefix } from '../server.js';

export function registerGetAddress(server: McpServer, apiClient: ApiClient, walletContext?: WalletContext): void {
  server.tool(
    'get_address',
    withWalletPrefix('Get the public address of the wallet.', walletContext?.walletName),
    async () => {
      const result = await apiClient.get('/v1/wallet/address');
      return toToolResult(result);
    },
  );
}
