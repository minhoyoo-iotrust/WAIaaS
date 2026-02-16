/**
 * wc_disconnect tool: Disconnect the active WalletConnect session.
 *
 * Wraps DELETE /v1/wallet/wc/session. After disconnecting,
 * a new pairing must be initiated to reconnect.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type WalletContext, withWalletPrefix } from '../server.js';

export function registerWcDisconnect(
  server: McpServer,
  apiClient: ApiClient,
  walletContext?: WalletContext,
): void {
  server.tool(
    'wc_disconnect',
    withWalletPrefix(
      'Disconnect the active WalletConnect session. After disconnecting, a new pairing must be initiated to reconnect.',
      walletContext?.walletName,
    ),
    {},
    async () => {
      const result = await apiClient.delete('/v1/wallet/wc/session');
      return toToolResult(result);
    },
  );
}
