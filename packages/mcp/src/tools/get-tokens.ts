/**
 * get_tokens tool: Get registered tokens for a network.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type WalletContext, withWalletPrefix } from '../server.js';

export function registerGetTokens(server: McpServer, apiClient: ApiClient, walletContext?: WalletContext): void {
  server.tool(
    'get_tokens',
    withWalletPrefix('Get registered tokens (builtin + custom) for a specific network.', walletContext?.walletName),
    {
      network: z.string().describe('Network identifier (e.g., "ethereum-sepolia", "polygon-amoy").'),
    },
    async (args) => {
      const params = new URLSearchParams();
      params.set('network', args.network);
      const result = await apiClient.get('/v1/tokens?' + params.toString());
      return toToolResult(result);
    },
  );
}
