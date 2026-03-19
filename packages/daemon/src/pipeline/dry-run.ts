/**
 * Dry-run simulation pipeline.
 *
 * Executes transaction stages in read-only mode with ZERO side effects:
 * - No DB INSERT/UPDATE
 * - No signing / key decryption
 * - No on-chain submission
 * - No notifications / events / audit logs
 *
 * Returns a DryRunSimulationResult with policy evaluation, fee estimate,
 * balance changes, warnings, and simulation details.
 *
 * @see Phase 304 DESIGN-SPEC.md section 3 (SIM-02)
 * @see Phase 309 Plan 01 Task 2
 */

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import {
  NATIVE_DECIMALS,
  NATIVE_SYMBOLS,
  TransactionRequestSchema,
  WAIaaSError,
  type IChainAdapter,
  type IPolicyEngine,
  type TransactionRequest,
  type UnsignedTransaction,
  type SimulationResult,
  type DryRunSimulationResult,
  type GasConditionResult,
  type ChainType,
  type PolicyEvaluation,
  type IPriceOracle,
} from '@waiaas/core';
import type * as schema from '../infrastructure/database/schema.js';
import { wallets } from '../infrastructure/database/schema.js';
import type { SettingsService } from '../infrastructure/settings/settings-service.js';
import { buildByType, buildTransactionParam, getRequestAmount } from './stages.js';
import { resolveEffectiveAmountUsd, type PriceResult } from './resolve-effective-amount-usd.js';
import { downgradeIfNoOwner } from '../workflow/owner-state.js';
import { GAS_SAFETY_NUMERATOR, GAS_SAFETY_DENOMINATOR } from '../constants.js';
import { queryEvmGasPrice, querySolanaGasPrice } from './gas-condition-tracker.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// DryRunDeps -- subset of PipelineDeps (no keyStore, no masterPassword)
// ---------------------------------------------------------------------------

export interface DryRunDeps {
  db: BetterSQLite3Database<typeof schema>;
  adapter: IChainAdapter;
  policyEngine: IPolicyEngine;
  priceOracle?: IPriceOracle;
  settingsService?: SettingsService;
  /** RPC URL for gas price queries (needed for gasCondition evaluation). */
  rpcUrl?: string;
}

// ---------------------------------------------------------------------------
// DryRunCollector -- accumulates results through stages
// ---------------------------------------------------------------------------

export interface DryRunCollector {
  validationPassed: boolean;
  policyEvaluation: PolicyEvaluation | null;
  downgraded: boolean;
  unsignedTx: UnsignedTransaction | null;
  simulationResult: SimulationResult | null;
  currentBalances: Array<{ asset: string; symbol: string; decimals: number; balance: bigint }>;
  warnings: Array<{ code: string; message: string; severity: 'info' | 'warning' | 'error' }>;
  startTime: number;
  amountUsd: number | null;
  feeUsd: number | null;
  gasConditionResult: GasConditionResult | null;
}

// ---------------------------------------------------------------------------
// executeDryRun
// ---------------------------------------------------------------------------

/**
 * Execute a transaction dry-run simulation.
 *
 * Returns DryRunSimulationResult with zero side effects.
 * Policy denials return success=false (not thrown errors).
 * Build/simulation failures produce warnings (not exceptions).
 *
 * @param deps - Dry-run dependencies (no keyStore, no notifications)
 * @param walletId - Wallet ID
 * @param request - Transaction request (5-type discriminatedUnion)
 * @param resolvedNetwork - Pre-resolved network
 * @param walletInfo - Wallet public key, chain, environment
 * @returns DryRunSimulationResult
 * @throws WAIaaSError('VALIDATION_FAILED') for invalid request format
 */
