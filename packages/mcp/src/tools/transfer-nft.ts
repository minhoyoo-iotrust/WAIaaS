/**
 * transfer_nft tool: Transfer an NFT (ERC-721, ERC-1155, or Metaplex) to a recipient.
 *
 * Wraps POST /v1/transactions/send with type=NFT_TRANSFER.
 * Default approval tier is APPROVAL (owner must approve unless overridden).
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type WalletContext, withWalletPrefix } from '../server.js';

export function registerTransferNft(
  server: McpServer,
  apiClient: ApiClient,
  walletContext?: WalletContext,
): void {
  server.tool(
    'transfer_nft',
    withWalletPrefix(
      'Transfer an NFT (ERC-721/ERC-1155/Metaplex) to a recipient address. Default tier: APPROVAL.',
      walletContext?.walletName,
    ),
    {
      to: z.string().describe('Recipient address (0x-hex for EVM, base58 for Solana).'),
      token_address: z.string().describe('NFT contract address (EVM) or mint address (Solana).'),
      token_id: z.string().describe('Token ID within the contract (EVM). Use "0" for Solana Metaplex.'),
      standard: z.enum(['erc721', 'erc1155', 'metaplex']).describe('NFT standard.'),
      network: z.string().describe('Network identifier (e.g., "ethereum-mainnet", "solana-mainnet" or CAIP-2 "eip155:1").'),
      amount: z.string().optional().describe('Number of tokens to transfer (default: "1"). Only relevant for ERC-1155 multi-copy NFTs. This is a count, not a smallest-unit value.'),
      wallet_id: z.string().optional().describe('Target wallet ID. Required for multi-wallet sessions.'),
    },
    async (args) => {
      const body: Record<string, unknown> = {
        type: 'NFT_TRANSFER',
        to: args.to,
        token: {
          address: args.token_address,
          tokenId: args.token_id,
          standard: args.standard,
        },
        network: args.network,
      };
      if (args.amount !== undefined) body.amount = args.amount;
      if (args.wallet_id) body.walletId = args.wallet_id;
      const result = await apiClient.post('/v1/transactions/send', body);
      return toToolResult(result);
    },
  );
}
