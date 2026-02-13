/**
 * send_token tool: Send SOL/ETH or tokens from the wallet.
 *
 * Supports TRANSFER (native) and TOKEN_TRANSFER (SPL/ERC-20) types.
 * For contract calls, approvals, and batch transactions, use the
 * dedicated call_contract, approve_token, and send_batch tools.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type WalletContext, withWalletPrefix } from '../server.js';

export function registerSendToken(server: McpServer, apiClient: ApiClient, walletContext?: WalletContext): void {
  server.tool(
    'send_token',
    withWalletPrefix('Send SOL/ETH or tokens from the wallet. For token transfers, specify type and token info.', walletContext?.walletName),
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
