/**
 * erc8128_sign_request tool: Sign an HTTP request using ERC-8128.
 *
 * Wraps POST /v1/erc8128/sign. Uses RFC 9421 Signature Base construction
 * with EIP-191 signing to produce Signature-Input, Signature, and
 * Content-Digest headers for the given HTTP method, URL, headers, and body.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type WalletContext, withWalletPrefix } from '../server.js';

export function registerErc8128SignRequest(
  server: McpServer,
  apiClient: ApiClient,
  walletContext?: WalletContext,
): void {
  server.tool(
    'erc8128_sign_request',
    withWalletPrefix(
      'Sign an HTTP request using ERC-8128 (RFC 9421 + EIP-191). Returns Signature-Input, Signature, and Content-Digest headers for the given HTTP method, URL, headers, and body.',
      walletContext?.walletName,
    ),
    {
      method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).describe('HTTP method'),
      url: z.string().url().describe('Target URL to sign for'),
      headers: z.record(z.string(), z.string()).optional().describe('HTTP headers to include in signature'),
      body: z.string().optional().describe('Request body (used for Content-Digest)'),
      wallet_id: z.string().optional().describe('Target wallet ID. Required for multi-wallet sessions; auto-resolved when session has a single wallet.'),
      network: z.string().optional().describe('Network ID (e.g., evm-ethereum-mainnet)'),
      preset: z.enum(['minimal', 'standard', 'strict']).optional().describe('Covered Components preset (default: standard)'),
      ttl_seconds: z.number().optional().describe('Signature TTL in seconds (default: 300)'),
    },
    async (args) => {
      const requestBody: Record<string, unknown> = {
        method: args.method,
        url: args.url,
      };
      if (args.headers) requestBody['headers'] = args.headers;
      if (args.body) requestBody['body'] = args.body;
      if (args.wallet_id) requestBody['walletId'] = args.wallet_id;
      if (args.network) requestBody['network'] = args.network;
      if (args.preset) requestBody['preset'] = args.preset;
      if (args.ttl_seconds !== undefined) requestBody['ttlSeconds'] = args.ttl_seconds;
      const result = await apiClient.post('/v1/erc8128/sign', requestBody);
      return toToolResult(result);
    },
  );
}
