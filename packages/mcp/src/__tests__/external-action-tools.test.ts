/**
 * Tests for 2 External Action MCP tools: list_offchain_actions, list_credentials.
 *
 * Note: MCP action_* tools (via action-provider.ts registerActionProviderTools)
 * already call POST /v1/actions/:provider/:action. Off-chain actions are
 * auto-routed by the daemon via kind-based routing (INTEG-01 satisfied).
 * No MCP code changes needed for off-chain action execution.
 *
 * Verifies:
 * - Correct API endpoints called with correct parameters
 * - toToolResult applied to responses
 */

import { describe, it, expect, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient, ApiResult } from '../api-client.js';
import { registerListOffchainActions } from '../tools/list-offchain-actions.js';
import { registerListCredentials } from '../tools/list-credentials.js';

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

// =========================================================================
// list_offchain_actions
// =========================================================================

describe('list_offchain_actions tool', () => {
  it('calls GET /v1/wallets/default/actions with no params', async () => {
    const actionList = { actions: [], total: 0, limit: 20, offset: 0 };
    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/wallets/default/actions', { ok: true, data: actionList }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerListOffchainActions, apiClient);

    const result = await handler({}) as { content: Array<{ text: string }> };

    expect(apiClient.get).toHaveBeenCalledWith('/v1/wallets/default/actions');
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed['total']).toBe(0);
  });

  it('includes venue/status/limit/offset query params', async () => {
    const apiClient = createMockApiClient(new Map());
    const handler = getToolHandler(registerListOffchainActions, apiClient);

    await handler({ venue: 'polymarket', status: 'FILLED', limit: 10, offset: 5 });

    expect(apiClient.get).toHaveBeenCalledWith(
      '/v1/wallets/default/actions?venue=polymarket&status=FILLED&limit=10&offset=5',
    );
  });

  it('uses wallet_id in URL path when provided', async () => {
    const apiClient = createMockApiClient(new Map());
    const handler = getToolHandler(registerListOffchainActions, apiClient);

    await handler({ wallet_id: 'w-123', venue: 'hyperliquid' });

    expect(apiClient.get).toHaveBeenCalledWith(
      '/v1/wallets/w-123/actions?venue=hyperliquid',
    );
  });
});

// =========================================================================
// list_credentials
// =========================================================================

describe('list_credentials tool', () => {
  it('calls GET /v1/wallets/default/credentials with no params', async () => {
    const credList = [
      { id: 'cred-1', name: 'polymarket-api', type: 'api_key', walletId: 'w1', expiresAt: null, createdAt: 1000 },
    ];
    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/wallets/default/credentials', { ok: true, data: credList }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerListCredentials, apiClient);

    const result = await handler({}) as { content: Array<{ text: string }> };

    expect(apiClient.get).toHaveBeenCalledWith('/v1/wallets/default/credentials');
    const parsed = JSON.parse(result.content[0]!.text) as Array<Record<string, unknown>>;
    expect(parsed[0]!['name']).toBe('polymarket-api');
    // Credential values should never be in the response
    expect(parsed[0]!['value']).toBeUndefined();
  });

  it('uses wallet_id in URL path when provided', async () => {
    const apiClient = createMockApiClient(new Map());
    const handler = getToolHandler(registerListCredentials, apiClient);

    await handler({ wallet_id: 'w-456' });

    expect(apiClient.get).toHaveBeenCalledWith('/v1/wallets/w-456/credentials');
  });
});
