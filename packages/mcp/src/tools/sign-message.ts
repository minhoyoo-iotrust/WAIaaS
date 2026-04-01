/**
 * sign_message tool: Sign a message (personal_sign or EIP-712 signTypedData).
 *
 * Wraps POST /v1/transactions/sign-message. AI agents can sign raw messages
 * or EIP-712 structured data for DApp interactions (Permit, orders, etc.).
 *
 * EIP-712 signTypedData is EVM-only. Solana wallets only support personal signing.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type WalletContext, withWalletPrefix } from '../server.js';

export function registerSignMessage(
  server: McpServer,
  apiClient: ApiClient,
  walletContext?: WalletContext,
): void {
  server.tool(
    'sign_message',
    withWalletPrefix(
      'Sign a message (personal_sign) or EIP-712 typed data (signTypedData). Returns the signature. EIP-712 is EVM-only.',
      walletContext?.walletName,
    ),
    {
      message: z.string().optional().describe('Message to sign (hex 0x-prefixed or UTF-8 string). Required for sign_type "personal".'),
      sign_type: z.enum(['personal', 'typedData']).optional().describe('Sign type: "personal" (default) for raw message, "typedData" for EIP-712.'),
      typed_data: z.object({
        domain: z.object({
          name: z.string().optional(),
          version: z.string().optional(),
          chainId: z.union([z.number(), z.string()]).optional(),
          verifyingContract: z.string().optional(),
          salt: z.string().optional(),
        }),
        types: z.record(z.string(), z.array(z.object({ name: z.string(), type: z.string() }))),
        primaryType: z.string(),
        message: z.record(z.string(), z.unknown()),
      }).optional().describe('EIP-712 typed data structure. Required when sign_type is "typedData".'),
      network: z.string().optional().describe('Target network (optional).'),
      wallet_id: z.string().optional().describe('Target wallet ID. Required for multi-wallet sessions.'),
    },
    async (args) => {
      const body: Record<string, unknown> = {};
      if (args.message) body.message = args.message;
      if (args.sign_type) body.signType = args.sign_type;
      if (args.typed_data) body.typedData = args.typed_data;
      if (args.network) body.network = args.network;
      if (args.wallet_id) body.walletId = args.wallet_id;
      const result = await apiClient.post('/v1/transactions/sign-message', body);
      return toToolResult(result);
    },
  );
}
