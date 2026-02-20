/**
 * wc_connect tool: Start WalletConnect pairing.
 *
 * Wraps POST /v1/wallet/wc/pair. Returns a WC URI + QR code
 * that the wallet owner can use to connect their external wallet.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type WalletContext, withWalletPrefix } from '../server.js';

export function registerWcConnect(
  server: McpServer,
  apiClient: ApiClient,
  walletContext?: WalletContext,
): void {
  server.tool(
    'wc_connect',
    withWalletPrefix(
      "Start WalletConnect pairing. Returns a WC URI that the wallet owner can use to connect their external wallet (D'CENT, MetaMask, Phantom, etc). Share the URI with the user -- they can paste it into their wallet app.",
      walletContext?.walletName,
    ),
    {
      wallet_id: z.string().optional().describe('Target wallet ID. Omit to use the default wallet.'),
    },
    async (args) => {
      const body: Record<string, unknown> = {};
      if (args.wallet_id) body.walletId = args.wallet_id;
      const result = await apiClient.post('/v1/wallet/wc/pair', body);
      return toToolResult(result);
    },
  );
}
