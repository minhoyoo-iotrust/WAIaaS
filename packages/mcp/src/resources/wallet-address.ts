/**
 * waiaas://wallet/address resource: Public address of the agent wallet.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toResourceResult } from '../api-client.js';

const RESOURCE_URI = 'waiaas://wallet/address';

export function registerWalletAddress(server: McpServer, apiClient: ApiClient): void {
  server.resource(
    'Wallet Address',
    RESOURCE_URI,
    {
      description: 'Public address of the agent wallet',
      mimeType: 'application/json',
    },
    async () => {
      const result = await apiClient.get('/v1/wallet/address');
      return toResourceResult(RESOURCE_URI, result);
    },
  );
}
