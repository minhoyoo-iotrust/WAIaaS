/**
 * LiFiActionProvider supplementary unit tests.
 *
 * Focuses on paths not covered by existing lifi-swap.test.ts:
 * - humanFromAmount + decimals conversion
 * - toAddress override vs. context.walletAddress default
 * - Solana fromChain cross-chain resolution
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { LiFiActionProvider } from '../index.js';
import type { ActionContext } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeQuoteResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: 'quote-supp-001',
    type: 'lifi',
    tool: 'stargate',
    toolDetails: { key: 'stargate', name: 'Stargate' },
    action: {
      fromChainId: 1,
      toChainId: 8453,
      fromToken: { address: '0xUSDC', symbol: 'USDC', decimals: 6, chainId: 1 },
      toToken: { address: '0xUSDC_Base', symbol: 'USDC', decimals: 6, chainId: 8453 },
      fromAmount: '100000000',
      slippage: 0.03,
      fromAddress: '0x1234567890123456789012345678901234567890',
    },
    estimate: {
      fromAmount: '100000000',
      toAmount: '99500000',
      toAmountMin: '96500000',
      executionDuration: 120,
      feeCosts: [],
      gasCosts: [],
    },
    transactionRequest: {
      data: '0xbridgecalldata_supp',
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
// MSW
// ---------------------------------------------------------------------------

const server = setupServer(
  http.get('https://li.quest/v1/quote', () => HttpResponse.json(makeQuoteResponse())),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const CONTEXT: ActionContext = {
  walletAddress: '0x1234567890123456789012345678901234567890',
  chain: 'ethereum',
  walletId: '00000000-0000-0000-0000-000000000001',
};

const DEFAULT_PARAMS = {
  fromChain: 'ethereum',
  toChain: 'base',
  fromToken: '0xUSDC',
  toToken: '0xUSDC_Base',
  fromAmount: '100000000',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LiFiActionProvider - humanFromAmount conversion', () => {
  it('converts humanFromAmount="100" with decimals=6 to fromAmount="100000000"', async () => {
    let capturedUrl = '';
    server.use(
      http.get('https://li.quest/v1/quote', ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json(makeQuoteResponse());
      }),
    );

    const provider = new LiFiActionProvider({ enabled: true });
    const result = await provider.resolve('cross_swap', {
      fromChain: 'ethereum',
      toChain: 'base',
      fromToken: '0xUSDC',
      toToken: '0xUSDC_Base',
      humanFromAmount: '100',
      decimals: 6,
    }, CONTEXT);

    expect(result).toHaveLength(1);
    const url = new URL(capturedUrl);
    expect(url.searchParams.get('fromAmount')).toBe('100000000');
  });

  it('converts humanFromAmount="0.5" with decimals=18 correctly', async () => {
    let capturedUrl = '';
    server.use(
      http.get('https://li.quest/v1/quote', ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json(makeQuoteResponse());
      }),
    );

    const provider = new LiFiActionProvider({ enabled: true });
    await provider.resolve('bridge', {
      fromChain: 'ethereum',
      toChain: 'base',
      fromToken: '0xETH',
      toToken: '0xETH_Base',
      humanFromAmount: '0.5',
      decimals: 18,
    }, CONTEXT);

    const url = new URL(capturedUrl);
    expect(url.searchParams.get('fromAmount')).toBe('500000000000000000');
  });

  it('throws when humanFromAmount given without decimals', async () => {
    const provider = new LiFiActionProvider({ enabled: true });
    await expect(
      provider.resolve('cross_swap', {
        ...DEFAULT_PARAMS,
        fromAmount: undefined,
        humanFromAmount: '100',
      }, CONTEXT),
    ).rejects.toThrow('decimals');
  });

  it('throws when neither fromAmount nor humanFromAmount provided', async () => {
    const provider = new LiFiActionProvider({ enabled: true });
    await expect(
      provider.resolve('cross_swap', {
        fromChain: 'ethereum',
        toChain: 'base',
        fromToken: '0xUSDC',
        toToken: '0xUSDC_Base',
      }, CONTEXT),
    ).rejects.toThrow();
  });
});

describe('LiFiActionProvider - toAddress override', () => {
  it('passes toAddress when explicitly provided', async () => {
    let capturedUrl = '';
    server.use(
      http.get('https://li.quest/v1/quote', ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json(makeQuoteResponse());
      }),
    );

    const customTo = '0xAAAABBBBCCCCDDDDEEEEFFFF0000111122223333';
    const provider = new LiFiActionProvider({ enabled: true });
    await provider.resolve('cross_swap', {
      ...DEFAULT_PARAMS,
      toAddress: customTo,
    }, CONTEXT);

    const url = new URL(capturedUrl);
    expect(url.searchParams.get('toAddress')).toBe(customTo);
  });

  it('does not include toAddress when not provided', async () => {
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
    expect(url.searchParams.has('toAddress')).toBe(false);
  });
});

describe('LiFiActionProvider - Solana chain resolution', () => {
  it('resolves solana as fromChain correctly', async () => {
    let capturedUrl = '';
    server.use(
      http.get('https://li.quest/v1/quote', ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json(makeQuoteResponse());
      }),
    );

    const provider = new LiFiActionProvider({ enabled: true });
    await provider.resolve('bridge', {
      fromChain: 'solana',
      toChain: 'ethereum',
      fromToken: 'SOL',
      toToken: 'ETH',
      fromAmount: '1000000000',
    }, CONTEXT);

    const url = new URL(capturedUrl);
    // Solana LI.FI chain ID = 1151111081099710
    expect(url.searchParams.get('fromChain')).toBe('1151111081099710');
    expect(url.searchParams.get('toChain')).toBe('1');
  });

  it('resolves solana-mainnet variant', async () => {
    let capturedUrl = '';
    server.use(
      http.get('https://li.quest/v1/quote', ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json(makeQuoteResponse());
      }),
    );

    const provider = new LiFiActionProvider({ enabled: true });
    await provider.resolve('bridge', {
      fromChain: 'solana-mainnet',
      toChain: 'ethereum-mainnet',
      fromToken: 'SOL',
      toToken: 'ETH',
      fromAmount: '1000000000',
    }, CONTEXT);

    const url = new URL(capturedUrl);
    expect(url.searchParams.get('fromChain')).toBe('1151111081099710');
    expect(url.searchParams.get('toChain')).toBe('1');
  });
});
