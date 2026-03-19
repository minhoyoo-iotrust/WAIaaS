/**
 * DCent Swap policy engine integration tests.
 *
 * Verifies that DcentSwapActionProvider outputs the correct
 * request types for policy evaluation:
 * - DEX Swap -> ContractCallRequest[] (CONTRACT_CALL type, subject to CONTRACT_WHITELIST)
 * - Exchange -> TRANSFER type (not subject to CONTRACT_WHITELIST, DS-09)
 *
 * Phase 346-03 Task 2: TEST-06
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { DcentSwapActionProvider } from '../providers/dcent-swap/index.js';
import type { ActionContext } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = 'https://agent-swap.dcentwallet.com';
const ETH_CAIP19 = 'eip155:1/slip44:60';
const USDC_CAIP19 = 'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const USDC_ADDRESS = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';

const SUSHI_SPENDER = '0xAC4c6e212A361c968F1725b4d055b47E63F80b75';
const WALLET_ADDRESS = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

const CONTEXT: ActionContext = {
  chain: 'ethereum',
  walletAddress: WALLET_ADDRESS,
  walletId: 'test-wallet-uuid',
};

// ---------------------------------------------------------------------------
// MSW server
// ---------------------------------------------------------------------------

const server = setupServer(
  http.get(`${BASE_URL}/api/swap/v3/get_supported_currencies`, () =>
    HttpResponse.json([
      { currencyId: 'ETHEREUM', tokenDeviceId: 'ERC20', providers: ['sushi_swap'] },
    ]),
  ),
  // Default: native sell (ETH -> USDC)
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
          quoteType: 'flexible',
          expectedAmount: '2049257221',
          spenderContractAddress: SUSHI_SPENDER,
        }],
      },
    }),
  ),
  http.post(`${BASE_URL}/api/swap/v3/get_dex_swap_transaction_data`, () =>
    HttpResponse.json({
      status: 'success',
      txdata: {
        from: WALLET_ADDRESS,
        to: SUSHI_SPENDER,
        data: '0x5f3bd1c8000000000000000000000000',
        value: '1000000000000000000',
      },
      networkFee: { gas: '275841', gasPrice: '121236406' },
    }),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function createProvider(): DcentSwapActionProvider {
  return new DcentSwapActionProvider({
    apiBaseUrl: BASE_URL,
    requestTimeoutMs: 5_000,
    defaultSlippageBps: 100,
    maxSlippageBps: 500,
    currencyCacheTtlMs: 86_400_000,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DCent Swap policy integration', () => {
  describe('DEX Swap -> CONTRACT_CALL pipeline', () => {
    it('native sell returns ContractCallRequest with correct to, calldata, value', async () => {
      const provider = createProvider();
      const result = await provider.resolve('dex_swap', {
        fromAsset: ETH_CAIP19,
        toAsset: USDC_CAIP19,
        amount: '1000000000000000000',
        fromDecimals: 18,
        toDecimals: 6,
      }, CONTEXT);

      expect('__apiDirect' in (result as object)).toBe(false);
      const requests = Array.isArray(result) ? result : [result];
      const swap = requests[0] as { to: string; calldata: string; value: string };

      // to = DEX router address (subject to CONTRACT_WHITELIST)
      expect(swap.to.toLowerCase()).toBe(SUSHI_SPENDER.toLowerCase());
      // calldata = swap transaction data (0x prefixed hex)
      expect(swap.calldata).toMatch(/^0x/);
      // value = native amount being sent
      expect(swap.value).toBe('1000000000000000000');
    });

    it('ERC-20 sell returns approve + swap ContractCallRequests', async () => {
      server.use(
        http.post(`${BASE_URL}/api/swap/v3/get_quotes`, () =>
          HttpResponse.json({
            status: 'success',
            fromId: 'ERC20/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
            toId: 'ETHEREUM',
            providers: {
              bestOrder: ['sushi_swap'],
              common: [{
                id: 'sushi_swap',
                status: 'success',
                providerId: 'sushi_swap',
                providerType: 'swap',
                name: 'Sushi',
                fromAmount: '2000000000',
                quoteType: 'flexible',
                expectedAmount: '900000000000000000',
                spenderContractAddress: SUSHI_SPENDER,
              }],
            },
          }),
        ),
        http.post(`${BASE_URL}/api/swap/v3/get_dex_swap_transaction_data`, () =>
          HttpResponse.json({
            status: 'success',
            txdata: {
              from: WALLET_ADDRESS,
              to: SUSHI_SPENDER,
              data: '0xswapdata',
              value: '0',
            },
            networkFee: { gas: '200000' },
          }),
        ),
      );

      const provider = createProvider();
      const result = await provider.resolve('dex_swap', {
        fromAsset: USDC_CAIP19,
        toAsset: ETH_CAIP19,
        amount: '2000000000',
        fromDecimals: 6,
        toDecimals: 18,
      }, CONTEXT);

      expect('__apiDirect' in (result as object)).toBe(false);
      const requests = Array.isArray(result) ? result : [result];
      expect(requests.length).toBe(2);

      // First request: approve (to = ERC-20 token contract)
      const approve = requests[0] as { to: string; calldata: string; value: string };
      expect(approve.to.toLowerCase()).toBe(USDC_ADDRESS);
      // approve(address,uint256) selector = 0x095ea7b3
      expect(approve.calldata).toContain('0x095ea7b3');
      expect(approve.value).toBe('0');

      // Second request: swap (to = DEX router, subject to CONTRACT_WHITELIST)
      const swap = requests[1] as { to: string; calldata: string };
      expect(swap.to.toLowerCase()).toBe(SUSHI_SPENDER.toLowerCase());
      expect(swap.calldata).toBeDefined();
    });
  });

  describe('metadata validation', () => {
    it('provider metadata indicates no API key required', () => {
      const provider = createProvider();
      expect(provider.metadata.name).toBe('dcent_swap');
      expect(provider.metadata.requiresApiKey).toBe(false);
      expect(provider.metadata.chains).toContain('ethereum');
      expect(provider.metadata.chains).not.toContain('solana');
    });

    it('provider has 2 actions defined (DEX-only)', () => {
      const provider = createProvider();
      expect(provider.actions.length).toBe(2);
      const actionNames = provider.actions.map((a) => a.name);
      expect(actionNames).toContain('get_quotes');
      expect(actionNames).toContain('dex_swap');
    });
  });
});
