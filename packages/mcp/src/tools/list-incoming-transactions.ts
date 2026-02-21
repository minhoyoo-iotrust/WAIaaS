/**
 * list_incoming_transactions tool: List incoming transaction history with cursor-based pagination.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type WalletContext, withWalletPrefix } from '../server.js';

export function registerListIncomingTransactions(
  server: McpServer,
  apiClient: ApiClient,
  walletContext?: WalletContext,
): void {
  server.tool(
    'list_incoming_transactions',
    withWalletPrefix(
      'List incoming (received) transaction history with cursor-based pagination. Returns confirmed incoming transfers by default.',
      walletContext?.walletName,
    ),
    {
      limit: z.number().optional().describe('Maximum number of transactions to return (1-100, default 20)'),
      cursor: z.string().optional().describe('Pagination cursor from previous response'),
      chain: z.string().optional().describe('Filter by chain (solana or ethereum)'),
      network: z.string().optional().describe('Filter by network'),
      status: z.string().optional().describe('Filter by status: DETECTED or CONFIRMED (default: CONFIRMED)'),
      token: z.string().optional().describe('Filter by token address (null for native transfers)'),
      from_address: z.string().optional().describe('Filter by sender address'),
      since: z.number().optional().describe('Filter: only transactions detected after this epoch (seconds)'),
      until: z.number().optional().describe('Filter: only transactions detected before this epoch (seconds)'),
      wallet_id: z.string().optional().describe('Target wallet ID. Omit to use the default wallet.'),
    },
    async (args) => {
      const params = new URLSearchParams();
      if (args.limit !== undefined) params.set('limit', String(args.limit));
      if (args.cursor !== undefined) params.set('cursor', args.cursor);
      if (args.chain !== undefined) params.set('chain', args.chain);
      if (args.network !== undefined) params.set('network', args.network);
      if (args.status !== undefined) params.set('status', args.status);
      if (args.token !== undefined) params.set('token', args.token);
      if (args.from_address !== undefined) params.set('from_address', args.from_address);
      if (args.since !== undefined) params.set('since', String(args.since));
      if (args.until !== undefined) params.set('until', String(args.until));
      if (args.wallet_id) params.set('wallet_id', args.wallet_id);
      const qs = params.toString();
      const result = await apiClient.get(`/v1/wallet/incoming${qs ? `?${qs}` : ''}`);
      return toToolResult(result);
    },
  );
}
