/**
 * LiFiActionProvider unit tests.
 * Uses msw to intercept LI.FI API v1 calls.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse, delay } from 'msw';
import { setupServer } from 'msw/node';
import { LiFiActionProvider } from '../providers/lifi/index.js';
import type { ActionContext } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Canned responses
// ---------------------------------------------------------------------------

function makeQuoteResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: 'quote-test-001',
    type: 'lifi',
    tool: 'stargate',
    toolDetails: { key: 'stargate', name: 'Stargate' },
    action: {
      fromChainId: 1,
      toChainId: 8453,
      fromToken: {
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        symbol: 'USDC',
        decimals: 6,
        chainId: 1,
      },
      toToken: {
        address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        symbol: 'USDC',
        decimals: 6,
        chainId: 8453,
      },
      fromAmount: '1000000',
      slippage: 0.03,
      fromAddress: '0x1234567890123456789012345678901234567890',
    },
    estimate: {
      fromAmount: '1000000',
      toAmount: '995000',
      toAmountMin: '965000',
      executionDuration: 120,
      feeCosts: [],
      gasCosts: [],
    },
    transactionRequest: {
      data: '0xbridgecalldata123',
      to: '0xLiFiBridgeContract',
      value: '0',
      from: '0x1234567890123456789012345678901234567890',
      chainId: 1,
      gasLimit: '300000',
    },
    includedSteps: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// MSW server setup
// ---------------------------------------------------------------------------

const server = setupServer(
  http.get('https://li.quest/v1/quote', () => {
    return HttpResponse.json(makeQuoteResponse());
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ---------------------------------------------------------------------------
// Test context
// ---------------------------------------------------------------------------

const CONTEXT: ActionContext = {
  walletAddress: '0x1234567890123456789012345678901234567890',
  chain: 'ethereum',
  walletId: '00000000-0000-0000-0000-000000000001',
};

const DEFAULT_PARAMS = {
  fromChain: 'ethereum',
  toChain: 'base',
  fromToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  toToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  fromAmount: '1000000',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LiFiActionProvider', () => {
  describe('LIFI-03: cross_swap resolve', () => {
    it('returns ContractCallRequest with calldata from LI.FI /quote', async () => {
      const provider = new LiFiActionProvider({ enabled: true });
      const result = await provider.resolve('cross_swap', DEFAULT_PARAMS, CONTEXT);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);

      const req = result[0] as { type: string; to: string; calldata?: string; value?: string };
      expect(req.type).toBe('CONTRACT_CALL');
      expect(req.to).toBe('0xLiFiBridgeContract');
      expect(req.calldata).toBe('0xbridgecalldata123');
      expect(req.value).toBe('0');
    });
  });

  describe('LIFI-03: bridge resolve', () => {
    it('same resolve logic as cross_swap', async () => {
      const provider = new LiFiActionProvider({ enabled: true });
      const result = await provider.resolve('bridge', DEFAULT_PARAMS, CONTEXT);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);

      const req = result[0] as { type: string; to: string; calldata?: string; value?: string };
      expect(req.type).toBe('CONTRACT_CALL');
      expect(req.to).toBe('0xLiFiBridgeContract');
      expect(req.calldata).toBe('0xbridgecalldata123');
    });
  });

  describe('LIFI-HEX: hex value conversion (#190)', () => {
    it('converts hex value "0x38d7ea4c68000" to decimal string', async () => {
      server.use(
        http.get('https://li.quest/v1/quote', () => {
          return HttpResponse.json(makeQuoteResponse({
            transactionRequest: {
              data: '0xbridgecalldata123',
              to: '0xLiFiBridgeContract',
              value: '0x38d7ea4c68000', // 1000000000000000 in hex
              from: '0x1234567890123456789012345678901234567890',
              chainId: 1,
              gasLimit: '300000',
            },
          }));
        }),
      );

      const provider = new LiFiActionProvider({ enabled: true });
      const result = await provider.resolve('cross_swap', DEFAULT_PARAMS, CONTEXT);
      const req = result[0] as { value?: string };
      expect(req.value).toBe('1000000000000000');
    });

    it('converts hex value "0x0" to decimal "0"', async () => {
      server.use(
        http.get('https://li.quest/v1/quote', () => {
          return HttpResponse.json(makeQuoteResponse({
            transactionRequest: {
              data: '0xbridgecalldata123',
              to: '0xLiFiBridgeContract',
              value: '0x0',
              from: '0x1234567890123456789012345678901234567890',
              chainId: 1,
              gasLimit: '300000',
            },
          }));
        }),
      );

      const provider = new LiFiActionProvider({ enabled: true });
      const result = await provider.resolve('cross_swap', DEFAULT_PARAMS, CONTEXT);
      const req = result[0] as { value?: string };
      expect(req.value).toBe('0');
    });

    it('passes decimal value through unchanged', async () => {
      server.use(
        http.get('https://li.quest/v1/quote', () => {
          return HttpResponse.json(makeQuoteResponse({
            transactionRequest: {
              data: '0xbridgecalldata123',
              to: '0xLiFiBridgeContract',
              value: '1000000000000000',
              from: '0x1234567890123456789012345678901234567890',
              chainId: 1,
              gasLimit: '300000',
            },
          }));
        }),
      );

      const provider = new LiFiActionProvider({ enabled: true });
      const result = await provider.resolve('cross_swap', DEFAULT_PARAMS, CONTEXT);
      const req = result[0] as { value?: string };
      expect(req.value).toBe('1000000000000000');
    });

  });

  describe('LIFI-04: slippage clamping', () => {
    it('uses default 0.03 (3%) when no slippage specified', async () => {
      let capturedUrl = '';
      server.use(
        http.get('https://li.quest/v1/quote', ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json(makeQuoteResponse());
        }),
      );

      const provider = new LiFiActionProvider({ enabled: true });
      await provider.resolve('cross_swap', DEFAULT_PARAMS, CONTEXT);

      const url = new URL(capturedUrl);
      expect(url.searchParams.get('slippage')).toBe('0.03');
    });

    it('clamps slippage to max 0.05 (5%)', async () => {
      let capturedUrl = '';
      server.use(
        http.get('https://li.quest/v1/quote', ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json(makeQuoteResponse());
        }),
      );

      const provider = new LiFiActionProvider({ enabled: true });
      await provider.resolve('cross_swap', { ...DEFAULT_PARAMS, slippage: 0.10 }, CONTEXT);

      const url = new URL(capturedUrl);
      expect(url.searchParams.get('slippage')).toBe('0.05');
    });

    it('passes custom slippage within range', async () => {
      let capturedUrl = '';
      server.use(
        http.get('https://li.quest/v1/quote', ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json(makeQuoteResponse());
        }),
      );

      const provider = new LiFiActionProvider({ enabled: true });
      await provider.resolve('cross_swap', { ...DEFAULT_PARAMS, slippage: 0.04 }, CONTEXT);

      const url = new URL(capturedUrl);
      expect(url.searchParams.get('slippage')).toBe('0.04');
    });
  });

  describe('error handling', () => {
    it('unknown action throws INVALID_INSTRUCTION', async () => {
      const provider = new LiFiActionProvider({ enabled: true });
      await expect(
        provider.resolve('unknown_action', DEFAULT_PARAMS, CONTEXT),
      ).rejects.toThrow('Unknown action');
    });

    it('unsupported fromChain throws INVALID_INSTRUCTION with supported chains list', async () => {
      const provider = new LiFiActionProvider({ enabled: true });
      await expect(
        provider.resolve('cross_swap', { ...DEFAULT_PARAMS, fromChain: 'bitcoin' }, CONTEXT),
      ).rejects.toThrow('Unsupported chain');
    });

    it('unsupported toChain throws INVALID_INSTRUCTION', async () => {
      const provider = new LiFiActionProvider({ enabled: true });
      await expect(
        provider.resolve('cross_swap', { ...DEFAULT_PARAMS, toChain: 'avalanche' }, CONTEXT),
      ).rejects.toThrow('Unsupported chain');
    });

    it('API error propagates as ACTION_API_ERROR', async () => {
      server.use(
        http.get('https://li.quest/v1/quote', () => {
          return HttpResponse.json({ message: 'Bad Request' }, { status: 400 });
        }),
      );

      const provider = new LiFiActionProvider({ enabled: true });
      await expect(
        provider.resolve('cross_swap', DEFAULT_PARAMS, CONTEXT),
      ).rejects.toThrow('API error 400');
    });

    it('API timeout propagates as ACTION_API_TIMEOUT', async () => {
      server.use(
        http.get('https://li.quest/v1/quote', async () => {
          await delay(500);
          return HttpResponse.json(makeQuoteResponse());
        }),
      );

      const provider = new LiFiActionProvider({ enabled: true, requestTimeoutMs: 50 });
      await expect(
        provider.resolve('cross_swap', DEFAULT_PARAMS, CONTEXT),
      ).rejects.toThrow('timeout');
    });
  });

  describe('metadata', () => {
    it('name=lifi, mcpExpose=true, chains includes both ethereum and solana', () => {
      const provider = new LiFiActionProvider({ enabled: true });
      expect(provider.metadata.name).toBe('lifi');
      expect(provider.metadata.mcpExpose).toBe(true);
      expect(provider.metadata.chains).toEqual(['ethereum', 'solana']);
      expect(provider.metadata.requiresApiKey).toBe(false);
      expect(provider.metadata.requiredApis).toEqual(['lifi']);
      expect(provider.metadata.version).toBe('1.0.0');
    });

    it('has 2 actions (cross_swap, bridge) both with inputSchema', () => {
      const provider = new LiFiActionProvider({ enabled: true });
      expect(provider.actions).toHaveLength(2);

      const [crossSwap, bridge] = provider.actions;
      expect(crossSwap!.name).toBe('cross_swap');
      expect(crossSwap!.riskLevel).toBe('high');
      expect(crossSwap!.defaultTier).toBe('DELAY');
      expect(crossSwap!.inputSchema).toBeDefined();

      expect(bridge!.name).toBe('bridge');
      expect(bridge!.riskLevel).toBe('high');
      expect(bridge!.defaultTier).toBe('DELAY');
      expect(bridge!.inputSchema).toBeDefined();
    });
  });
});
