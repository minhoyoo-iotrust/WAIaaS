import type { PluginApi } from '../config.js';
import type { WAIaaSPluginClient } from '../client.js';
import { toResult } from '../client.js';

export function registerTransferTools(api: PluginApi, client: WAIaaSPluginClient): void {
  // Tool 4: send_token
  api.registerTool({
    name: 'send_token',
    description: 'Send SOL/ETH or tokens from the wallet. For token transfers, specify type and token info.',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Destination wallet address' },
        amount: { type: 'string', description: 'Amount in smallest units (wei for EVM, lamports for Solana). Example: "1000000000000000000" = 1 ETH' },
        type: { type: 'string', enum: ['TRANSFER', 'TOKEN_TRANSFER'], description: 'Transaction type. Default: TRANSFER (native). TOKEN_TRANSFER for SPL/ERC-20' },
        network: { type: 'string', description: 'Target network (e.g., "polygon-mainnet" or CAIP-2 "eip155:137"). Required for EVM wallets; auto-resolved for Solana.' },
        token: {
          type: 'object',
          description: 'Required for TOKEN_TRANSFER. Provide full metadata OR assetId alone for auto-resolve.',
          properties: {
            address: { type: 'string', description: 'Token mint (SPL) or contract address (ERC-20).' },
            decimals: { type: 'number', description: 'Token decimals (e.g., 6 for USDC).' },
            symbol: { type: 'string', description: 'Token symbol (e.g., USDC).' },
            assetId: { type: 'string', description: 'CAIP-19 asset identifier for auto-resolve.' },
          },
        },
        memo: { type: 'string', description: 'Optional transaction memo' },
        wallet_id: { type: 'string', description: 'Target wallet ID. Required for multi-wallet sessions; auto-resolved when session has a single wallet.' },
        gas_condition: {
          type: 'object',
          description: 'Gas price condition for deferred execution.',
          properties: {
            max_gas_price: { type: 'string', description: 'Max gas price in wei' },
            max_priority_fee: { type: 'string', description: 'Max priority fee in wei or micro-lamports' },
            timeout: { type: 'number', description: 'Max wait time in seconds (60-86400)' },
          },
        },
      },
      required: ['to', 'amount'],
    },
    handler: async (args) => {
      const body: Record<string, unknown> = { to: args['to'], amount: args['amount'] };
      if (args['type']) body['type'] = args['type'];
      if (args['token']) body['token'] = args['token'];
      if (args['network'] !== undefined) body['network'] = args['network'];
      if (args['memo'] !== undefined) body['memo'] = args['memo'];
      if (args['wallet_id']) body['walletId'] = args['wallet_id'];
      if (args['gas_condition']) {
        const gc = args['gas_condition'] as Record<string, unknown>;
        body['gasCondition'] = {
          maxGasPrice: gc['max_gas_price'],
          maxPriorityFee: gc['max_priority_fee'],
          timeout: gc['timeout'],
        };
      }
      const result = await client.post('/v1/transactions/send', body);
      return toResult(result);
    },
  });

  // Tool 5: get_transaction
  api.registerTool({
    name: 'get_transaction',
    description: 'Get details of a specific transaction by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        transaction_id: { type: 'string', description: 'Transaction ID to retrieve' },
        display_currency: { type: 'string', description: 'Display currency for amount conversion (e.g. KRW, EUR).' },
        wallet_id: { type: 'string', description: 'Target wallet ID. Required for multi-wallet sessions.' },
      },
      required: ['transaction_id'],
    },
    handler: async (args) => {
      const params = new URLSearchParams();
      if (typeof args['display_currency'] === 'string') params.set('display_currency', args['display_currency']);
      if (typeof args['wallet_id'] === 'string') params.set('walletId', args['wallet_id']);
      const qs = params.toString();
      const result = await client.get(`/v1/transactions/${String(args['transaction_id'])}${qs ? '?' + qs : ''}`);
      return toResult(result);
    },
  });

  // Tool 6: list_transactions
  api.registerTool({
    name: 'list_transactions',
    description: 'List transaction history with cursor-based pagination.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Maximum number of transactions to return' },
        cursor: { type: 'string', description: 'Pagination cursor from previous response' },
        display_currency: { type: 'string', description: 'Display currency for amount conversion (e.g. KRW, EUR).' },
        wallet_id: { type: 'string', description: 'Target wallet ID. Required for multi-wallet sessions.' },
      },
    },
    handler: async (args) => {
      const params = new URLSearchParams();
      if (args['limit'] !== undefined) params.set('limit', String(args['limit']));
      if (typeof args['cursor'] === 'string') params.set('cursor', args['cursor']);
      if (typeof args['display_currency'] === 'string') params.set('display_currency', args['display_currency']);
      if (typeof args['wallet_id'] === 'string') params.set('walletId', args['wallet_id']);
      const qs = params.toString();
      const result = await client.get(`/v1/transactions${qs ? '?' + qs : ''}`);
      return toResult(result);
    },
  });
}
