/**
 * Tests for all 11 MCP tools.
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
import { registerGetAssets } from '../tools/get-assets.js';
import { registerListTransactions } from '../tools/list-transactions.js';
import { registerGetTransaction } from '../tools/get-transaction.js';
import { registerGetNonce } from '../tools/get-nonce.js';
import { registerCallContract } from '../tools/call-contract.js';
import { registerApproveToken } from '../tools/approve-token.js';
import { registerSendBatch } from '../tools/send-batch.js';
import { registerGetWalletInfo } from '../tools/get-wallet-info.js';
import { registerSetDefaultNetwork } from '../tools/set-default-network.js';

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

  it('sends type and token fields when type=TOKEN_TRANSFER', async () => {
    const apiClient = createMockApiClient(new Map());
    const handler = getToolHandler(registerSendToken, apiClient);

    await handler({
      to: 'addr',
      amount: '1000',
      type: 'TOKEN_TRANSFER',
      token: { address: 'mint1', decimals: 6, symbol: 'USDC' },
    });

    expect(apiClient.post).toHaveBeenCalledWith('/v1/transactions/send', {
      to: 'addr',
      amount: '1000',
      type: 'TOKEN_TRANSFER',
      token: { address: 'mint1', decimals: 6, symbol: 'USDC' },
    });
  });

  it('sends legacy body without type/token when omitted (backward compat)', async () => {
    const apiClient = createMockApiClient(new Map());
    const handler = getToolHandler(registerSendToken, apiClient);

    await handler({ to: 'addr', amount: '1000' });

    expect(apiClient.post).toHaveBeenCalledWith('/v1/transactions/send', {
      to: 'addr',
      amount: '1000',
    });
  });

  it('sends type field in body when type=TRANSFER with memo', async () => {
    const apiClient = createMockApiClient(new Map());
    const handler = getToolHandler(registerSendToken, apiClient);

    await handler({ to: 'addr', amount: '1000', type: 'TRANSFER', memo: 'test' });

    expect(apiClient.post).toHaveBeenCalledWith('/v1/transactions/send', {
      to: 'addr',
      amount: '1000',
      type: 'TRANSFER',
      memo: 'test',
    });
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

  it('includes network in body when specified', async () => {
    const apiClient = createMockApiClient(new Map());
    const handler = getToolHandler(registerSendToken, apiClient);

    await handler({ to: 'addr', amount: '100', network: 'polygon-mainnet' });

    expect(apiClient.post).toHaveBeenCalledWith('/v1/transactions/send', {
      to: 'addr',
      amount: '100',
      network: 'polygon-mainnet',
    });
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

  it('appends network query parameter when specified', async () => {
    const apiClient = createMockApiClient(new Map());
    const handler = getToolHandler(registerGetBalance, apiClient);

    await handler({ network: 'ethereum-sepolia' });

    expect(apiClient.get).toHaveBeenCalledWith('/v1/wallet/balance?network=ethereum-sepolia');
  });

  it('calls without query when network not specified', async () => {
    const apiClient = createMockApiClient(new Map());
    const handler = getToolHandler(registerGetBalance, apiClient);

    await handler({});

    expect(apiClient.get).toHaveBeenCalledWith('/v1/wallet/balance');
  });

  it('passes network=all query parameter for aggregate balance', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/wallet/balance?network=all', {
        ok: true,
        data: {
          walletId: 'w1', chain: 'ethereum', environment: 'testnet',
          balances: [
            { network: 'ethereum-sepolia', balance: '500', decimals: 18, symbol: 'ETH' },
            { network: 'polygon-amoy', balance: '100', decimals: 18, symbol: 'POL' },
          ],
        },
      }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerGetBalance, apiClient);

    const result = await handler({ network: 'all' }) as { content: Array<{ text: string }> };

    expect(apiClient.get).toHaveBeenCalledWith('/v1/wallet/balance?network=all');
    const parsed = JSON.parse(result.content[0]!.text) as { balances: unknown[] };
    expect(parsed.balances).toHaveLength(2);
  });
});

describe('get_assets tool', () => {
  it('calls GET /v1/wallet/assets', async () => {
    const assetsData = {
      walletId: 'wallet-1',
      chain: 'solana',
      network: 'devnet',
      assets: [
        { mint: null, symbol: 'SOL', name: 'Solana', balance: '5000000000', decimals: 9, isNative: true, usdValue: null },
        { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC', name: 'USD Coin', balance: '1000000', decimals: 6, isNative: false, usdValue: null },
      ],
    };
    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/wallet/assets', { ok: true, data: assetsData }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerGetAssets, apiClient);

    const result = await handler({}) as { content: Array<{ text: string }> };

    expect(apiClient.get).toHaveBeenCalledWith('/v1/wallet/assets');
    const parsed = JSON.parse(result.content[0]!.text) as { assets: unknown[] };
    expect(parsed.assets).toHaveLength(2);
  });

  it('returns error on failure', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/wallet/assets', {
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'RPC error', retryable: true },
      }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerGetAssets, apiClient);

    const result = await handler({}) as { isError?: boolean };
    expect(result.isError).toBe(true);
  });

  it('appends network query parameter when specified', async () => {
    const apiClient = createMockApiClient(new Map());
    const handler = getToolHandler(registerGetAssets, apiClient);

    await handler({ network: 'polygon-mainnet' });

    expect(apiClient.get).toHaveBeenCalledWith('/v1/wallet/assets?network=polygon-mainnet');
  });

  it('passes network=all query parameter for aggregate assets', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/wallet/assets?network=all', {
        ok: true,
        data: {
          walletId: 'w1', chain: 'ethereum', environment: 'testnet',
          networkAssets: [
            { network: 'ethereum-sepolia', assets: [{ mint: '0x0', symbol: 'ETH', name: 'Ether', balance: '100', decimals: 18, isNative: true }] },
          ],
        },
      }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerGetAssets, apiClient);

    const result = await handler({ network: 'all' }) as { content: Array<{ text: string }> };

    expect(apiClient.get).toHaveBeenCalledWith('/v1/wallet/assets?network=all');
    const parsed = JSON.parse(result.content[0]!.text) as { networkAssets: unknown[] };
    expect(parsed.networkAssets).toHaveLength(1);
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

describe('call_contract tool', () => {
  it('calls POST /v1/transactions/send with CONTRACT_CALL type and EVM params', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['POST:/v1/transactions/send', { ok: true, data: { id: 'tx-cc-1', status: 'PENDING' } }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerCallContract, apiClient);

    const result = await handler({ to: '0xContractAddr', calldata: '0xabcdef', value: '1000' }) as { content: Array<{ text: string }> };

    expect(apiClient.post).toHaveBeenCalledWith('/v1/transactions/send', {
      type: 'CONTRACT_CALL',
      to: '0xContractAddr',
      calldata: '0xabcdef',
      value: '1000',
    });
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed['id']).toBe('tx-cc-1');
  });

  it('calls POST with Solana params (programId, instructionData, accounts)', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['POST:/v1/transactions/send', { ok: true, data: { id: 'tx-cc-2', status: 'PENDING' } }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerCallContract, apiClient);

    const result = await handler({
      to: 'ProgramAddr',
      programId: 'Prog1',
      instructionData: 'base64data',
      accounts: [{ pubkey: 'pk1', isSigner: true, isWritable: true }],
    }) as { content: Array<{ text: string }> };

    expect(apiClient.post).toHaveBeenCalledWith('/v1/transactions/send', {
      type: 'CONTRACT_CALL',
      to: 'ProgramAddr',
      programId: 'Prog1',
      instructionData: 'base64data',
      accounts: [{ pubkey: 'pk1', isSigner: true, isWritable: true }],
    });
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed['id']).toBe('tx-cc-2');
  });

  it('returns error with isError on policy rejection', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['POST:/v1/transactions/send', {
        ok: false,
        error: { code: 'CONTRACT_NOT_WHITELISTED', message: 'Contract not in whitelist', retryable: false },
      }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerCallContract, apiClient);

    const result = await handler({ to: '0xMalicious' }) as {
      content: Array<{ text: string }>;
      isError?: boolean;
    };

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed['code']).toBe('CONTRACT_NOT_WHITELISTED');
  });

  it('omits undefined optional fields from body', async () => {
    const apiClient = createMockApiClient(new Map());
    const handler = getToolHandler(registerCallContract, apiClient);

    await handler({ to: '0xAddr' });

    expect(apiClient.post).toHaveBeenCalledWith('/v1/transactions/send', {
      type: 'CONTRACT_CALL',
      to: '0xAddr',
    });
  });

  it('includes network in body when specified', async () => {
    const apiClient = createMockApiClient(new Map());
    const handler = getToolHandler(registerCallContract, apiClient);

    await handler({ to: '0xAddr', network: 'arbitrum-mainnet' });

    expect(apiClient.post).toHaveBeenCalledWith('/v1/transactions/send', {
      type: 'CONTRACT_CALL',
      to: '0xAddr',
      network: 'arbitrum-mainnet',
    });
  });
});

describe('approve_token tool', () => {
  it('calls POST /v1/transactions/send with APPROVE type', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['POST:/v1/transactions/send', { ok: true, data: { id: 'tx-ap-1', status: 'PENDING' } }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerApproveToken, apiClient);

    const result = await handler({
      spender: '0xSpenderAddr',
      token: { address: '0xTokenAddr', decimals: 18, symbol: 'USDT' },
      amount: '1000000',
    }) as { content: Array<{ text: string }> };

    expect(apiClient.post).toHaveBeenCalledWith('/v1/transactions/send', {
      type: 'APPROVE',
      spender: '0xSpenderAddr',
      token: { address: '0xTokenAddr', decimals: 18, symbol: 'USDT' },
      amount: '1000000',
    });
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed['id']).toBe('tx-ap-1');
  });

  it('returns error on SPENDER_NOT_APPROVED policy rejection', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['POST:/v1/transactions/send', {
        ok: false,
        error: { code: 'SPENDER_NOT_APPROVED', message: 'Spender not in approved list', retryable: false },
      }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerApproveToken, apiClient);

    const result = await handler({
      spender: '0xBadSpender',
      token: { address: '0xToken', decimals: 18, symbol: 'TK' },
      amount: '100',
    }) as { isError?: boolean };

    expect(result.isError).toBe(true);
  });

  it('includes network in body when specified', async () => {
    const apiClient = createMockApiClient(new Map());
    const handler = getToolHandler(registerApproveToken, apiClient);

    await handler({
      spender: '0xSpender',
      token: { address: '0xToken', decimals: 18, symbol: 'TK' },
      amount: '100',
      network: 'base-mainnet',
    });

    expect(apiClient.post).toHaveBeenCalledWith('/v1/transactions/send', {
      type: 'APPROVE',
      spender: '0xSpender',
      token: { address: '0xToken', decimals: 18, symbol: 'TK' },
      amount: '100',
      network: 'base-mainnet',
    });
  });
});

describe('send_batch tool', () => {
  it('calls POST /v1/transactions/send with BATCH type and instructions', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['POST:/v1/transactions/send', { ok: true, data: { id: 'tx-batch-1', status: 'PENDING' } }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerSendBatch, apiClient);

    const result = await handler({
      instructions: [
        { to: 'addr1', amount: '100' },
        { to: 'addr2', amount: '200' },
      ],
    }) as { content: Array<{ text: string }> };

    expect(apiClient.post).toHaveBeenCalledWith('/v1/transactions/send', {
      type: 'BATCH',
      instructions: [
        { to: 'addr1', amount: '100' },
        { to: 'addr2', amount: '200' },
      ],
    });
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed['id']).toBe('tx-batch-1');
  });

  it('returns error on BATCH_NOT_SUPPORTED for EVM', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['POST:/v1/transactions/send', {
        ok: false,
        error: { code: 'BATCH_NOT_SUPPORTED', message: 'Batch not supported on EVM', retryable: false },
      }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerSendBatch, apiClient);

    const result = await handler({
      instructions: [
        { to: 'addr1', amount: '100' },
        { to: 'addr2', amount: '200' },
      ],
    }) as { isError?: boolean };

    expect(result.isError).toBe(true);
  });

  it('includes network in body when specified', async () => {
    const apiClient = createMockApiClient(new Map());
    const handler = getToolHandler(registerSendBatch, apiClient);

    await handler({
      instructions: [{ to: 'a', amount: '1' }, { to: 'b', amount: '2' }],
      network: 'devnet',
    });

    expect(apiClient.post).toHaveBeenCalledWith('/v1/transactions/send', {
      type: 'BATCH',
      instructions: [{ to: 'a', amount: '1' }, { to: 'b', amount: '2' }],
      network: 'devnet',
    });
  });
});

describe('get_wallet_info tool', () => {
  it('returns combined wallet info with networks', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/wallet/address', { ok: true, data: { walletId: 'w1', chain: 'ethereum', network: 'ethereum-sepolia', address: '0xabc' } }],
      ['GET:/v1/wallets/w1/networks', { ok: true, data: { networks: [{ network: 'ethereum-sepolia', name: 'Sepolia', isDefault: true }] } }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerGetWalletInfo, apiClient);

    const result = await handler({}) as { content: Array<{ text: string }> };
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.walletId).toBe('w1');
    expect(parsed.networks).toHaveLength(1);
    expect(parsed.networks[0].isDefault).toBe(true);
  });

  it('returns address info with empty networks on networks API failure', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/wallet/address', { ok: true, data: { walletId: 'w1', chain: 'solana', network: 'devnet', address: 'abc' } }],
      ['GET:/v1/wallets/w1/networks', { ok: false, error: { code: 'NOT_FOUND', message: 'Not found', retryable: false } }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerGetWalletInfo, apiClient);

    const result = await handler({}) as { content: Array<{ text: string }> };
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.walletId).toBe('w1');
    expect(parsed.networks).toEqual([]);
  });

  it('returns error when address API fails', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/wallet/address', { ok: false, expired: true, message: 'Token expired' }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerGetWalletInfo, apiClient);

    const result = await handler({}) as { content: Array<{ text: string }>; isError?: boolean };
    // Session expired should NOT have isError (H-04)
    expect(result.isError).toBeUndefined();
  });
});

describe('set_default_network tool', () => {
  it('calls PUT /v1/wallet/default-network with correct params', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['PUT:/v1/wallet/default-network', { ok: true, data: { id: 'w-1', defaultNetwork: 'polygon-amoy', previousNetwork: 'ethereum-sepolia' } }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerSetDefaultNetwork, apiClient);

    const result = await handler({ network: 'polygon-amoy' }) as { content: Array<{ text: string }> };

    expect(apiClient.put).toHaveBeenCalledWith('/v1/wallet/default-network', { network: 'polygon-amoy' });
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed['defaultNetwork']).toBe('polygon-amoy');
    expect(parsed['previousNetwork']).toBe('ethereum-sepolia');
  });

  it('returns error on environment mismatch', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['PUT:/v1/wallet/default-network', {
        ok: false,
        error: { code: 'ENVIRONMENT_NETWORK_MISMATCH', message: 'Network not allowed', retryable: false },
      }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerSetDefaultNetwork, apiClient);

    const result = await handler({ network: 'mainnet' }) as {
      content: Array<{ text: string }>;
      isError?: boolean;
    };

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed['code']).toBe('ENVIRONMENT_NETWORK_MISMATCH');
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

  it('registers get_assets tool without error', () => {
    expect(() => registerGetAssets(server, apiClient)).not.toThrow();
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

  it('registers call_contract tool without error', () => {
    expect(() => registerCallContract(server, apiClient)).not.toThrow();
  });

  it('registers approve_token tool without error', () => {
    expect(() => registerApproveToken(server, apiClient)).not.toThrow();
  });

  it('registers send_batch tool without error', () => {
    expect(() => registerSendBatch(server, apiClient)).not.toThrow();
  });

  it('registers get_wallet_info tool without error', () => {
    expect(() => registerGetWalletInfo(server, apiClient)).not.toThrow();
  });

  it('registers set_default_network tool without error', () => {
    expect(() => registerSetDefaultNetwork(server, apiClient)).not.toThrow();
  });
});
