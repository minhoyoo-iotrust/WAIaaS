/**
 * get_nft_metadata tool: Get detailed metadata for a specific NFT.
 *
 * Wraps GET /v1/wallet/nfts/{tokenIdentifier}?network=...
 * Returns name, image, description, attributes, and CAIP-19 assetId.
 *
 * tokenIdentifier format:
 * - EVM: {contractAddress}:{tokenId}
 * - Solana: {mintAddress}
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type WalletContext, withWalletPrefix } from '../server.js';

export function registerGetNftMetadata(
  server: McpServer,
  apiClient: ApiClient,
  walletContext?: WalletContext,
): void {
  server.tool(
    'get_nft_metadata',
    withWalletPrefix(
      'Get detailed metadata for a specific NFT (name, image, attributes, CAIP-19 assetId). EVM: contractAddress:tokenId, Solana: mintAddress.',
      walletContext?.walletName,
    ),
    {
      token_identifier: z.string().describe('NFT identifier. EVM: {contractAddress}:{tokenId}. Solana: {mintAddress}.'),
      network: z.string().describe('Network identifier (e.g., "ethereum-mainnet", "solana-mainnet").'),
      wallet_id: z.string().optional().describe('Target wallet ID. Required for multi-wallet sessions.'),
    },
    async (args) => {
      const params = new URLSearchParams();
      params.set('network', args.network);
      if (args.wallet_id) params.set('walletId', args.wallet_id);
      const result = await apiClient.get(
        `/v1/wallet/nfts/${encodeURIComponent(args.token_identifier)}?${params.toString()}`,
      );
      return toToolResult(result);
    },
  );
}
