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
      wallet_id: z.string().optional().describe('Target wallet ID. Omit to use the default wallet.'),
    },
    async (args) => {
      const params = new URLSearchParams();
      if (args.wallet_id) params.set('walletId', args.wallet_id);
      const qs = params.toString();
      const result = await apiClient.get('/v1/policies' + (qs ? '?' + qs : ''));
      return toToolResult(result);
    },
  );
}
