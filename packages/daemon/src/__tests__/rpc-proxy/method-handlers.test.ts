import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock pipeline modules
vi.mock('../../pipeline/sign-only.js', () => ({
  executeSignOnly: vi.fn().mockResolvedValue({
    id: 'tx-sign-1',
    signedTransaction: '0xsigned123',
    txHash: '0xhash',
    operations: [],
    policyResult: { tier: 'INSTANT' },
  }),
}));

vi.mock('../../pipeline/sign-message.js', () => ({
  executeSignMessage: vi.fn().mockResolvedValue({
    id: 'tx-msg-1',
    signature: '0xsig456',
    signType: 'personal',
  }),
}));

import {
  RpcMethodHandlers,
  classifyMethod,
  INTERCEPT_METHODS,
} from '../../rpc-proxy/method-handlers.js';
import { executeSignOnly } from '../../pipeline/sign-only.js';
import { executeSignMessage } from '../../pipeline/sign-message.js';

function createMockHandlerCtx() {
  return {
    walletId: 'w1',
    walletAddress: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
    chainId: 1,
    network: 'ethereum-mainnet',
    chain: 'ethereum',
    sessionId: 'session-1',
  };
}

describe('classifyMethod', () => {
  const passthrough = { isPassthrough: (m: string) => m === 'eth_call' };

  it('returns intercept for signing methods', () => {
    expect(classifyMethod('eth_sendTransaction', passthrough as any)).toBe('intercept');
    expect(classifyMethod('personal_sign', passthrough as any)).toBe('intercept');
    expect(classifyMethod('eth_signTypedData_v4', passthrough as any)).toBe('intercept');
    expect(classifyMethod('eth_accounts', passthrough as any)).toBe('intercept');
  });

  it('returns passthrough for read methods', () => {
    expect(classifyMethod('eth_call', passthrough as any)).toBe('passthrough');
  });

  it('returns unsupported for unknown methods', () => {
    expect(classifyMethod('eth_subscribe', passthrough as any)).toBe('unsupported');
    expect(classifyMethod('custom_method', passthrough as any)).toBe('unsupported');
  });
});

describe('INTERCEPT_METHODS', () => {
  it('contains all intercept methods', () => {
    const expected = [
      'eth_sendTransaction', 'eth_signTransaction',
      'eth_accounts', 'eth_requestAccounts',
      'eth_chainId', 'net_version',
      'personal_sign', 'eth_sign', 'eth_signTypedData_v4',
      'eth_sendRawTransaction',
    ];
    for (const m of expected) {
      expect(INTERCEPT_METHODS.has(m)).toBe(true);
    }
  });
});

