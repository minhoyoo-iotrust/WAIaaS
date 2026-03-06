/**
 * build_userop tool: Build an unsigned ERC-4337 UserOperation from a transaction request.
 *
 * Wraps POST /v1/wallets/:id/userop/build. Returns sender, nonce, callData,
 * factory/factoryData (for undeployed accounts), entryPoint, and buildId.
 * Platform fills gas/paymaster fields before signing.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type WalletContext, withWalletPrefix } from '../server.js';

export function registerBuildUserop(
  server: McpServer,
  apiClient: ApiClient,
  walletContext?: WalletContext,
): void {
  server.tool(
    'build_userop',
    withWalletPrefix(
      'Build an unsigned ERC-4337 UserOperation from a transaction request. Returns sender, nonce, callData, buildId. Platform fills gas/paymaster fields before signing.',
      walletContext?.walletName,
    ),
    {
      wallet_id: z.string().describe('Smart Account wallet ID (UUID).'),
      type: z.enum(['TRANSFER', 'TOKEN_TRANSFER', 'CONTRACT_CALL', 'APPROVE', 'BATCH']).describe('Transaction type.'),
      to: z.string().optional().describe('Recipient address.'),
      amount: z.string().optional().describe('Amount in base units (wei/lamports).'),
      token: z.string().optional().describe('Token contract address (for TOKEN_TRANSFER/APPROVE).'),
      contract: z.string().optional().describe('Contract address (for CONTRACT_CALL).'),
      method: z.string().optional().describe('Contract method name (for CONTRACT_CALL).'),
      abi: z.array(z.unknown()).optional().describe('Contract ABI (for CONTRACT_CALL).'),
      args: z.array(z.unknown()).optional().describe('Contract method args (for CONTRACT_CALL).'),
      calls: z.array(z.object({ to: z.string(), amount: z.string().optional(), data: z.string().optional() })).optional().describe('Batch calls (for BATCH type).'),
      network: z.string().describe('EVM network (e.g., "ethereum-sepolia").'),
    },
    async (args) => {
      const request: Record<string, unknown> = { type: args.type };
      if (args.to) request.to = args.to;
      if (args.amount) request.amount = args.amount;
      if (args.token) request.token = args.token;
      if (args.contract) request.contract = args.contract;
      if (args.method) request.method = args.method;
      if (args.abi) request.abi = args.abi;
      if (args.args) request.args = args.args;
      if (args.calls) request.calls = args.calls;
      const body = { request, network: args.network };
      const result = await apiClient.post(
        `/v1/wallets/${args.wallet_id}/userop/build`,
        body,
      );
      return toToolResult(result);
    },
  );
}
