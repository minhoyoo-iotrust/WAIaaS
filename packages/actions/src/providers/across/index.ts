/**
 * Across Protocol Cross-Chain Bridge Action Provider.
 *
 * Implements IActionProvider with 5 actions:
 * - quote:   Get bridge quote (fees, limits, estimated fill time)
 * - execute: Execute bridge via SpokePool depositV3 (ERC-20 BATCH or native ETH)
 * - status:  Check deposit status (filled/pending/expired/refunded)
 * - routes:  List available bridge routes
 * - limits:  Get min/max transfer amounts for a route
 *
 * Uses Across REST API + SpokePool ABI encoding (no Across SDK dependency).
 * See: design doc 79
 */
import { z } from 'zod';
import { ChainError } from '@waiaas/core';
import type {
  IActionProvider,
  ActionProviderMetadata,
  ActionDefinition,
  ActionContext,
  ContractCallRequest,
  ApiDirectResult,
  ILogger,
} from '@waiaas/core';
import { encodeFunctionData } from 'viem';
import { AcrossApiClient } from './across-api-client.js';
import { resolveProviderHumanAmount } from '../../common/resolve-human-amount.js';
import type { AcrossSuggestedFeesResponse } from './schemas.js';
import {
  type AcrossConfig,
  ACROSS_DEFAULTS,
  getAcrossChainId,
  getSpokePoolAddress,
  isNativeTokenBridge,
} from './config.js';

// ---------------------------------------------------------------------------
// Input schemas (design doc 79 section 8.3)
// ---------------------------------------------------------------------------

const AcrossQuoteInputSchema = z.object({
  fromChain: z.string().min(1, 'fromChain is required (e.g., ethereum, arbitrum, base)'),
  toChain: z.string().min(1, 'toChain is required'),
  inputToken: z.string().min(1, 'inputToken address is required'),
  outputToken: z.string().min(1, 'outputToken address is required'),
  amount: z.string().min(1, 'amount is required (in smallest units, e.g., wei)').describe('Amount in smallest units (wei). Example: "1000000" = 1 USDC').optional(),
  humanAmount: z.string().min(1).optional()
    .describe('Human-readable amount (e.g., "100" for 100 USDC). Requires decimals field. Mutually exclusive with amount.'),
  decimals: z.number().int().min(0).max(24).optional()
    .describe('Token decimals for humanAmount conversion. Required when using humanAmount.'),
  recipient: z.string().optional(),
});

const AcrossExecuteInputSchema = z.object({
  fromChain: z.string().min(1),
  toChain: z.string().min(1),
  inputToken: z.string().min(1),
  outputToken: z.string().min(1),
  amount: z.string().min(1).describe('Amount in smallest units (wei). Example: "1000000" = 1 USDC').optional(),
  humanAmount: z.string().min(1).optional()
    .describe('Human-readable amount (e.g., "100" for 100 USDC). Requires decimals field. Mutually exclusive with amount.'),
  decimals: z.number().int().min(0).max(24).optional()
    .describe('Token decimals for humanAmount conversion. Required when using humanAmount.'),
  recipient: z.string().optional(),
  slippage: z.number().min(0).max(1).optional(),  // decimal, 0.01 = 1%
});

const AcrossStatusInputSchema = z.object({
  depositTxHash: z.string().min(1, 'depositTxHash is required'),
  originChainId: z.number().optional(),
});

const AcrossRoutesInputSchema = z.object({
  fromChain: z.string().optional(),
  toChain: z.string().optional(),
  inputToken: z.string().optional(),
  outputToken: z.string().optional(),
});

const AcrossLimitsInputSchema = z.object({
  fromChain: z.string().min(1),
  toChain: z.string().min(1),
  inputToken: z.string().min(1),
  outputToken: z.string().min(1),
});

// ---------------------------------------------------------------------------
// SpokePool depositV3 ABI (design doc 79 section 4.3)
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

