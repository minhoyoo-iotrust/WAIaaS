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
      amount: z.string().describe('Amount in smallest units (wei for EVM, lamports for Solana). Example: "1000000000000000000" = 1 ETH, "1000000000" = 1 SOL'),
      memo: z.string().optional().describe('Optional transaction memo'),
      type: z.enum(['TRANSFER', 'TOKEN_TRANSFER']).optional()
        .describe('Transaction type. Default: TRANSFER (native). TOKEN_TRANSFER for SPL/ERC-20'),
      network: z.string().optional().describe('Target network (e.g., "polygon-mainnet" or CAIP-2 "eip155:137"). Required for EVM wallets; auto-resolved for Solana.'),
      token: z.object({
        address: z.string().optional().describe('Token mint (SPL) or contract address (ERC-20). Optional when assetId is provided.'),
        decimals: z.number().optional().describe('Token decimals (e.g., 6 for USDC). Optional when assetId is provided.'),
        symbol: z.string().optional().describe('Token symbol (e.g., USDC). Optional when assetId is provided.'),
        assetId: z.string().optional().describe(
          'CAIP-19 asset identifier. When provided alone (without address/decimals/symbol), the daemon auto-resolves from the token registry.',
        ),
      }).optional().describe('Required for TOKEN_TRANSFER. Provide full metadata (address/decimals/symbol) OR assetId alone for auto-resolve.'),
      wallet_id: z.string().optional().describe('Target wallet ID. Required for multi-wallet sessions; auto-resolved when session has a single wallet.'),
      gas_condition: z.object({
        max_gas_price: z.string().optional().describe('Max gas price in wei (EVM baseFee+priorityFee)'),
        max_priority_fee: z.string().optional().describe('Max priority fee in wei (EVM) or micro-lamports (Solana)'),
        timeout: z.number().optional().describe('Max wait time in seconds (60-86400)'),
      }).optional().describe('Gas price condition for deferred execution. At least one of max_gas_price or max_priority_fee required.'),
    },
    async (args) => {
      const body: Record<string, unknown> = { to: args.to, amount: args.amount };
      if (args.memo !== undefined) body.memo = args.memo;
      if (args.type) body.type = args.type;
      if (args.token) body.token = args.token;
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
