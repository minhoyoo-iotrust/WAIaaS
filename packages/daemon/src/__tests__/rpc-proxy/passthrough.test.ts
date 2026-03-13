import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RpcPassthrough, PASSTHROUGH_METHODS } from '../../rpc-proxy/passthrough.js';
import type { JsonRpcRequest } from '../../rpc-proxy/json-rpc.js';

describe('RpcPassthrough', () => {
  let rpcPool: { getUrl: ReturnType<typeof vi.fn> };
  let passthrough: RpcPassthrough;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    rpcPool = { getUrl: vi.fn().mockReturnValue('https://rpc.example.com') };
    passthrough = new RpcPassthrough(rpcPool as any);
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('PASSTHROUGH_METHODS', () => {
    it('contains standard read-only EVM methods', () => {
      const expected = [
        'eth_call', 'eth_getBalance', 'eth_blockNumber',
        'eth_getBlockByNumber', 'eth_getBlockByHash',
        'eth_getTransactionByHash', 'eth_getTransactionReceipt',
        'eth_estimateGas', 'eth_gasPrice', 'eth_feeHistory',
        'eth_maxPriorityFeePerGas', 'eth_getCode', 'eth_getStorageAt',
        'eth_getLogs', 'eth_getTransactionCount',
        'net_version', 'web3_clientVersion',
        'eth_getBlockTransactionCountByNumber',
        'eth_getBlockTransactionCountByHash',
      ];
      for (const method of expected) {
        expect(PASSTHROUGH_METHODS.has(method)).toBe(true);
      }
    });

    it('does not contain signing methods', () => {
      expect(PASSTHROUGH_METHODS.has('eth_sendTransaction')).toBe(false);
      expect(PASSTHROUGH_METHODS.has('personal_sign')).toBe(false);
      expect(PASSTHROUGH_METHODS.has('eth_signTypedData_v4')).toBe(false);
    });
  });

  describe('isPassthrough', () => {
    it('returns true for passthrough methods', () => {
      expect(passthrough.isPassthrough('eth_call')).toBe(true);
      expect(passthrough.isPassthrough('eth_getBalance')).toBe(true);
    });

    it('returns false for non-passthrough methods', () => {
      expect(passthrough.isPassthrough('eth_sendTransaction')).toBe(false);
      expect(passthrough.isPassthrough('custom_method')).toBe(false);
    });
  });

  describe('forward', () => {
    it('proxies request to upstream RPC and returns response', async () => {
      const upstreamResponse = { jsonrpc: '2.0', id: 1, result: '0x10' };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(upstreamResponse),
      });

      const request: JsonRpcRequest = { jsonrpc: '2.0', method: 'eth_blockNumber', id: 42 };
      const resp = await passthrough.forward(request, 'ethereum-mainnet');

      expect(rpcPool.getUrl).toHaveBeenCalledWith('ethereum-mainnet');
      expect(resp.id).toBe(42); // Preserves original id
      expect((resp as any).result).toBe('0x10');
    });

    it('preserves original request id even if upstream uses different id', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ jsonrpc: '2.0', id: 999, result: '0x1' }),
      });

      const request: JsonRpcRequest = { jsonrpc: '2.0', method: 'eth_call', id: 'my-id' };
      const resp = await passthrough.forward(request, 'ethereum-mainnet');

      expect(resp.id).toBe('my-id');
    });

    it('returns JSON-RPC error on upstream non-200 response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
      });

      const request: JsonRpcRequest = { jsonrpc: '2.0', method: 'eth_call', id: 1 };
      const resp = await passthrough.forward(request, 'ethereum-mainnet');

      expect(resp).toHaveProperty('error');
      expect((resp as any).error.code).toBe(-32000);
      expect((resp as any).error.message).toContain('503');
    });

    it('returns JSON-RPC error on network failure', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      const request: JsonRpcRequest = { jsonrpc: '2.0', method: 'eth_call', id: 1 };
      const resp = await passthrough.forward(request, 'ethereum-mainnet');

      expect(resp).toHaveProperty('error');
      expect((resp as any).error.code).toBe(-32000);
      expect((resp as any).error.message).toContain('ECONNREFUSED');
    });

    it('handles null id correctly', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ jsonrpc: '2.0', id: 1, result: '0x0' }),
      });

      const request: JsonRpcRequest = { jsonrpc: '2.0', method: 'eth_blockNumber', id: null };
      const resp = await passthrough.forward(request, 'ethereum-mainnet');

      expect(resp.id).toBeNull();
    });

    it('sends correct JSON-RPC body to upstream', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ jsonrpc: '2.0', id: 1, result: '0x1' }),
      });
      globalThis.fetch = mockFetch;

      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'eth_getBalance',
        params: ['0xabc', 'latest'],
        id: 5,
      };
      await passthrough.forward(request, 'ethereum-mainnet');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://rpc.example.com',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body).toEqual({
        jsonrpc: '2.0',
        method: 'eth_getBalance',
        params: ['0xabc', 'latest'],
        id: 5,
      });
    });
  });
});
