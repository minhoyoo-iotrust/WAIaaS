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
        assetId: z.string().optional().describe(
          'CAIP-19 asset identifier (e.g., "eip155:1/erc20:0xa0b8..." or "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5..."). When provided, the daemon cross-validates address against assetId. EVM addresses must be lowercase in CAIP-19.',
        ),
      }).describe('Token info. Includes optional CAIP-19 assetId for standard asset identification.'),
      amount: z.string().describe('Approval amount in smallest unit'),
      network: z.string().optional().describe('Target network (e.g., polygon-mainnet). Defaults to wallet default network.'),
      wallet_id: z.string().optional().describe('Target wallet ID. Omit to use the default wallet.'),
    },
    async (args) => {
      const body: Record<string, unknown> = {
        type: 'APPROVE',
        spender: args.spender,
        token: args.token,
        amount: args.amount,
      };
      if (args.network !== undefined) body.network = args.network;
      if (args.wallet_id) body.walletId = args.wallet_id;
      const result = await apiClient.post('/v1/transactions/send', body);
      return toToolResult(result);
    },
  );
}
