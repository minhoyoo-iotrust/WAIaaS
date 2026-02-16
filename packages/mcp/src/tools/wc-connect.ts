/**
 * wc_connect tool: Start WalletConnect pairing.
 *
 * Wraps POST /v1/wallet/wc/pair. Returns a WC URI + QR code
 * that the wallet owner can use to connect their external wallet.
 */

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
    {},
    async () => {
      const result = await apiClient.post('/v1/wallet/wc/pair', {});
      return toToolResult(result);
    },
  );
}
