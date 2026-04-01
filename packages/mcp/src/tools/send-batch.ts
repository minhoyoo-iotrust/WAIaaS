/**
 * send_batch tool: Send multiple instructions in a single atomic transaction.
 *
 * Supports BATCH type (Solana only). Each instruction is a TRANSFER,
 * TOKEN_TRANSFER, CONTRACT_CALL, or APPROVE without the type field.
 * Minimum 2, maximum 20 instructions.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type WalletContext, withWalletPrefix } from '../server.js';

export function registerSendBatch(server: McpServer, apiClient: ApiClient, walletContext?: WalletContext): void {
  server.tool(
    'send_batch',
    withWalletPrefix('Send multiple instructions in a single atomic transaction (Solana only, 2-20 instructions).', walletContext?.walletName),
    {
      instructions: z.array(z.record(z.string(), z.unknown())).min(2).max(20)
        .describe('Array of instruction objects (each is a TRANSFER/TOKEN_TRANSFER/CONTRACT_CALL/APPROVE without the type field). All amount values must be in smallest units (wei/lamports). TOKEN_TRANSFER/APPROVE instructions can include an optional assetId field in the token object for CAIP-19 asset identification.'),
      network: z.string().optional().describe('Target network (e.g., polygon-mainnet). Required for EVM wallets; auto-resolved for Solana.'),
      wallet_id: z.string().optional().describe('Target wallet ID. Required for multi-wallet sessions; auto-resolved when session has a single wallet.'),
      gas_condition: z.object({
        max_gas_price: z.string().optional().describe('Max gas price in wei (EVM baseFee+priorityFee)'),
        max_priority_fee: z.string().optional().describe('Max priority fee in wei (EVM) or micro-lamports (Solana)'),
        timeout: z.number().optional().describe('Max wait time in seconds (60-86400)'),
      }).optional().describe('Gas price condition for deferred execution. At least one of max_gas_price or max_priority_fee required.'),
    },
    async (args) => {
      const body: Record<string, unknown> = {
        type: 'BATCH',
        instructions: args.instructions,
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
