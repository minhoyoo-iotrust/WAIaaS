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
      headers: z.record(z.string()).describe('HTTP headers from the signed request'),
      signature_input: z.string().describe('Signature-Input header value'),
      signature: z.string().describe('Signature header value'),
      content_digest: z.string().optional().describe('Content-Digest header value'),
    },
    async (args) => {
      const requestBody: Record<string, unknown> = {
        method: args.method,
        url: args.url,
        headers: args.headers,
        signatureInput: args.signature_input,
        signature: args.signature,
      };
      if (args.content_digest) requestBody['contentDigest'] = args.content_digest;
      const result = await apiClient.post('/v1/erc8128/verify', requestBody);
      return toToolResult(result);
    },
  );
}
