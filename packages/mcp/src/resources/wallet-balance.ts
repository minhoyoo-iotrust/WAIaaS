/**
 * waiaas://wallet/balance resource: Current balance of the wallet.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toResourceResult } from '../api-client.js';
import { type WalletContext, withWalletPrefix } from '../server.js';

const RESOURCE_URI = 'waiaas://wallet/balance';

export function registerWalletBalance(server: McpServer, apiClient: ApiClient, walletContext?: WalletContext): void {
  server.resource(
    'Wallet Balance',
    RESOURCE_URI,
    {
      description: withWalletPrefix('Current balance of the wallet', walletContext?.walletName),
      mimeType: 'application/json',
    },
    async () => {
      const result = await apiClient.get('/v1/wallet/balance');
      return toResourceResult(RESOURCE_URI, result);
    },
  );
}
