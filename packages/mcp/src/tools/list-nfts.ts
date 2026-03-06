/**
 * list_nfts tool: List NFTs owned by the wallet for a specific network.
 *
 * Wraps GET /v1/wallet/nfts with network, cursor, limit, and groupBy parameters.
 * Requires an NFT indexer API key (Alchemy for EVM, Helius for Solana) to be configured.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type WalletContext, withWalletPrefix } from '../server.js';

export function registerListNfts(
  server: McpServer,
  apiClient: ApiClient,
  walletContext?: WalletContext,
): void {
  server.tool(
    'list_nfts',
    withWalletPrefix(
      'List NFTs (ERC-721, ERC-1155, Metaplex) owned by the wallet for a specific network. Requires NFT indexer API key.',
      walletContext?.walletName,
    ),
    {
      network: z.string().describe('Network identifier (e.g., "ethereum-mainnet", "solana-mainnet").'),
      cursor: z.string().optional().describe('Pagination cursor from previous response.'),
      limit: z.number().optional().describe('Max NFTs per page (default: 20).'),
      group_by: z.enum(['collection']).optional().describe('Group NFTs by collection.'),
      wallet_id: z.string().optional().describe('Target wallet ID. Required for multi-wallet sessions.'),
    },
    async (args) => {
      const params = new URLSearchParams();
      params.set('network', args.network);
      if (args.cursor) params.set('cursor', args.cursor);
      if (args.limit !== undefined) params.set('limit', String(args.limit));
      if (args.group_by) params.set('groupBy', args.group_by);
      if (args.wallet_id) params.set('walletId', args.wallet_id);
      const result = await apiClient.get('/v1/wallet/nfts?' + params.toString());
      return toToolResult(result);
    },
  );
}
