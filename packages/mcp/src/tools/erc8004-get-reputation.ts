/**
 * erc8004_get_reputation tool: Get ERC-8004 agent reputation summary.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type WalletContext, withWalletPrefix } from '../server.js';

export function registerErc8004GetReputation(server: McpServer, apiClient: ApiClient, walletContext?: WalletContext): void {
  server.tool(
    'erc8004_get_reputation',
    withWalletPrefix('Get ERC-8004 agent reputation summary (score, count, decimals).', walletContext?.walletName),
    {
      agent_id: z.string().describe('On-chain agent ID (uint256)'),
      tag1: z.string().optional().describe('Optional tag1 filter'),
      tag2: z.string().optional().describe('Optional tag2 filter'),
    },
    async (args) => {
      const params = new URLSearchParams();
      if (args.tag1) params.set('tag1', args.tag1);
      if (args.tag2) params.set('tag2', args.tag2);
      const qs = params.toString();
      const result = await apiClient.get(`/v1/erc8004/agent/${args.agent_id}/reputation${qs ? `?${qs}` : ''}`);
      return toToolResult(result);
    },
  );
}
