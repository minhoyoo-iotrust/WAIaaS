/**
 * send_token tool: Send SOL or tokens from the agent wallet.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type AgentContext, withAgentPrefix } from '../server.js';

export function registerSendToken(server: McpServer, apiClient: ApiClient, agentContext?: AgentContext): void {
  server.tool(
    'send_token',
    withAgentPrefix('Send SOL or tokens from the agent wallet to a destination address. Amount is in smallest unit (lamports for SOL). Returns transaction ID and status.', agentContext?.agentName),
    {
      to: z.string().describe('Destination wallet address'),
      amount: z.string().describe('Amount in smallest unit (e.g., lamports)'),
      memo: z.string().optional().describe('Optional transaction memo'),
    },
    async (args) => {
      const result = await apiClient.post('/v1/transactions/send', {
        to: args.to,
        amount: args.amount,
        ...(args.memo !== undefined && { memo: args.memo }),
      });
      return toToolResult(result);
    },
  );
}
