/**
 * x402_fetch tool: Fetch a URL with automatic x402 payment.
 *
 * Wraps POST /v1/x402/fetch. If the target server responds with HTTP 402,
 * the daemon automatically signs a cryptocurrency payment and retries.
 * Returns the response along with payment details if payment was made.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type WalletContext, withWalletPrefix } from '../server.js';

export function registerX402Fetch(
  server: McpServer,
  apiClient: ApiClient,
  walletContext?: WalletContext,
): void {
  server.tool(
    'x402_fetch',
    withWalletPrefix(
      'Fetch a URL with automatic x402 payment. If the server responds with HTTP 402, automatically sign a cryptocurrency payment and retry. Returns the response along with payment details if payment was made.',
      walletContext?.walletName,
    ),
    {
      url: z.string().url().describe('Target URL to fetch (HTTPS required)'),
      method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).optional()
        .describe('HTTP method (default: GET)'),
      headers: z.record(z.string()).optional()
        .describe('Additional HTTP headers'),
      body: z.string().optional()
        .describe('Request body string'),
    },
    async (args) => {
      const requestBody: Record<string, unknown> = { url: args.url };
      if (args.method) requestBody['method'] = args.method;
      if (args.headers) requestBody['headers'] = args.headers;
      if (args.body) requestBody['body'] = args.body;
      const result = await apiClient.post('/v1/x402/fetch', requestBody);
      return toToolResult(result);
    },
  );
}