// ---------------------------------------------------------------------------
// ERC-20 approve ABI
// ---------------------------------------------------------------------------

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
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Validate bridge parameters before depositV3 (design doc 79 section 5.3).
 */
function validateBridgeParams(
  inputAmount: bigint,
  outputAmount: bigint,
  fees: AcrossSuggestedFeesResponse,
): void {
  // 1. isAmountTooLow check (Pitfall 1)
  if (fees.isAmountTooLow) {
    throw new ChainError('ACTION_API_ERROR', 'ethereum', {
      message: 'Deposit amount is below minimum for this route (isAmountTooLow)',
    });
  }

  // 2. outputAmount <= inputAmount
  if (outputAmount > inputAmount) {
    throw new ChainError('INVALID_INSTRUCTION', 'ethereum', {
      message: 'outputAmount cannot exceed inputAmount',
    });
  }

  // 3. outputAmount > 0
  if (outputAmount <= 0n) {
    throw new ChainError('ACTION_API_ERROR', 'ethereum', {
      message: 'outputAmount would be zero or negative after fees',
    });
  }

  // 4. Within limits range
  const limits = fees.limits;
  if (inputAmount < BigInt(limits.minDeposit)) {
    throw new ChainError('ACTION_API_ERROR', 'ethereum', {
      message: `Amount below minimum deposit: ${limits.minDeposit}`,
    });
  }
  if (inputAmount > BigInt(limits.maxDeposit)) {
    throw new ChainError('ACTION_API_ERROR', 'ethereum', {
      message: `Amount above maximum deposit: ${limits.maxDeposit}`,
    });
  }
}

/**
 * Calculate fillDeadline (design doc 79 section 7.1).
 * Priority: API-suggested fillDeadline > quoteTimestamp + buffer.
 */
function calculateFillDeadline(
  fees: AcrossSuggestedFeesResponse,
  config: AcrossConfig,
): number {
  // Priority 1: Use API-suggested fillDeadline if available
  const apiDeadline = (fees as Record<string, unknown>).fillDeadline;
  if (typeof apiDeadline === 'number' && apiDeadline > 0) {
    return apiDeadline;
  }

  // Priority 2: quoteTimestamp + admin configurable buffer
  return fees.timestamp + config.fillDeadlineBufferSec;
}

/**
 * Resolve exclusivity parameters (design doc 79 section 7.2).
 * Pitfall 6: exclusiveRelayer=0x0 -> exclusivityDeadline must be 0.
 */
