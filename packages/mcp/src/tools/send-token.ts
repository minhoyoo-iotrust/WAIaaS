/**
 * send_token tool: Send SOL/ETH or tokens from the agent wallet.
 *
 * Supports TRANSFER (native) and TOKEN_TRANSFER (SPL/ERC-20) types.
 * CONTRACT_CALL, APPROVE, and BATCH are deliberately NOT exposed via MCP
 * for security (MCPSDK-04).
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type AgentContext, withAgentPrefix } from '../server.js';

export function registerSendToken(server: McpServer, apiClient: ApiClient, agentContext?: AgentContext): void {
  server.tool(
    'send_token',
    withAgentPrefix('Send SOL/ETH or tokens from the agent wallet. For token transfers, specify type and token info.', agentContext?.agentName),
    {
      to: z.string().describe('Destination wallet address'),
      amount: z.string().describe('Amount in smallest unit (lamports/wei)'),
      memo: z.string().optional().describe('Optional transaction memo'),
      type: z.enum(['TRANSFER', 'TOKEN_TRANSFER']).optional()
        .describe('Transaction type. Default: TRANSFER (native). TOKEN_TRANSFER for SPL/ERC-20'),
      token: z.object({
        address: z.string().describe('Token mint (SPL) or contract address (ERC-20)'),
        decimals: z.number().describe('Token decimals (e.g., 6 for USDC)'),
        symbol: z.string().describe('Token symbol (e.g., USDC)'),
      }).optional().describe('Required for TOKEN_TRANSFER'),
    },
    async (args) => {
      const body: Record<string, unknown> = { to: args.to, amount: args.amount };
      if (args.memo !== undefined) body.memo = args.memo;
      if (args.type) body.type = args.type;
      if (args.token) body.token = args.token;
      const result = await apiClient.post('/v1/transactions/send', body);
      return toToolResult(result);
    },
  );
}
