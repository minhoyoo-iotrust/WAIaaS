/**
 * RpcDispatcher unit tests.
 *
 * Tests single/batch dispatch, notification filtering, and method classification.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  RpcDispatcher,
  type RpcDispatcherDeps,
  classifyMethod,
  jsonRpcSuccess,
  jsonRpcError,
  JSON_RPC_ERRORS,
  type JsonRpcRequest,
  type HandlerContext,
} from '../../rpc-proxy/index.js';

// -- Mock builders -----------------------------------------------------------

function createMockDeps(): RpcDispatcherDeps {
  return {
    methodHandlers: {
      handle: vi.fn().mockResolvedValue(jsonRpcSuccess(1, '0xabc')),
    } as any,
    passthrough: {
      forward: vi.fn().mockResolvedValue(jsonRpcSuccess(1, '0x1234')),
      isPassthrough: vi.fn((method: string) =>
        ['eth_getBalance', 'eth_call', 'eth_blockNumber'].includes(method),
      ),
    } as any,
    nonceTracker: {
      getNextNonce: vi.fn(),
      confirmNonce: vi.fn(),
      rollbackNonce: vi.fn(),
    } as any,
  };
}

const mockCtx: HandlerContext = {
  walletId: 'wallet-1',
  walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD61',
  chainId: 1,
  network: 'ethereum-mainnet',
  chain: 'ethereum',
  sessionId: 'session-1',
};

// -- Tests -------------------------------------------------------------------

describe('RpcDispatcher', () => {
  describe('single request -- intercept method', () => {
    it('routes eth_sendTransaction through methodHandlers.handle()', async () => {
      const deps = createMockDeps();
      const dispatcher = new RpcDispatcher(deps);

      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'eth_sendTransaction',
        params: [{ from: '0x123', to: '0x456', value: '0x0' }],
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
      expect(result).toEqual(jsonRpcSuccess(1, '0xabc'));
    });
  });

  describe('single request -- passthrough method', () => {
    it('routes eth_getBalance through passthrough.forward()', async () => {
      const deps = createMockDeps();
      const dispatcher = new RpcDispatcher(deps);

      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'eth_getBalance',
        params: ['0x123', 'latest'],
        id: 2,
      };

      const result = await dispatcher.dispatch(request, mockCtx, {});

      expect(deps.passthrough.forward).toHaveBeenCalledWith(request, 'ethereum-mainnet');
      expect(result).toEqual(jsonRpcSuccess(1, '0x1234'));
    });
  });

  describe('single request -- unsupported method', () => {
    it('returns JSON-RPC error -32601', async () => {
      const deps = createMockDeps();
      const dispatcher = new RpcDispatcher(deps);

      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'eth_subscribe',
        params: [],
        id: 3,
      };

      const result = await dispatcher.dispatch(request, mockCtx, {});

      expect(result).toEqual(
        jsonRpcError(3, JSON_RPC_ERRORS.METHOD_NOT_FOUND, 'Method not found: eth_subscribe'),
      );
    });
  });

  describe('batch dispatch', () => {
    it('returns array of responses for mixed methods', async () => {
      const deps = createMockDeps();
      (deps.methodHandlers.handle as any).mockResolvedValue(jsonRpcSuccess(1, '0xtxhash'));
      (deps.passthrough.forward as any).mockResolvedValue(jsonRpcSuccess(2, '1000'));

      const dispatcher = new RpcDispatcher(deps);

      const requests: JsonRpcRequest[] = [
        { jsonrpc: '2.0', method: 'eth_sendTransaction', params: [{ to: '0x1' }], id: 1 },
        { jsonrpc: '2.0', method: 'eth_getBalance', params: ['0x1', 'latest'], id: 2 },
        { jsonrpc: '2.0', method: 'eth_subscribe', params: [], id: 3 },
      ];

      const results = await dispatcher.dispatchBatch(requests, mockCtx, {});

      expect(results).toHaveLength(3);
      // Verify each response type
      expect(results[0]).toEqual(jsonRpcSuccess(1, '0xtxhash'));
      expect(results[1]).toEqual(jsonRpcSuccess(2, '1000'));
      expect((results[2] as any).error.code).toBe(JSON_RPC_ERRORS.METHOD_NOT_FOUND);
    });
  });

  describe('batch with notification', () => {
    it('filters out notification responses', async () => {
      const deps = createMockDeps();
      (deps.methodHandlers.handle as any).mockResolvedValue(jsonRpcSuccess(null, '0xhash'));
      (deps.passthrough.forward as any).mockResolvedValue(jsonRpcSuccess(5, '1000'));

      const dispatcher = new RpcDispatcher(deps);

      const requests: JsonRpcRequest[] = [
        // This is a notification (no `id` field)
        { jsonrpc: '2.0', method: 'eth_sendTransaction', params: [{ to: '0x1' }] },
        // This has an id
        { jsonrpc: '2.0', method: 'eth_getBalance', params: ['0x1', 'latest'], id: 5 },
      ];

      const results = await dispatcher.dispatchBatch(requests, mockCtx, {});

      // Only the non-notification should be in results
      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe(5);
    });

    it('returns empty array when all requests are notifications', async () => {
      const deps = createMockDeps();
      const dispatcher = new RpcDispatcher(deps);

      const requests: JsonRpcRequest[] = [
        { jsonrpc: '2.0', method: 'eth_sendTransaction', params: [{ to: '0x1' }] },
        { jsonrpc: '2.0', method: 'eth_getBalance', params: ['0x1'] },
      ];

      const results = await dispatcher.dispatchBatch(requests, mockCtx, {});
      expect(results).toHaveLength(0);
    });
  });

  describe('classifyMethod integration', () => {
    it('classifies intercept methods correctly', () => {
      const mockPassthrough = {
        isPassthrough: (m: string) => ['eth_getBalance', 'eth_call'].includes(m),
      } as any;

      expect(classifyMethod('eth_sendTransaction', mockPassthrough)).toBe('intercept');
      expect(classifyMethod('eth_signTransaction', mockPassthrough)).toBe('intercept');
      expect(classifyMethod('personal_sign', mockPassthrough)).toBe('intercept');
      expect(classifyMethod('eth_accounts', mockPassthrough)).toBe('intercept');
      expect(classifyMethod('eth_chainId', mockPassthrough)).toBe('intercept');
    });

    it('classifies passthrough methods correctly', () => {
      const mockPassthrough = {
        isPassthrough: (m: string) => ['eth_getBalance', 'eth_call'].includes(m),
      } as any;

      expect(classifyMethod('eth_getBalance', mockPassthrough)).toBe('passthrough');
      expect(classifyMethod('eth_call', mockPassthrough)).toBe('passthrough');
    });

    it('classifies unsupported methods correctly', () => {
      const mockPassthrough = {
        isPassthrough: () => false,
      } as any;

      expect(classifyMethod('eth_subscribe', mockPassthrough)).toBe('unsupported');
      expect(classifyMethod('debug_traceTransaction', mockPassthrough)).toBe('unsupported');
    });
  });

  describe('null id handling', () => {
    it('preserves null id in responses', async () => {
      const deps = createMockDeps();
      const dispatcher = new RpcDispatcher(deps);

      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'eth_subscribe',
        params: [],
        id: null,
      };

      const result = await dispatcher.dispatch(request, mockCtx, {});
      expect(result.id).toBeNull();
    });
  });
});
