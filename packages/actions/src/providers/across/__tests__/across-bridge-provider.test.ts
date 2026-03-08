/**
 * AcrossBridgeActionProvider integration tests.
 * Tests 5 actions: quote, execute (ERC-20/native), status, routes, limits.
 * Uses msw for API mocking and viem decodeFunctionData for calldata verification.
 *
 * @see internal/design/79-across-protocol-bridge.md
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { decodeFunctionData } from 'viem';
import { ChainError } from '@waiaas/core';
import type { ActionContext, ContractCallRequest, ApiDirectResult } from '@waiaas/core';
import { AcrossBridgeActionProvider } from '../index.js';
import { ACROSS_DEFAULTS, getSpokePoolAddress, getWethAddress } from '../config.js';

// ---------------------------------------------------------------------------
// SpokePool depositV3 ABI (local copy for calldata decoding in tests)
// ---------------------------------------------------------------------------

const SPOKE_POOL_DEPOSIT_V3_ABI = [
  {
    type: 'function' as const,
    name: 'depositV3' as const,
    inputs: [
      { name: 'depositor', type: 'address' as const },
      { name: 'recipient', type: 'address' as const },
      { name: 'inputToken', type: 'address' as const },
      { name: 'outputToken', type: 'address' as const },
      { name: 'inputAmount', type: 'uint256' as const },
      { name: 'outputAmount', type: 'uint256' as const },
      { name: 'destinationChainId', type: 'uint256' as const },
      { name: 'exclusiveRelayer', type: 'address' as const },
      { name: 'quoteTimestamp', type: 'uint32' as const },
      { name: 'fillDeadline', type: 'uint32' as const },
      { name: 'exclusivityDeadline', type: 'uint32' as const },
      { name: 'message', type: 'bytes' as const },
    ],
    outputs: [],
    stateMutability: 'payable' as const,
  },
] as const;

const ERC20_APPROVE_ABI = [
  {
    type: 'function' as const,
    name: 'approve' as const,
    inputs: [
      { name: 'spender', type: 'address' as const },
      { name: 'amount', type: 'uint256' as const },
    ],
    outputs: [{ name: '', type: 'bool' as const }],
    stateMutability: 'nonpayable' as const,
  },
] as const;

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const NOW_SEC = Math.floor(Date.now() / 1000);

const MOCK_SUGGESTED_FEES = {
  totalRelayFee: { pct: '1000000000000000', total: '100000' },
  relayerCapitalFee: { pct: '500000000000000', total: '50000' },
  relayerGasFee: { pct: '300000000000000', total: '30000' },
  lpFee: { pct: '200000000000000', total: '20000' },
  timestamp: NOW_SEC - 5,
  isAmountTooLow: false,
  exclusiveRelayer: '0x0000000000000000000000000000000000000000',
  exclusivityDeadline: 0,
  expectedFillTimeSec: 5,
  limits: {
    minDeposit: '10000',
    maxDeposit: '1000000000000',
    maxDepositInstant: '500000000000',
    maxDepositShortDelay: '800000000000',
  },
};

const MOCK_ROUTES = [
  {
    originChainId: 1,
    destinationChainId: 42161,
    originToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    destinationToken: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
  },
];

const MOCK_LIMITS = {
  minDeposit: '10000',
  maxDeposit: '1000000000000',
  maxDepositInstant: '500000000000',
  maxDepositShortDelay: '800000000000',
};

const MOCK_DEPOSIT_STATUS = {
  status: 'filled' as const,
  fillTxHash: '0xfill1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcd',
  depositId: 42,
  destinationChainId: 42161,
};

const MOCK_CONTEXT: ActionContext = {
  walletAddress: '0x1234567890123456789012345678901234567890',
  chain: 'ethereum',
} as ActionContext;

const INPUT_TOKEN = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'; // USDC
const OUTPUT_TOKEN = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9'; // USDT
const WETH_ETH = getWethAddress(1); // Ethereum WETH

// ---------------------------------------------------------------------------
// MSW server setup
// ---------------------------------------------------------------------------

const BASE_URL = 'https://app.across.to/api';

const server = setupServer(
  http.get(`${BASE_URL}/suggested-fees`, () => {
    return HttpResponse.json(MOCK_SUGGESTED_FEES);
  }),
  http.get(`${BASE_URL}/limits`, () => {
    return HttpResponse.json(MOCK_LIMITS);
  }),
  http.get(`${BASE_URL}/available-routes`, () => {
    return HttpResponse.json(MOCK_ROUTES);
  }),
  http.get(`${BASE_URL}/deposit/status`, () => {
    return HttpResponse.json(MOCK_DEPOSIT_STATUS);
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AcrossBridgeActionProvider', () => {
  describe('constructor', () => {
    it('uses ACROSS_DEFAULTS when no config provided', () => {
      const provider = new AcrossBridgeActionProvider();
      expect(provider.metadata.name).toBe('across_bridge');
      expect(provider.actions).toHaveLength(5);
    });

    it('merges partial config over defaults', () => {
      const provider = new AcrossBridgeActionProvider({ enabled: true, integratorId: 'test' });
      expect(provider.metadata.name).toBe('across_bridge');
    });
  });

  describe('resolve("quote")', () => {
    it('returns ApiDirectResult with outputAmount = inputAmount - totalRelayFee.total', async () => {
      const provider = new AcrossBridgeActionProvider();
      const result = await provider.resolve('quote', {
        fromChain: 'ethereum',
        toChain: 'arbitrum',
        inputToken: INPUT_TOKEN,
        outputToken: OUTPUT_TOKEN,
        amount: '1000000',
      }, MOCK_CONTEXT) as ApiDirectResult;

      expect(result.__apiDirect).toBe(true);
      expect(result.provider).toBe('across_bridge');
      expect(result.action).toBe('quote');
      // 1000000 - 100000 = 900000
      expect(result.data.outputAmount).toBe('900000');
      expect(result.data.inputAmount).toBe('1000000');
      expect(result.data.totalFee).toBe('100000');
    });

    it('includes feeBreakdown', async () => {
      const provider = new AcrossBridgeActionProvider();
      const result = await provider.resolve('quote', {
        fromChain: 'ethereum',
        toChain: 'arbitrum',
        inputToken: INPUT_TOKEN,
        outputToken: OUTPUT_TOKEN,
        amount: '1000000',
      }, MOCK_CONTEXT) as ApiDirectResult;

      const breakdown = result.data.feeBreakdown as Record<string, string>;
      expect(breakdown.lpFee).toBe('20000');
      expect(breakdown.relayerCapitalFee).toBe('50000');
      expect(breakdown.relayerGasFee).toBe('30000');
    });

    it('includes limits', async () => {
      const provider = new AcrossBridgeActionProvider();
      const result = await provider.resolve('quote', {
        fromChain: 'ethereum',
        toChain: 'arbitrum',
        inputToken: INPUT_TOKEN,
        outputToken: OUTPUT_TOKEN,
        amount: '1000000',
      }, MOCK_CONTEXT) as ApiDirectResult;

      const limits = result.data.limits as Record<string, string>;
      expect(limits.minDeposit).toBe('10000');
      expect(limits.maxDeposit).toBe('1000000000000');
    });

    it('throws for unsupported fromChain', async () => {
      const provider = new AcrossBridgeActionProvider();
      await expect(
        provider.resolve('quote', {
          fromChain: 'solana',
          toChain: 'arbitrum',
          inputToken: INPUT_TOKEN,
          outputToken: OUTPUT_TOKEN,
          amount: '1000000',
        }, MOCK_CONTEXT),
      ).rejects.toThrow(ChainError);
    });
  });

  describe('resolve("execute") - ERC-20 bridge', () => {
    it('returns 2-element ContractCallRequest[] array (approve + depositV3)', async () => {
      const provider = new AcrossBridgeActionProvider();
      const result = await provider.resolve('execute', {
        fromChain: 'ethereum',
        toChain: 'arbitrum',
        inputToken: INPUT_TOKEN,
        outputToken: OUTPUT_TOKEN,
        amount: '1000000',
      }, MOCK_CONTEXT) as ContractCallRequest[];

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result[0]!.type).toBe('CONTRACT_CALL');
      expect(result[1]!.type).toBe('CONTRACT_CALL');
    });

    it('first TX: approve(spokePoolAddress, inputAmount) on inputToken', async () => {
      const provider = new AcrossBridgeActionProvider();
      const result = await provider.resolve('execute', {
        fromChain: 'ethereum',
        toChain: 'arbitrum',
        inputToken: INPUT_TOKEN,
        outputToken: OUTPUT_TOKEN,
        amount: '1000000',
      }, MOCK_CONTEXT) as ContractCallRequest[];

      const approveTx = result[0]!;
      expect(approveTx.to).toBe(INPUT_TOKEN);

      const decoded = decodeFunctionData({
        abi: ERC20_APPROVE_ABI,
        data: approveTx.calldata as `0x${string}`,
      });
      expect(decoded.functionName).toBe('approve');
      const spokePool = getSpokePoolAddress(1);
      expect((decoded.args as readonly unknown[])[0]).toBe(spokePool);
      // Pitfall 10: approve exact inputAmount, not MaxUint256
      expect((decoded.args as readonly unknown[])[1]).toBe(BigInt('1000000'));
    });

    it('second TX: depositV3 calldata on spokePoolAddress with 12 correct params', async () => {
      const provider = new AcrossBridgeActionProvider();
      const result = await provider.resolve('execute', {
        fromChain: 'ethereum',
        toChain: 'arbitrum',
        inputToken: INPUT_TOKEN,
        outputToken: OUTPUT_TOKEN,
        amount: '1000000',
      }, MOCK_CONTEXT) as ContractCallRequest[];

      const depositTx = result[1]!;
      const spokePool = getSpokePoolAddress(1);
      expect(depositTx.to).toBe(spokePool);

      const decoded = decodeFunctionData({
        abi: SPOKE_POOL_DEPOSIT_V3_ABI,
        data: depositTx.calldata as `0x${string}`,
      });
      expect(decoded.functionName).toBe('depositV3');

      const args = decoded.args as readonly unknown[];
      // depositor = context.walletAddress
      expect(args[0]).toBe(MOCK_CONTEXT.walletAddress);
      // recipient = context.walletAddress (default)
      expect(args[1]).toBe(MOCK_CONTEXT.walletAddress);
      // inputToken
      expect(args[2]).toBe(INPUT_TOKEN);
      // outputToken
      expect(args[3]).toBe(OUTPUT_TOKEN);
      // inputAmount
      expect(args[4]).toBe(BigInt('1000000'));
      // outputAmount = inputAmount - totalRelayFee.total = 1000000 - 100000 = 900000
      expect(args[5]).toBe(BigInt('900000'));
      // destinationChainId = 42161 (arbitrum)
      expect(args[6]).toBe(BigInt(42161));
      // exclusiveRelayer = 0x0 (open competition)
      expect(args[7]).toBe('0x0000000000000000000000000000000000000000');
      // quoteTimestamp = fees.timestamp
      expect(args[8]).toBe(MOCK_SUGGESTED_FEES.timestamp);
      // fillDeadline = timestamp + fillDeadlineBufferSec
      expect(args[9]).toBe(MOCK_SUGGESTED_FEES.timestamp + ACROSS_DEFAULTS.fillDeadlineBufferSec);
      // exclusivityDeadline = 0 (open competition)
      expect(args[10]).toBe(0);
      // message = '0x' (empty)
      expect(args[11]).toBe('0x');
    });

    it('no value field on ERC-20 TX', async () => {
      const provider = new AcrossBridgeActionProvider();
      const result = await provider.resolve('execute', {
        fromChain: 'ethereum',
        toChain: 'arbitrum',
        inputToken: INPUT_TOKEN,
        outputToken: OUTPUT_TOKEN,
        amount: '1000000',
      }, MOCK_CONTEXT) as ContractCallRequest[];

      expect(result[0]!.value).toBeUndefined();
      expect(result[1]!.value).toBeUndefined();
    });
  });

  describe('resolve("execute") - native ETH bridge', () => {
    it('returns single depositV3 with msg.value (no approve)', async () => {
      const provider = new AcrossBridgeActionProvider();
      const result = await provider.resolve('execute', {
        fromChain: 'ethereum',
        toChain: 'arbitrum',
        inputToken: WETH_ETH,
        outputToken: OUTPUT_TOKEN,
        amount: '1000000',
      }, MOCK_CONTEXT) as ContractCallRequest[];

      expect(result).toHaveLength(1);
      // value = inputAmount for native ETH
      expect(result[0]!.value).toBe('1000000');
    });

    it('depositV3 calldata inputToken is WETH address', async () => {
      const provider = new AcrossBridgeActionProvider();
      const result = await provider.resolve('execute', {
        fromChain: 'ethereum',
        toChain: 'arbitrum',
        inputToken: WETH_ETH,
        outputToken: OUTPUT_TOKEN,
        amount: '1000000',
      }, MOCK_CONTEXT) as ContractCallRequest[];

      const decoded = decodeFunctionData({
        abi: SPOKE_POOL_DEPOSIT_V3_ABI,
        data: result[0]!.calldata as `0x${string}`,
      });
      const args = decoded.args as readonly unknown[];
      expect(args[2]).toBe(WETH_ETH);
    });
  });

  describe('resolve("execute") - custom recipient', () => {
    it('sets recipient in depositV3 when specified', async () => {
      const customRecipient = '0xabcdef1234567890abcdef1234567890abcdef12';
      const provider = new AcrossBridgeActionProvider();
      const result = await provider.resolve('execute', {
        fromChain: 'ethereum',
        toChain: 'arbitrum',
        inputToken: INPUT_TOKEN,
        outputToken: OUTPUT_TOKEN,
        amount: '1000000',
        recipient: customRecipient,
      }, MOCK_CONTEXT) as ContractCallRequest[];

      const decoded = decodeFunctionData({
        abi: SPOKE_POOL_DEPOSIT_V3_ABI,
        data: result[1]!.calldata as `0x${string}`,
      });
      const args = decoded.args as readonly unknown[];
      expect((args[1] as string).toLowerCase()).toBe(customRecipient.toLowerCase()); // recipient
    });
  });

  describe('resolve("execute") - error cases', () => {
    it('throws when isAmountTooLow=true', async () => {
      server.use(
        http.get(`${BASE_URL}/suggested-fees`, () => {
          return HttpResponse.json({ ...MOCK_SUGGESTED_FEES, isAmountTooLow: true });
        }),
      );

      const provider = new AcrossBridgeActionProvider();
      await expect(
        provider.resolve('execute', {
          fromChain: 'ethereum',
          toChain: 'arbitrum',
          inputToken: INPUT_TOKEN,
          outputToken: OUTPUT_TOKEN,
          amount: '1000000',
        }, MOCK_CONTEXT),
      ).rejects.toThrow(/below minimum|isAmountTooLow/i);
    });

    it('throws when inputAmount < minDeposit', async () => {
      server.use(
        http.get(`${BASE_URL}/suggested-fees`, () => {
          return HttpResponse.json({
            ...MOCK_SUGGESTED_FEES,
            totalRelayFee: { pct: '100000', total: '1' },
            limits: { ...MOCK_SUGGESTED_FEES.limits, minDeposit: '999999999' },
          });
        }),
      );

      const provider = new AcrossBridgeActionProvider();
      await expect(
        provider.resolve('execute', {
          fromChain: 'ethereum',
          toChain: 'arbitrum',
          inputToken: INPUT_TOKEN,
          outputToken: OUTPUT_TOKEN,
          amount: '1000',
        }, MOCK_CONTEXT),
      ).rejects.toThrow(/below minimum|minimum deposit/i);
    });

    it('throws when inputAmount > maxDeposit', async () => {
      server.use(
        http.get(`${BASE_URL}/suggested-fees`, () => {
          return HttpResponse.json({
            ...MOCK_SUGGESTED_FEES,
            totalRelayFee: { pct: '100000', total: '1' },
            limits: { ...MOCK_SUGGESTED_FEES.limits, maxDeposit: '100' },
          });
        }),
      );

      const provider = new AcrossBridgeActionProvider();
      await expect(
        provider.resolve('execute', {
          fromChain: 'ethereum',
          toChain: 'arbitrum',
          inputToken: INPUT_TOKEN,
          outputToken: OUTPUT_TOKEN,
          amount: '1000000',
        }, MOCK_CONTEXT),
      ).rejects.toThrow(/above maximum|maximum deposit/i);
    });

    it('throws when outputAmount would be zero (fees >= inputAmount)', async () => {
      server.use(
        http.get(`${BASE_URL}/suggested-fees`, () => {
          return HttpResponse.json({
            ...MOCK_SUGGESTED_FEES,
            totalRelayFee: { pct: '100', total: '1000000' }, // fee == inputAmount
          });
        }),
      );

      const provider = new AcrossBridgeActionProvider();
      await expect(
        provider.resolve('execute', {
          fromChain: 'ethereum',
          toChain: 'arbitrum',
          inputToken: INPUT_TOKEN,
          outputToken: OUTPUT_TOKEN,
          amount: '1000000',
        }, MOCK_CONTEXT),
      ).rejects.toThrow(/zero|negative/i);
    });

    it('throws when fillDeadline is in the past (stale quote)', async () => {
      server.use(
        http.get(`${BASE_URL}/suggested-fees`, () => {
          return HttpResponse.json({
            ...MOCK_SUGGESTED_FEES,
            // timestamp so far in the past that timestamp + 21600 < now
            timestamp: Math.floor(Date.now() / 1000) - 100_000,
          });
        }),
      );

      const provider = new AcrossBridgeActionProvider();
      await expect(
        provider.resolve('execute', {
          fromChain: 'ethereum',
          toChain: 'arbitrum',
          inputToken: INPUT_TOKEN,
          outputToken: OUTPUT_TOKEN,
          amount: '1000000',
        }, MOCK_CONTEXT),
      ).rejects.toThrow(/stale|past/i);
    });

    it('throws for unsupported fromChain', async () => {
      const provider = new AcrossBridgeActionProvider();
      await expect(
        provider.resolve('execute', {
          fromChain: 'solana',
          toChain: 'arbitrum',
          inputToken: INPUT_TOKEN,
          outputToken: OUTPUT_TOKEN,
          amount: '1000000',
        }, MOCK_CONTEXT),
      ).rejects.toThrow(ChainError);
    });
  });

  describe('resolve("status")', () => {
    it('returns ApiDirectResult with status field', async () => {
      const provider = new AcrossBridgeActionProvider();
      const result = await provider.resolve('status', {
        depositTxHash: '0xdeposit123',
      }, MOCK_CONTEXT) as ApiDirectResult;

      expect(result.__apiDirect).toBe(true);
      expect(result.provider).toBe('across_bridge');
      expect(result.action).toBe('status');
      expect(result.data.status).toBe('filled');
    });

    it('includes fillTxHash', async () => {
      const provider = new AcrossBridgeActionProvider();
      const result = await provider.resolve('status', {
        depositTxHash: '0xdeposit123',
      }, MOCK_CONTEXT) as ApiDirectResult;

      expect(result.data.fillTxHash).toBe(MOCK_DEPOSIT_STATUS.fillTxHash);
    });
  });

  describe('resolve("routes")', () => {
    it('returns ApiDirectResult with routes array', async () => {
      const provider = new AcrossBridgeActionProvider();
      const result = await provider.resolve('routes', {}, MOCK_CONTEXT) as ApiDirectResult;

      expect(result.__apiDirect).toBe(true);
      expect(result.action).toBe('routes');
      expect(Array.isArray(result.data.routes)).toBe(true);
    });

    it('passes fromChain/toChain as originChainId/destinationChainId', async () => {
      let capturedUrl = '';
      server.use(
        http.get(`${BASE_URL}/available-routes`, ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json(MOCK_ROUTES);
        }),
      );

      const provider = new AcrossBridgeActionProvider();
      await provider.resolve('routes', {
        fromChain: 'ethereum',
        toChain: 'arbitrum',
      }, MOCK_CONTEXT);

      const url = new URL(capturedUrl);
      expect(url.searchParams.get('originChainId')).toBe('1');
      expect(url.searchParams.get('destinationChainId')).toBe('42161');
    });
  });

  describe('resolve("limits")', () => {
    it('returns ApiDirectResult with minDeposit/maxDeposit', async () => {
      const provider = new AcrossBridgeActionProvider();
      const result = await provider.resolve('limits', {
        fromChain: 'ethereum',
        toChain: 'arbitrum',
        inputToken: INPUT_TOKEN,
        outputToken: OUTPUT_TOKEN,
      }, MOCK_CONTEXT) as ApiDirectResult;

      expect(result.__apiDirect).toBe(true);
      expect(result.action).toBe('limits');
      expect(result.data.minDeposit).toBe('10000');
      expect(result.data.maxDeposit).toBe('1000000000000');
    });
  });

  describe('resolve("unknown")', () => {
    it('throws ChainError for unknown action name', async () => {
      const provider = new AcrossBridgeActionProvider();
      await expect(
        provider.resolve('invalid_action', {}, MOCK_CONTEXT),
      ).rejects.toThrow(ChainError);
    });
  });
});
