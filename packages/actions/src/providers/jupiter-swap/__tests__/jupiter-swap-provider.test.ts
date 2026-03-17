/**
 * JupiterSwapActionProvider supplementary unit tests.
 *
 * Focuses on paths not covered by existing jupiter-swap.test.ts:
 * - humanAmount + decimals conversion
 * - getSwapInstructions API failure
 * - slippage edge cases (zero, exact boundary)
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { JupiterSwapActionProvider } from '../index.js';
import { JUPITER_PROGRAM_ID } from '../config.js';
import type { ActionContext } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Canned responses
// ---------------------------------------------------------------------------

const QUOTE_RESPONSE = {
  inputMint: 'So11111111111111111111111111111111111111112',
  inAmount: '1500000000',
  outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  outAmount: '276204034',
  otherAmountThreshold: '273441993',
  swapMode: 'ExactIn',
  slippageBps: 50,
  priceImpactPct: '0.002',
  routePlan: [
    {
      swapInfo: {
        ammKey: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
        label: 'Whirlpool',
        inputMint: 'So11111111111111111111111111111111111111112',
        outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        inAmount: '1500000000',
        outAmount: '276204034',
        feeAmount: '300',
        feeMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      },
      percent: 100,
    },
  ],
  contextSlot: 290000000,
  timeTaken: 0.05,
};

const SWAP_INSTRUCTIONS_RESPONSE = {
  tokenLedgerInstruction: null,
  computeBudgetInstructions: [
    { programId: 'ComputeBudget111111111111111111111111111111', accounts: [], data: 'AQAAAA==' },
  ],
  setupInstructions: [],
  swapInstruction: {
    programId: JUPITER_PROGRAM_ID,
    accounts: [
      { pubkey: 'So11111111111111111111111111111111111111112', isSigner: false, isWritable: true },
      { pubkey: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', isSigner: false, isWritable: true },
    ],
    data: 'c3dhcGRhdGE=',
  },
  cleanupInstruction: null,
  addressLookupTableAddresses: ['GxS6FiQ9RbErBVmNB8mGSEn6MnacxPMPG6yMhMpB2sN2'],
};

// ---------------------------------------------------------------------------
// MSW setup
// ---------------------------------------------------------------------------

const server = setupServer(
  http.get('https://api.jup.ag/swap/v1/quote', () => HttpResponse.json(QUOTE_RESPONSE)),
  http.post('https://api.jup.ag/swap/v1/swap-instructions', () => HttpResponse.json(SWAP_INSTRUCTIONS_RESPONSE)),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ---------------------------------------------------------------------------
// Shared context
// ---------------------------------------------------------------------------

const CONTEXT: ActionContext = {
  walletAddress: 'WaLLet111111111111111111111111111111111111111',
  chain: 'solana',
  walletId: '00000000-0000-0000-0000-000000000001',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('JupiterSwapActionProvider - humanAmount conversion', () => {
  it('resolves humanAmount="1.5" with decimals=9 to amount="1500000000"', async () => {
    let capturedUrl = '';
    server.use(
      http.get('https://api.jup.ag/swap/v1/quote', ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json(QUOTE_RESPONSE);
      }),
    );

    const provider = new JupiterSwapActionProvider({ enabled: true });
    const result = await provider.resolve('swap', {
      inputMint: 'So11111111111111111111111111111111111111112',
      outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      humanAmount: '1.5',
      decimals: 9,
    }, CONTEXT);

    expect(result.type).toBe('CONTRACT_CALL');
    expect(result.to).toBe(JUPITER_PROGRAM_ID);
    const url = new URL(capturedUrl);
    expect(url.searchParams.get('amount')).toBe('1500000000');
  });

  it('resolves humanAmount="0.001" with decimals=6 to amount="1000"', async () => {
    let capturedUrl = '';
    server.use(
      http.get('https://api.jup.ag/swap/v1/quote', ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json(QUOTE_RESPONSE);
      }),
    );

    const provider = new JupiterSwapActionProvider({ enabled: true });
    await provider.resolve('swap', {
      inputMint: 'So11111111111111111111111111111111111111112',
      outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      humanAmount: '0.001',
      decimals: 6,
    }, CONTEXT);

    const url = new URL(capturedUrl);
    expect(url.searchParams.get('amount')).toBe('1000');
  });

  it('throws when humanAmount given without decimals', async () => {
    const provider = new JupiterSwapActionProvider({ enabled: true });
    await expect(
      provider.resolve('swap', {
        inputMint: 'So11111111111111111111111111111111111111112',
        outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        humanAmount: '1.5',
      }, CONTEXT),
    ).rejects.toThrow('decimals');
  });

  it('throws when neither amount nor humanAmount is provided', async () => {
    const provider = new JupiterSwapActionProvider({ enabled: true });
    await expect(
      provider.resolve('swap', {
        inputMint: 'So11111111111111111111111111111111111111112',
        outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      }, CONTEXT),
    ).rejects.toThrow();
  });
});

describe('JupiterSwapActionProvider - getSwapInstructions failure', () => {
  it('throws ChainError when getSwapInstructions API returns 500', async () => {
    server.use(
      http.post('https://api.jup.ag/swap/v1/swap-instructions', () => {
        return HttpResponse.json({ error: 'Internal error' }, { status: 500 });
      }),
    );

    const provider = new JupiterSwapActionProvider({ enabled: true });
    await expect(
      provider.resolve('swap', {
        inputMint: 'So11111111111111111111111111111111111111112',
        outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        amount: '1000000000',
      }, CONTEXT),
    ).rejects.toThrow();
  });
});

describe('JupiterSwapActionProvider - slippage edge cases', () => {
  it('uses default when slippageBps=0', async () => {
    let capturedUrl = '';
    server.use(
      http.get('https://api.jup.ag/swap/v1/quote', ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json(QUOTE_RESPONSE);
      }),
    );

    const provider = new JupiterSwapActionProvider({ enabled: true, defaultSlippageBps: 50, maxSlippageBps: 500 });
    await provider.resolve('swap', {
      inputMint: 'So11111111111111111111111111111111111111112',
      outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      amount: '1000000000',
      slippageBps: 0,
    }, CONTEXT);

    const url = new URL(capturedUrl);
    expect(url.searchParams.get('slippageBps')).toBe('50');
  });

  it('passes valid slippage within range (250bps)', async () => {
    let capturedUrl = '';
    server.use(
      http.get('https://api.jup.ag/swap/v1/quote', ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json(QUOTE_RESPONSE);
      }),
    );

    const provider = new JupiterSwapActionProvider({ enabled: true, defaultSlippageBps: 50, maxSlippageBps: 500 });
    await provider.resolve('swap', {
      inputMint: 'So11111111111111111111111111111111111111112',
      outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      amount: '1000000000',
      slippageBps: 250,
    }, CONTEXT);

    const url = new URL(capturedUrl);
    expect(url.searchParams.get('slippageBps')).toBe('250');
  });
});
