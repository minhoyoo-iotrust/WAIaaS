/**
 * Tests for MCP get_provider_status tool.
 *
 * Verifies:
 * - Returns provider info for smart account with provider
 * - Returns 'no provider' message for smart account without provider
 * - Returns 'EOA wallet' message for non-smart account
 * - Passes error through when API call fails
 */

import { describe, it, expect, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient, ApiResult } from '../api-client.js';
import { registerGetProviderStatus } from '../tools/get-provider-status.js';

function createMockApiClient(responses: Map<string, ApiResult<unknown>>): ApiClient {
  const defaultOk: ApiResult<unknown> = { ok: true, data: { mock: true } };
  return {
    get: vi.fn(async (path: string) => responses.get(path) ?? defaultOk),
    post: vi.fn(async () => defaultOk),
    put: vi.fn(async () => defaultOk),
  } as unknown as ApiClient;
}

function getToolHandler(
  apiClient: ApiClient,
): (args: Record<string, unknown>) => Promise<unknown> {
  let capturedHandler: ((args: Record<string, unknown>, extra: unknown) => Promise<unknown>) | undefined;
  const server = {
    tool: (...fnArgs: unknown[]) => {
      capturedHandler = fnArgs[fnArgs.length - 1] as typeof capturedHandler;
    },
  } as unknown as McpServer;

  registerGetProviderStatus(server, apiClient);

  if (!capturedHandler) throw new Error('Handler not captured');
  const handler = capturedHandler;
  return (args) => handler(args, {}) as Promise<unknown>;
}

describe('get_provider_status tool', () => {
  it('returns provider info for smart account with provider', async () => {
    const walletData = {
      id: 'w1',
      accountType: 'smart',
      provider: { name: 'pimlico', supportedChains: ['ethereum-mainnet', 'ethereum-sepolia'], paymasterEnabled: true },
    };
    const responses = new Map<string, ApiResult<unknown>>([
      ['/v1/wallets/w1', { ok: true, data: walletData }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(apiClient);

    const result = await handler({ wallet_id: 'w1' }) as { content: Array<{ text: string }> };

    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed['accountType']).toBe('smart');
    const provider = parsed['provider'] as Record<string, unknown>;
    expect(provider['name']).toBe('pimlico');
    expect(provider['paymasterEnabled']).toBe(true);
    expect(provider['gasSponsorshipStatus']).toContain('sponsored');
  });

  it('returns no-provider message for smart account without provider', async () => {
    const walletData = { id: 'w2', accountType: 'smart', provider: null };
    const responses = new Map<string, ApiResult<unknown>>([
      ['/v1/wallets/w2', { ok: true, data: walletData }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(apiClient);

    const result = await handler({ wallet_id: 'w2' }) as { content: Array<{ text: string }> };

    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed['accountType']).toBe('smart');
    expect(parsed['provider']).toBeNull();
    expect(parsed['message']).toContain('No provider configured');
  });

  it('returns EOA wallet message for non-smart account', async () => {
    const walletData = { id: 'w3', accountType: 'eoa', provider: null };
    const responses = new Map<string, ApiResult<unknown>>([
      ['/v1/wallets/w3', { ok: true, data: walletData }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(apiClient);

    const result = await handler({ wallet_id: 'w3' }) as { content: Array<{ text: string }> };

    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed['accountType']).toBe('eoa');
    expect(parsed['provider']).toBeNull();
    expect(parsed['message']).toContain('EOA wallet');
  });

  it('passes error through when API call fails', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['/v1/wallets/w999', { ok: false as const, error: { code: 'NOT_FOUND', message: 'Wallet not found', retryable: false } }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(apiClient);

    const result = await handler({ wallet_id: 'w999' }) as { isError: boolean };

    expect(result.isError).toBe(true);
  });
});
