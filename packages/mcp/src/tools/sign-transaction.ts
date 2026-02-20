/**
 * sign_transaction tool: Sign an unsigned transaction without broadcasting.
 *
 * Wraps POST /v1/transactions/sign. AI agents provide a raw unsigned
 * transaction (base64 for Solana, hex for EVM) and optionally a target
 * network. Returns signed transaction, parsed operations, and policy result.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type WalletContext, withWalletPrefix } from '../server.js';

export function registerSignTransaction(
  server: McpServer,
  apiClient: ApiClient,
  walletContext?: WalletContext,
): void {
  server.tool(
    'sign_transaction',
    withWalletPrefix(
      'Sign an unsigned transaction without broadcasting. Provide raw transaction (base64 for Solana, hex for EVM). Returns signed transaction, parsed operations, and policy evaluation.',
      walletContext?.walletName,
    ),
    {
      transaction: z.string().describe('Raw unsigned transaction (base64 for Solana, hex 0x-prefixed for EVM)'),
      network: z.string().optional().describe('Target network (e.g., "polygon-mainnet"). Omit to use wallet default.'),
      wallet_id: z.string().optional().describe('Target wallet ID. Omit to use the default wallet.'),
    },
    async (args) => {
      const body: Record<string, unknown> = { transaction: args.transaction };
      if (args.network) {
        body['network'] = args.network;
      }
      if (args.wallet_id) body.walletId = args.wallet_id;
      const result = await apiClient.post('/v1/transactions/sign', body);
      return toToolResult(result);
    },
  );
}
