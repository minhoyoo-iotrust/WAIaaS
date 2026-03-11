/**
 * list_offchain_actions tool: List off-chain action history with venue/status filter and pagination.
 *
 * Off-chain actions are created automatically when an action provider resolves to
 * signedData or signedHttp kind (instead of the on-chain contractCall kind).
 * The existing action_* tools handle execution; this tool handles query only.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type WalletContext, withWalletPrefix } from '../server.js';

export function registerListOffchainActions(
  server: McpServer,
  apiClient: ApiClient,
  walletContext?: WalletContext,
): void {
  server.tool(
    'list_offchain_actions',
    withWalletPrefix(
      'List off-chain action history (signedData/signedHttp) with venue/status filter and pagination.',
      walletContext?.walletName,
    ),
    {
      venue: z.string().optional().describe('Filter by venue name (e.g. polymarket, hyperliquid)'),
      status: z.string().optional().describe('Filter by status (e.g. PENDING, FILLED, CANCELED, EXPIRED)'),
      limit: z.number().optional().describe('Maximum number of results to return'),
      offset: z.number().optional().describe('Pagination offset'),
      wallet_id: z.string().optional().describe('Wallet ID. Auto-resolved for single-wallet sessions.'),
    },
    async (args) => {
      const walletId = args.wallet_id || 'default';
      const params = new URLSearchParams();
      if (args.venue !== undefined) params.set('venue', args.venue);
      if (args.status !== undefined) params.set('status', args.status);
      if (args.limit !== undefined) params.set('limit', String(args.limit));
      if (args.offset !== undefined) params.set('offset', String(args.offset));
      const qs = params.toString();
      const result = await apiClient.get(`/v1/wallets/${walletId}/actions${qs ? `?${qs}` : ''}`);
      return toToolResult(result);
    },
  );
}
