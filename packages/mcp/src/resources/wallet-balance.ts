/**
 * waiaas://wallet/balance resource: Current balance of the agent wallet.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toResourceResult } from '../api-client.js';

const RESOURCE_URI = 'waiaas://wallet/balance';

export function registerWalletBalance(server: McpServer, apiClient: ApiClient): void {
  server.resource(
    'Wallet Balance',
    RESOURCE_URI,
    {
      description: 'Current balance of the agent wallet',
      mimeType: 'application/json',
    },
    async () => {
      const result = await apiClient.get('/v1/wallet/balance');
      return toResourceResult(RESOURCE_URI, result);
    },
  );
}
