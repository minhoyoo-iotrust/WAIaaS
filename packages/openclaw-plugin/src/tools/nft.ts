import type { PluginApi } from '../config.js';
import type { WAIaaSPluginClient } from '../client.js';
import { toResult } from '../client.js';

export function registerNftTools(api: PluginApi, client: WAIaaSPluginClient): void {
  // Tool 16: list_nfts
  api.registerTool({
    name: 'list_nfts',
    description: 'List NFTs (ERC-721, ERC-1155, Metaplex) owned by the wallet for a specific network. Requires NFT indexer API key.',
    inputSchema: {
      type: 'object',
      properties: {
        network: { type: 'string', description: 'Network identifier (e.g., "ethereum-mainnet", "solana-mainnet" or CAIP-2 "eip155:1").' },
        cursor: { type: 'string', description: 'Pagination cursor from previous response.' },
        limit: { type: 'number', description: 'Max NFTs per page (default: 20).' },
        group_by: { type: 'string', enum: ['collection'], description: 'Group NFTs by collection.' },
        wallet_id: { type: 'string', description: 'Target wallet ID. Required for multi-wallet sessions.' },
      },
      required: ['network'],
    },
    handler: async (args) => {
      const params = new URLSearchParams();
      params.set('network', String(args['network']));
      if (typeof args['cursor'] === 'string') params.set('cursor', args['cursor']);
      if (args['limit'] !== undefined) params.set('limit', String(args['limit']));
      if (typeof args['group_by'] === 'string') params.set('groupBy', args['group_by']);
      if (typeof args['wallet_id'] === 'string') params.set('walletId', args['wallet_id']);
      const result = await client.get('/v1/wallet/nfts?' + params.toString());
      return toResult(result);
    },
  });

  // Tool 17: transfer_nft
  api.registerTool({
    name: 'transfer_nft',
    description: 'Transfer an NFT (ERC-721/ERC-1155/Metaplex) to a recipient address. Default tier: APPROVAL.',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient address (0x-hex for EVM, base58 for Solana).' },
        token_address: { type: 'string', description: 'NFT contract address (EVM) or mint address (Solana).' },
        token_id: { type: 'string', description: 'Token ID within the contract (EVM). Use "0" for Solana Metaplex.' },
        standard: { type: 'string', enum: ['erc721', 'erc1155', 'metaplex'], description: 'NFT standard.' },
        network: { type: 'string', description: 'Network identifier (e.g., "ethereum-mainnet", "solana-mainnet").' },
        amount: { type: 'string', description: 'Number of tokens to transfer (default: "1"). Only relevant for ERC-1155.' },
        wallet_id: { type: 'string', description: 'Target wallet ID. Required for multi-wallet sessions.' },
      },
      required: ['to', 'token_address', 'token_id', 'standard', 'network'],
    },
    handler: async (args) => {
      const body: Record<string, unknown> = {
        type: 'NFT_TRANSFER',
        to: args['to'],
        token: {
          address: args['token_address'],
          tokenId: args['token_id'],
          standard: args['standard'],
        },
        network: args['network'],
      };
      if (args['amount'] !== undefined) body['amount'] = args['amount'];
      if (args['wallet_id']) body['walletId'] = args['wallet_id'];
      const result = await client.post('/v1/transactions/send', body);
      return toResult(result);
    },
  });
}
