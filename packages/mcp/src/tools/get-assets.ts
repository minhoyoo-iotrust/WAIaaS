/**
 * get_assets tool: Get all assets (native + tokens) held by the wallet.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type WalletContext, withWalletPrefix } from '../server.js';

export function registerGetAssets(server: McpServer, apiClient: ApiClient, walletContext?: WalletContext): void {
  server.tool(
    'get_assets',
    withWalletPrefix('Get all assets (native + tokens) held by the wallet.', walletContext?.walletName),
    {
      network: z.string().optional().describe('Query assets for specific network (e.g., "polygon-mainnet" or CAIP-2 "eip155:137"). Use "all" for all networks. Required for EVM wallets; auto-resolved for Solana.'),
      display_currency: z.string().optional().describe('Display currency for asset value conversion (e.g. KRW, EUR). Defaults to server setting.'),
      wallet_id: z.string().optional().describe('Target wallet ID. Required for multi-wallet sessions; auto-resolved when session has a single wallet.'),
    },
    async (args) => {
      const params = new URLSearchParams();
      if (args.network) params.set('network', args.network);
      if (args.display_currency) params.set('display_currency', args.display_currency);
      if (args.wallet_id) params.set('walletId', args.wallet_id);
      const qs = params.toString();
      const result = await apiClient.get('/v1/wallet/assets' + (qs ? '?' + qs : ''));
      return toToolResult(result);
    },
  );
}
