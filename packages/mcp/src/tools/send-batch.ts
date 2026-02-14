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
      instructions: z.array(z.record(z.unknown())).min(2).max(20)
        .describe('Array of instruction objects (each is a TRANSFER/TOKEN_TRANSFER/CONTRACT_CALL/APPROVE without the type field)'),
      network: z.string().optional().describe('Target network (e.g., polygon-mainnet). Defaults to wallet default network.'),
    },
    async (args) => {
      const body: Record<string, unknown> = {
        type: 'BATCH',
        instructions: args.instructions,
      };
      if (args.network !== undefined) body.network = args.network;
      const result = await apiClient.post('/v1/transactions/send', body);
      return toToolResult(result);
    },
  );
}