export async function executeDryRun(
  deps: DryRunDeps,
  walletId: string,
  request: TransactionRequest,
  resolvedNetwork: string,
  walletInfo: { publicKey: string; chain: string; environment: string },
): Promise<DryRunSimulationResult> {
  const collector: DryRunCollector = {
    validationPassed: false,
    policyEvaluation: null,
    downgraded: false,
    unsignedTx: null,
    simulationResult: null,
    currentBalances: [],
    warnings: [],
    startTime: Date.now(),
    amountUsd: null,
    feeUsd: null,
    gasConditionResult: null,
  };

  const chain = walletInfo.chain;
  const txType = request.type || 'TRANSFER';
  const requestAmount = BigInt(getRequestAmount(request) || '0');

  // -----------------------------------------------------------------------
  // Stage 1': Validate only (no DB INSERT)
  // -----------------------------------------------------------------------

  const parseResult = TransactionRequestSchema.safeParse(request);
  if (!parseResult.success) {
    throw new WAIaaSError('VALIDATION_FAILED', {
      message: `Request validation failed: ${parseResult.error.message}`,
    });
  }
  collector.validationPassed = true;

  // -----------------------------------------------------------------------
  // Stage 3': Policy evaluate only (no reserve, no DB update)
  // -----------------------------------------------------------------------

  const txParam = buildTransactionParam(request, txType, chain);
  txParam.network = resolvedNetwork;

  // Resolve USD amount from price oracle (read-only)
  let priceResult: PriceResult | undefined;
  if (deps.priceOracle) {
    try {
      priceResult = await resolveEffectiveAmountUsd(
        request as unknown as Record<string, unknown>,
        txType,
        chain,
        deps.priceOracle,
        resolvedNetwork,
      );
      if (priceResult.type === 'success') {
        collector.amountUsd = priceResult.usdAmount;
      } else {
        collector.warnings.push({
          code: 'ORACLE_PRICE_UNAVAILABLE',
          message: priceResult.type === 'notListed'
            ? `Price unavailable for token ${priceResult.tokenAddress}`
            : 'Price oracle unavailable',
          severity: 'warning',
        });
      }
    } catch {
      collector.warnings.push({
        code: 'ORACLE_PRICE_UNAVAILABLE',
        message: 'Price oracle unavailable',
        severity: 'warning',
      });
    }
  }

  // Evaluate policy (read-only -- evaluate(), NOT evaluateAndReserve())
  const evaluation = await deps.policyEngine.evaluate(
    walletId,
    { ...txParam, network: resolvedNetwork },
  );
  collector.policyEvaluation = evaluation;

  // Check for owner downgrade (APPROVAL -> DELAY when no owner)
  if (evaluation.tier === 'APPROVAL') {
    const walletRow = deps.db
      .select({ ownerAddress: wallets.ownerAddress, ownerVerified: wallets.ownerVerified })
      .from(wallets)
      .where(eq(wallets.id, walletId))
      .get();

    const downgradeResult = downgradeIfNoOwner(
      {
        ownerAddress: walletRow?.ownerAddress ?? null,
        ownerVerified: !!walletRow?.ownerVerified,
      },
      evaluation.tier,
    );

    if (downgradeResult.downgraded) {
      collector.downgraded = true;
      evaluation.tier = downgradeResult.tier as PolicyEvaluation['tier'];
      collector.warnings.push({
        code: 'DOWNGRADED_NO_OWNER',
        message: 'APPROVAL tier downgraded to DELAY because no owner is registered',
        severity: 'info',
      });
    }
  }

  // Add tier-specific warnings
  if (evaluation.tier === 'APPROVAL') {
    collector.warnings.push({
      code: 'APPROVAL_REQUIRED',
      message: `Owner approval is required${evaluation.approvalReason ? ` (${evaluation.approvalReason})` : ''}`,
      severity: 'warning',
    });
  }
  if (evaluation.tier === 'DELAY') {
    collector.warnings.push({
      code: 'DELAY_REQUIRED',
      message: `Time delay of ${evaluation.delaySeconds ?? 900} seconds will be applied`,
      severity: 'info',
    });
  }
  if (evaluation.cumulativeWarning && evaluation.cumulativeWarning.ratio >= 0.8) {
    collector.warnings.push({
      code: 'CUMULATIVE_LIMIT_WARNING',
      message: `Cumulative ${evaluation.cumulativeWarning.type} spending at ${Math.round(evaluation.cumulativeWarning.ratio * 100)}% of limit`,
      severity: 'warning',
    });
  }

  // Add policy denial reason-based warnings
  if (!evaluation.allowed && evaluation.reason) {
    if (evaluation.reason.includes('not in allowed list') || evaluation.reason.includes('Token transfer not allowed')) {
      collector.warnings.push({
        code: 'TOKEN_NOT_IN_ALLOWED_LIST',
        message: evaluation.reason,
        severity: 'error',
      });
    } else if (evaluation.reason.includes('not whitelisted') || evaluation.reason.includes('Contract calls disabled')) {
      collector.warnings.push({
        code: 'CONTRACT_NOT_WHITELISTED',
        message: evaluation.reason,
        severity: 'error',
      });
    } else if (evaluation.reason.includes('not in allowed networks')) {
      collector.warnings.push({
        code: 'NETWORK_NOT_ALLOWED',
        message: evaluation.reason,
        severity: 'error',
      });
    }
  }

  // If policy denied, skip build/simulate/balance but still return result
  if (!evaluation.allowed) {
    return buildResult(collector, request, txType, chain, resolvedNetwork);
  }

  // -----------------------------------------------------------------------
  // Balance query
  // -----------------------------------------------------------------------

  const nativeDecimals = NATIVE_DECIMALS[chain] ?? 18;
  const nativeSymbol = NATIVE_SYMBOLS[chain] ?? chain.toUpperCase();

  try {
    const balanceInfo = await deps.adapter.getBalance(walletInfo.publicKey);
    collector.currentBalances.push({
      asset: 'native',
      symbol: balanceInfo.symbol || nativeSymbol,
      decimals: balanceInfo.decimals || nativeDecimals,
      balance: balanceInfo.balance,
    });
  } catch {
    collector.currentBalances.push({
      asset: 'native',
      symbol: nativeSymbol,
      decimals: nativeDecimals,
      balance: 0n,
    });
  }

  // For TOKEN_TRANSFER, fetch token balance via getAssets
  if (txType === 'TOKEN_TRANSFER') {
    const tokenReq = request as { token: { address: string; symbol: string; decimals: number } };
    try {
      const assets = await deps.adapter.getAssets(walletInfo.publicKey);
      const tokenAsset = assets.find((a) =>
        a.mint.toLowerCase() === tokenReq.token.address.toLowerCase(),
      );
      if (tokenAsset) {
        collector.currentBalances.push({
          asset: tokenReq.token.address,
          symbol: tokenAsset.symbol || tokenReq.token.symbol,
          decimals: tokenAsset.decimals ?? tokenReq.token.decimals,
          balance: tokenAsset.balance ?? 0n,
        });
      } else {
        collector.currentBalances.push({
          asset: tokenReq.token.address,
          symbol: tokenReq.token.symbol,
          decimals: tokenReq.token.decimals,
          balance: 0n,
        });
      }
    } catch {
      collector.currentBalances.push({
        asset: tokenReq.token.address,
        symbol: tokenReq.token.symbol,
        decimals: tokenReq.token.decimals,
        balance: 0n,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Stage 5a': Build (no signing)
  // -----------------------------------------------------------------------

  try {
    collector.unsignedTx = await buildByType(deps.adapter, request, walletInfo.publicKey);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Build failed';
    collector.warnings.push({
      code: 'SIMULATION_FAILED',
      message: `Transaction build failed: ${errMsg}`,
      severity: 'warning',
    });
    collector.simulationResult = {
      success: false,
      logs: [],
      error: errMsg,
    };
    return buildResult(collector, request, txType, chain, resolvedNetwork);
  }

  // -----------------------------------------------------------------------
  // Stage 5b': Simulate (no signing, no submission)
  // -----------------------------------------------------------------------

  try {
    collector.simulationResult = await deps.adapter.simulateTransaction(collector.unsignedTx);
    if (!collector.simulationResult.success) {
      collector.warnings.push({
        code: 'SIMULATION_FAILED',
        message: collector.simulationResult.error ?? 'Transaction simulation failed',
        severity: 'warning',
      });
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Simulation failed';
    collector.simulationResult = {
      success: false,
      logs: [],
      error: errMsg,
    };
    collector.warnings.push({
      code: 'SIMULATION_FAILED',
      message: `Transaction simulation error: ${errMsg}`,
      severity: 'warning',
    });
  }

  // -----------------------------------------------------------------------
  // Compute fee with gas safety margin and check balances
  // -----------------------------------------------------------------------

  const estimatedFee = collector.unsignedTx.estimatedFee;
  const safetyFee = (estimatedFee * GAS_SAFETY_NUMERATOR) / GAS_SAFETY_DENOMINATOR;

  // Check balance sufficiency
  const nativeBalance = collector.currentBalances.find((b) => b.asset === 'native');
  if (nativeBalance) {
    if (txType === 'TRANSFER' || txType === 'CONTRACT_CALL') {
      const totalCost = requestAmount + safetyFee;
      if (totalCost > nativeBalance.balance) {
        collector.warnings.push({
          code: 'INSUFFICIENT_BALANCE_WITH_FEE',
          message: `Insufficient balance after fee: need ${totalCost.toString()}, have ${nativeBalance.balance.toString()}`,
          severity: 'error',
        });
      }
    } else {
      if (safetyFee > nativeBalance.balance) {
        collector.warnings.push({
          code: 'INSUFFICIENT_BALANCE_WITH_FEE',
          message: `Insufficient native balance for fee: need ${safetyFee.toString()}, have ${nativeBalance.balance.toString()}`,
          severity: 'error',
        });
      }
    }
  }

  // For TOKEN_TRANSFER, check token balance
  if (txType === 'TOKEN_TRANSFER') {
    const tokenReq = request as { token: { address: string }; amount: string };
    const tokenBalance = collector.currentBalances.find(
      (b) => b.asset.toLowerCase() === tokenReq.token.address.toLowerCase(),
    );
    if (tokenBalance && BigInt(tokenReq.amount) > tokenBalance.balance) {
      collector.warnings.push({
        code: 'INSUFFICIENT_BALANCE',
        message: `Insufficient token balance: need ${tokenReq.amount}, have ${tokenBalance.balance.toString()}`,
        severity: 'error',
      });
    }
  }

  // Check high fee ratio
  if (requestAmount > 0n && safetyFee > 0n) {
    const feeRatio = Number(safetyFee) / Number(requestAmount);
    if (feeRatio > 0.1) {
      collector.warnings.push({
        code: 'HIGH_FEE_RATIO',
        message: `Fee is ${Math.round(feeRatio * 100)}% of transaction amount`,
        severity: 'info',
      });
    }
  }

  // Resolve fee USD if oracle available
  if (deps.priceOracle) {
    try {
      const nativePrice = await deps.priceOracle.getNativePrice(chain as ChainType);
      const feeDecimals = NATIVE_DECIMALS[chain] ?? 18;
      const feeHuman = Number(safetyFee) / Math.pow(10, feeDecimals);
      collector.feeUsd = feeHuman * nativePrice.usdPrice;
    } catch {
      // feeUsd stays null
    }
  }

  // -----------------------------------------------------------------------
  // Gas condition evaluation (read-only -- no DB writes, no pipeline halt)
  // -----------------------------------------------------------------------

  await evaluateGasCondition(deps, request, chain, collector);

  return buildResult(collector, request, txType, chain, resolvedNetwork);
}

// ---------------------------------------------------------------------------
// Gas condition evaluation (read-only)
// ---------------------------------------------------------------------------

/**
 * Evaluate gasCondition from the request against current on-chain gas prices.
 * Populates collector.gasConditionResult and adds warnings if condition is not met.
 * No side effects: no DB writes, no pipeline halt, no notifications.
 */
async function evaluateGasCondition(
  deps: DryRunDeps,
  request: TransactionRequest,
  chain: string,
  collector: DryRunCollector,
): Promise<void> {
  // Check if request has gasCondition
  const gasCondition = ('gasCondition' in request && request.gasCondition)
    ? request.gasCondition as { maxGasPrice?: string; maxPriorityFee?: string; timeout?: number }
    : undefined;

  if (!gasCondition) {
    // No gas condition specified: skip (backward compat)
    return;
  }

  // Check if gas_condition feature is enabled via settings
  let gasConditionEnabled = true;
  if (deps.settingsService) {
    try {
      const enabledValue = deps.settingsService.get('gas_condition.enabled');
      gasConditionEnabled = enabledValue !== 'false';
    } catch {
      // Setting key not yet registered -- default to true
      gasConditionEnabled = true;
    }
  }

  if (!gasConditionEnabled) {
    // Feature disabled: report in warnings, skip evaluation
    collector.warnings.push({
      code: 'GAS_CONDITION_DISABLED',
      message: 'Gas condition feature is disabled in Admin Settings',
      severity: 'info',
    });
    return;
  }

  // Need RPC URL to query gas price
  const rpcUrl = deps.rpcUrl;
  if (!rpcUrl) {
    collector.warnings.push({
      code: 'GAS_CONDITION_NOT_MET',
      message: 'Cannot evaluate gas condition: no RPC URL available',
      severity: 'warning',
    });
    return;
  }

  try {
    // Query current gas price based on chain
    const { gasPrice, priorityFee } = chain === 'solana'
      ? await querySolanaGasPrice(rpcUrl)
      : await queryEvmGasPrice(rpcUrl);

    // Evaluate gas condition
    let conditionMet = true;

    if (gasCondition.maxGasPrice) {
      const threshold = BigInt(gasCondition.maxGasPrice);
      if (gasPrice > threshold) {
        conditionMet = false;
      }
    }

    if (gasCondition.maxPriorityFee && conditionMet) {
      const threshold = BigInt(gasCondition.maxPriorityFee);
      if (priorityFee > threshold) {
        conditionMet = false;
      }
    }

    collector.gasConditionResult = {
      met: conditionMet,
      currentGasPrice: gasPrice.toString(),
      currentPriorityFee: priorityFee > 0n ? priorityFee.toString() : undefined,
      maxGasPrice: gasCondition.maxGasPrice,
      maxPriorityFee: gasCondition.maxPriorityFee,
    };

    if (!conditionMet) {
      collector.warnings.push({
        code: 'GAS_CONDITION_NOT_MET',
        message: `Current gas price (${gasPrice.toString()}) exceeds maxGasPrice (${gasCondition.maxGasPrice ?? 'N/A'})`,
        severity: 'warning',
      });
    }
  } catch (err) {
    // RPC error -- report as warning, gasConditionResult stays null
    const errMsg = err instanceof Error ? err.message : 'Gas price query failed';
    collector.warnings.push({
      code: 'GAS_CONDITION_NOT_MET',
      message: `Cannot evaluate gas condition: ${errMsg}`,
      severity: 'warning',
    });
  }
}

// ---------------------------------------------------------------------------
// Build the final result from collector
// ---------------------------------------------------------------------------

function buildResult(
  collector: DryRunCollector,
  request: TransactionRequest,
  txType: string,
  chain: string,
  resolvedNetwork: string,
): DryRunSimulationResult {
  const evaluation = collector.policyEvaluation;
  const unsignedTx = collector.unsignedTx;

  const nativeDecimals = NATIVE_DECIMALS[chain] ?? 18;
  const nativeSymbol = NATIVE_SYMBOLS[chain] ?? chain.toUpperCase();

  // Determine success: policy allowed
  const success = !!evaluation?.allowed;

  // Build fee estimate
  let fee: DryRunSimulationResult['fee'] = null;
  if (unsignedTx) {
    const safetyFee = (unsignedTx.estimatedFee * GAS_SAFETY_NUMERATOR) / GAS_SAFETY_DENOMINATOR;
    fee = {
      estimatedFee: safetyFee.toString(),
      feeSymbol: nativeSymbol,
      feeDecimals: nativeDecimals,
      feeUsd: collector.feeUsd,
    };
  }

  // Build balance changes from collector
  const requestAmount = BigInt(getRequestAmount(request) || '0');
  const balanceChanges: DryRunSimulationResult['balanceChanges'] = [];

  for (const bal of collector.currentBalances) {
    let changeAmount: bigint;
    if (bal.asset === 'native') {
      const feeAmount = unsignedTx ? (unsignedTx.estimatedFee * GAS_SAFETY_NUMERATOR) / GAS_SAFETY_DENOMINATOR : 0n;
      if (txType === 'TRANSFER' || txType === 'CONTRACT_CALL') {
        // Native transfer: deduct amount + fee
        changeAmount = -(requestAmount + feeAmount);
      } else {
        // Token transfer/Approve/Batch: only deduct fee from native
        changeAmount = -feeAmount;
      }
    } else {
      // Token balance: deduct token amount
      changeAmount = -requestAmount;
    }

    const afterBalance = bal.balance + changeAmount;
    balanceChanges.push({
      asset: bal.asset,
      symbol: bal.symbol,
      decimals: bal.decimals,
      currentBalance: bal.balance.toString(),
      changeAmount: changeAmount.toString(),
      afterBalance: afterBalance.toString(),
    });
  }

  // Build simulation detail
  const simulation: DryRunSimulationResult['simulation'] = {
    success: collector.simulationResult?.success ?? false,
    logs: collector.simulationResult?.logs ?? [],
    unitsConsumed: collector.simulationResult?.unitsConsumed != null
      ? collector.simulationResult.unitsConsumed.toString()
      : null,
    error: collector.simulationResult?.error ?? (evaluation?.allowed === false ? 'Skipped: policy denied' : null),
  };

  // Build meta
  const meta: DryRunSimulationResult['meta'] = {
    chain: chain as DryRunSimulationResult['meta']['chain'],
    network: resolvedNetwork as DryRunSimulationResult['meta']['network'],
    transactionType: txType,
    durationMs: Date.now() - collector.startTime,
  };

  return {
    success,
    policy: {
      tier: evaluation?.tier ?? 'INSTANT',
      allowed: evaluation?.allowed ?? false,
      reason: evaluation?.reason,
      delaySeconds: evaluation?.delaySeconds,
      approvalReason: evaluation?.approvalReason,
      downgraded: collector.downgraded || undefined,
      cumulativeWarning: evaluation?.cumulativeWarning,
    },
    fee,
    balanceChanges,
    warnings: collector.warnings as DryRunSimulationResult['warnings'],
    simulation,
    meta,
    ...(collector.gasConditionResult ? { gasCondition: collector.gasConditionResult } : {}),
  };
}
