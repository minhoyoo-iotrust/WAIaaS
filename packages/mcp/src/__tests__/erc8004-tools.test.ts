/**
 * Tests for ERC-8004 MCP tools.
 *
 * Verifies:
 * - 3 read-only tools registered and call correct endpoints
 * - Query parameters passed correctly for reputation
 * - Error responses return isError=true
 */

import { describe, it, expect, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient, ApiResult } from '../api-client.js';
import { registerErc8004GetAgentInfo } from '../tools/erc8004-get-agent-info.js';
import { registerErc8004GetReputation } from '../tools/erc8004-get-reputation.js';
import { registerErc8004GetValidationStatus } from '../tools/erc8004-get-validation-status.js';

// --- Mock ApiClient factory ---
function createMockApiClient(responses: Map<string, ApiResult<unknown>>): ApiClient {
  const defaultOk: ApiResult<unknown> = { ok: true, data: { mock: true } };

  return {
    get: vi.fn(async (path: string) => responses.get(path) ?? defaultOk),
    post: vi.fn(async (path: string, _body: unknown) => responses.get(path) ?? defaultOk),
    put: vi.fn(async (path: string, _body: unknown) => responses.get(path) ?? defaultOk),
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

describe('erc8004_get_agent_info tool', () => {
  it('calls GET /v1/erc8004/agent/:agentId', async () => {
    const mockData = { agentId: '42', wallet: '0xabc', uri: 'https://example.com', metadata: {}, registryAddress: '0xreg', chainId: 1 };
    const responses = new Map<string, ApiResult<unknown>>([
      ['/v1/erc8004/agent/42', { ok: true, data: mockData }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerErc8004GetAgentInfo, apiClient);

    const result = await handler({ agent_id: '42' }) as { content: Array<{ text: string }> };

    expect(apiClient.get).toHaveBeenCalledWith('/v1/erc8004/agent/42');
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed['agentId']).toBe('42');
    expect(parsed['wallet']).toBe('0xabc');
  });

  it('returns isError=true on API error', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['/v1/erc8004/agent/999', { ok: false, error: 'Not found' }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerErc8004GetAgentInfo, apiClient);

    const result = await handler({ agent_id: '999' }) as { isError: boolean };

    expect(result.isError).toBe(true);
  });
});

describe('erc8004_get_reputation tool', () => {
  it('calls GET /v1/erc8004/agent/:agentId/reputation', async () => {
    const mockData = { agentId: '42', count: 5, score: '75', decimals: 0, tag1: '', tag2: '' };
    const responses = new Map<string, ApiResult<unknown>>([
      ['/v1/erc8004/agent/42/reputation', { ok: true, data: mockData }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerErc8004GetReputation, apiClient);

    const result = await handler({ agent_id: '42' }) as { content: Array<{ text: string }> };

    expect(apiClient.get).toHaveBeenCalledWith('/v1/erc8004/agent/42/reputation');
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed['score']).toBe('75');
    expect(parsed['count']).toBe(5);
  });

  it('passes tag1/tag2 as query params', async () => {
    const mockData = { agentId: '42', count: 2, score: '50', decimals: 0, tag1: 'reliability', tag2: 'speed' };
    const responses = new Map<string, ApiResult<unknown>>([
      ['/v1/erc8004/agent/42/reputation?tag1=reliability&tag2=speed', { ok: true, data: mockData }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerErc8004GetReputation, apiClient);

    await handler({ agent_id: '42', tag1: 'reliability', tag2: 'speed' });

    expect(apiClient.get).toHaveBeenCalledWith('/v1/erc8004/agent/42/reputation?tag1=reliability&tag2=speed');
  });
});

describe('erc8004_get_validation_status tool', () => {
  it('calls GET /v1/erc8004/validation/:requestHash', async () => {
    const mockData = { requestHash: '0xhash', validator: '0xval', agentId: '42', response: 1, responseHash: '0xrh', tag: 'audit', lastUpdate: 1000 };
    const responses = new Map<string, ApiResult<unknown>>([
      ['/v1/erc8004/validation/0xhash', { ok: true, data: mockData }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerErc8004GetValidationStatus, apiClient);

    const result = await handler({ request_hash: '0xhash' }) as { content: Array<{ text: string }> };

    expect(apiClient.get).toHaveBeenCalledWith('/v1/erc8004/validation/0xhash');
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed['requestHash']).toBe('0xhash');
    expect(parsed['validator']).toBe('0xval');
  });
});
