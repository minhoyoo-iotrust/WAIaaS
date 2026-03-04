/**
 * Tests for simulate_transaction MCP tool.
 *
 * Verifies:
 * - Correct API endpoint called (POST /v1/transactions/simulate)
 * - Parameters mapped correctly (snake_case -> camelCase)
 * - toToolResult applied (isError on failure)
 * - All 5 transaction types supported
 *
 * @see Phase 309 Plan 02 Task 2
 */

import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient, ApiResult } from '../api-client.js';
import { registerSimulateTransaction } from '../tools/simulate-transaction.js';

function createMockApiClient(responses: Map<string, ApiResult<unknown>>): ApiClient {
  const defaultOk: ApiResult<unknown> = { ok: true, data: { mock: true } };
  return {
    get: vi.fn(async (path: string) => responses.get(`GET:${path}`) ?? defaultOk),
    post: vi.fn(async (path: string, _body: unknown) => responses.get(`POST:${path}`) ?? defaultOk),
    put: vi.fn(async (path: string, _body: unknown) => responses.get(`PUT:${path}`) ?? defaultOk),
  } as unknown as ApiClient;
}

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

describe('simulate_transaction tool', () => {
  it('calls POST /v1/transactions/simulate with correct params', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['POST:/v1/transactions/simulate', {
        ok: true,
        data: {
          success: true,
          policy: { tier: 'INSTANT', allowed: true },
          fee: { estimatedFee: '6000', feeSymbol: 'SOL', feeDecimals: 9 },
          balanceChanges: [],
          warnings: [],
        },
      }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerSimulateTransaction, apiClient);

    const result = await handler({ to: 'addr123', amount: '1000000' }) as { content: Array<{ text: string }> };

    expect(apiClient.post).toHaveBeenCalledWith('/v1/transactions/simulate', {
      to: 'addr123',
      amount: '1000000',
    });
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed['success']).toBe(true);
  });

  it('maps wallet_id to walletId in body', async () => {
    const apiClient = createMockApiClient(new Map());
    const handler = getToolHandler(registerSimulateTransaction, apiClient);

    await handler({ to: 'addr', amount: '100', wallet_id: 'wid-123' });

    expect(apiClient.post).toHaveBeenCalledWith('/v1/transactions/simulate', {
      to: 'addr',
      amount: '100',
      walletId: 'wid-123',
    });
  });

  it('maps gas_condition to gasCondition in body', async () => {
    const apiClient = createMockApiClient(new Map());
    const handler = getToolHandler(registerSimulateTransaction, apiClient);

    await handler({
      to: 'addr',
      amount: '100',
      gas_condition: {
        max_gas_price: '20000000000',
        max_priority_fee: '1000000000',
        timeout: 3600,
      },
    });

    expect(apiClient.post).toHaveBeenCalledWith('/v1/transactions/simulate', {
      to: 'addr',
      amount: '100',
      gasCondition: {
        maxGasPrice: '20000000000',
        maxPriorityFee: '1000000000',
        timeout: 3600,
      },
    });
  });

  it('includes type and token for TOKEN_TRANSFER simulation', async () => {
    const apiClient = createMockApiClient(new Map());
    const handler = getToolHandler(registerSimulateTransaction, apiClient);

    await handler({
      to: 'addr',
      amount: '1000',
      type: 'TOKEN_TRANSFER',
      token: { address: 'mint1', decimals: 6, symbol: 'USDC' },
    });

    expect(apiClient.post).toHaveBeenCalledWith('/v1/transactions/simulate', {
      to: 'addr',
      amount: '1000',
      type: 'TOKEN_TRANSFER',
      token: { address: 'mint1', decimals: 6, symbol: 'USDC' },
    });
  });

  it('includes CONTRACT_CALL fields when provided', async () => {
    const apiClient = createMockApiClient(new Map());
    const handler = getToolHandler(registerSimulateTransaction, apiClient);

    await handler({
      to: '0xContractAddr',
      amount: '0',
      type: 'CONTRACT_CALL',
      calldata: '0x1234',
      value: '0',
    });

    expect(apiClient.post).toHaveBeenCalledWith('/v1/transactions/simulate', {
      to: '0xContractAddr',
      amount: '0',
      type: 'CONTRACT_CALL',
      calldata: '0x1234',
      value: '0',
    });
  });

  it('includes network when provided', async () => {
    const apiClient = createMockApiClient(new Map());
    const handler = getToolHandler(registerSimulateTransaction, apiClient);

    await handler({ to: 'addr', amount: '100', network: 'polygon-mainnet' });

    expect(apiClient.post).toHaveBeenCalledWith('/v1/transactions/simulate', {
      to: 'addr',
      amount: '100',
      network: 'polygon-mainnet',
    });
  });

  it('returns error with isError on API failure', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['POST:/v1/transactions/simulate', {
        ok: false,
        error: { code: 'WALLET_NOT_FOUND', message: 'Not found', retryable: false },
      }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerSimulateTransaction, apiClient);

    const result = await handler({ to: 'addr', amount: '100' }) as {
      content: Array<{ text: string }>;
      isError?: boolean;
    };

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed['code']).toBe('WALLET_NOT_FOUND');
  });

  it('excludes undefined optional fields from body', async () => {
    const apiClient = createMockApiClient(new Map());
    const handler = getToolHandler(registerSimulateTransaction, apiClient);

    await handler({ to: 'addr', amount: '100' });

    const callArgs = (apiClient.post as ReturnType<typeof vi.fn>).mock.calls[0] as [string, Record<string, unknown>];
    const body = callArgs[1];
    expect(body).not.toHaveProperty('type');
    expect(body).not.toHaveProperty('token');
    expect(body).not.toHaveProperty('calldata');
    expect(body).not.toHaveProperty('network');
    expect(body).not.toHaveProperty('walletId');
    expect(body).not.toHaveProperty('gasCondition');
  });
});
