/**
 * get_nonce tool: Get a nonce for owner wallet signature verification.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type WalletContext, withWalletPrefix } from '../server.js';

export function registerGetNonce(server: McpServer, apiClient: ApiClient, walletContext?: WalletContext): void {
  server.tool(
    'get_nonce',
    withWalletPrefix('Get a nonce for owner wallet signature verification.', walletContext?.walletName),
    {
      wallet_id: z.string().optional().describe('Target wallet ID. Omit to use the default wallet.'),
    },
    async (args) => {
      const params = new URLSearchParams();
      if (args.wallet_id) params.set('walletId', args.wallet_id);
      const qs = params.toString();
      const result = await apiClient.get('/v1/nonce' + (qs ? '?' + qs : ''));
      return toToolResult(result);
    },
  );
}
