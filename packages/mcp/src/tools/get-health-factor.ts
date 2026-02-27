/**
 * get_health_factor tool: Get lending health factor with severity classification.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type WalletContext, withWalletPrefix } from '../server.js';

export function registerGetHealthFactor(server: McpServer, apiClient: ApiClient, walletContext?: WalletContext): void {
  server.tool(
    'waiaas_get_health_factor',
    withWalletPrefix('Get lending health factor (safe/warning/danger/critical).', walletContext?.walletName),
    {
      wallet_id: z.string().optional().describe('Target wallet ID. Required for multi-wallet sessions; auto-resolved when session has a single wallet.'),
      network: z.string().optional().describe('Target network for health factor query.'),
    },
    async (args) => {
      const params = new URLSearchParams();
      if (args.wallet_id) params.set('wallet_id', args.wallet_id);
      if (args.network) params.set('network', args.network);
      const qs = params.toString();
      const result = await apiClient.get('/v1/wallet/health-factor' + (qs ? '?' + qs : ''));
      return toToolResult(result);
    },
  );
}
