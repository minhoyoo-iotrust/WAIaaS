/**
 * Tests for all 6 MCP tools.
 *
 * Uses mock ApiClient to test tool handlers return correct results.
 * Verifies:
 * - Correct API endpoints called
 * - Parameters passed correctly
 * - toToolResult applied (isError behavior per H-04)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient, ApiResult } from '../api-client.js';
import { registerSendToken } from '../tools/send-token.js';
import { registerGetBalance } from '../tools/get-balance.js';
import { registerGetAddress } from '../tools/get-address.js';
import { registerListTransactions } from '../tools/list-transactions.js';
import { registerGetTransaction } from '../tools/get-transaction.js';
import { registerGetNonce } from '../tools/get-nonce.js';

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
// Register tool, then get the handler from the server internals
function getToolHandler(
  registerFn: (server: McpServer, apiClient: ApiClient) => void,
  apiClient: ApiClient,
): (args: Record<string, unknown>) => Promise<unknown> {
  // We'll capture the handler by intercepting the tool() call
  let capturedHandler: ((args: Record<string, unknown>, extra: unknown) => Promise<unknown>) | undefined;
  const server = {
    tool: (...fnArgs: unknown[]) => {
      // The handler is always the last argument
      capturedHandler = fnArgs[fnArgs.length - 1] as typeof capturedHandler;
    },
  } as unknown as McpServer;

  registerFn(server, apiClient);

  if (!capturedHandler) throw new Error('Handler not captured');
  const handler = capturedHandler;
  return (args) => handler(args, {}) as Promise<unknown>;
}

describe('send_token tool', () => {
  it('calls POST /v1/transactions/send with correct params', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['POST:/v1/transactions/send', { ok: true, data: { id: 'tx-1', status: 'PENDING' } }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerSendToken, apiClient);

    const result = await handler({ to: 'addr123', amount: '1000000' }) as { content: Array<{ text: string }> };

    expect(apiClient.post).toHaveBeenCalledWith('/v1/transactions/send', {
      to: 'addr123',
      amount: '1000000',
    });
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed['id']).toBe('tx-1');
    expect(parsed['status']).toBe('PENDING');
  });

  it('includes memo when provided', async () => {
    const apiClient = createMockApiClient(new Map());
    const handler = getToolHandler(registerSendToken, apiClient);

    await handler({ to: 'addr', amount: '100', memo: 'payment' });

    expect(apiClient.post).toHaveBeenCalledWith('/v1/transactions/send', {
      to: 'addr',
      amount: '100',
      memo: 'payment',
    });
  });

  it('excludes memo when undefined', async () => {
    const apiClient = createMockApiClient(new Map());
    const handler = getToolHandler(registerSendToken, apiClient);

    await handler({ to: 'addr', amount: '100' });

    expect(apiClient.post).toHaveBeenCalledWith('/v1/transactions/send', {
      to: 'addr',
      amount: '100',
    });
  });

  it('returns error with isError on API failure', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['POST:/v1/transactions/send', {
        ok: false,
        error: { code: 'INSUFFICIENT_BALANCE', message: 'Not enough', retryable: false },
      }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerSendToken, apiClient);

    const result = await handler({ to: 'addr', amount: '999999999' }) as {
      content: Array<{ text: string }>;
      isError?: boolean;
    };

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed['code']).toBe('INSUFFICIENT_BALANCE');
  });

  it('returns session_expired without isError (H-04)', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['POST:/v1/transactions/send', {
        ok: false,
        expired: true,
        message: 'Token expired',
      }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerSendToken, apiClient);

    const result = await handler({ to: 'addr', amount: '100' }) as {
      content: Array<{ text: string }>;
      isError?: boolean;
    };

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed['session_expired']).toBe(true);
  });
});

describe('get_balance tool', () => {
  it('calls GET /v1/wallet/balance', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/wallet/balance', {
        ok: true,
        data: { balance: '5000000000', symbol: 'SOL', decimals: 9 },
      }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerGetBalance, apiClient);

    const result = await handler({}) as { content: Array<{ text: string }> };

    expect(apiClient.get).toHaveBeenCalledWith('/v1/wallet/balance');
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed['balance']).toBe('5000000000');
  });

  it('returns networkError without isError', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/wallet/balance', {
        ok: false,
        networkError: true,
        message: 'Connection refused',
      }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerGetBalance, apiClient);

    const result = await handler({}) as {
      content: Array<{ text: string }>;
      isError?: boolean;
    };

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed['network_error']).toBe(true);
  });
});

describe('get_address tool', () => {
  it('calls GET /v1/wallet/address', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/wallet/address', {
        ok: true,
        data: { address: 'So1ana111...', chain: 'solana' },
      }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerGetAddress, apiClient);

    const result = await handler({}) as { content: Array<{ text: string }> };

    expect(apiClient.get).toHaveBeenCalledWith('/v1/wallet/address');
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed['address']).toBe('So1ana111...');
  });

  it('returns error on failure', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/wallet/address', {
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'Oops', retryable: true },
      }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerGetAddress, apiClient);

    const result = await handler({}) as { isError?: boolean };
    expect(result.isError).toBe(true);
  });
});

describe('list_transactions tool', () => {
  it('calls GET /v1/transactions without query params', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/transactions', {
        ok: true,
        data: { items: [], cursor: null, hasMore: false },
      }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerListTransactions, apiClient);

    await handler({});

    expect(apiClient.get).toHaveBeenCalledWith('/v1/transactions');
  });

  it('builds query string with limit and cursor', async () => {
    const apiClient = createMockApiClient(new Map());
    const handler = getToolHandler(registerListTransactions, apiClient);

    await handler({ limit: 10, cursor: 'abc123' });

    expect(apiClient.get).toHaveBeenCalledWith(
      expect.stringContaining('/v1/transactions?'),
    );
    const calledUrl = (apiClient.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(calledUrl).toContain('limit=10');
    expect(calledUrl).toContain('cursor=abc123');
  });

  it('builds query string with only limit', async () => {
    const apiClient = createMockApiClient(new Map());
    const handler = getToolHandler(registerListTransactions, apiClient);

    await handler({ limit: 5 });

    const calledUrl = (apiClient.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(calledUrl).toContain('limit=5');
    expect(calledUrl).not.toContain('cursor');
  });

  it('returns success result with items', async () => {
    const txData = {
      items: [
        { id: 'tx-1', status: 'CONFIRMED', amount: '100' },
        { id: 'tx-2', status: 'PENDING', amount: '200' },
      ],
      cursor: 'next-cursor',
      hasMore: true,
    };
    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/transactions', { ok: true, data: txData }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerListTransactions, apiClient);

    const result = await handler({}) as { content: Array<{ text: string }> };
    const parsed = JSON.parse(result.content[0]!.text) as { items: unknown[]; hasMore: boolean };
    expect(parsed.items).toHaveLength(2);
    expect(parsed.hasMore).toBe(true);
  });
});

describe('get_transaction tool', () => {
  it('calls GET /v1/transactions/:id', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/transactions/tx-abc', {
        ok: true,
        data: { id: 'tx-abc', status: 'CONFIRMED', txHash: '0x...' },
      }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerGetTransaction, apiClient);

    const result = await handler({ transaction_id: 'tx-abc' }) as { content: Array<{ text: string }> };

    expect(apiClient.get).toHaveBeenCalledWith('/v1/transactions/tx-abc');
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed['id']).toBe('tx-abc');
  });

  it('returns error on 404', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/transactions/nonexistent', {
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Transaction not found', retryable: false },
      }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerGetTransaction, apiClient);

    const result = await handler({ transaction_id: 'nonexistent' }) as {
      content: Array<{ text: string }>;
      isError?: boolean;
    };

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed['code']).toBe('NOT_FOUND');
  });
});

describe('get_nonce tool', () => {
  it('calls GET /v1/nonce', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/nonce', {
        ok: true,
        data: { nonce: 'random-nonce-123', expiresAt: 1700000000 },
      }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerGetNonce, apiClient);

    const result = await handler({}) as { content: Array<{ text: string }> };

    expect(apiClient.get).toHaveBeenCalledWith('/v1/nonce');
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed['nonce']).toBe('random-nonce-123');
  });

  it('returns error on failure', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/nonce', {
        ok: false,
        error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests', retryable: true },
      }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerGetNonce, apiClient);

    const result = await handler({}) as { isError?: boolean };
    expect(result.isError).toBe(true);
  });
});

describe('tool registration with McpServer', () => {
  let server: McpServer;
  let apiClient: ApiClient;

  beforeEach(() => {
    server = new McpServer({ name: 'test', version: '0.0.0' });
    apiClient = createMockApiClient(new Map());
  });

  it('registers send_token tool without error', () => {
    expect(() => registerSendToken(server, apiClient)).not.toThrow();
  });

  it('registers get_balance tool without error', () => {
    expect(() => registerGetBalance(server, apiClient)).not.toThrow();
  });

  it('registers get_address tool without error', () => {
    expect(() => registerGetAddress(server, apiClient)).not.toThrow();
  });

  it('registers list_transactions tool without error', () => {
    expect(() => registerListTransactions(server, apiClient)).not.toThrow();
  });

  it('registers get_transaction tool without error', () => {
    expect(() => registerGetTransaction(server, apiClient)).not.toThrow();
  });

  it('registers get_nonce tool without error', () => {
    expect(() => registerGetNonce(server, apiClient)).not.toThrow();
  });
});
