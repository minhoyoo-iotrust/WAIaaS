/**
 * get_wallet_info tool: Get wallet info including address, chain, and available networks.
 *
 * Combines two API calls:
 * 1. GET /v1/wallet/address - wallet identity
 * 2. GET /v1/wallets/:walletId/networks - available networks
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type WalletContext, withWalletPrefix } from '../server.js';

export function registerGetWalletInfo(server: McpServer, apiClient: ApiClient, walletContext?: WalletContext): void {
  server.tool(
    'get_wallet_info',
    withWalletPrefix('Get wallet info including chain, address, environment, and available networks.', walletContext?.walletName),
    {
      wallet_id: z.string().optional().describe('Target wallet ID. Omit to use the default wallet.'),
    },
    async (args) => {
      const params = new URLSearchParams();
      if (args.wallet_id) params.set('walletId', args.wallet_id);
      const qs = params.toString();
      const addressResult = await apiClient.get<Record<string, unknown>>('/v1/wallet/address' + (qs ? '?' + qs : ''));
      if (!addressResult.ok) {
        return toToolResult(addressResult);
      }

      const walletId = addressResult.data['walletId'] as string;
      const networksResult = await apiClient.get<{ networks: unknown[] }>(
        '/v1/wallets/' + walletId + '/networks',
      );

      const combined = {
        ...addressResult.data,
        networks: networksResult.ok ? networksResult.data.networks : [],
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(combined) }],
      };
    },
  );
}
