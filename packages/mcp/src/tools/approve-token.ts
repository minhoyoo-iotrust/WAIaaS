/**
 * approve_token tool: Approve a spender to transfer tokens on your behalf.
 *
 * Supports APPROVE type for ERC-20 approve and SPL delegate.
 * Requires APPROVED_SPENDERS policy to be configured on the daemon.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type WalletContext, withWalletPrefix } from '../server.js';

export function registerApproveToken(server: McpServer, apiClient: ApiClient, walletContext?: WalletContext): void {
  server.tool(
    'approve_token',
    withWalletPrefix('Approve a spender to transfer tokens on your behalf. Requires APPROVED_SPENDERS policy.', walletContext?.walletName),
    {
      spender: z.string().describe('Spender address'),
      token: z.object({
        address: z.string().describe('Token mint (SPL) or contract address (ERC-20)'),
        decimals: z.number().describe('Token decimals (e.g., 6 for USDC)'),
        symbol: z.string().describe('Token symbol (e.g., USDC)'),
      }).describe('Token info'),
      amount: z.string().describe('Approval amount in smallest unit'),
    },
    async (args) => {
      const body: Record<string, unknown> = {
        type: 'APPROVE',
        spender: args.spender,
        token: args.token,
        amount: args.amount,
      };
      const result = await apiClient.post('/v1/transactions/send', body);
      return toToolResult(result);
    },
  );
}
