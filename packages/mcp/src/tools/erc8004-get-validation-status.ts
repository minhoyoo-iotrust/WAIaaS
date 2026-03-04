/**
 * erc8004_get_validation_status tool: Get ERC-8004 validation request status.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type WalletContext, withWalletPrefix } from '../server.js';

export function registerErc8004GetValidationStatus(server: McpServer, apiClient: ApiClient, walletContext?: WalletContext): void {
  server.tool(
    'erc8004_get_validation_status',
    withWalletPrefix('Get ERC-8004 validation request status.', walletContext?.walletName),
    {
      request_hash: z.string().describe('Validation request hash (bytes32)'),
    },
    async (args) => {
      const result = await apiClient.get(`/v1/erc8004/validation/${args.request_hash}`);
      return toToolResult(result);
    },
  );
}
