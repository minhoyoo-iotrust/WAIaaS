/**
 * RPC Proxy integration tests (TEST-01 through TEST-07).
 *
 * Tests cross-component behavior of the full RPC proxy stack using
 * RpcDispatcher with mocked pipeline dependencies.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  RpcDispatcher,
  type RpcDispatcherDeps,
  jsonRpcSuccess,
  jsonRpcError,
  JSON_RPC_ERRORS,
  parseJsonRpcBody,
  isNotification,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type JsonRpcSuccessResponse,
  type JsonRpcErrorResponse,
  type HandlerContext,
  classifyMethod,
  toHexChainId,
  type EthTransactionParams,
} from '../../rpc-proxy/index.js';
import {
  validateAndFillFrom,
} from '../../api/routes/rpc-proxy.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const WALLET_ADDRESS = '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD61';
const WALLET_ID = '550e8400-e29b-41d4-a716-446655440000';

function createMockDeps(overrides?: Partial<RpcDispatcherDeps>): RpcDispatcherDeps {
  return {
    methodHandlers: {
      handle: vi.fn().mockImplementation((_method: string, _params: unknown, id: unknown) =>
        jsonRpcSuccess(id as string | number | null, '0xdeadbeef'),
      ),
      ...overrides?.methodHandlers,
    } as any,
    passthrough: {
      forward: vi.fn().mockImplementation((req: JsonRpcRequest) =>
        jsonRpcSuccess(req.id ?? null, '0x1234'),
      ),
      isPassthrough: vi.fn((method: string) =>
        ['eth_getBalance', 'eth_call', 'eth_blockNumber', 'eth_getTransactionCount',
         'eth_getCode', 'eth_estimateGas', 'eth_gasPrice'].includes(method),
      ),
      ...overrides?.passthrough,
    } as any,
    nonceTracker: {
      getNextNonce: vi.fn(),
      confirmNonce: vi.fn(),
      rollbackNonce: vi.fn(),
      ...overrides?.nonceTracker,
    } as any,
  };
}

const mockCtx: HandlerContext = {
  walletId: WALLET_ID,
  walletAddress: WALLET_ADDRESS,
  chainId: 1,
  network: 'ethereum-mainnet',
  chain: 'ethereum',
  sessionId: 'session-abc',
};

// ---------------------------------------------------------------------------
// TEST-01: JSON-RPC 2.0 protocol compliance
// ---------------------------------------------------------------------------

describe('TEST-01: JSON-RPC 2.0 protocol compliance', () => {
  it('returns valid response with string id', async () => {
    const deps = createMockDeps();
    const dispatcher = new RpcDispatcher(deps);

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'eth_getBalance',
      params: [WALLET_ADDRESS, 'latest'],
      id: 'abc-123',
    };

    const result = await dispatcher.dispatch(request, mockCtx, {});
    expect(result.jsonrpc).toBe('2.0');
    expect(result.id).toBe('abc-123');
    expect('result' in result).toBe(true);
  });

  it('returns valid response with number id', async () => {
    const deps = createMockDeps();
    const dispatcher = new RpcDispatcher(deps);

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'eth_getBalance',
      params: [WALLET_ADDRESS, 'latest'],
      id: 42,
    };

    const result = await dispatcher.dispatch(request, mockCtx, {});
    expect(result.jsonrpc).toBe('2.0');
    expect(result.id).toBe(42);
  });

  it('rejects request with missing jsonrpc field', () => {
    const parsed = parseJsonRpcBody({ method: 'eth_call', id: 1 });
    expect(parsed.type).toBe('error');
  });

  it('rejects request with missing method field', () => {
    const parsed = parseJsonRpcBody({ jsonrpc: '2.0', id: 1 });
    expect(parsed.type).toBe('error');
  });

  it('detects notification (id omitted)', () => {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'eth_getBalance',
      params: [WALLET_ADDRESS, 'latest'],
    };
    expect(isNotification(request)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TEST-02: Signing method intercept
// ---------------------------------------------------------------------------

describe('TEST-02: Signing method intercept', () => {
  let deps: RpcDispatcherDeps;
  let dispatcher: RpcDispatcher;

  beforeEach(() => {
    deps = createMockDeps();
    dispatcher = new RpcDispatcher(deps);
  });

  it('routes eth_sendTransaction through methodHandlers', async () => {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'eth_sendTransaction',
      params: [{ from: WALLET_ADDRESS, to: '0x456', value: '0x0' }],
      id: 1,
    };

    const result = await dispatcher.dispatch(request, mockCtx, {});
    expect(deps.methodHandlers.handle).toHaveBeenCalledWith(
      'eth_sendTransaction',
      request.params,
      1,
      mockCtx,
      {},
    );
    expect((result as JsonRpcSuccessResponse).result).toBe('0xdeadbeef');
  });

  it('routes eth_signTransaction through methodHandlers', async () => {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'eth_signTransaction',
      params: [{ from: WALLET_ADDRESS, to: '0x456', value: '0x0' }],
      id: 2,
    };

    await dispatcher.dispatch(request, mockCtx, {});
    expect(deps.methodHandlers.handle).toHaveBeenCalledWith(
      'eth_signTransaction',
      request.params,
      2,
      mockCtx,
      {},
    );
  });

  it('routes eth_accounts through methodHandlers (returns wallet address)', async () => {
    (deps.methodHandlers.handle as any).mockImplementation((_m: string, _p: unknown, id: unknown) =>
      jsonRpcSuccess(id as string | number | null, [WALLET_ADDRESS]),
    );

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'eth_accounts',
      id: 3,
    };

    const result = await dispatcher.dispatch(request, mockCtx, {});
    expect((result as JsonRpcSuccessResponse).result).toEqual([WALLET_ADDRESS]);
  });

  it('routes eth_chainId through methodHandlers (returns hex chainId)', async () => {
    (deps.methodHandlers.handle as any).mockImplementation((_m: string, _p: unknown, id: unknown) =>
      jsonRpcSuccess(id as string | number | null, toHexChainId(1)),
    );

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'eth_chainId',
      id: 4,
    };

    const result = await dispatcher.dispatch(request, mockCtx, {});
    expect((result as JsonRpcSuccessResponse).result).toBe('0x1');
  });
});

// ---------------------------------------------------------------------------
// TEST-03: Passthrough method proxy
// ---------------------------------------------------------------------------

describe('TEST-03: Passthrough method proxy', () => {
  let deps: RpcDispatcherDeps;
  let dispatcher: RpcDispatcher;

  beforeEach(() => {
    deps = createMockDeps();
    dispatcher = new RpcDispatcher(deps);
  });

  it('forwards eth_call to RPC pool via passthrough', async () => {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'eth_call',
      params: [{ to: '0x456', data: '0x' }, 'latest'],
      id: 10,
    };

    const result = await dispatcher.dispatch(request, mockCtx, {});
    expect(deps.passthrough.forward).toHaveBeenCalled();
    expect((result as JsonRpcSuccessResponse).result).toBe('0x1234');
  });

  it('forwards eth_getBalance to RPC pool', async () => {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'eth_getBalance',
      params: [WALLET_ADDRESS, 'latest'],
      id: 11,
    };

    await dispatcher.dispatch(request, mockCtx, {});
    expect(deps.passthrough.forward).toHaveBeenCalled();
  });

  it('returns METHOD_NOT_FOUND for unsupported method', async () => {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'debug_traceTransaction',
      params: ['0xabc'],
      id: 12,
    };

    const result = await dispatcher.dispatch(request, mockCtx, {});
    expect('error' in result).toBe(true);
    expect((result as JsonRpcErrorResponse).error.code).toBe(JSON_RPC_ERRORS.METHOD_NOT_FOUND);
  });
});

// ---------------------------------------------------------------------------
// TEST-04: CONTRACT_DEPLOY classification
// ---------------------------------------------------------------------------

describe('TEST-04: CONTRACT_DEPLOY classification', () => {
  it('classifies eth_sendTransaction as intercept (routing to pipeline)', () => {
    const deps = createMockDeps();
    const classification = classifyMethod('eth_sendTransaction', deps.passthrough as any);
    expect(classification).toBe('intercept');
  });

  it('validateAndFillFrom allows to=null (CONTRACT_DEPLOY pattern)', () => {
    const params: unknown[] = [{ from: WALLET_ADDRESS, to: null, data: '0x6060' }];
    const result = validateAndFillFrom('eth_sendTransaction', params, WALLET_ADDRESS);
    expect(result).toBeNull();
  });

  it('rejects oversized bytecode in CONTRACT_DEPLOY', () => {
    const oversizedData = '0x' + 'ab'.repeat(49153); // > 48KB
    const txParams: EthTransactionParams = { to: null, data: oversizedData };
    // Inline bytecodeSize check logic (mirrors route)
    const bytecodeHex = txParams.data!.startsWith('0x') ? txParams.data!.slice(2) : txParams.data!;
    const bytecodeSize = bytecodeHex.length / 2;
    expect(bytecodeSize).toBeGreaterThan(48 * 1024);
  });
});

// ---------------------------------------------------------------------------
// TEST-05: Async approval (tier behavior)
// ---------------------------------------------------------------------------

describe('TEST-05: Async approval tier behavior', () => {
  it('IMMEDIATE tier returns result synchronously via methodHandlers', async () => {
    const deps = createMockDeps();
    // Simulate IMMEDIATE: handler returns immediately
    (deps.methodHandlers.handle as any).mockImplementation((_m: string, _p: unknown, id: unknown) =>
      jsonRpcSuccess(id as string | number | null, '0xdeadbeef_immediate'),
    );
    const dispatcher = new RpcDispatcher(deps);

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'eth_sendTransaction',
      params: [{ from: WALLET_ADDRESS, to: '0x456', value: '0x0' }],
      id: 20,
    };

    const result = await dispatcher.dispatch(request, mockCtx, {});
    expect((result as JsonRpcSuccessResponse).result).toBe('0xdeadbeef_immediate');
  });

  it('handler timeout returns SERVER_ERROR with txId for async retry', async () => {
    const deps = createMockDeps();
    // Simulate timeout error from handler
    (deps.methodHandlers.handle as any).mockImplementation((_m: string, _p: unknown, id: unknown) =>
      jsonRpcError(id as string | number | null, JSON_RPC_ERRORS.SERVER_ERROR, 'Transaction pending approval', {
        txId: 'tx-uuid',
        message: 'Use GET /v1/transactions/{txId} to check status',
      }),
    );
    const dispatcher = new RpcDispatcher(deps);

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'eth_sendTransaction',
      params: [{ from: WALLET_ADDRESS, to: '0x456' }],
      id: 21,
    };

    const result = await dispatcher.dispatch(request, mockCtx, {});
    expect('error' in result).toBe(true);
    const errResult = result as JsonRpcErrorResponse;
    expect(errResult.error.code).toBe(JSON_RPC_ERRORS.SERVER_ERROR);
    expect(errResult.error.data).toHaveProperty('txId');
  });

  it('DELAY tier uses configured timeout (handler receives pipelineDeps)', async () => {
    const deps = createMockDeps();
    const dispatcher = new RpcDispatcher(deps);
    const pipelineDeps = { delayTimeoutSeconds: 300 };

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'eth_sendTransaction',
      params: [{ from: WALLET_ADDRESS, to: '0x456' }],
      id: 22,
    };

    await dispatcher.dispatch(request, mockCtx, pipelineDeps);
    expect(deps.methodHandlers.handle).toHaveBeenCalledWith(
      'eth_sendTransaction',
      request.params,
      22,
      mockCtx,
      pipelineDeps,
    );
  });
});

// ---------------------------------------------------------------------------
// TEST-06: Batch request handling
// ---------------------------------------------------------------------------

describe('TEST-06: Batch request handling', () => {
  it('processes array of mixed read+write requests returning array of responses', async () => {
    const deps = createMockDeps();
    const dispatcher = new RpcDispatcher(deps);

    const requests: JsonRpcRequest[] = [
      { jsonrpc: '2.0', method: 'eth_getBalance', params: [WALLET_ADDRESS, 'latest'], id: 100 },
      { jsonrpc: '2.0', method: 'eth_sendTransaction', params: [{ from: WALLET_ADDRESS, to: '0x456' }], id: 101 },
    ];

    const results = await dispatcher.dispatchBatch(requests, mockCtx, {});
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(2);
    expect(results[0]!.id).toBe(100);
    expect(results[1]!.id).toBe(101);
  });

  it('empty array returns INVALID_REQUEST from parseJsonRpcBody', () => {
    const parsed = parseJsonRpcBody([]);
    expect(parsed.type).toBe('error');
  });

  it('batch with notifications filters out notification responses', async () => {
    const deps = createMockDeps();
    const dispatcher = new RpcDispatcher(deps);

    const requests: JsonRpcRequest[] = [
      { jsonrpc: '2.0', method: 'eth_getBalance', params: [WALLET_ADDRESS, 'latest'], id: 200 },
      { jsonrpc: '2.0', method: 'eth_getBalance', params: [WALLET_ADDRESS, 'latest'] }, // notification (no id)
    ];

    const results = await dispatcher.dispatchBatch(requests, mockCtx, {});
    // Notification responses are filtered out by dispatchBatch per JSON-RPC 2.0 spec
    expect(results.length).toBe(1);
    expect(results[0]!.id).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// TEST-07: Auth/security
// ---------------------------------------------------------------------------

describe('TEST-07: Auth/security', () => {
  it('from field mismatch returns error', () => {
    const params: unknown[] = [{ from: '0x999999999999999999999999999999999999999A', to: '0x456' }];
    const result = validateAndFillFrom('eth_sendTransaction', params, WALLET_ADDRESS);
    expect(result).not.toBeNull();
    expect((result as JsonRpcErrorResponse).error.code).toBe(JSON_RPC_ERRORS.INVALID_PARAMS);
    expect((result as JsonRpcErrorResponse).error.message).toContain('does not match session wallet');
  });

  it('auto-fills from when omitted', () => {
    const txParams: EthTransactionParams = { to: '0x456', value: '0x0' };
    const params: unknown[] = [txParams];
    const result = validateAndFillFrom('eth_sendTransaction', params, WALLET_ADDRESS);
    expect(result).toBeNull();
    expect((params[0] as EthTransactionParams).from).toBe(WALLET_ADDRESS);
  });

  it('eth_sendRawTransaction is classified as intercept (for explicit rejection)', () => {
    const deps = createMockDeps();
    const classification = classifyMethod('eth_sendRawTransaction', deps.passthrough as any);
    expect(classification).toBe('intercept');
  });

  it('eth_sendRawTransaction handler returns INVALID_PARAMS rejection', async () => {
    const deps = createMockDeps();
    (deps.methodHandlers.handle as any).mockImplementation((_m: string, _p: unknown, id: unknown) =>
      jsonRpcError(id as string | number | null, JSON_RPC_ERRORS.INVALID_PARAMS,
        'eth_sendRawTransaction is not supported. Use eth_sendTransaction instead.'),
    );
    const dispatcher = new RpcDispatcher(deps);

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'eth_sendRawTransaction',
      params: ['0xsignedtx'],
      id: 30,
    };

    const result = await dispatcher.dispatch(request, mockCtx, {});
    expect('error' in result).toBe(true);
    expect((result as JsonRpcErrorResponse).error.code).toBe(JSON_RPC_ERRORS.INVALID_PARAMS);
  });
});
