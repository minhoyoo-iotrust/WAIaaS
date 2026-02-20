/**
 * encode_calldata tool: Encode EVM function call into calldata hex.
 *
 * Wraps POST /v1/utils/encode-calldata. AI agents provide ABI fragment,
 * function name, and arguments to get hex-encoded calldata for use
 * with call_contract's calldata parameter.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type WalletContext, withWalletPrefix } from '../server.js';

export function registerEncodeCalldata(
  server: McpServer,
  apiClient: ApiClient,
  walletContext?: WalletContext,
): void {
  server.tool(
    'encode_calldata',
    withWalletPrefix(
      'Encode EVM function call into calldata hex. Provide ABI fragment array, function name, and arguments. Returns hex calldata and function selector for use with call_contract.',
      walletContext?.walletName,
    ),
    {
      abi: z.array(z.record(z.unknown())).describe('ABI fragment array for the function (JSON array of objects)'),
      functionName: z.string().describe('Function name to encode (e.g., "transfer", "approve")'),
      args: z.array(z.any()).optional().describe('Function arguments array (e.g., ["0xAddress", "1000000"]). Omit for zero-arg functions.'),
      wallet_id: z.string().optional().describe('Target wallet ID. Omit to use the default wallet.'),
    },
    async (args) => {
      const body: Record<string, unknown> = {
        abi: args.abi,
        functionName: args.functionName,
        args: args.args ?? [],
      };
      if (args.wallet_id) body.walletId = args.wallet_id;
      const result = await apiClient.post('/v1/utils/encode-calldata', body);
      return toToolResult(result);
    },
  );
}
