/**
 * erc8128_verify_signature tool: Verify an ERC-8128 HTTP message signature.
 *
 * Wraps POST /v1/erc8128/verify. Checks RFC 9421 signature validity,
 * recovers the signer's Ethereum address, and validates expiry.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type WalletContext, withWalletPrefix } from '../server.js';

export function registerErc8128VerifySignature(
  server: McpServer,
  apiClient: ApiClient,
  walletContext?: WalletContext,
): void {
  server.tool(
    'erc8128_verify_signature',
    withWalletPrefix(
      'Verify an ERC-8128 HTTP message signature. Checks RFC 9421 signature validity, recovers the signer\'s Ethereum address, and validates expiry.',
      walletContext?.walletName,
    ),
    {
      method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).describe('HTTP method'),
      url: z.string().url().describe('Request URL'),
      headers: z.record(z.string(), z.string()).describe('HTTP headers from the signed request'),
      signature_input: z.string().describe('Signature-Input header value'),
      signature: z.string().describe('Signature header value'),
      content_digest: z.string().optional().describe('Content-Digest header value'),
    },
    async (args) => {
      // Merge signature headers into the headers dict (REST API extracts from headers)
      const headers = { ...args.headers };
      headers['signature-input'] = args.signature_input;
      headers['signature'] = args.signature;
      if (args.content_digest) headers['content-digest'] = args.content_digest;

      const requestBody: Record<string, unknown> = {
        method: args.method,
        url: args.url,
        headers,
      };
      const result = await apiClient.post('/v1/erc8128/verify', requestBody);
      return toToolResult(result);
    },
  );
}
