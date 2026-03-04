/**
 * erc8004_get_agent_info tool: Get ERC-8004 agent identity info.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type WalletContext, withWalletPrefix } from '../server.js';

export function registerErc8004GetAgentInfo(server: McpServer, apiClient: ApiClient, walletContext?: WalletContext): void {
  server.tool(
    'erc8004_get_agent_info',
    withWalletPrefix('Get ERC-8004 agent identity info (on-chain ID, wallet, URI, metadata).', walletContext?.walletName),
    {
      agent_id: z.string().describe('On-chain agent ID (uint256)'),
    },
    async (args) => {
      const result = await apiClient.get(`/v1/erc8004/agent/${args.agent_id}`);
      return toToolResult(result);
    },
  );
}