function resolveExclusivity(fees: AcrossSuggestedFeesResponse): {
  exclusiveRelayer: `0x${string}`;
  exclusivityDeadline: number;
} {
  const zeroAddress = '0x0000000000000000000000000000000000000000' as `0x${string}`;
  const exclusiveRelayer = fees.exclusiveRelayer as `0x${string}`;
  const isOpenCompetition = exclusiveRelayer.toLowerCase() === zeroAddress.toLowerCase();

  return {
    exclusiveRelayer: isOpenCompetition ? zeroAddress : exclusiveRelayer,
    exclusivityDeadline: isOpenCompetition ? 0 : (fees.exclusivityDeadline ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Provider implementation
// ---------------------------------------------------------------------------

export class AcrossBridgeActionProvider implements IActionProvider {
  readonly metadata: ActionProviderMetadata;
  readonly actions: readonly ActionDefinition[];
  private readonly config: AcrossConfig;
  private readonly logger?: ILogger;

  constructor(config?: Partial<AcrossConfig>, logger?: ILogger) {
    this.config = { ...ACROSS_DEFAULTS, ...config };
    this.logger = logger;

    this.metadata = {
      name: 'across_bridge',
      displayName: 'Across Bridge',
      description: 'Across Protocol intent-based cross-chain bridge with fast relayer fills (2-10 seconds)',
      version: '1.0.0',
      chains: ['ethereum'],  // multi-chain via fromChain/toChain params
      mcpExpose: true,
      requiresApiKey: false,
      requiredApis: ['across'],
      requiresSigningKey: false,
    };

    this.actions = [
      {
        name: 'quote',
        description: 'Get Across bridge quote with fees, limits, and estimated fill time',
        chain: 'ethereum',
        inputSchema: AcrossQuoteInputSchema,
        riskLevel: 'low',
        defaultTier: 'INSTANT',
      },
      {
        name: 'execute',
        description: 'Execute cross-chain bridge via Across Protocol SpokePool depositV3',
        chain: 'ethereum',
        inputSchema: AcrossExecuteInputSchema,
        riskLevel: 'high',
        defaultTier: 'DELAY',
      },
      {
        name: 'status',
        description: 'Check Across bridge deposit status (filled/pending/expired/refunded)',
        chain: 'ethereum',
        inputSchema: AcrossStatusInputSchema,
        riskLevel: 'low',
        defaultTier: 'INSTANT',
      },
      {
        name: 'routes',
        description: 'List available Across bridge routes (supported chain/token combinations)',
        chain: 'ethereum',
        inputSchema: AcrossRoutesInputSchema,
        riskLevel: 'low',
        defaultTier: 'INSTANT',
      },
      {
        name: 'limits',
        description: 'Get Across bridge transfer limits for a specific route',
        chain: 'ethereum',
        inputSchema: AcrossLimitsInputSchema,
        riskLevel: 'low',
        defaultTier: 'INSTANT',
      },
    ] as const;
  }

  async resolve(
    actionName: string,
    params: Record<string, unknown>,
    context: ActionContext,
  ): Promise<ContractCallRequest | ContractCallRequest[] | ApiDirectResult> {
    switch (actionName) {
      case 'quote':    return this.resolveQuote(params, context);
      case 'execute':  return this.resolveExecute(params, context);
      case 'status':   return this.resolveStatus(params);
      case 'routes':   return this.resolveRoutes(params);
      case 'limits':   return this.resolveLimits(params);
      default:
        throw new ChainError('INVALID_INSTRUCTION', 'ethereum', {
          message: `Unknown action: ${actionName}. Supported: quote, execute, status, routes, limits`,
        });
    }
  }

  // ---------------------------------------------------------------------------
  // Action resolvers
  // ---------------------------------------------------------------------------

  /**
   * Get bridge quote with fees, limits, and estimated fill time.
   * Returns ApiDirectResult with quote data (design doc 79 section 9.2).
   */
  private async resolveQuote(
    params: Record<string, unknown>,
    context: ActionContext,
  ): Promise<ApiDirectResult> {
    const rp = { ...params };
    resolveProviderHumanAmount(rp, 'amount', 'humanAmount');
    const input = AcrossQuoteInputSchema.parse(rp);
    if (!input.amount) throw new ChainError('INVALID_INSTRUCTION', 'ethereum', { message: 'Either amount or humanAmount (with decimals) is required' });
    const originChainId = getAcrossChainId(input.fromChain);
    const destChainId = getAcrossChainId(input.toChain);

    const apiClient = new AcrossApiClient(this.config, this.logger);
    const fees = await apiClient.getSuggestedFees({
      inputToken: input.inputToken,
      outputToken: input.outputToken,
      originChainId,
      destinationChainId: destChainId,
      amount: input.amount,
      recipient: input.recipient ?? context.walletAddress,
    });

    // DS-07: outputAmount = inputAmount - totalRelayFee.total
    const inputAmount = BigInt(input.amount);
    const outputAmount = inputAmount - BigInt(fees.totalRelayFee.total);
    const fillDeadline = calculateFillDeadline(fees, this.config);

    return {
      __apiDirect: true,
      externalId: `quote-${fees.timestamp}`,
      status: 'success',
      provider: 'across_bridge',
      action: 'quote',
      data: {
        inputAmount: inputAmount.toString(),
        outputAmount: outputAmount > 0n ? outputAmount.toString() : '0',
        totalFee: fees.totalRelayFee.total,
        feeBreakdown: {
          lpFee: fees.lpFee.total,
          relayerCapitalFee: fees.relayerCapitalFee.total,
          relayerGasFee: fees.relayerGasFee.total,
        },
        estimatedFillTimeSec: fees.expectedFillTimeSec ?? null,
        fillDeadline,
        isAmountTooLow: fees.isAmountTooLow,
        limits: {
          minDeposit: fees.limits.minDeposit,
          maxDeposit: fees.limits.maxDeposit,
          maxDepositInstant: fees.limits.maxDepositInstant,
          maxDepositShortDelay: fees.limits.maxDepositShortDelay,
        },
      },
    };
  }

  /**
   * Execute cross-chain bridge via SpokePool depositV3.
   * ERC-20: returns [approve, depositV3] BATCH.
   * Native ETH: returns [depositV3] with msg.value.
   * DS-04: Fresh quote at resolve time (late-bind pattern).
   */
  private async resolveExecute(
    params: Record<string, unknown>,
    context: ActionContext,
  ): Promise<ContractCallRequest[]> {
    const rp = { ...params };
    resolveProviderHumanAmount(rp, 'amount', 'humanAmount');
    const input = AcrossExecuteInputSchema.parse(rp);
    if (!input.amount) throw new ChainError('INVALID_INSTRUCTION', 'ethereum', { message: 'Either amount or humanAmount (with decimals) is required' });
    const originChainId = getAcrossChainId(input.fromChain);
    const destChainId = getAcrossChainId(input.toChain);

    // 1. Get fresh suggested fees (no caching -- DS-04 late-bind)
    const apiClient = new AcrossApiClient(this.config, this.logger);
    const fees = await apiClient.getSuggestedFees({
      inputToken: input.inputToken,
      outputToken: input.outputToken,
      originChainId,
      destinationChainId: destChainId,
      amount: input.amount,
      recipient: input.recipient ?? context.walletAddress,
    });

    // 2. Calculate outputAmount (DS-07)
    const inputAmount = BigInt(input.amount);
    const outputAmount = inputAmount - BigInt(fees.totalRelayFee.total);

    // 3. Validate
    validateBridgeParams(inputAmount, outputAmount, fees);

    // 4. Resolve fillDeadline + exclusivity
    const fillDeadline = calculateFillDeadline(fees, this.config);
    const { exclusiveRelayer, exclusivityDeadline } = resolveExclusivity(fees);

    // 5. Validate fillDeadline not in past (Pitfall 3)
    const nowSec = Math.floor(Date.now() / 1000);
    if (fillDeadline <= nowSec) {
      throw new ChainError('ACTION_API_ERROR', 'ethereum', {
        message: 'fillDeadline is in the past. Quote may be stale.',
      });
    }

    // 6. Determine native or ERC-20
    const isNative = isNativeTokenBridge(input.inputToken, originChainId);
    const spokePoolAddress = getSpokePoolAddress(originChainId);
    const recipient = (input.recipient ?? context.walletAddress) as `0x${string}`;

    // 7. Encode depositV3 calldata
    const depositCalldata = encodeFunctionData({
      abi: SPOKE_POOL_DEPOSIT_V3_ABI,
      functionName: 'depositV3',
      args: [
        context.walletAddress as `0x${string}`,   // depositor
        recipient,                                  // recipient
        input.inputToken as `0x${string}`,         // inputToken
        input.outputToken as `0x${string}`,        // outputToken
        inputAmount,                                // inputAmount
        outputAmount,                               // outputAmount
        BigInt(destChainId),                        // destinationChainId
        exclusiveRelayer,                           // exclusiveRelayer
        fees.timestamp,                             // quoteTimestamp
        fillDeadline,                               // fillDeadline
        exclusivityDeadline,                        // exclusivityDeadline
        '0x' as `0x${string}`,                     // message (empty)
      ],
    });

    // 8. Build ContractCallRequest array
    if (isNative) {
      // Native ETH: single depositV3 with msg.value = inputAmount
      return [{
        type: 'CONTRACT_CALL' as const,
        to: spokePoolAddress,
        calldata: depositCalldata,
        value: input.amount,  // msg.value = inputAmount
      }];
    }

    // ERC-20: approve(spokePool, inputAmount) + depositV3
    // Pitfall 10: approve exact amount, not MaxUint256
    const approveCalldata = encodeFunctionData({
      abi: ERC20_APPROVE_ABI,
      functionName: 'approve',
      args: [spokePoolAddress as `0x${string}`, inputAmount],
    });

    return [
      {
        type: 'CONTRACT_CALL' as const,
        to: input.inputToken,
        calldata: approveCalldata,
      },
      {
        type: 'CONTRACT_CALL' as const,
        to: spokePoolAddress,
        calldata: depositCalldata,
      },
    ];
  }

  /**
   * Check deposit status via Across /deposit/status API.
   */
  private async resolveStatus(
    params: Record<string, unknown>,
  ): Promise<ApiDirectResult> {
    const input = AcrossStatusInputSchema.parse(params);
    const apiClient = new AcrossApiClient(this.config, this.logger);
    const result = await apiClient.getDepositStatus({
      depositTxnRef: input.depositTxHash,
      originChainId: input.originChainId,
    });

    return {
      __apiDirect: true,
      externalId: input.depositTxHash,
      status: 'success',
      provider: 'across_bridge',
      action: 'status',
      data: {
        status: result.status,
        fillTxHash: result.fillTxHash ?? result.fillTx ?? null,
        depositId: result.depositId ?? null,
        destinationChainId: result.destinationChainId ?? null,
        depositTxHash: result.depositTxHash ?? null,
        updatedAt: result.updatedAt ?? null,
      },
    };
  }

  /**
   * List available bridge routes.
   */
  private async resolveRoutes(
    params: Record<string, unknown>,
  ): Promise<ApiDirectResult> {
    const input = AcrossRoutesInputSchema.parse(params);
    const apiClient = new AcrossApiClient(this.config, this.logger);

    const apiParams: {
      originChainId?: number;
      destinationChainId?: number;
      originToken?: string;
      destinationToken?: string;
    } = {};

    if (input.fromChain) apiParams.originChainId = getAcrossChainId(input.fromChain);
    if (input.toChain) apiParams.destinationChainId = getAcrossChainId(input.toChain);
    if (input.inputToken) apiParams.originToken = input.inputToken;
    if (input.outputToken) apiParams.destinationToken = input.outputToken;

    const routes = await apiClient.getAvailableRoutes(apiParams);
    return {
      __apiDirect: true,
      externalId: 'routes',
      status: 'success',
      provider: 'across_bridge',
      action: 'routes',
      data: { routes },
    };
  }

  /**
   * Get min/max transfer limits for a specific route.
   */
  private async resolveLimits(
    params: Record<string, unknown>,
  ): Promise<ApiDirectResult> {
    const input = AcrossLimitsInputSchema.parse(params);
    const originChainId = getAcrossChainId(input.fromChain);
    const destChainId = getAcrossChainId(input.toChain);

    const apiClient = new AcrossApiClient(this.config, this.logger);
    const result = await apiClient.getLimits({
      inputToken: input.inputToken,
      outputToken: input.outputToken,
      originChainId,
      destinationChainId: destChainId,
    });

    return {
      __apiDirect: true,
      externalId: 'limits',
      status: 'success',
      provider: 'across_bridge',
      action: 'limits',
      data: {
        minDeposit: result.minDeposit,
        maxDeposit: result.maxDeposit,
        maxDepositInstant: result.maxDepositInstant,
        maxDepositShortDelay: result.maxDepositShortDelay,
      },
    };
  }

}
