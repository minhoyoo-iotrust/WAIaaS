/**
 * Tests for Action Provider -> MCP Tool auto-conversion (ACTNP-05, ACTNP-06).
 *
 * Verifies:
 * - mcpExpose=true actions are registered as MCP tools
 * - mcpExpose=false providers are ignored
 * - API failure triggers degraded mode (empty Map, built-in tools unaffected)
 * - Tool handlers call correct REST endpoints
 * - WalletContext prefixes tool descriptions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient, ApiResult } from '../api-client.js';
import { registerActionProviderTools } from '../tools/action-provider.js';

// --- Mock ApiClient factory ---

function createMockApiClient(responses: Map<string, ApiResult<unknown>>): ApiClient {
  const defaultOk: ApiResult<unknown> = { ok: true, data: { mock: true } };

  return {
    get: vi.fn(async (path: string) => responses.get(`GET:${path}`) ?? defaultOk),
    post: vi.fn(async (path: string, _body: unknown) => responses.get(`POST:${path}`) ?? defaultOk),
    put: vi.fn(async (path: string, _body: unknown) => responses.get(`PUT:${path}`) ?? defaultOk),
  } as unknown as ApiClient;
}

// --- Mock McpServer factory ---

function createMockServer(): {
  server: McpServer;
  toolCalls: Array<{ name: string; description: string; handler: (...args: unknown[]) => Promise<unknown> }>;
} {
  const toolCalls: Array<{ name: string; description: string; handler: (...args: unknown[]) => Promise<unknown> }> = [];

  const server = {
    tool: vi.fn((...args: unknown[]) => {
      // server.tool(name, description, schema, handler) -- 4 args
      const name = args[0] as string;
      const description = args[1] as string;
      const handler = args[args.length - 1] as (...a: unknown[]) => Promise<unknown>;
      toolCalls.push({ name, description, handler });

      // Return a mock RegisteredTool
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

// --- Provider fixture ---

function makeProvidersResponse(providers: Array<{
  name: string;
  mcpExpose: boolean;
  actions: Array<{ name: string; description: string; chain: string; riskLevel: string }>;
}>) {
  return {
    providers: providers.map((p) => ({
      name: p.name,
      description: `${p.name} provider`,
      version: '1.0.0',
      chains: ['solana'],
      mcpExpose: p.mcpExpose,
      requiresApiKey: false,
      hasApiKey: false,
      actions: p.actions.map((a) => ({
        ...a,
        defaultTier: 'SESSION',
      })),
    })),
  };
}

describe('registerActionProviderTools', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('mcpExpose=true 액션이 MCP 도구로 등록된다', async () => {
    const providersData = makeProvidersResponse([{
      name: 'defi',
      mcpExpose: true,
      actions: [
        { name: 'swap', description: 'Swap tokens', chain: 'solana', riskLevel: 'HIGH' },
        { name: 'stake', description: 'Stake SOL', chain: 'solana', riskLevel: 'MEDIUM' },
      ],
    }]);

    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/actions/providers', { ok: true, data: providersData }],
    ]);
    const apiClient = createMockApiClient(responses);
    const { server, toolCalls } = createMockServer();

    const result = await registerActionProviderTools(server, apiClient);

    expect(result.size).toBe(2);
    expect(server.tool).toHaveBeenCalledTimes(2);
    expect(toolCalls[0]!.name).toBe('action_defi_swap');
    expect(toolCalls[1]!.name).toBe('action_defi_stake');
    expect(result.has('action_defi_swap')).toBe(true);
    expect(result.has('action_defi_stake')).toBe(true);
  });

  it('mcpExpose=false 프로바이더는 무시된다', async () => {
    const providersData = makeProvidersResponse([
      {
        name: 'internal',
        mcpExpose: false,
        actions: [
          { name: 'hidden', description: 'Hidden action', chain: 'solana', riskLevel: 'LOW' },
        ],
      },
      {
        name: 'defi',
        mcpExpose: true,
        actions: [
          { name: 'swap', description: 'Swap tokens', chain: 'solana', riskLevel: 'HIGH' },
        ],
      },
    ]);

    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/actions/providers', { ok: true, data: providersData }],
    ]);
    const apiClient = createMockApiClient(responses);
    const { server } = createMockServer();

    const result = await registerActionProviderTools(server, apiClient);

    // Only the mcpExpose=true provider's action should be registered
    expect(result.size).toBe(1);
    expect(result.has('action_defi_swap')).toBe(true);
    expect(result.has('action_internal_hidden')).toBe(false);
  });

  it('API 호출 실패 시 빈 Map 반환 (degraded mode)', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/actions/providers', {
        ok: false,
        error: { code: 'HTTP_500', message: 'Internal server error', retryable: false },
      }],
    ]);
    const apiClient = createMockApiClient(responses);
    const { server } = createMockServer();

    const result = await registerActionProviderTools(server, apiClient);

    expect(result.size).toBe(0);
    expect(server.tool).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to fetch action providers'),
    );
  });

  it('도구 핸들러가 올바른 REST API를 호출한다', async () => {
    const providersData = makeProvidersResponse([{
      name: 'defi',
      mcpExpose: true,
      actions: [
        { name: 'swap', description: 'Swap tokens', chain: 'solana', riskLevel: 'HIGH' },
      ],
    }]);

    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/actions/providers', { ok: true, data: providersData }],
      ['POST:/v1/actions/defi/swap', { ok: true, data: { id: 'tx-1', status: 'PENDING' } }],
    ]);
    const apiClient = createMockApiClient(responses);
    const { server, toolCalls } = createMockServer();

    await registerActionProviderTools(server, apiClient);

    // Call the captured handler directly
    const swapHandler = toolCalls[0]!.handler;
    await swapHandler({ params: { amount: '100', tokenIn: 'SOL' }, network: 'devnet' });

    expect(apiClient.post).toHaveBeenCalledWith(
      '/v1/actions/defi/swap',
      { params: { amount: '100', tokenIn: 'SOL' }, network: 'devnet' },
    );
  });

  it('walletContext가 설명에 prefix로 추가된다', async () => {
    const providersData = makeProvidersResponse([{
      name: 'defi',
      mcpExpose: true,
      actions: [
        { name: 'swap', description: 'Swap tokens', chain: 'solana', riskLevel: 'HIGH' },
      ],
    }]);

    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/actions/providers', { ok: true, data: providersData }],
    ]);
    const apiClient = createMockApiClient(responses);
    const { server, toolCalls } = createMockServer();

    await registerActionProviderTools(server, apiClient, { walletName: 'trading-bot' });

    expect(toolCalls[0]!.description).toContain('[trading-bot]');
    expect(toolCalls[0]!.description).toContain('[defi]');
    expect(toolCalls[0]!.description).toContain('chain: solana');
    expect(toolCalls[0]!.description).toContain('risk: HIGH');
  });

  it('핸들러가 params/network 없이 호출될 때 빈 body로 POST한다', async () => {
    const providersData = makeProvidersResponse([{
      name: 'defi',
      mcpExpose: true,
      actions: [
        { name: 'status', description: 'Get status', chain: 'solana', riskLevel: 'LOW' },
      ],
    }]);

    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/actions/providers', { ok: true, data: providersData }],
    ]);
    const apiClient = createMockApiClient(responses);
    const { server, toolCalls } = createMockServer();

    await registerActionProviderTools(server, apiClient);

    // Call with no params and no network
    await toolCalls[0]!.handler({});

    expect(apiClient.post).toHaveBeenCalledWith('/v1/actions/defi/status', {});
  });

  it('프로바이더가 없으면 빈 Map을 반환한다', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/actions/providers', { ok: true, data: { providers: [] } }],
    ]);
    const apiClient = createMockApiClient(responses);
    const { server } = createMockServer();

    const result = await registerActionProviderTools(server, apiClient);

    expect(result.size).toBe(0);
    expect(server.tool).not.toHaveBeenCalled();
  });

  it('등록된 도구 수가 >0이면 로그를 출력한다', async () => {
    const providersData = makeProvidersResponse([{
      name: 'defi',
      mcpExpose: true,
      actions: [
        { name: 'swap', description: 'Swap', chain: 'solana', riskLevel: 'HIGH' },
      ],
    }]);

    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/actions/providers', { ok: true, data: providersData }],
    ]);
    const apiClient = createMockApiClient(responses);
    const { server } = createMockServer();

    await registerActionProviderTools(server, apiClient);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Registered 1 action provider tools'),
    );
  });
});
