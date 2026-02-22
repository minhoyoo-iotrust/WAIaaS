/**
 * get_incoming_summary tool: Get period-based incoming transaction summary with totals.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type WalletContext, withWalletPrefix } from '../server.js';

export function registerGetIncomingSummary(
  server: McpServer,
  apiClient: ApiClient,
  walletContext?: WalletContext,
): void {
  server.tool(
    'get_incoming_summary',
    withWalletPrefix(
      'Get a period-based summary of incoming transactions (daily/weekly/monthly totals with USD conversion).',
      walletContext?.walletName,
    ),
    {
      period: z.string().optional().describe('Aggregation period: daily, weekly, or monthly (default: daily)'),
      chain: z.string().optional().describe('Filter by chain (solana or ethereum)'),
      network: z.string().optional().describe('Filter by network'),
      since: z.number().optional().describe('Summary start epoch (seconds)'),
      until: z.number().optional().describe('Summary end epoch (seconds)'),
      wallet_id: z.string().optional().describe('Target wallet ID. Omit to use the default wallet.'),
    },
    async (args) => {
      const params = new URLSearchParams();
      if (args.period !== undefined) params.set('period', args.period);
      if (args.chain !== undefined) params.set('chain', args.chain);
      if (args.network !== undefined) params.set('network', args.network);
      if (args.since !== undefined) params.set('since', String(args.since));
      if (args.until !== undefined) params.set('until', String(args.until));
      if (args.wallet_id) params.set('wallet_id', args.wallet_id);
      const qs = params.toString();
      const result = await apiClient.get(`/v1/wallet/incoming/summary${qs ? `?${qs}` : ''}`);
      return toToolResult(result);
    },
  );
}
