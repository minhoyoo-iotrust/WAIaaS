/**
 * get_provider_status tool: Get Smart Account provider status for a wallet.
 *
 * Reads provider info from GET /v1/wallets/:id response.
 * Shows provider name, supported chains, and paymaster (gas sponsorship) status.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type WalletContext, withWalletPrefix } from '../server.js';

export function registerGetProviderStatus(server: McpServer, apiClient: ApiClient, walletContext?: WalletContext): void {
  server.tool(
    'get_provider_status',
    withWalletPrefix('Get Smart Account provider status: provider name, supported chains, gas sponsorship (paymaster) status.', walletContext?.walletName),
    {
      wallet_id: z.string().describe('Target wallet ID (UUID).'),
    },
    async (args) => {
      const result = await apiClient.get<Record<string, unknown>>(
        '/v1/wallets/' + args.wallet_id,
      );
      if (!result.ok) return toToolResult(result);

      const wallet = result.data;
      const provider = wallet['provider'] as { name: string; supportedChains: string[]; paymasterEnabled: boolean } | null;
      const accountType = (wallet['accountType'] as string) ?? 'eoa';

      if (accountType !== 'smart') {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ accountType, provider: null, message: 'This is an EOA wallet. Smart Account provider is only applicable to smart account wallets.' }) }],
        };
      }

      if (!provider) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ accountType: 'smart', provider: null, message: 'No provider configured. Use PUT /v1/wallets/:id/provider to set up a provider (pimlico, alchemy, or custom).' }) }],
        };
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          accountType: 'smart',
          provider: {
            name: provider.name,
            supportedChains: provider.supportedChains,
            paymasterEnabled: provider.paymasterEnabled,
            gasSponsorshipStatus: provider.paymasterEnabled ? 'Gas fees are sponsored by the paymaster on supported chains.' : 'No paymaster configured. Transactions require the wallet to hold native gas tokens.',
          },
        }) }],
      };
    },
  );
}