describe('RpcMethodHandlers', () => {
  let syncPipeline: { execute: ReturnType<typeof vi.fn> };
  let txAdapter: { convert: ReturnType<typeof vi.fn> };
  let nonceTracker: {
    getNextNonce: ReturnType<typeof vi.fn>;
    confirmNonce: ReturnType<typeof vi.fn>;
    rollbackNonce: ReturnType<typeof vi.fn>;
  };
  let handlers: RpcMethodHandlers;
  let ctx: ReturnType<typeof createMockHandlerCtx>;
  const deps = {} as any;

  beforeEach(() => {
    vi.clearAllMocks();
    syncPipeline = { execute: vi.fn().mockResolvedValue('0xtxhash') };
    txAdapter = {
      convert: vi.fn().mockReturnValue({
        type: 'TRANSFER', to: '0x1', amount: '100', network: 'ethereum-mainnet',
      }),
    };
    nonceTracker = {
      getNextNonce: vi.fn().mockReturnValue(5),
      confirmNonce: vi.fn(),
      rollbackNonce: vi.fn(),
    };
    handlers = new RpcMethodHandlers(
      syncPipeline as any,
      txAdapter as any,
      nonceTracker as any,
    );
    ctx = createMockHandlerCtx();
  });

  describe('eth_accounts', () => {
    it('returns wallet address in array', async () => {
      const resp = await handlers.handle('eth_accounts', [], 1, ctx, deps);
      expect(resp).toEqual({
        jsonrpc: '2.0',
        id: 1,
        result: ['0xAbCdEf1234567890AbCdEf1234567890AbCdEf12'],
      });
    });
  });

  describe('eth_requestAccounts', () => {
    it('returns same as eth_accounts', async () => {
      const resp = await handlers.handle('eth_requestAccounts', [], 2, ctx, deps);
      expect(resp).toEqual({
        jsonrpc: '2.0',
        id: 2,
        result: ['0xAbCdEf1234567890AbCdEf1234567890AbCdEf12'],
      });
    });
  });

  describe('eth_chainId', () => {
    it('returns hex chain id', async () => {
      const resp = await handlers.handle('eth_chainId', [], 3, ctx, deps);
      expect(resp).toEqual({
        jsonrpc: '2.0',
        id: 3,
        result: '0x1',
      });
    });

    it('returns correct hex for Base chain (8453)', async () => {
      ctx.chainId = 8453;
      const resp = await handlers.handle('eth_chainId', [], 4, ctx, deps);
      expect((resp as any).result).toBe('0x2105');
    });
  });

  describe('net_version', () => {
    it('returns chainId as decimal string', async () => {
      const resp = await handlers.handle('net_version', [], 5, ctx, deps);
      expect(resp).toEqual({
        jsonrpc: '2.0',
        id: 5,
        result: '1',
      });
    });
  });

  describe('eth_sendTransaction', () => {
    it('converts params and calls SyncPipelineExecutor', async () => {
      const params = [{ to: '0x1', value: '0x100' }];
      const resp = await handlers.handle('eth_sendTransaction', params, 6, ctx, deps);

      expect(txAdapter.convert).toHaveBeenCalledWith(
        { to: '0x1', value: '0x100' },
        'ethereum-mainnet',
      );
      expect(syncPipeline.execute).toHaveBeenCalled();
      expect(resp).toEqual({
        jsonrpc: '2.0',
        id: 6,
        result: '0xtxhash',
      });
    });

    it('returns error on pipeline failure', async () => {
      syncPipeline.execute.mockRejectedValueOnce(new Error('Pipeline failed'));
      const params = [{ to: '0x1' }];
      const resp = await handlers.handle('eth_sendTransaction', params, 7, ctx, deps);

      expect(resp).toHaveProperty('error');
      expect((resp as any).error.code).toBe(-32000);
      expect((resp as any).error.message).toContain('Pipeline failed');
    });
  });

  describe('eth_signTransaction', () => {
    it('calls executeSignOnly and returns signed tx', async () => {
      const params = [{ to: '0x1', value: '0x100', data: '0x' }];
      const resp = await handlers.handle('eth_signTransaction', params, 8, ctx, deps);

      expect(executeSignOnly).toHaveBeenCalled();
      expect(resp).toEqual({
        jsonrpc: '2.0',
        id: 8,
        result: '0xsigned123',
      });
    });
  });

  describe('personal_sign', () => {
    it('calls executeSignMessage with personal type', async () => {
      // personal_sign params order: [message, address]
      const params = ['0x48656c6c6f', '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12'];
      const resp = await handlers.handle('personal_sign', params, 9, ctx, deps);

      expect(executeSignMessage).toHaveBeenCalledWith(
        deps,
        'w1',
        'ethereum',
        expect.objectContaining({ signType: 'personal', message: '0x48656c6c6f' }),
        'session-1',
      );
      expect(resp).toEqual({
        jsonrpc: '2.0',
        id: 9,
        result: '0xsig456',
      });
    });
  });

  describe('eth_sign', () => {
    it('calls executeSignMessage with personal type (reversed param order)', async () => {
      // eth_sign params order: [address, message]
      const params = ['0xAbCdEf1234567890AbCdEf1234567890AbCdEf12', '0x48656c6c6f'];
      const resp = await handlers.handle('eth_sign', params, 10, ctx, deps);

      expect(executeSignMessage).toHaveBeenCalledWith(
        deps,
        'w1',
        'ethereum',
        expect.objectContaining({ signType: 'personal', message: '0x48656c6c6f' }),
        'session-1',
      );
      expect((resp as any).result).toBe('0xsig456');
    });
  });

  describe('eth_signTypedData_v4', () => {
    it('calls executeSignMessage with typedData type', async () => {
      const typedData = JSON.stringify({ types: {}, primaryType: 'Test', domain: {}, message: {} });
      const params = ['0xAbCdEf1234567890AbCdEf1234567890AbCdEf12', typedData];
      const resp = await handlers.handle('eth_signTypedData_v4', params, 11, ctx, deps);

      expect(executeSignMessage).toHaveBeenCalledWith(
        deps,
        'w1',
        'ethereum',
        expect.objectContaining({ signType: 'typedData', message: typedData }),
        'session-1',
      );
      expect((resp as any).result).toBe('0xsig456');
    });
  });

  describe('eth_sendRawTransaction', () => {
    it('returns explicit rejection error (SIGN-07)', async () => {
      const resp = await handlers.handle('eth_sendRawTransaction', ['0xraw'], 12, ctx, deps);

      expect(resp).toHaveProperty('error');
      expect((resp as any).error.code).toBe(-32602);
      expect((resp as any).error.message).toContain('not supported');
      expect((resp as any).error.message).toContain('eth_sendTransaction');
    });
  });

  describe('unsupported method', () => {
    it('returns METHOD_NOT_FOUND error', async () => {
      const resp = await handlers.handle('eth_subscribe', [], 13, ctx, deps);

      expect(resp).toHaveProperty('error');
      expect((resp as any).error.code).toBe(-32601);
    });
  });
});
