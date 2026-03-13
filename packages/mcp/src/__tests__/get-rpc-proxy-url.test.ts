/**
 * Tests for MCP get_rpc_proxy_url tool.
 *
 * Verifies:
 * - Correct URL construction when rpcProxy is enabled
 * - Error message when rpcProxy is disabled
 * - Tool registration with correct name and parameters
 */

import { describe, it, expect, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient, ApiResult } from '../api-client.js';
import { registerGetRpcProxyUrl } from '../tools/get-rpc-proxy-url.js';

// --- Mock ApiClient factory ---
function createMockApiClient(connectInfoData: unknown): ApiClient {
  return {
    get: vi.fn(async () => ({ ok: true, data: connectInfoData }) as ApiResult<unknown>),
    post: vi.fn(),
    put: vi.fn(),
  } as unknown as ApiClient;
}

// --- Tool handler extraction helper ---
function getToolHandler(
  apiClient: ApiClient,
): (args: Record<string, unknown>) => Promise<unknown> {
  let capturedHandler: ((args: Record<string, unknown>, extra: unknown) => Promise<unknown>) | undefined;
  const server = {
    tool: (...fnArgs: unknown[]) => {
      capturedHandler = fnArgs[fnArgs.length - 1] as typeof capturedHandler;
    },
  } as unknown as McpServer;

  registerGetRpcProxyUrl(server, apiClient);
  if (!capturedHandler) throw new Error('Handler not captured');
  const handler = capturedHandler;
  return (args) => handler(args, {}) as Promise<unknown>;
}

// --- Tests ---

describe('get_rpc_proxy_url tool', () => {
  it('returns correct URL when rpcProxy is enabled', async () => {
    const apiClient = createMockApiClient({
      rpcProxy: { enabled: true, baseUrl: 'http://localhost:3100/v1/rpc-evm' },
    });
    const handler = getToolHandler(apiClient);

    const result = await handler({
      wallet_id: 'wallet-abc',
      chain_id: 1,
    }) as { content: Array<{ text: string }> };

    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.url).toBe('http://localhost:3100/v1/rpc-evm/wallet-abc/1');
    expect(parsed.walletId).toBe('wallet-abc');
    expect(parsed.chainId).toBe(1);
  });

  it('returns error message when rpcProxy is disabled', async () => {
    const apiClient = createMockApiClient({
      rpcProxy: null,
    });
    const handler = getToolHandler(apiClient);

    const result = await handler({
      wallet_id: 'wallet-abc',
      chain_id: 1,
    }) as { content: Array<{ text: string }>; isError: boolean };

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.error).toContain('not enabled');
  });

  it('constructs URL with correct chainId parameter', async () => {
    const apiClient = createMockApiClient({
      rpcProxy: { enabled: true, baseUrl: 'http://localhost:3100/v1/rpc-evm' },
    });
    const handler = getToolHandler(apiClient);

    const result = await handler({
      wallet_id: 'wallet-xyz',
      chain_id: 137,
    }) as { content: Array<{ text: string }> };

    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.url).toBe('http://localhost:3100/v1/rpc-evm/wallet-xyz/137');
  });

  it('registers tool with correct name', () => {
    let capturedName: string | undefined;
    const server = {
      tool: (name: string, ..._args: unknown[]) => {
        capturedName = name;
      },
    } as unknown as McpServer;

    const apiClient = createMockApiClient({});
    registerGetRpcProxyUrl(server, apiClient);

    expect(capturedName).toBe('get_rpc_proxy_url');
  });
});
