/**
 * Tests for DeFi position and health factor MCP tools.
 *
 * Verifies:
 * - waiaas_get_defi_positions calls GET /v1/wallet/positions
 * - waiaas_get_health_factor calls GET /v1/wallet/health-factor
 * - Query parameters are passed correctly
 */

import { describe, it, expect, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient, ApiResult } from '../api-client.js';
import { registerGetDefiPositions } from '../tools/get-defi-positions.js';
import { registerGetHealthFactor } from '../tools/get-health-factor.js';

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

// ---------------------------------------------------------------------------
// waiaas_get_defi_positions
// ---------------------------------------------------------------------------

describe('waiaas_get_defi_positions tool', () => {
  it('calls GET /v1/wallet/positions', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/wallet/positions', { ok: true, data: { walletId: 'w1', positions: [], totalValueUsd: null } }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerGetDefiPositions, apiClient);

    await handler({});

    expect(apiClient.get).toHaveBeenCalledWith('/v1/wallet/positions');
  });

  it('passes wallet_id as query param', async () => {
    const apiClient = createMockApiClient(new Map());
    const handler = getToolHandler(registerGetDefiPositions, apiClient);

    await handler({ wallet_id: 'wlt-123' });

    expect(apiClient.get).toHaveBeenCalledWith('/v1/wallet/positions?wallet_id=wlt-123');
  });

  it('registers with correct tool name', () => {
    let registeredName = '';
    const server = {
      tool: (name: string, ..._args: unknown[]) => {
        registeredName = name;
      },
    } as unknown as McpServer;

    registerGetDefiPositions(server, {} as ApiClient);

    expect(registeredName).toBe('waiaas_get_defi_positions');
  });
});

// ---------------------------------------------------------------------------
// waiaas_get_health_factor
// ---------------------------------------------------------------------------

describe('waiaas_get_health_factor tool', () => {
  it('calls GET /v1/wallet/health-factor', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/wallet/health-factor', { ok: true, data: { walletId: 'w1', factor: 2.5, status: 'safe' } }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerGetHealthFactor, apiClient);

    await handler({});

    expect(apiClient.get).toHaveBeenCalledWith('/v1/wallet/health-factor');
  });

  it('passes wallet_id and network as query params', async () => {
    const apiClient = createMockApiClient(new Map());
    const handler = getToolHandler(registerGetHealthFactor, apiClient);

    await handler({ wallet_id: 'wlt-456', network: 'ethereum-mainnet' });

    expect(apiClient.get).toHaveBeenCalledWith(
      '/v1/wallet/health-factor?wallet_id=wlt-456&network=ethereum-mainnet',
    );
  });

  it('registers with correct tool name', () => {
    let registeredName = '';
    const server = {
      tool: (name: string, ..._args: unknown[]) => {
        registeredName = name;
      },
    } as unknown as McpServer;

    registerGetHealthFactor(server, {} as ApiClient);

    expect(registeredName).toBe('waiaas_get_health_factor');
  });
});
