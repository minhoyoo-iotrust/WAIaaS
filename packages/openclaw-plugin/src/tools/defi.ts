import type { PluginApi } from '../config.js';
import type { WAIaaSPluginClient } from '../client.js';
import { toResult } from '../client.js';

export function registerDefiTools(api: PluginApi, client: WAIaaSPluginClient): void {
  // Tool 7: execute_action
  api.registerTool({
    name: 'execute_action',
    description: 'Execute a DeFi action (swap, bridge, stake, unstake, lend_supply, lend_borrow, lend_repay, lend_withdraw, etc.) through the action provider system. Call get_provider_status first to see available providers and actions.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Action name (e.g., "swap", "stake", "lend_supply"). Use get_provider_status to see available actions.' },
        provider: { type: 'string', description: 'Provider name (e.g., "jupiter", "lido", "aave"). Use get_provider_status to see available providers.' },
        params: {
          type: 'object',
          description: 'Action-specific parameters. See provider documentation or get_provider_status for required fields.',
          properties: {},
        },
        wallet_id: { type: 'string', description: 'Target wallet ID. Required for multi-wallet sessions.' },
        network: { type: 'string', description: 'Target network (e.g., "ethereum-mainnet"). Required for EVM providers.' },
      },
      required: ['action', 'provider', 'params'],
    },
    handler: async (args) => {
      const body: Record<string, unknown> = {
        action: args['action'],
        provider: args['provider'],
        params: args['params'] ?? {},
      };
      if (args['wallet_id']) body['walletId'] = args['wallet_id'];
      if (args['network']) body['network'] = args['network'];
      const result = await client.post('/v1/actions/execute', body);
      return toResult(result);
    },
  });

  // Tool 8: get_defi_positions
  api.registerTool({
    name: 'get_defi_positions',
    description: 'Get DeFi lending positions with health factor and USD amounts.',
    inputSchema: {
      type: 'object',
      properties: {
        wallet_id: { type: 'string', description: 'Target wallet ID. Required for multi-wallet sessions; auto-resolved when session has a single wallet.' },
      },
    },
    handler: async (args) => {
      const params = new URLSearchParams();
      if (typeof args['wallet_id'] === 'string') params.set('wallet_id', args['wallet_id']);
      const qs = params.toString();
      const result = await client.get('/v1/wallet/positions' + (qs ? '?' + qs : ''));
      return toResult(result);
    },
  });

  // Tool 9: get_provider_status
  api.registerTool({
    name: 'get_provider_status',
    description: 'List available DeFi action providers with their actions, supported chains, and API key status.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    handler: async () => {
      const result = await client.get('/v1/actions/providers');
      return toResult(result);
    },
  });
}
