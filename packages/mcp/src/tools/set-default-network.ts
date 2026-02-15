/**
 * set_default_network tool: Change the default network for this wallet.
 *
 * Calls PUT /v1/wallet/default-network (session-scoped endpoint).
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type WalletContext, withWalletPrefix } from '../server.js';

export function registerSetDefaultNetwork(server: McpServer, apiClient: ApiClient, walletContext?: WalletContext): void {
  server.tool(
    'set_default_network',
    withWalletPrefix('Change the default network for this wallet.', walletContext?.walletName),
    {
      network: z.string().describe('New default network (e.g., polygon-amoy, ethereum-sepolia).'),
    },
    async (args) => {
      const result = await apiClient.put<Record<string, unknown>>(
        '/v1/wallet/default-network',
        { network: args.network },
      );
      return toToolResult(result);
    },
  );
}
