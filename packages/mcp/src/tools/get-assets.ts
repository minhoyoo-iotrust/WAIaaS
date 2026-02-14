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
      network: z.string().optional().describe('Query assets for specific network. Defaults to wallet default network.'),
    },
    async (args) => {
      const qs = args.network ? '?network=' + encodeURIComponent(args.network) : '';
      const result = await apiClient.get('/v1/wallet/assets' + qs);
      return toToolResult(result);
    },
  );
}
