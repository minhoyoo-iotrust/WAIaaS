/**
 * list_credentials tool: List credential metadata for a wallet (names, types, expiry -- never shows values).
 *
 * Credential values are AES-256-GCM encrypted at rest and never exposed via API.
 * This tool returns only metadata (name, type, expiresAt, createdAt).
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type WalletContext, withWalletPrefix } from '../server.js';

export function registerListCredentials(
  server: McpServer,
  apiClient: ApiClient,
  walletContext?: WalletContext,
): void {
  server.tool(
    'list_credentials',
    withWalletPrefix(
      'List credential metadata for a wallet (names, types, expiry -- never shows values).',
      walletContext?.walletName,
    ),
    {
      wallet_id: z.string().optional().describe('Wallet ID. Auto-resolved for single-wallet sessions.'),
    },
    async (args) => {
      const walletId = args.wallet_id || 'default';
      const result = await apiClient.get(`/v1/wallets/${walletId}/credentials`);
      return toToolResult(result);
    },
  );
}
