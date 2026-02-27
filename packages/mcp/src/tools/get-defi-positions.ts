/**
 * get_defi_positions tool: Get DeFi lending positions with USD amounts.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type WalletContext, withWalletPrefix } from '../server.js';

export function registerGetDefiPositions(server: McpServer, apiClient: ApiClient, walletContext?: WalletContext): void {
  server.tool(
    'waiaas_get_defi_positions',
    withWalletPrefix('Get DeFi lending positions with health factor and USD amounts.', walletContext?.walletName),
    {
      wallet_id: z.string().optional().describe('Target wallet ID. Required for multi-wallet sessions; auto-resolved when session has a single wallet.'),
    },
    async (args) => {
      const params = new URLSearchParams();
      if (args.wallet_id) params.set('wallet_id', args.wallet_id);
      const qs = params.toString();
      const result = await apiClient.get('/v1/wallet/positions' + (qs ? '?' + qs : ''));
      return toToolResult(result);
    },
  );
}
