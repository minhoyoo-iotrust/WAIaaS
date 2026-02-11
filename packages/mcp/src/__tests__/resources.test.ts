/**
 * Tests for all 3 MCP resources.
 *
 * Uses mock ApiClient to test resource handlers.
 * Verifies:
 * - Correct API endpoints called
 * - URI and mimeType in response
 * - toResourceResult format for all ApiResult variants
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient, ApiResult } from '../api-client.js';
import { registerWalletBalance } from '../resources/wallet-balance.js';
import { registerWalletAddress } from '../resources/wallet-address.js';
import { registerSystemStatus } from '../resources/system-status.js';

// --- Mock ApiClient ---
function createMockApiClient(responses: Map<string, ApiResult<unknown>>): ApiClient {
  const defaultOk: ApiResult<unknown> = { ok: true, data: { mock: true } };

  return {
    get: vi.fn(async (path: string) => responses.get(`GET:${path}`) ?? defaultOk),
    post: vi.fn(),
    put: vi.fn(),
  } as unknown as ApiClient;
}

// --- Resource handler extraction helper ---
function getResourceHandler(
  registerFn: (server: McpServer, apiClient: ApiClient) => void,
  apiClient: ApiClient,
): () => Promise<unknown> {
  let capturedHandler: ((_uri: unknown, _extra: unknown) => Promise<unknown>) | undefined;
  const server = {
    resource: (...fnArgs: unknown[]) => {
      // The handler is always the last argument
      capturedHandler = fnArgs[fnArgs.length - 1] as typeof capturedHandler;
    },
  } as unknown as McpServer;

  registerFn(server, apiClient);

  if (!capturedHandler) throw new Error('Handler not captured');
  const handler = capturedHandler;
  return () => handler(new URL('waiaas://test'), {}) as Promise<unknown>;
}

describe('waiaas://wallet/balance resource', () => {
  it('calls GET /v1/wallet/balance', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/wallet/balance', {
        ok: true,
        data: { balance: '5000000000', symbol: 'SOL', decimals: 9 },
      }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getResourceHandler(registerWalletBalance, apiClient);

    const result = await handler() as { contents: Array<{ uri: string; text: string; mimeType: string }> };

    expect(apiClient.get).toHaveBeenCalledWith('/v1/wallet/balance');
    expect(result.contents[0]!.uri).toBe('waiaas://wallet/balance');
    expect(result.contents[0]!.mimeType).toBe('application/json');
    const parsed = JSON.parse(result.contents[0]!.text) as Record<string, unknown>;
    expect(parsed['balance']).toBe('5000000000');
  });

  it('returns informational content on expired session', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/wallet/balance', {
        ok: false,
        expired: true,
        message: 'Session expired',
      }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getResourceHandler(registerWalletBalance, apiClient);

    const result = await handler() as { contents: Array<{ uri: string; text: string; mimeType: string }> };

    expect(result.contents[0]!.uri).toBe('waiaas://wallet/balance');
    const parsed = JSON.parse(result.contents[0]!.text) as Record<string, unknown>;
    expect(parsed['session_expired']).toBe(true);
  });

  it('returns error content on API error', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/wallet/balance', {
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'Server error', retryable: true },
      }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getResourceHandler(registerWalletBalance, apiClient);

    const result = await handler() as { contents: Array<{ text: string }> };

    const parsed = JSON.parse(result.contents[0]!.text) as Record<string, unknown>;
    expect(parsed['error']).toBe(true);
    expect(parsed['code']).toBe('INTERNAL_ERROR');
  });

  it('returns network error content', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/wallet/balance', {
        ok: false,
        networkError: true,
        message: 'Connection refused',
      }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getResourceHandler(registerWalletBalance, apiClient);

    const result = await handler() as { contents: Array<{ text: string }> };

    const parsed = JSON.parse(result.contents[0]!.text) as Record<string, unknown>;
    expect(parsed['network_error']).toBe(true);
  });
});

describe('waiaas://wallet/address resource', () => {
  it('calls GET /v1/wallet/address', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/wallet/address', {
        ok: true,
        data: { address: 'So1ana111...' },
      }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getResourceHandler(registerWalletAddress, apiClient);

    const result = await handler() as { contents: Array<{ uri: string; text: string; mimeType: string }> };

    expect(apiClient.get).toHaveBeenCalledWith('/v1/wallet/address');
    expect(result.contents[0]!.uri).toBe('waiaas://wallet/address');
    expect(result.contents[0]!.mimeType).toBe('application/json');
  });

  it('returns expired session info', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/wallet/address', {
        ok: false,
        expired: true,
        message: 'Token expired',
      }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getResourceHandler(registerWalletAddress, apiClient);

    const result = await handler() as { contents: Array<{ text: string }> };

    const parsed = JSON.parse(result.contents[0]!.text) as Record<string, unknown>;
    expect(parsed['session_expired']).toBe(true);
  });

  it('returns error on API failure', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/wallet/address', {
        ok: false,
        error: { code: 'NOT_FOUND', message: 'No wallet', retryable: false },
      }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getResourceHandler(registerWalletAddress, apiClient);

    const result = await handler() as { contents: Array<{ text: string }> };

    const parsed = JSON.parse(result.contents[0]!.text) as Record<string, unknown>;
    expect(parsed['error']).toBe(true);
  });
});

describe('waiaas://system/status resource', () => {
  it('calls GET /v1/admin/status', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/admin/status', {
        ok: true,
        data: { uptime: 3600, version: '0.0.0', killSwitch: 'NORMAL' },
      }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getResourceHandler(registerSystemStatus, apiClient);

    const result = await handler() as { contents: Array<{ uri: string; text: string; mimeType: string }> };

    expect(apiClient.get).toHaveBeenCalledWith('/v1/admin/status');
    expect(result.contents[0]!.uri).toBe('waiaas://system/status');
    expect(result.contents[0]!.mimeType).toBe('application/json');
    const parsed = JSON.parse(result.contents[0]!.text) as Record<string, unknown>;
    expect(parsed['uptime']).toBe(3600);
  });

  it('handles auth error gracefully (admin endpoint may need masterAuth)', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/admin/status', {
        ok: false,
        expired: true,
        message: 'Admin auth required',
      }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getResourceHandler(registerSystemStatus, apiClient);

    const result = await handler() as { contents: Array<{ text: string }> };

    const parsed = JSON.parse(result.contents[0]!.text) as Record<string, unknown>;
    expect(parsed['session_expired']).toBe(true);
  });

  it('returns network error content', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/admin/status', {
        ok: false,
        networkError: true,
        message: 'ECONNREFUSED',
      }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getResourceHandler(registerSystemStatus, apiClient);

    const result = await handler() as { contents: Array<{ text: string }> };

    const parsed = JSON.parse(result.contents[0]!.text) as Record<string, unknown>;
    expect(parsed['network_error']).toBe(true);
  });
});

describe('resource registration with McpServer', () => {
  let server: McpServer;
  let apiClient: ApiClient;

  beforeEach(() => {
    server = new McpServer({ name: 'test', version: '0.0.0' });
    apiClient = createMockApiClient(new Map());
  });

  it('registers wallet balance resource without error', () => {
    expect(() => registerWalletBalance(server, apiClient)).not.toThrow();
  });

  it('registers wallet address resource without error', () => {
    expect(() => registerWalletAddress(server, apiClient)).not.toThrow();
  });

  it('registers system status resource without error', () => {
    expect(() => registerSystemStatus(server, apiClient)).not.toThrow();
  });
});
