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
        address: z.string().optional().describe('Token mint (SPL) or contract address (ERC-20). Optional when assetId is provided.'),
        decimals: z.number().optional().describe('Token decimals (e.g., 6 for USDC). Optional when assetId is provided.'),
        symbol: z.string().optional().describe('Token symbol (e.g., USDC). Optional when assetId is provided.'),
        assetId: z.string().optional().describe(
          'CAIP-19 asset identifier. When provided alone (without address/decimals/symbol), the daemon auto-resolves from the token registry.',
        ),
      }).describe('Token info. Provide full metadata (address/decimals/symbol) OR assetId alone for auto-resolve.'),
      amount: z.string().describe('Approval amount in smallest units (wei for EVM, lamports for Solana). Example: "1000000" = 1 USDC (6 decimals). Use max uint256 for unlimited: "115792089237316195423570985008687907853269984665640564039457584007913129639935"'),
      network: z.string().optional().describe('Target network (e.g., "polygon-mainnet" or CAIP-2 "eip155:137"). Required for EVM wallets; auto-resolved for Solana.'),
      wallet_id: z.string().optional().describe('Target wallet ID. Required for multi-wallet sessions; auto-resolved when session has a single wallet.'),
      gas_condition: z.object({
        max_gas_price: z.string().optional().describe('Max gas price in wei (EVM baseFee+priorityFee)'),
        max_priority_fee: z.string().optional().describe('Max priority fee in wei (EVM) or micro-lamports (Solana)'),
        timeout: z.number().optional().describe('Max wait time in seconds (60-86400)'),
      }).optional().describe('Gas price condition for deferred execution. At least one of max_gas_price or max_priority_fee required.'),
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
      if (args.gas_condition) {
        body.gasCondition = {
          maxGasPrice: args.gas_condition.max_gas_price,
          maxPriorityFee: args.gas_condition.max_priority_fee,
          timeout: args.gas_condition.timeout,
        };
      }
      const result = await apiClient.post('/v1/transactions/send', body);
      return toToolResult(result);
    },
  );
}
