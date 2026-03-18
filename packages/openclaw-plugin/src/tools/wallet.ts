import type { PluginApi } from '../config.js';
import type { WAIaaSPluginClient } from '../client.js';
import { toResult } from '../client.js';

export function registerWalletTools(api: PluginApi, client: WAIaaSPluginClient): void {
  // Tool 1: get_wallet_info
  api.registerTool({
    name: 'get_wallet_info',
    description: 'Get wallet info including chain, address, environment, and available networks.',
    inputSchema: {
      type: 'object',
      properties: {
        wallet_id: { type: 'string', description: 'Target wallet ID. Required for multi-wallet sessions; auto-resolved when session has a single wallet.' },
      },
    },
    handler: async (args) => {
      const params = new URLSearchParams();
      if (typeof args['wallet_id'] === 'string') params.set('walletId', args['wallet_id']);
      const qs = params.toString();
      const result = await client.get<Record<string, unknown>>('/v1/wallet/address' + (qs ? '?' + qs : ''));
      return toResult(result);
    },
  });

  // Tool 2: get_balance
  api.registerTool({
    name: 'get_balance',
    description: 'Get the current balance of the wallet.',
    inputSchema: {
      type: 'object',
      properties: {
        network: { type: 'string', description: 'Query balance for specific network (e.g., "polygon-mainnet" or CAIP-2 "eip155:137"). Use "all" for all networks.' },
        display_currency: { type: 'string', description: 'Display currency for balance conversion (e.g. KRW, EUR). Defaults to server setting.' },
        wallet_id: { type: 'string', description: 'Target wallet ID. Required for multi-wallet sessions; auto-resolved when session has a single wallet.' },
      },
    },
    handler: async (args) => {
      const params = new URLSearchParams();
      if (typeof args['network'] === 'string') params.set('network', args['network']);
      if (typeof args['display_currency'] === 'string') params.set('display_currency', args['display_currency']);
      if (typeof args['wallet_id'] === 'string') params.set('walletId', args['wallet_id']);
      const qs = params.toString();
      const result = await client.get('/v1/wallet/balance' + (qs ? '?' + qs : ''));
      return toResult(result);
    },
  });

  // Tool 3: connect_info
  api.registerTool({
    name: 'connect_info',
    description: 'Get self-discovery info: accessible wallets, policies, capabilities, and AI-ready prompt. Call this first to understand your environment.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      const result = await client.get('/v1/connect-info');
      return toResult(result);
    },
  });
}
