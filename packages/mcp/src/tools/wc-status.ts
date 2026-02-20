/**
 * wc_status tool: Get WalletConnect session status.
 *
 * Wraps GET /v1/wallet/wc/session. Returns session info
 * (peer wallet, chain, expiry) or error if no active session.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type WalletContext, withWalletPrefix } from '../server.js';

export function registerWcStatus(
  server: McpServer,
  apiClient: ApiClient,
  walletContext?: WalletContext,
): void {
  server.tool(
    'wc_status',
    withWalletPrefix(
      'Get WalletConnect session status. Returns session info (peer wallet, chain, expiry) or error if no active session.',
      walletContext?.walletName,
    ),
    {
      wallet_id: z.string().optional().describe('Target wallet ID. Omit to use the default wallet.'),
    },
    async (args) => {
      const params = new URLSearchParams();
      if (args.wallet_id) params.set('walletId', args.wallet_id);
      const qs = params.toString();
      const result = await apiClient.get('/v1/wallet/wc/session' + (qs ? '?' + qs : ''));
      return toToolResult(result);
    },
  );
}
