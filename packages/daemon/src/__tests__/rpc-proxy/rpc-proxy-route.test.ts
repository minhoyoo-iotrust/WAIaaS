/**
 * RPC Proxy route-level integration tests.
 *
 * Tests from validation/auto-fill (SEC-02, SEC-03),
 * async timeout formatting (ASYNC-04), and batch processing (RPC-05).
 */

import { describe, it, expect } from 'vitest';
import {
  validateAndFillFrom,
} from '../../api/routes/rpc-proxy.js';
import {
  jsonRpcError,
  JSON_RPC_ERRORS,
  type EthTransactionParams,
  type JsonRpcErrorResponse,
} from '../../rpc-proxy/index.js';

const WALLET_ADDRESS = '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD61';
const WALLET_ADDRESS_LOWER = WALLET_ADDRESS.toLowerCase();

// -- from validation tests (SEC-02, SEC-03) ----------------------------------

describe('validateAndFillFrom', () => {
  describe('eth_sendTransaction', () => {
    it('passes when from matches wallet address', () => {
      const params: unknown[] = [{ from: WALLET_ADDRESS, to: '0x456' }];
      const result = validateAndFillFrom('eth_sendTransaction', params, WALLET_ADDRESS);
      expect(result).toBeNull();
    });

    it('passes case-insensitive match (mixed case vs checksummed)', () => {
      const params: unknown[] = [{ from: WALLET_ADDRESS_LOWER, to: '0x456' }];
      const result = validateAndFillFrom('eth_sendTransaction', params, WALLET_ADDRESS);
      expect(result).toBeNull();
    });

    it('returns error on from mismatch', () => {
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

    it('auto-fills from when empty string', () => {
      const txParams: EthTransactionParams = { from: '', to: '0x456' };
      const params: unknown[] = [txParams];
      const result = validateAndFillFrom('eth_sendTransaction', params, WALLET_ADDRESS);
      expect(result).toBeNull();
      expect((params[0] as EthTransactionParams).from).toBe(WALLET_ADDRESS);
    });
  });

  describe('eth_signTransaction', () => {
    it('auto-fills from when omitted', () => {
      const params: unknown[] = [{ to: '0x456' }];
      const result = validateAndFillFrom('eth_signTransaction', params, WALLET_ADDRESS);
      expect(result).toBeNull();
      expect((params[0] as EthTransactionParams).from).toBe(WALLET_ADDRESS);
    });

    it('returns error on from mismatch', () => {
      const params: unknown[] = [{ from: '0xDEAD', to: '0x456' }];
      const result = validateAndFillFrom('eth_signTransaction', params, WALLET_ADDRESS);
      expect(result).not.toBeNull();
    });
  });

  describe('personal_sign', () => {
    it('auto-fills address param when omitted', () => {
      // personal_sign params: [message, address]
      const params: unknown[] = ['0xdeadbeef'];
      const result = validateAndFillFrom('personal_sign', params, WALLET_ADDRESS);
      expect(result).toBeNull();
      expect(params[1]).toBe(WALLET_ADDRESS);
    });

    it('passes when address matches', () => {
      const params: unknown[] = ['0xdeadbeef', WALLET_ADDRESS];
      const result = validateAndFillFrom('personal_sign', params, WALLET_ADDRESS);
      expect(result).toBeNull();
    });

    it('returns error on address mismatch', () => {
      const params: unknown[] = ['0xdeadbeef', '0xBAD'];
      const result = validateAndFillFrom('personal_sign', params, WALLET_ADDRESS);
      expect(result).not.toBeNull();
    });
  });

  describe('eth_sign', () => {
    it('auto-fills address param when omitted', () => {
      // eth_sign params: [address, message]
      const params: unknown[] = [undefined, '0xdeadbeef'];
      const result = validateAndFillFrom('eth_sign', params, WALLET_ADDRESS);
      expect(result).toBeNull();
      expect(params[0]).toBe(WALLET_ADDRESS);
    });

    it('validates address param', () => {
      const params: unknown[] = ['0xBAD', '0xdeadbeef'];
      const result = validateAndFillFrom('eth_sign', params, WALLET_ADDRESS);
      expect(result).not.toBeNull();
      expect((result as JsonRpcErrorResponse).error.code).toBe(JSON_RPC_ERRORS.INVALID_PARAMS);
    });
  });

  describe('eth_signTypedData_v4', () => {
    it('auto-fills address param when omitted', () => {
      // eth_signTypedData_v4 params: [address, typedData]
      const params: unknown[] = [undefined, '{"types":{}}'];
      const result = validateAndFillFrom('eth_signTypedData_v4', params, WALLET_ADDRESS);
      expect(result).toBeNull();
      expect(params[0]).toBe(WALLET_ADDRESS);
    });

    it('validates address param', () => {
      const params: unknown[] = ['0xWRONG', '{"types":{}}'];
      const result = validateAndFillFrom('eth_signTypedData_v4', params, WALLET_ADDRESS);
      expect(result).not.toBeNull();
    });
  });

  describe('non-signing methods', () => {
    it('passes through without validation for eth_getBalance', () => {
      const params: unknown[] = ['0x123', 'latest'];
      const result = validateAndFillFrom('eth_getBalance', params, WALLET_ADDRESS);
      expect(result).toBeNull();
    });
  });
});

// -- Async timeout tests (ASYNC-02, ASYNC-03, ASYNC-04) ----------------------

describe('timeout error formatting', () => {
  it('timeout error includes txId in error data field', () => {
    // Simulates the error format from CompletionWaiter
    const txId = '550e8400-e29b-41d4-a716-446655440000';
    const message = `Transaction ${txId} timed out after 600000ms`;
    const txIdMatch = message.match(/Transaction ([a-f0-9-]+) timed out/);

    expect(txIdMatch).not.toBeNull();
    expect(txIdMatch![1]).toBe(txId);

    const errorResp = jsonRpcError(1, JSON_RPC_ERRORS.SERVER_ERROR, message, { txId: txIdMatch![1] });
    expect(errorResp.error.code).toBe(-32000);
    expect(errorResp.error.data).toEqual({ txId });
  });

  it('error code is -32000 (SERVER_ERROR) for timeouts', () => {
    expect(JSON_RPC_ERRORS.SERVER_ERROR).toBe(-32000);
  });
});

// -- Batch tests (RPC-05) ----------------------------------------------------

describe('batch processing', () => {
  it('batch request returns array of responses (tested via validateAndFillFrom on each)', () => {
    // Validate that each request in a batch can be individually validated
    const requests = [
      { method: 'eth_sendTransaction', params: [{ to: '0x1' }] },
      { method: 'eth_getBalance', params: ['0x1', 'latest'] },
    ];

    for (const req of requests) {
      const error = validateAndFillFrom(req.method, req.params as unknown[], WALLET_ADDRESS);
      expect(error).toBeNull();
    }

    // Verify eth_sendTransaction got auto-filled
    expect((requests[0]!.params[0] as EthTransactionParams).from).toBe(WALLET_ADDRESS);
  });

  it('empty batch detection works via parseJsonRpcBody', async () => {
    const { parseJsonRpcBody } = await import('../../rpc-proxy/json-rpc.js');
    const result = parseJsonRpcBody([]);
    expect(result.type).toBe('error');
  });
});
