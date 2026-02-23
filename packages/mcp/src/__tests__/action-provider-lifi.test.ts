/**
 * Tests for LI.FI Action Provider -> MCP Tool auto-registration (INTG-01).
 *
 * Verifies the existing registerActionProviderTools() mechanism works correctly
 * for the LiFi provider's 2 actions: cross_swap and bridge.
 *
 * Uses the same mock patterns from action-provider.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient, ApiResult } from '../api-client.js';
import { registerActionProviderTools } from '../tools/action-provider.js';

// --- Mock ApiClient factory (reused from action-provider.test.ts) ---

function createMockApiClient(responses: Map<string, ApiResult<unknown>>): ApiClient {
  const defaultOk: ApiResult<unknown> = { ok: true, data: { mock: true } };

  return {
    get: vi.fn(async (path: string) => responses.get(`GET:${path}`) ?? defaultOk),
    post: vi.fn(async (path: string, _body: unknown) => responses.get(`POST:${path}`) ?? defaultOk),
    put: vi.fn(async (path: string, _body: unknown) => responses.get(`PUT:${path}`) ?? defaultOk),
  } as unknown as ApiClient;
}

// --- Mock McpServer factory (reused from action-provider.test.ts) ---

function createMockServer(): {
  server: McpServer;
  toolCalls: Array<{ name: string; description: string; handler: (...args: unknown[]) => Promise<unknown> }>;
} {
  const toolCalls: Array<{ name: string; description: string; handler: (...args: unknown[]) => Promise<unknown> }> = [];

  const server = {
    tool: vi.fn((...args: unknown[]) => {
      const name = args[0] as string;
      const description = args[1] as string;
      const handler = args[args.length - 1] as (...a: unknown[]) => Promise<unknown>;
      toolCalls.push({ name, description, handler });

      return {
        enabled: true,
        enable: vi.fn(),
        disable: vi.fn(),
        remove: vi.fn(),
        update: vi.fn(),
      } as unknown as RegisteredTool;
    }),
  } as unknown as McpServer;

  return { server, toolCalls };
}

// --- LiFi provider fixture ---

function makeLiFiProvidersResponse() {
  return {
    providers: [
      {
        name: 'lifi',
        description: 'LI.FI cross-chain bridge and swap aggregator (100+ bridges, 40+ chains)',
        version: '1.0.0',
        chains: ['ethereum', 'solana'],
        mcpExpose: true,
        requiresApiKey: false,
        hasApiKey: false,
        actions: [
          {
            name: 'cross_swap',
            description: 'Cross-chain bridge and swap via LI.FI aggregator',
            chain: 'ethereum',
            riskLevel: 'high',
            defaultTier: 'DELAY',
          },
          {
            name: 'bridge',
            description: 'Simple cross-chain bridge via LI.FI',
            chain: 'ethereum',
            riskLevel: 'high',
            defaultTier: 'DELAY',
          },
        ],
      },
    ],
  };
}

describe('registerActionProviderTools (LiFi)', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('LiFi provider with mcpExpose=true registers 2 MCP tools', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/actions/providers', { ok: true, data: makeLiFiProvidersResponse() }],
    ]);
    const apiClient = createMockApiClient(responses);
    const { server, toolCalls } = createMockServer();

    const result = await registerActionProviderTools(server, apiClient);

    expect(result.size).toBe(2);
    expect(server.tool).toHaveBeenCalledTimes(2);
    expect(toolCalls[0]!.name).toBe('action_lifi_cross_swap');
    expect(toolCalls[1]!.name).toBe('action_lifi_bridge');
    expect(result.has('action_lifi_cross_swap')).toBe(true);
    expect(result.has('action_lifi_bridge')).toBe(true);
  });

  it('action_lifi_cross_swap handler calls POST /v1/actions/lifi/cross_swap', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/actions/providers', { ok: true, data: makeLiFiProvidersResponse() }],
      ['POST:/v1/actions/lifi/cross_swap', {
        ok: true,
        data: { id: 'tx-bridge-1', status: 'PENDING' },
      }],
    ]);
    const apiClient = createMockApiClient(responses);
    const { server, toolCalls } = createMockServer();

    await registerActionProviderTools(server, apiClient);

    const crossSwapHandler = toolCalls[0]!.handler;
    await crossSwapHandler({
      params: {
        fromChain: 'solana',
        toChain: 'base',
        fromToken: 'So11111111111111111111111111111111111111112',
        toToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        fromAmount: '1000000000',
      },
      network: 'solana-mainnet',
    });

    expect(apiClient.post).toHaveBeenCalledWith(
      '/v1/actions/lifi/cross_swap',
      {
        params: {
          fromChain: 'solana',
          toChain: 'base',
          fromToken: 'So11111111111111111111111111111111111111112',
          toToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          fromAmount: '1000000000',
        },
        network: 'solana-mainnet',
      },
    );
  });

  it('action_lifi_bridge handler calls POST /v1/actions/lifi/bridge', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/actions/providers', { ok: true, data: makeLiFiProvidersResponse() }],
      ['POST:/v1/actions/lifi/bridge', {
        ok: true,
        data: { id: 'tx-bridge-2', status: 'PENDING' },
      }],
    ]);
    const apiClient = createMockApiClient(responses);
    const { server, toolCalls } = createMockServer();

    await registerActionProviderTools(server, apiClient);

    const bridgeHandler = toolCalls[1]!.handler;
    await bridgeHandler({
      params: {
        fromChain: 'ethereum',
        toChain: 'arbitrum',
        fromToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        toToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        fromAmount: '100000000',
      },
    });

    expect(apiClient.post).toHaveBeenCalledWith(
      '/v1/actions/lifi/bridge',
      {
        params: {
          fromChain: 'ethereum',
          toChain: 'arbitrum',
          fromToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          toToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          fromAmount: '100000000',
        },
      },
    );
  });

  it('LiFi tools pass network and wallet_id correctly', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/actions/providers', { ok: true, data: makeLiFiProvidersResponse() }],
      ['POST:/v1/actions/lifi/cross_swap', { ok: true, data: { id: 'tx-1', status: 'PENDING' } }],
    ]);
    const apiClient = createMockApiClient(responses);
    const { server, toolCalls } = createMockServer();

    await registerActionProviderTools(server, apiClient);

    const crossSwapHandler = toolCalls[0]!.handler;
    await crossSwapHandler({
      params: {
        fromChain: 'ethereum',
        toChain: 'base',
        fromToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        toToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        fromAmount: '500000000',
      },
      network: 'base-mainnet',
      wallet_id: 'w-123',
    });

    expect(apiClient.post).toHaveBeenCalledWith(
      '/v1/actions/lifi/cross_swap',
      {
        params: {
          fromChain: 'ethereum',
          toChain: 'base',
          fromToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          toToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          fromAmount: '500000000',
        },
        network: 'base-mainnet',
        walletId: 'w-123',
      },
    );
  });

  it('LiFi tool descriptions include chain and risk info', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/actions/providers', { ok: true, data: makeLiFiProvidersResponse() }],
    ]);
    const apiClient = createMockApiClient(responses);
    const { server, toolCalls } = createMockServer();

    await registerActionProviderTools(server, apiClient);

    // Both tools should have chain and risk info in description
    for (const tool of toolCalls) {
      expect(tool.description).toContain('chain:');
      expect(tool.description).toContain('risk: high');
      expect(tool.description).toContain('[lifi]');
    }
  });
});
