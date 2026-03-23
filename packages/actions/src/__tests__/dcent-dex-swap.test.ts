/**
 * DCent DEX Swap unit tests.
 * Uses msw to intercept DCent Swap API calls.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { getDcentQuotes, executeDexSwap, tryGetDcentQuotes } from '../providers/dcent-swap/dex-swap.js';
import { DcentSwapApiClient } from '../providers/dcent-swap/dcent-api-client.js';
import { DCENT_SWAP_DEFAULTS, type DcentSwapConfig } from '../providers/dcent-swap/config.js';
import { ChainError } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = 'https://agent-swap.dcentwallet.com';
const SOLANA_CAIP2 = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';

const ETH_CAIP19 = 'eip155:1/slip44:60';
const USDC_CAIP19 = 'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const USDC_ADDRESS = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';

const SUSHI_SPENDER = '0xAC4c6e212A361c968F1725b4d055b47E63F80b75';

// ---------------------------------------------------------------------------
// Mock responses
// ---------------------------------------------------------------------------

function makeQuotesResponse(overrides: Record<string, unknown> = {}) {
  return {
    status: 'success',
    fromId: 'ETHEREUM',
    toId: 'ERC20/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    providers: {
      bestOrder: ['sushi_swap', 'uniswap_swap'],
      common: [
        {
          id: 'sushi_swap',
          status: 'success',
          providerId: 'sushi_swap',
          providerType: 'swap',
          name: 'Sushi',
          fromAmount: '1000000000000000000',
          quoteType: 'flexible',
          expectedAmount: '2049257221',
          spenderContractAddress: SUSHI_SPENDER,
        },
        {
          id: 'uniswap_swap',
          status: 'success',
          providerId: 'uniswap_swap',
          providerType: 'swap',
          name: 'Uniswap',
          fromAmount: '1000000000000000000',
          quoteType: 'flexible',
          expectedAmount: '2040000000',
          spenderContractAddress: '0xUniswapRouter',
        },
        {
          id: 'rubic_swap',
          status: 'fail_chain_not_supported',
          providerId: 'rubic_swap',
          providerType: 'cross_swap',
          name: 'Rubic',
        },
      ],
    },
    ...overrides,
  };
}

function makeTxDataResponse(overrides: Record<string, unknown> = {}) {
  return {
    status: 'success',
    txdata: {
      from: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      to: SUSHI_SPENDER,
      data: '0x5f3bd1c8abcdef',
      value: '1000000000000000000',
    },
    networkFee: {
      gas: '275841',
      gasPrice: '121236406',
    },
    ...overrides,
  };
}

const CURRENCIES_RESPONSE = [
  { currencyId: 'ETHEREUM', tokenDeviceId: 'ERC20', currencyName: 'Ethereum' },
  { currencyId: 'ERC20/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', tokenDeviceId: 'ERC20', currencyName: 'USDC' },
];

// ---------------------------------------------------------------------------
// MSW server
// ---------------------------------------------------------------------------

const server = setupServer(
  http.get(`${BASE_URL}/api/swap/v3/get_supported_currencies`, () => {
    return HttpResponse.json(CURRENCIES_RESPONSE);
  }),
  http.post(`${BASE_URL}/api/swap/v3/get_quotes`, () => {
    return HttpResponse.json(makeQuotesResponse());
  }),
  http.post(`${BASE_URL}/api/swap/v3/get_dex_swap_transaction_data`, () => {
    return HttpResponse.json(makeTxDataResponse());
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function createClient(): DcentSwapApiClient {
  return new DcentSwapApiClient({ apiBaseUrl: BASE_URL });
}

const DEFAULT_CONFIG: DcentSwapConfig = { ...DCENT_SWAP_DEFAULTS, apiBaseUrl: BASE_URL };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('dcent-dex-swap', () => {
  describe('getDcentQuotes', () => {
    it('returns DEX providers', async () => {
      const client = createClient();
      const result = await getDcentQuotes(client, {
        fromAsset: ETH_CAIP19,
        toAsset: USDC_CAIP19,
        amount: '1000000000000000000',
        fromDecimals: 18,
        toDecimals: 6,
      });

      expect(result.dexProviders).toHaveLength(2);
      expect(result.dexProviders[0]?.providerId).toBe('sushi_swap');
      expect(result.bestDexProvider?.providerId).toBe('sushi_swap');
    });

    it('filters out failed providers', async () => {
      const client = createClient();
      const result = await getDcentQuotes(client, {
        fromAsset: ETH_CAIP19,
        toAsset: USDC_CAIP19,
        amount: '1000000000000000000',
        fromDecimals: 18,
        toDecimals: 6,
      });

      // rubic_swap has status 'fail_chain_not_supported' -> filtered out
      const providerIds = result.dexProviders.map(p => p.providerId);
      expect(providerIds).not.toContain('rubic_swap');
    });

    it('sorts DEX providers by expectedAmount descending', async () => {
      const client = createClient();
      const result = await getDcentQuotes(client, {
        fromAsset: ETH_CAIP19,
        toAsset: USDC_CAIP19,
        amount: '1000000000000000000',
        fromDecimals: 18,
        toDecimals: 6,
      });

      // sushi: 2049257221 > uniswap: 2040000000
      expect(result.dexProviders[0]?.providerId).toBe('sushi_swap');
      expect(result.dexProviders[1]?.providerId).toBe('uniswap_swap');
    });

    it('throws NO_ROUTE when all providers fail', async () => {
      server.use(
        http.post(`${BASE_URL}/api/swap/v3/get_quotes`, () => {
          return HttpResponse.json({ status: 'fail_no_available_provider' });
        }),
      );

      const client = createClient();
      await expect(
        getDcentQuotes(client, {
          fromAsset: ETH_CAIP19,
          toAsset: USDC_CAIP19,
          amount: '1000000000000000000',
          fromDecimals: 18,
          toDecimals: 6,
        }),
      ).rejects.toThrow(ChainError);
    });
  });

  describe('executeDexSwap', () => {
    it('returns single CONTRACT_CALL for native sell (no approve)', async () => {
      const client = createClient();
      const result = await executeDexSwap(client, {
        fromAsset: ETH_CAIP19,
        toAsset: USDC_CAIP19,
        amount: '1000000000000000000',
        fromDecimals: 18,
        toDecimals: 6,
        walletAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      }, DEFAULT_CONFIG);

      expect(result).toHaveLength(1);
      expect(result[0]!.type).toBe('CONTRACT_CALL');
      expect(result[0]!.to).toBe(SUSHI_SPENDER);
      expect(result[0]!.calldata).toBe('0x5f3bd1c8abcdef');
      expect(result[0]!.value).toBe('1000000000000000000');
    });

    it('returns [approve, swap] for ERC-20 sell', async () => {
      // ERC-20 sell: USDC -> ETH
      server.use(
        http.post(`${BASE_URL}/api/swap/v3/get_quotes`, () => {
          return HttpResponse.json(makeQuotesResponse({
            fromId: 'ERC20/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
            toId: 'ETHEREUM',
          }));
        }),
        http.post(`${BASE_URL}/api/swap/v3/get_dex_swap_transaction_data`, () => {
          return HttpResponse.json(makeTxDataResponse({
            txdata: {
              from: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
              to: SUSHI_SPENDER,
              data: '0xswapdata',
              value: '0',
            },
          }));
        }),
      );

      const client = createClient();
      const result = await executeDexSwap(client, {
        fromAsset: USDC_CAIP19,
        toAsset: ETH_CAIP19,
        amount: '1000000',
        fromDecimals: 6,
        toDecimals: 18,
        walletAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      }, DEFAULT_CONFIG);

      expect(result).toHaveLength(2);

      // approve calldata
      const approve = result[0]!;
      expect(approve.type).toBe('CONTRACT_CALL');
      expect(approve.to).toBe(USDC_ADDRESS);
      expect(approve.calldata).toMatch(/^0x095ea7b3/); // approve selector
      expect(approve.value).toBe('0');

      // swap calldata
      const swap = result[1]!;
      expect(swap.type).toBe('CONTRACT_CALL');
      expect(swap.to).toBe(SUSHI_SPENDER);
      expect(swap.calldata).toBe('0xswapdata');
    });

    it('encodes approve calldata correctly', async () => {
      server.use(
        http.post(`${BASE_URL}/api/swap/v3/get_quotes`, () => {
          return HttpResponse.json(makeQuotesResponse());
        }),
        http.post(`${BASE_URL}/api/swap/v3/get_dex_swap_transaction_data`, () => {
          return HttpResponse.json(makeTxDataResponse({
            txdata: {
              from: '0xwallet',
              to: SUSHI_SPENDER,
              data: '0xswapdata',
              value: '0',
            },
          }));
        }),
      );

      const client = createClient();
      const result = await executeDexSwap(client, {
        fromAsset: USDC_CAIP19,
        toAsset: ETH_CAIP19,
        amount: '1000000',
        fromDecimals: 6,
        toDecimals: 18,
        walletAddress: '0xwallet',
      }, DEFAULT_CONFIG);

      const approveCalldata = result[0]!.calldata!;
      // selector: 0x095ea7b3
      expect(approveCalldata.slice(0, 10)).toBe('0x095ea7b3');
      // spender padded to 32 bytes (64 hex chars)
      const paddedSpender = approveCalldata.slice(10, 74);
      expect(paddedSpender).toContain(SUSHI_SPENDER.slice(2).toLowerCase());
      // amount padded to 32 bytes
      const paddedAmount = approveCalldata.slice(74);
      expect(BigInt(`0x${paddedAmount}`)).toBe(1000000n);
    });

    it('throws INVALID_INSTRUCTION for same-asset swap', async () => {
      const client = createClient();
      await expect(
        executeDexSwap(client, {
          fromAsset: ETH_CAIP19,
          toAsset: ETH_CAIP19,
          amount: '1000000000000000000',
          fromDecimals: 18,
          toDecimals: 18,
          walletAddress: '0xwallet',
        }, DEFAULT_CONFIG),
      ).rejects.toThrow(ChainError);
    });

    it('throws when no DEX providers available', async () => {
      server.use(
        http.post(`${BASE_URL}/api/swap/v3/get_quotes`, () => {
          return HttpResponse.json({
            status: 'fail_no_available_provider',
            fromId: 'ETHEREUM',
            toId: 'UNKNOWN',
            providers: { bestOrder: [], common: [] },
          });
        }),
      );

      const client = createClient();
      await expect(
        executeDexSwap(client, {
          fromAsset: ETH_CAIP19,
          toAsset: `${SOLANA_CAIP2}/slip44:501`,
          amount: '1000000000000000000',
          fromDecimals: 18,
          toDecimals: 9,
          walletAddress: '0xwallet',
        }, DEFAULT_CONFIG),
      ).rejects.toThrow(ChainError);
    });

    it('throws AMOUNT_TOO_SMALL when expectedAmount is 0', async () => {
      server.use(
        http.post(`${BASE_URL}/api/swap/v3/get_quotes`, () => {
          return HttpResponse.json({
            status: 'success',
            fromId: 'ETHEREUM',
            toId: 'ERC20/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
            providers: {
              bestOrder: ['sushi_swap'],
              common: [
                {
                  id: 'sushi_swap',
                  status: 'success',
                  providerId: 'sushi_swap',
                  providerType: 'swap',
                  expectedAmount: '0',
                  spenderContractAddress: SUSHI_SPENDER,
                },
              ],
            },
          });
        }),
      );

      const client = createClient();
      await expect(
        executeDexSwap(client, {
          fromAsset: ETH_CAIP19,
          toAsset: USDC_CAIP19,
          amount: '1',
          fromDecimals: 18,
          toDecimals: 6,
          walletAddress: '0xwallet',
        }, DEFAULT_CONFIG),
      ).rejects.toThrow(ChainError);
    });

    it('uses providerId when specified', async () => {
      let capturedProviderId: string | undefined;
      server.use(
        http.post(`${BASE_URL}/api/swap/v3/get_dex_swap_transaction_data`, async ({ request }) => {
          const body = await request.json() as Record<string, unknown>;
          capturedProviderId = body.providerId as string;
          return HttpResponse.json(makeTxDataResponse());
        }),
      );

      const client = createClient();
      await executeDexSwap(client, {
        fromAsset: ETH_CAIP19,
        toAsset: USDC_CAIP19,
        amount: '1000000000000000000',
        fromDecimals: 18,
        toDecimals: 6,
        walletAddress: '0xwallet',
        providerId: 'uniswap_swap',
      }, DEFAULT_CONFIG);

      expect(capturedProviderId).toBe('uniswap_swap');
    });

    it('clamps slippage to default when not specified', async () => {
      let capturedSlippage: number | undefined;
      server.use(
        http.post(`${BASE_URL}/api/swap/v3/get_dex_swap_transaction_data`, async ({ request }) => {
          const body = await request.json() as Record<string, unknown>;
          capturedSlippage = body.slippage as number;
          return HttpResponse.json(makeTxDataResponse());
        }),
      );

      const client = createClient();
      await executeDexSwap(client, {
        fromAsset: ETH_CAIP19,
        toAsset: USDC_CAIP19,
        amount: '1000000000000000000',
        fromDecimals: 18,
        toDecimals: 6,
        walletAddress: '0xwallet',
      }, DEFAULT_CONFIG);

      // Default is 100 bps (1%), DCent API expects integer percent
      expect(capturedSlippage).toBe(1);
    });

    it('clamps slippage to max when exceeding limit', async () => {
      let capturedSlippage: number | undefined;
      server.use(
        http.post(`${BASE_URL}/api/swap/v3/get_dex_swap_transaction_data`, async ({ request }) => {
          const body = await request.json() as Record<string, unknown>;
          capturedSlippage = body.slippage as number;
          return HttpResponse.json(makeTxDataResponse());
        }),
      );

      const client = createClient();
      await executeDexSwap(client, {
        fromAsset: ETH_CAIP19,
        toAsset: USDC_CAIP19,
        amount: '1000000000000000000',
        fromDecimals: 18,
        toDecimals: 6,
        walletAddress: '0xwallet',
        slippageBps: 1000, // 10% -> should be clamped to 5% (500 bps)
      }, DEFAULT_CONFIG);

      // Max is 500 bps (5%), DCent API expects integer percent
      expect(capturedSlippage).toBe(5);
    });

    it('throws when specified providerId not found in DEX providers', async () => {
      const client = createClient();
      await expect(
        executeDexSwap(client, {
          fromAsset: ETH_CAIP19,
          toAsset: USDC_CAIP19,
          amount: '1000000000000000000',
          fromDecimals: 18,
          toDecimals: 6,
          walletAddress: '0xwallet',
          providerId: 'nonexistent_provider',
        }, DEFAULT_CONFIG),
      ).rejects.toThrow('not available or not a DEX provider');
    });

    it('throws when no DEX providers in successful quote', async () => {
      server.use(
        http.post(`${BASE_URL}/api/swap/v3/get_quotes`, () => {
          return HttpResponse.json({
            status: 'success',
            fromId: 'ETHEREUM',
            toId: 'ERC20/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
            providers: {
              bestOrder: [],
              common: [
                {
                  id: 'failed_swap',
                  status: 'fail_chain_not_supported',
                  providerId: 'failed_swap',
                  providerType: 'swap',
                  name: 'Failed',
                },
              ],
            },
          });
        }),
      );

      const client = createClient();
      await expect(
        executeDexSwap(client, {
          fromAsset: ETH_CAIP19,
          toAsset: USDC_CAIP19,
          amount: '1000000000000000000',
          fromDecimals: 18,
          toDecimals: 6,
          walletAddress: '0xwallet',
        }, DEFAULT_CONFIG),
      ).rejects.toThrow('No DEX swap route available');
    });

    it('throws when DCent API returns no txdata object', async () => {
      server.use(
        http.post(`${BASE_URL}/api/swap/v3/get_dex_swap_transaction_data`, () => {
          return HttpResponse.json({
            status: 'success',
            // txdata omitted entirely
          });
        }),
      );

      const client = createClient();
      await expect(
        executeDexSwap(client, {
          fromAsset: ETH_CAIP19,
          toAsset: USDC_CAIP19,
          amount: '1000000000000000000',
          fromDecimals: 18,
          toDecimals: 6,
          walletAddress: '0xwallet',
        }, DEFAULT_CONFIG),
      ).rejects.toThrow('DCent API returned empty txdata');
    });

    it('passes fromWalletAddress in quote request when provided', async () => {
      let capturedBody: Record<string, unknown> | undefined;
      server.use(
        http.post(`${BASE_URL}/api/swap/v3/get_quotes`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json(makeQuotesResponse());
        }),
      );

      const client = createClient();
      await getDcentQuotes(client, {
        fromAsset: ETH_CAIP19,
        toAsset: USDC_CAIP19,
        amount: '1000000000000000000',
        fromDecimals: 18,
        toDecimals: 6,
        fromWalletAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      });

      expect(capturedBody).toBeDefined();
      expect(capturedBody!.fromWalletAddress).toBe('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');
    });

    it('omits fromWalletAddress from quote request when not provided', async () => {
      let capturedBody: Record<string, unknown> | undefined;
      server.use(
        http.post(`${BASE_URL}/api/swap/v3/get_quotes`, async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json(makeQuotesResponse());
        }),
      );

      const client = createClient();
      await getDcentQuotes(client, {
        fromAsset: ETH_CAIP19,
        toAsset: USDC_CAIP19,
        amount: '1000000000000000000',
        fromDecimals: 18,
        toDecimals: 6,
      });

      expect(capturedBody).toBeDefined();
      expect(capturedBody!.fromWalletAddress).toBeUndefined();
    });

    it('executeDexSwap passes walletAddress as fromWalletAddress in quote request', async () => {
      let capturedQuoteBody: Record<string, unknown> | undefined;
      server.use(
        http.post(`${BASE_URL}/api/swap/v3/get_quotes`, async ({ request }) => {
          capturedQuoteBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json(makeQuotesResponse());
        }),
      );

      const client = createClient();
      await executeDexSwap(client, {
        fromAsset: ETH_CAIP19,
        toAsset: USDC_CAIP19,
        amount: '1000000000000000000',
        fromDecimals: 18,
        toDecimals: 6,
        walletAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      }, DEFAULT_CONFIG);

      expect(capturedQuoteBody).toBeDefined();
      expect(capturedQuoteBody!.fromWalletAddress).toBe('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');
    });

    it('corrects native sell value when API returns only protocol fees', async () => {
      server.use(
        http.post(`${BASE_URL}/api/swap/v3/get_dex_swap_transaction_data`, () => {
          return HttpResponse.json({
            status: 'success',
            txdata: {
              from: '0xwallet',
              to: SUSHI_SPENDER,
              data: '0xdata',
              value: '10925036', // protocol fee only, not swap amount
            },
          });
        }),
      );

      const client = createClient();
      const result = await executeDexSwap(client, {
        fromAsset: ETH_CAIP19,
        toAsset: USDC_CAIP19,
        amount: '5000000000000000', // 0.005 ETH
        fromDecimals: 18,
        toDecimals: 6,
        walletAddress: '0xwallet',
      }, DEFAULT_CONFIG);

      // Value should be corrected to swap amount since API value < swap amount
      expect(result[0]!.value).toBe('5000000000000000');
    });

    it('keeps API value for native sell when API value >= swap amount', async () => {
      const client = createClient();
      const result = await executeDexSwap(client, {
        fromAsset: ETH_CAIP19,
        toAsset: USDC_CAIP19,
        amount: '1000000000000000000',
        fromDecimals: 18,
        toDecimals: 6,
        walletAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      }, DEFAULT_CONFIG);

      // Mock returns value: '1000000000000000000' which equals swap amount -> keep as-is
      expect(result[0]!.value).toBe('1000000000000000000');
    });

    it('does not correct value for ERC-20 sell', async () => {
      server.use(
        http.post(`${BASE_URL}/api/swap/v3/get_quotes`, () => {
          return HttpResponse.json(makeQuotesResponse({
            fromId: 'ERC20/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
            toId: 'ETHEREUM',
          }));
        }),
        http.post(`${BASE_URL}/api/swap/v3/get_dex_swap_transaction_data`, () => {
          return HttpResponse.json(makeTxDataResponse({
            txdata: {
              from: '0xwallet',
              to: SUSHI_SPENDER,
              data: '0xswapdata',
              value: '0',
            },
          }));
        }),
      );

      const client = createClient();
      const result = await executeDexSwap(client, {
        fromAsset: USDC_CAIP19,
        toAsset: ETH_CAIP19,
        amount: '1000000',
        fromDecimals: 6,
        toDecimals: 18,
        walletAddress: '0xwallet',
      }, DEFAULT_CONFIG);

      // ERC-20 sell: value stays as API returned ('0'), no correction
      expect(result[1]!.value).toBe('0');
    });
  });

  describe('Solana swap (#417)', () => {
    const SOL_CAIP19 = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501';
    const SOL_USDC_CAIP19 = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

    it('returns Solana ContractCallRequest with instructionData', async () => {
      server.use(
        http.post(`${BASE_URL}/api/swap/v3/get_quotes`, () => {
          return HttpResponse.json(makeQuotesResponse());
        }),
        http.post(`${BASE_URL}/api/swap/v3/get_dex_swap_transaction_data`, () => {
          return HttpResponse.json({
            status: 'success',
            txdata: {
              serializedTransaction: 'AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAbase64==',
              programId: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
            },
          });
        }),
      );

      const client = createClient();
      const result = await executeDexSwap(client, {
        fromAsset: SOL_CAIP19,
        toAsset: SOL_USDC_CAIP19,
        amount: '1000000000',
        fromDecimals: 9,
        toDecimals: 6,
        walletAddress: 'SoLWaLLeTaDDreSS11111111111111111111111111',
      }, DEFAULT_CONFIG);

      expect(result).toHaveLength(1);
      expect(result[0]!.type).toBe('CONTRACT_CALL');
      expect(result[0]!.instructionData).toBe('AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAbase64==');
      expect(result[0]!.to).toBe('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4');
    });
  });

  describe('tryGetDcentQuotes', () => {
    it('returns result on success', async () => {
      server.use(
        http.get(`${BASE_URL}/api/swap/v3/get_supported_currencies`, () => HttpResponse.json(CURRENCIES_RESPONSE)),
        http.post(`${BASE_URL}/api/swap/v3/get_quotes`, () => HttpResponse.json(makeQuotesResponse())),
      );
      const client = createClient();
      const res = await tryGetDcentQuotes(client, {
        fromAsset: ETH_CAIP19,
        toAsset: USDC_CAIP19,
        amount: '1000000000000000000',
        fromDecimals: 18,
        toDecimals: 6,
      });
      expect('result' in res).toBe(true);
    });

    it('returns noRoute when no provider available', async () => {
      server.use(
        http.get(`${BASE_URL}/api/swap/v3/get_supported_currencies`, () => HttpResponse.json(CURRENCIES_RESPONSE)),
        http.post(`${BASE_URL}/api/swap/v3/get_quotes`, () =>
          HttpResponse.json({ status: 'fail_no_available_provider', fromId: 'ETHEREUM', toId: 'UNKNOWN', providers: { bestOrder: [], common: [] } }),
        ),
      );
      const client = createClient();
      const res = await tryGetDcentQuotes(client, {
        fromAsset: ETH_CAIP19,
        toAsset: USDC_CAIP19,
        amount: '1000000000000000000',
        fromDecimals: 18,
        toDecimals: 6,
      });
      expect('noRoute' in res).toBe(true);
    });

    it('rethrows non-route errors', async () => {
      server.use(
        http.get(`${BASE_URL}/api/swap/v3/get_supported_currencies`, () => HttpResponse.json(CURRENCIES_RESPONSE)),
        http.post(`${BASE_URL}/api/swap/v3/get_quotes`, () =>
          HttpResponse.json({ error: 'Internal Server Error' }, { status: 500 }),
        ),
      );
      const client = createClient();
      await expect(tryGetDcentQuotes(client, {
        fromAsset: ETH_CAIP19,
        toAsset: USDC_CAIP19,
        amount: '1000000000000000000',
        fromDecimals: 18,
        toDecimals: 6,
      })).rejects.toThrow();
    });
  });

  describe('executeDexSwap edge cases', () => {
    it('throws when specified providerId not found among DEX providers', async () => {
      server.use(
        http.get(`${BASE_URL}/api/swap/v3/get_supported_currencies`, () => HttpResponse.json(CURRENCIES_RESPONSE)),
        http.post(`${BASE_URL}/api/swap/v3/get_quotes`, () =>
          HttpResponse.json(makeQuotesResponse()),
        ),
      );
      const client = createClient();
      await expect(executeDexSwap(client, {
        fromAsset: ETH_CAIP19,
        toAsset: USDC_CAIP19,
        amount: '1000000000000000000',
        fromDecimals: 18,
        toDecimals: 6,
        walletAddress: '0x1234567890123456789012345678901234567890',
        providerId: 'nonexistent_provider',
      }, DEFAULT_CONFIG)).rejects.toThrow('not available or not a DEX provider');
    });

    it('throws when expectedAmount is 0', async () => {
      server.use(
        http.get(`${BASE_URL}/api/swap/v3/get_supported_currencies`, () => HttpResponse.json(CURRENCIES_RESPONSE)),
        http.post(`${BASE_URL}/api/swap/v3/get_quotes`, () =>
          HttpResponse.json({
            status: 'success',
            fromId: 'ETHEREUM',
            toId: 'ERC20/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
            providers: {
              bestOrder: ['sushi_swap'],
              common: [{
                id: 'sushi_swap',
                status: 'success',
                providerId: 'sushi_swap',
                providerType: 'swap',
                name: 'Sushi',
                fromAmount: '1000000000000000000',
                expectedAmount: '0',
                spenderContractAddress: '0xAC4c6e212A361c968F1725b4d055b47E63F80b75',
              }],
            },
          }),
        ),
      );
      const client = createClient();
      await expect(executeDexSwap(client, {
        fromAsset: ETH_CAIP19,
        toAsset: USDC_CAIP19,
        amount: '1000000000000000000',
        fromDecimals: 18,
        toDecimals: 6,
        walletAddress: '0x1234567890123456789012345678901234567890',
      }, DEFAULT_CONFIG)).rejects.toThrow('Amount too small');
    });
  });
});
