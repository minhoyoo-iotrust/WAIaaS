import type { PluginApi } from '../config.js';
import type { WAIaaSPluginClient } from '../client.js';
import { toResult } from '../client.js';

export function registerUtilityTools(api: PluginApi, client: WAIaaSPluginClient): void {
  // Tool 10: sign_message
  api.registerTool({
    name: 'sign_message',
    description: 'Sign a message (personal_sign) or EIP-712 typed data (signTypedData). Returns the signature. EIP-712 is EVM-only.',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Message to sign (hex 0x-prefixed or UTF-8 string). Required for sign_type "personal".' },
        sign_type: { type: 'string', enum: ['personal', 'typedData'], description: 'Sign type: "personal" (default) for raw message, "typedData" for EIP-712.' },
        typed_data: {
          type: 'object',
          description: 'EIP-712 typed data structure. Required when sign_type is "typedData".',
          properties: {
            domain: { type: 'object', properties: {} },
            types: { type: 'object', properties: {} },
            primaryType: { type: 'string' },
            message: { type: 'object', properties: {} },
          },
        },
        network: { type: 'string', description: 'Target network (optional).' },
        wallet_id: { type: 'string', description: 'Target wallet ID. Required for multi-wallet sessions.' },
      },
    },
    handler: async (args) => {
      const body: Record<string, unknown> = {};
      if (args['message']) body['message'] = args['message'];
      if (args['sign_type']) body['signType'] = args['sign_type'];
      if (args['typed_data']) body['typedData'] = args['typed_data'];
      if (args['network']) body['network'] = args['network'];
      if (args['wallet_id']) body['walletId'] = args['wallet_id'];
      const result = await client.post('/v1/transactions/sign-message', body);
      return toResult(result);
    },
  });

  // Tool 11: resolve_asset
  api.registerTool({
    name: 'resolve_asset',
    description: 'Resolve a CAIP-19 asset identifier to token metadata (address, decimals, symbol, isNative, isRegistered).',
    inputSchema: {
      type: 'object',
      properties: {
        asset_id: { type: 'string', description: 'CAIP-19 asset identifier (e.g., "eip155:1/erc20:0xa0b8...", "eip155:1/slip44:60")' },
      },
      required: ['asset_id'],
    },
    handler: async (args) => {
      const assetId = String(args['asset_id']);
      const slashIdx = assetId.indexOf('/');
      if (slashIdx === -1) return { error: 'INVALID_CAIP19', message: `Invalid CAIP-19 format: "${assetId}"` };
      const chainId = assetId.substring(0, slashIdx);
      const assetPart = assetId.substring(slashIdx + 1);
      const colonIdx = assetPart.indexOf(':');
      if (colonIdx === -1) return { error: 'INVALID_CAIP19', message: `Invalid CAIP-19 format: "${assetId}"` };
      const namespace = assetPart.substring(0, colonIdx);
      const reference = assetPart.substring(colonIdx + 1);
      if (namespace === 'slip44') {
        return { assetId, chainId, network: chainId, address: null, decimals: null, symbol: null, name: null, isNative: true, isRegistered: false };
      }
      const result = await client.get<{ tokens?: Array<Record<string, unknown>> }>(`/v1/tokens?network=${encodeURIComponent(chainId)}`);
      if (!result.ok) {
        return { assetId, chainId, network: chainId, address: reference, decimals: null, symbol: null, name: null, isNative: false, isRegistered: false };
      }
      const tokens = result.data.tokens ?? [];
      const match = tokens.find((t) => typeof t['address'] === 'string' && t['address'].toLowerCase() === reference.toLowerCase());
      if (match) {
        return { assetId, chainId, network: chainId, address: match['address'], decimals: match['decimals'], symbol: match['symbol'], name: match['name'], isNative: false, isRegistered: true };
      }
      return { assetId, chainId, network: chainId, address: reference, decimals: null, symbol: null, name: null, isNative: false, isRegistered: false };
    },
  });

  // Tool 12: call_contract
  api.registerTool({
    name: 'call_contract',
    description: 'Call a whitelisted smart contract. Requires CONTRACT_WHITELIST policy. For EVM: provide calldata (hex). For Solana: provide programId + instructionData + accounts.',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Contract address' },
        calldata: { type: 'string', description: 'Hex-encoded calldata (EVM)' },
        value: { type: 'string', description: 'Native token value in smallest units (wei).' },
        programId: { type: 'string', description: 'Program ID (Solana)' },
        instructionData: { type: 'string', description: 'Base64-encoded instruction data (Solana)' },
        accounts: {
          type: 'array',
          description: 'Account metas (Solana)',
          items: {
            type: 'object',
            properties: {
              pubkey: { type: 'string' },
              isSigner: { type: 'boolean' },
              isWritable: { type: 'boolean' },
            },
          },
        },
        network: { type: 'string', description: 'Target network.' },
        wallet_id: { type: 'string', description: 'Target wallet ID.' },
        gas_condition: {
          type: 'object',
          properties: {
            max_gas_price: { type: 'string' },
            max_priority_fee: { type: 'string' },
            timeout: { type: 'number' },
          },
        },
      },
      required: ['to'],
    },
    handler: async (args) => {
      const body: Record<string, unknown> = { type: 'CONTRACT_CALL', to: args['to'] };
      if (args['calldata'] !== undefined) body['calldata'] = args['calldata'];
      if (args['value'] !== undefined) body['value'] = args['value'];
      if (args['programId'] !== undefined) body['programId'] = args['programId'];
      if (args['instructionData'] !== undefined) body['instructionData'] = args['instructionData'];
      if (args['accounts'] !== undefined) body['accounts'] = args['accounts'];
      if (args['network'] !== undefined) body['network'] = args['network'];
      if (args['wallet_id']) body['walletId'] = args['wallet_id'];
      if (args['gas_condition']) {
        const gc = args['gas_condition'] as Record<string, unknown>;
        body['gasCondition'] = { maxGasPrice: gc['max_gas_price'], maxPriorityFee: gc['max_priority_fee'], timeout: gc['timeout'] };
      }
      const result = await client.post('/v1/transactions/send', body);
      return toResult(result);
    },
  });

  // Tool 13: approve_token
  api.registerTool({
    name: 'approve_token',
    description: 'Approve a spender to transfer tokens on your behalf. Requires APPROVED_SPENDERS policy.',
    inputSchema: {
      type: 'object',
      properties: {
        spender: { type: 'string', description: 'Spender address' },
        token: {
          type: 'object',
          description: 'Token info. Provide full metadata (address/decimals/symbol) OR assetId alone for auto-resolve.',
          properties: {
            address: { type: 'string' },
            decimals: { type: 'number' },
            symbol: { type: 'string' },
            assetId: { type: 'string' },
          },
        },
        amount: { type: 'string', description: 'Approval amount in smallest units.' },
        network: { type: 'string', description: 'Target network.' },
        wallet_id: { type: 'string', description: 'Target wallet ID.' },
        gas_condition: {
          type: 'object',
          properties: {
            max_gas_price: { type: 'string' },
            max_priority_fee: { type: 'string' },
            timeout: { type: 'number' },
          },
        },
      },
      required: ['spender', 'token', 'amount'],
    },
    handler: async (args) => {
      const body: Record<string, unknown> = { type: 'APPROVE', spender: args['spender'], token: args['token'], amount: args['amount'] };
      if (args['network'] !== undefined) body['network'] = args['network'];
      if (args['wallet_id']) body['walletId'] = args['wallet_id'];
      if (args['gas_condition']) {
        const gc = args['gas_condition'] as Record<string, unknown>;
        body['gasCondition'] = { maxGasPrice: gc['max_gas_price'], maxPriorityFee: gc['max_priority_fee'], timeout: gc['timeout'] };
      }
      const result = await client.post('/v1/transactions/send', body);
      return toResult(result);
    },
  });

  // Tool 14: send_batch
  api.registerTool({
    name: 'send_batch',
    description: 'Send multiple instructions in a single atomic transaction (Solana only, 2-20 instructions).',
    inputSchema: {
      type: 'object',
      properties: {
        instructions: {
          type: 'array',
          description: 'Array of instruction objects (each is a TRANSFER/TOKEN_TRANSFER/CONTRACT_CALL/APPROVE without the type field). 2-20 items.',
          items: { type: 'object', properties: {} },
        },
        network: { type: 'string', description: 'Target network.' },
        wallet_id: { type: 'string', description: 'Target wallet ID.' },
        gas_condition: {
          type: 'object',
          properties: {
            max_gas_price: { type: 'string' },
            max_priority_fee: { type: 'string' },
            timeout: { type: 'number' },
          },
        },
      },
      required: ['instructions'],
    },
    handler: async (args) => {
      const body: Record<string, unknown> = { type: 'BATCH', instructions: args['instructions'] };
      if (args['network'] !== undefined) body['network'] = args['network'];
      if (args['wallet_id']) body['walletId'] = args['wallet_id'];
      if (args['gas_condition']) {
        const gc = args['gas_condition'] as Record<string, unknown>;
        body['gasCondition'] = { maxGasPrice: gc['max_gas_price'], maxPriorityFee: gc['max_priority_fee'], timeout: gc['timeout'] };
      }
      const result = await client.post('/v1/transactions/send', body);
      return toResult(result);
    },
  });

  // Tool 15: get_policies
  api.registerTool({
    name: 'get_policies',
    description: 'Get policies applied to the wallet. Shows spending limits, whitelists, rate limits, and other rules.',
    inputSchema: {
      type: 'object',
      properties: {
        wallet_id: { type: 'string', description: 'Target wallet ID.' },
        limit: { type: 'number', description: 'Max items to return (default: 50)' },
        offset: { type: 'number', description: 'Number of items to skip (default: 0)' },
      },
    },
    handler: async (args) => {
      const params = new URLSearchParams();
      if (typeof args['wallet_id'] === 'string') params.set('walletId', args['wallet_id']);
      if (args['limit'] !== undefined) params.set('limit', String(args['limit']));
      if (args['offset'] !== undefined) params.set('offset', String(args['offset']));
      const qs = params.toString();
      const result = await client.get('/v1/policies' + (qs ? '?' + qs : ''));
      return toResult(result);
    },
  });
  // NOTE: get_policies is sessionAuth (GET only) — not masterAuth. Agents need to read their own policies.
  // Excluded masterAuth tools: POST/PUT/DELETE /v1/policies, POST /v1/wallets, DELETE /v1/wallets/:id
}
