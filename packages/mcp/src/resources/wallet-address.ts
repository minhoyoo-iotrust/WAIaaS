/**
 * waiaas://wallet/address resource: Public address of the wallet.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toResourceResult } from '../api-client.js';
import { type WalletContext, withWalletPrefix } from '../server.js';

const RESOURCE_URI = 'waiaas://wallet/address';

export function registerWalletAddress(server: McpServer, apiClient: ApiClient, walletContext?: WalletContext): void {
  server.resource(
    'Wallet Address',
    RESOURCE_URI,
    {
      description: withWalletPrefix('Public address of the wallet', walletContext?.walletName),
      mimeType: 'application/json',
    },
    async () => {
      const result = await apiClient.get('/v1/wallet/address');
      return toResourceResult(RESOURCE_URI, result);
    },
  );
}
