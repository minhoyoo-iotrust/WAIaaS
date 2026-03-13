import { describe, it, expect } from 'vitest';
import {
  jsonRpcSuccess,
  jsonRpcError,
  parseJsonRpcBody,
  isNotification,
  JSON_RPC_ERRORS,
  type JsonRpcRequest,
} from '../../rpc-proxy/json-rpc.js';

describe('JSON-RPC 2.0 Protocol Utilities', () => {
  // ── JSON_RPC_ERRORS ─────────────────────────────────────────────
  describe('JSON_RPC_ERRORS', () => {
    it('has standard error codes', () => {
      expect(JSON_RPC_ERRORS.PARSE_ERROR).toBe(-32700);
      expect(JSON_RPC_ERRORS.INVALID_REQUEST).toBe(-32600);
      expect(JSON_RPC_ERRORS.METHOD_NOT_FOUND).toBe(-32601);
      expect(JSON_RPC_ERRORS.INVALID_PARAMS).toBe(-32602);
      expect(JSON_RPC_ERRORS.INTERNAL_ERROR).toBe(-32603);
      expect(JSON_RPC_ERRORS.SERVER_ERROR).toBe(-32000);
    });
  });

  // ── jsonRpcSuccess ──────────────────────────────────────────────
  describe('jsonRpcSuccess', () => {
    it('builds success response with number id', () => {
      const resp = jsonRpcSuccess(42, '0xabc');
      expect(resp).toEqual({ jsonrpc: '2.0', id: 42, result: '0xabc' });
    });

    it('builds success response with string id', () => {
      const resp = jsonRpcSuccess('req-1', '0xdef');
      expect(resp).toEqual({ jsonrpc: '2.0', id: 'req-1', result: '0xdef' });
    });

    it('preserves null id', () => {
      const resp = jsonRpcSuccess(null, true);
      expect(resp).toEqual({ jsonrpc: '2.0', id: null, result: true });
    });

    it('does not include error field', () => {
      const resp = jsonRpcSuccess(1, 'ok');
      expect(resp).not.toHaveProperty('error');
    });
  });

  // ── jsonRpcError ────────────────────────────────────────────────
  describe('jsonRpcError', () => {
    it('builds error response', () => {
      const resp = jsonRpcError(42, -32601, 'Method not found');
      expect(resp).toEqual({
        jsonrpc: '2.0',
        id: 42,
        error: { code: -32601, message: 'Method not found' },
      });
    });

    it('includes optional data', () => {
      const resp = jsonRpcError(1, -32602, 'Bad params', { detail: 'missing to' });
      expect(resp.error).toEqual({
        code: -32602,
        message: 'Bad params',
        data: { detail: 'missing to' },
      });
    });

    it('does not include result field (Pitfall 9)', () => {
      const resp = jsonRpcError(1, -32600, 'Invalid');
      expect(resp).not.toHaveProperty('result');
    });

    it('preserves null id', () => {
      const resp = jsonRpcError(null, -32700, 'Parse error');
      expect(resp.id).toBeNull();
    });
  });

  // ── parseJsonRpcBody ────────────────────────────────────────────
  describe('parseJsonRpcBody', () => {
    it('parses valid single request', () => {
      const body = { jsonrpc: '2.0', method: 'eth_blockNumber', id: 1 };
      const result = parseJsonRpcBody(body);
      expect(result.type).toBe('single');
      if (result.type === 'single') {
        expect(result.request.method).toBe('eth_blockNumber');
        expect(result.request.id).toBe(1);
      }
    });

    it('parses single request with params', () => {
      const body = { jsonrpc: '2.0', method: 'eth_call', params: [{ to: '0x1' }], id: 2 };
      const result = parseJsonRpcBody(body);
      expect(result.type).toBe('single');
      if (result.type === 'single') {
        expect(result.request.params).toEqual([{ to: '0x1' }]);
      }
    });

    it('parses valid batch request', () => {
      const body = [
        { jsonrpc: '2.0', method: 'eth_blockNumber', id: 1 },
        { jsonrpc: '2.0', method: 'eth_chainId', id: 2 },
      ];
      const result = parseJsonRpcBody(body);
      expect(result.type).toBe('batch');
      if (result.type === 'batch') {
        expect(result.requests).toHaveLength(2);
        expect(result.requests[0].method).toBe('eth_blockNumber');
        expect(result.requests[1].method).toBe('eth_chainId');
      }
    });

    it('returns error for non-object/non-array body', () => {
      const result = parseJsonRpcBody('not json');
      expect(result.type).toBe('error');
    });

    it('returns error for missing jsonrpc field', () => {
      const result = parseJsonRpcBody({ method: 'eth_call', id: 1 });
      expect(result.type).toBe('error');
    });

    it('returns error for wrong jsonrpc version', () => {
      const result = parseJsonRpcBody({ jsonrpc: '1.0', method: 'eth_call', id: 1 });
      expect(result.type).toBe('error');
    });

    it('returns error for missing method field', () => {
      const result = parseJsonRpcBody({ jsonrpc: '2.0', id: 1 });
      expect(result.type).toBe('error');
    });

    it('returns error for empty batch array', () => {
      const result = parseJsonRpcBody([]);
      expect(result.type).toBe('error');
    });

    it('handles null body as error', () => {
      const result = parseJsonRpcBody(null);
      expect(result.type).toBe('error');
    });
  });

  // ── isNotification ──────────────────────────────────────────────
  describe('isNotification', () => {
    it('returns true when id is undefined', () => {
      const req: JsonRpcRequest = { jsonrpc: '2.0', method: 'eth_subscription' };
      expect(isNotification(req)).toBe(true);
    });

    it('returns false when id is null (null id is valid per spec)', () => {
      const req: JsonRpcRequest = { jsonrpc: '2.0', method: 'eth_call', id: null };
      expect(isNotification(req)).toBe(false);
    });

    it('returns false when id is a number', () => {
      const req: JsonRpcRequest = { jsonrpc: '2.0', method: 'eth_call', id: 1 };
      expect(isNotification(req)).toBe(false);
    });

    it('returns false when id is a string', () => {
      const req: JsonRpcRequest = { jsonrpc: '2.0', method: 'eth_call', id: 'abc' };
      expect(isNotification(req)).toBe(false);
    });
  });
});
