/**
 * JupiterSwapActionProvider unit tests.
 * Uses msw to intercept Jupiter API calls.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { JupiterSwapActionProvider } from '../providers/jupiter-swap/index.js';
import { JUPITER_PROGRAM_ID } from '../providers/jupiter-swap/config.js';
import type { ActionContext } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Canned responses
// ---------------------------------------------------------------------------

const QUOTE_RESPONSE = {
  inputMint: 'So11111111111111111111111111111111111111112',
  inAmount: '1000000000',
  outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  outAmount: '184136023',
  otherAmountThreshold: '182294662',
  swapMode: 'ExactIn',
  slippageBps: 50,
  priceImpactPct: '0.001',
  routePlan: [
    {
      swapInfo: {
        ammKey: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
        label: 'Whirlpool',
        inputMint: 'So11111111111111111111111111111111111111112',
        outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        inAmount: '1000000000',
        outAmount: '184136023',
        feeAmount: '200',
        feeMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      },
      percent: 100,
    },
  ],
  contextSlot: 290000000,
  timeTaken: 0.042,
};

const SWAP_INSTRUCTIONS_RESPONSE = {
  tokenLedgerInstruction: null,
  computeBudgetInstructions: [
    {
      programId: 'ComputeBudget111111111111111111111111111111',
      accounts: [],
      data: 'AQAAAA==',
    },
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
  http.get('https://api.jup.ag/swap/v1/quote', () => {
    return HttpResponse.json(QUOTE_RESPONSE);
  }),
  http.post('https://api.jup.ag/swap/v1/swap-instructions', () => {
    return HttpResponse.json(SWAP_INSTRUCTIONS_RESPONSE);
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ---------------------------------------------------------------------------
// Test context
// ---------------------------------------------------------------------------

const CONTEXT: ActionContext = {
  walletAddress: 'WaLLet111111111111111111111111111111111111111',
  chain: 'solana',
  walletId: '00000000-0000-0000-0000-000000000001',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('JupiterSwapActionProvider', () => {
  describe('metadata', () => {
    it('has correct provider metadata', () => {
      const provider = new JupiterSwapActionProvider({ enabled: true });
      expect(provider.metadata.name).toBe('jupiter_swap');
      expect(provider.metadata.chains).toEqual(['solana']);
      expect(provider.metadata.mcpExpose).toBe(true);
    });

    it('exposes swap action', () => {
      const provider = new JupiterSwapActionProvider({ enabled: true });
      expect(provider.actions).toHaveLength(1);
      const swap = provider.actions[0]!;
      expect(swap.name).toBe('swap');
      expect(swap.chain).toBe('solana');
      expect(swap.riskLevel).toBe('medium');
    });
  });

  describe('resolve - success', () => {
    it('returns valid ContractCallRequest for SOL -> USDC swap', async () => {
      const provider = new JupiterSwapActionProvider({ enabled: true });
      const result = await provider.resolve('swap', {
        inputMint: 'So11111111111111111111111111111111111111112',
        outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        amount: '1000000000',
      }, CONTEXT);

      expect(result.type).toBe('CONTRACT_CALL');
      expect(result.to).toBe(JUPITER_PROGRAM_ID);
      expect(result.programId).toBe(JUPITER_PROGRAM_ID);
      expect(result.instructionData).toBe('c3dhcGRhdGE=');
      expect(result.accounts).toHaveLength(2);
      expect(result.accounts?.[0]?.pubkey).toBe('So11111111111111111111111111111111111111112');
    });
  });

  describe('SAFE-01: default slippage 50bps', () => {
    it('uses default 50bps when no slippage specified', async () => {
      let capturedUrl = '';
      server.use(
        http.get('https://api.jup.ag/swap/v1/quote', ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json(QUOTE_RESPONSE);
        }),
      );

      const provider = new JupiterSwapActionProvider({ enabled: true, defaultSlippageBps: 50 });
      await provider.resolve('swap', {
        inputMint: 'So11111111111111111111111111111111111111112',
        outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        amount: '1000000000',
      }, CONTEXT);

      const url = new URL(capturedUrl);
      expect(url.searchParams.get('slippageBps')).toBe('50');
    });
  });

  describe('SAFE-02: max slippage 500bps clamp', () => {
    it('clamps slippage exceeding max to max', async () => {
      let capturedUrl = '';
      server.use(
        http.get('https://api.jup.ag/swap/v1/quote', ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json(QUOTE_RESPONSE);
        }),
      );

      const provider = new JupiterSwapActionProvider({
        enabled: true,
        defaultSlippageBps: 50,
        maxSlippageBps: 500,
      });
      await provider.resolve('swap', {
        inputMint: 'So11111111111111111111111111111111111111112',
        outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        amount: '1000000000',
        slippageBps: 1000,
      }, CONTEXT);

      const url = new URL(capturedUrl);
      expect(url.searchParams.get('slippageBps')).toBe('500');
    });
  });

  describe('SAFE-03: price impact check', () => {
    it('rejects when price impact exceeds max', async () => {
      server.use(
        http.get('https://api.jup.ag/swap/v1/quote', () => {
          return HttpResponse.json({ ...QUOTE_RESPONSE, priceImpactPct: '5.5' });
        }),
      );

      const provider = new JupiterSwapActionProvider({
        enabled: true,
        maxPriceImpactPct: 1.0,
      });

      await expect(
        provider.resolve('swap', {
          inputMint: 'So11111111111111111111111111111111111111112',
          outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          amount: '1000000000',
        }, CONTEXT),
      ).rejects.toThrow('Price impact');
    });
  });

  describe('SAFE-04: Jito MEV tip', () => {
    it('includes jitoTipLamports in swap-instructions request', async () => {
      let capturedBody: Record<string, unknown> = {};
      server.use(
        http.post('https://api.jup.ag/swap/v1/swap-instructions', async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json(SWAP_INSTRUCTIONS_RESPONSE);
        }),
      );

      const provider = new JupiterSwapActionProvider({
        enabled: true,
        jitoTipLamports: 2000,
      });
      await provider.resolve('swap', {
        inputMint: 'So11111111111111111111111111111111111111112',
        outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        amount: '1000000000',
      }, CONTEXT);

      expect(capturedBody.prioritizationFeeLamports).toEqual({
        jitoTipLamports: 2000,
      });
    });
  });

  describe('SAFE-05: same token check', () => {
    it('rejects same-token swap', async () => {
      const provider = new JupiterSwapActionProvider({ enabled: true });

      await expect(
        provider.resolve('swap', {
          inputMint: 'So11111111111111111111111111111111111111112',
          outputMint: 'So11111111111111111111111111111111111111112',
          amount: '1000000000',
        }, CONTEXT),
      ).rejects.toThrow('Cannot swap a token for itself');
    });
  });

  describe('SWAP-05: program ID verification', () => {
    it('rejects mismatched program ID', async () => {
      server.use(
        http.post('https://api.jup.ag/swap/v1/swap-instructions', () => {
          return HttpResponse.json({
            ...SWAP_INSTRUCTIONS_RESPONSE,
            swapInstruction: {
              ...SWAP_INSTRUCTIONS_RESPONSE.swapInstruction,
              programId: 'MaliciousProgram11111111111111111111111111111',
            },
          });
        }),
      );

      const provider = new JupiterSwapActionProvider({ enabled: true });

      await expect(
        provider.resolve('swap', {
          inputMint: 'So11111111111111111111111111111111111111112',
          outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          amount: '1000000000',
        }, CONTEXT),
      ).rejects.toThrow('Unexpected program ID');
    });
  });

  describe('SWAP-06: restrictIntermediateTokens', () => {
    it('sends restrictIntermediateTokens=true in quote request', async () => {
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
        amount: '1000000000',
      }, CONTEXT);

      const url = new URL(capturedUrl);
      expect(url.searchParams.get('restrictIntermediateTokens')).toBe('true');
    });
  });

  describe('error handling', () => {
    it('throws on unknown action name', async () => {
      const provider = new JupiterSwapActionProvider({ enabled: true });
      await expect(
        provider.resolve('unknown', {}, CONTEXT),
      ).rejects.toThrow('Unknown action');
    });

    it('throws on API error', async () => {
      server.use(
        http.get('https://api.jup.ag/swap/v1/quote', () => {
          return HttpResponse.json({ error: 'Route not found' }, { status: 400 });
        }),
      );

      const provider = new JupiterSwapActionProvider({ enabled: true });
      await expect(
        provider.resolve('swap', {
          inputMint: 'InvalidMint',
          outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          amount: '1000000000',
        }, CONTEXT),
      ).rejects.toThrow('API error');
    });

    it('throws on missing input params', async () => {
      const provider = new JupiterSwapActionProvider({ enabled: true });
      await expect(
        provider.resolve('swap', { inputMint: '' }, CONTEXT),
      ).rejects.toThrow();
    });
  });
});
