/**
 * Tests for resolve_asset MCP tool.
 *
 * Verifies CAIP-19 asset resolution: registered tokens, unregistered tokens,
 * native assets (slip44), and invalid formats.
 */

import { describe, it, expect, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient, ApiResult } from '../api-client.js';
import { registerResolveAsset } from '../tools/resolve-asset.js';

// --- Mock ApiClient factory ---
function createMockApiClient(responses: Map<string, ApiResult<unknown>>): ApiClient {
  const defaultOk: ApiResult<unknown> = { ok: true, data: { mock: true } };

  return {
    get: vi.fn(async (path: string) => responses.get(`GET:${path}`) ?? defaultOk),
    post: vi.fn(async (path: string, _body: unknown) => responses.get(`POST:${path}`) ?? defaultOk),
    put: vi.fn(async (path: string, _body: unknown) => responses.get(`PUT:${path}`) ?? defaultOk),
  } as unknown as ApiClient;
}

// --- Tool handler extraction helper ---
function getToolHandler(
  registerFn: (server: McpServer, apiClient: ApiClient) => void,
  apiClient: ApiClient,
): (args: Record<string, unknown>) => Promise<unknown> {
  let capturedHandler: ((args: Record<string, unknown>, extra: unknown) => Promise<unknown>) | undefined;
  const server = {
    tool: (...fnArgs: unknown[]) => {
      capturedHandler = fnArgs[fnArgs.length - 1] as typeof capturedHandler;
    },
  } as unknown as McpServer;

  registerFn(server, apiClient);

  if (!capturedHandler) throw new Error('Handler not captured');
  const handler = capturedHandler;
  return (args) => handler(args, {}) as Promise<unknown>;
}

type ToolContent = { content: Array<{ type: string; text: string }>; isError?: boolean };

function parseResult(result: unknown): Record<string, unknown> {
  const r = result as ToolContent;
  return JSON.parse(r.content[0]!.text) as Record<string, unknown>;
}

describe('resolve_asset tool', () => {
  const USDC_ADDRESS = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';

  it('returns full metadata for a registered token', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      [`GET:/v1/tokens?network=eip155%3A1`, {
        ok: true,
        data: {
          network: 'ethereum-mainnet',
          tokens: [{
            address: USDC_ADDRESS,
            symbol: 'USDC',
            name: 'USD Coin',
            decimals: 6,
            source: 'builtin',
            assetId: `eip155:1/erc20:${USDC_ADDRESS}`,
            chainId: 'eip155:1',
          }],
        },
      }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerResolveAsset, apiClient);

    const result = parseResult(await handler({
      asset_id: `eip155:1/erc20:${USDC_ADDRESS}`,
    }));

    expect(result['address']).toBe(USDC_ADDRESS);
    expect(result['decimals']).toBe(6);
    expect(result['symbol']).toBe('USDC');
    expect(result['name']).toBe('USD Coin');
    expect(result['network']).toBe('eip155:1');
    expect(result['chainId']).toBe('eip155:1');
    expect(result['isNative']).toBe(false);
    expect(result['isRegistered']).toBe(true);
  });

  it('returns isRegistered=false for unregistered token', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      [`GET:/v1/tokens?network=eip155%3A1`, {
        ok: true,
        data: { network: 'ethereum-mainnet', tokens: [] },
      }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerResolveAsset, apiClient);

    const result = parseResult(await handler({
      asset_id: 'eip155:1/erc20:0xabcdef1234567890abcdef1234567890abcdef12',
    }));

    expect(result['address']).toBe('0xabcdef1234567890abcdef1234567890abcdef12');
    expect(result['decimals']).toBeNull();
    expect(result['symbol']).toBeNull();
    expect(result['name']).toBeNull();
    expect(result['isRegistered']).toBe(false);
    expect(result['isNative']).toBe(false);
    expect(result['chainId']).toBe('eip155:1');
  });

  it('returns isNative=true and address=null for slip44 native asset', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      [`GET:/v1/tokens?network=eip155%3A1`, {
        ok: true,
        data: { network: 'ethereum-mainnet', tokens: [] },
      }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerResolveAsset, apiClient);

    const result = parseResult(await handler({
      asset_id: 'eip155:1/slip44:60',
    }));

    expect(result['isNative']).toBe(true);
    expect(result['address']).toBeNull();
    expect(result['chainId']).toBe('eip155:1');
  });

  it('returns error for invalid CAIP-19 format', async () => {
    const apiClient = createMockApiClient(new Map());
    const handler = getToolHandler(registerResolveAsset, apiClient);

    const result = await handler({ asset_id: 'invalid' }) as ToolContent;

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed['error']).toBe(true);
  });

  it('always includes chainId in response', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      [`GET:/v1/tokens?network=eip155%3A137`, {
        ok: true,
        data: { network: 'polygon-mainnet', tokens: [] },
      }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerResolveAsset, apiClient);

    const result = parseResult(await handler({
      asset_id: 'eip155:137/erc20:0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
    }));

    expect(result['chainId']).toBe('eip155:137');
    expect(result['network']).toBe('eip155:137');
  });
});
