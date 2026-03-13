/**
 * get_rpc_proxy_url tool: Get the EVM RPC proxy URL for a wallet and chain.
 *
 * Queries connect-info to determine if RPC proxy is enabled and constructs
 * the full URL to use as --rpc-url for Forge, Hardhat, ethers.js, or viem.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type WalletContext, withWalletPrefix } from '../server.js';

interface ConnectInfoData {
  rpcProxy?: { enabled: boolean; baseUrl: string } | null;
}

export function registerGetRpcProxyUrl(
  server: McpServer,
  apiClient: ApiClient,
  walletContext?: WalletContext,
): void {
  server.tool(
    'get_rpc_proxy_url',
    withWalletPrefix(
      'Get the EVM RPC proxy URL for a wallet and chain. Use this URL as --rpc-url for Forge, Hardhat, ethers.js, or viem.',
      walletContext?.walletName,
    ),
    {
      wallet_id: z.string().describe('Wallet ID (UUID)'),
      chain_id: z.number().describe('EVM chain ID (e.g. 1 for Ethereum mainnet, 137 for Polygon)'),
    },
    async (args) => {
      const result = await apiClient.get('/v1/connect-info');
      if (!('ok' in result) || !result.ok) {
        return toToolResult(result);
      }

      const data = result.data as ConnectInfoData;
      if (!data.rpcProxy?.enabled || !data.rpcProxy?.baseUrl) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              error: 'RPC proxy is not enabled. Ask the operator to enable it in Admin Settings.',
            }),
          }],
          isError: true,
        };
      }

      const url = `${data.rpcProxy.baseUrl}/${args.wallet_id}/${args.chain_id}`;
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            url,
            walletId: args.wallet_id,
            chainId: args.chain_id,
            usage: `Use this URL as --rpc-url: ${url}`,
          }),
        }],
      };
    },
  );
}
