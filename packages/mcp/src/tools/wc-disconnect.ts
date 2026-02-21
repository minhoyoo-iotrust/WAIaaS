/**
 * wc_disconnect tool: Disconnect the active WalletConnect session.
 *
 * Wraps DELETE /v1/wallet/wc/session. After disconnecting,
 * a new pairing must be initiated to reconnect.
 */

import { z } from 'zod';
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
    {
      wallet_id: z.string().optional().describe('Target wallet ID. Omit to use the default wallet.'),
    },
    async (args) => {
      const params = new URLSearchParams();
      if (args.wallet_id) params.set('walletId', args.wallet_id);
      const qs = params.toString();
      const result = await apiClient.delete('/v1/wallet/wc/session' + (qs ? '?' + qs : ''));
      return toToolResult(result);
    },
  );
}
