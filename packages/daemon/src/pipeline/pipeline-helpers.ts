/**
 * Pipeline shared types and helper functions.
 *
 * PipelineContext interface -- the mutable state bag passed through all stages.
 * Helper functions for extracting request fields, formatting amounts, and building
 * type-specific TransactionParam objects for policy evaluation.
 *
 * @see docs/32-pipeline-design.md
 */

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Database as SQLiteDatabase } from 'better-sqlite3';
import type {
  IChainAdapter,
  IPolicyEngine,
  PolicyTier,
  SendTransactionRequest,
  TransactionRequest,
  UnsignedTransaction,
  SubmitResult,
  ContractNameRegistry,
  TokenTransferRequest,
  ApproveRequest,
  NftTransferRequest,
  ContractDeployRequest,
  IPriceOracle,
  IForexRateService,
  CurrencyCode,
  IMetricsCounter,
  EventBus,
} from '@waiaas/core';
import { NATIVE_DECIMALS, NATIVE_SYMBOLS, formatDisplayCurrency, formatAmount } from '@waiaas/core';
import type { LocalKeyStore } from '../infrastructure/keystore/keystore.js';
import type * as schema from '../infrastructure/database/schema.js';
import type { DelayQueue } from '../workflow/delay-queue.js';
import type { ApprovalWorkflow } from '../workflow/approval-workflow.js';
import type { NotificationService } from '../notifications/notification-service.js';
import type { SettingsService } from '../infrastructure/settings/settings-service.js';
import type { WcSigningBridge } from '../services/wc-signing-bridge.js';
import type { ApprovalChannelRouter } from '../services/signing-sdk/approval-channel-router.js';

// v1.5: CoinGecko 키 안내 힌트 최초 1회 추적 (데몬 재시작 시 리셋 OK)
export const hintedTokens = new Set<string>();

/** Clear hintedTokens set (for testing). */
export function clearHintedTokens(): void { hintedTokens.clear(); }
/** Check if a token hint has been shown. */
export function hasHintedToken(key: string): boolean { return hintedTokens.has(key); }

// ---------------------------------------------------------------------------
// Pipeline context
// ---------------------------------------------------------------------------

export interface PipelineContext {
  // Dependencies
  db: BetterSQLite3Database<typeof schema>;
  adapter: IChainAdapter;
  keyStore: LocalKeyStore;
  policyEngine: IPolicyEngine;
  masterPassword: string;
  // Request data
  walletId: string;
  wallet: {
    publicKey: string;
    chain: string;
    environment: string;
    accountType?: string;
    aaProvider?: string | null;
    aaProviderApiKeyEncrypted?: string | null;
    aaBundlerUrl?: string | null;
    aaPaymasterUrl?: string | null;
    aaPaymasterPolicyId?: string | null;
    factoryAddress?: string | null;
  };
  resolvedNetwork: string;
  request: SendTransactionRequest | TransactionRequest;
  // State accumulated through stages
  txId: string;
  tier?: PolicyTier;
  unsignedTx?: UnsignedTransaction;
  signedTx?: Uint8Array;
  submitResult?: SubmitResult;
  // v1.2: session + policy integration
  sessionId?: string;
  sqlite?: SQLiteDatabase;
  delaySeconds?: number;
  downgraded?: boolean;
  // v1.2: workflow dependencies for stage4Wait
  delayQueue?: DelayQueue;
  approvalWorkflow?: ApprovalWorkflow;
  config?: {
    policy_defaults_delay_seconds: number;
    policy_defaults_approval_timeout: number;
  };
  // v1.3.4: notification service for pipeline event triggers
  notificationService?: NotificationService;
  // v1.5: price oracle for USD policy evaluation
  priceOracle?: IPriceOracle;
  // v1.5: settings service for CoinGecko hint
  settingsService?: SettingsService;
  // v1.5.3: forex rate service for display currency conversion
  forexRateService?: IForexRateService;
  // v1.5.3: cached amountUsd from Stage 3 for Stage 5/6 display_amount
  amountUsd?: number;
  // v1.6: event bus for AutoStop/BalanceMonitor subscribers
  eventBus?: EventBus;
  // v1.6.1: WC signing bridge for APPROVAL fire-and-forget
  wcSigningBridge?: WcSigningBridge;
  // v2.6.1: signing SDK channel router for APPROVAL fire-and-forget
  approvalChannelRouter?: ApprovalChannelRouter;
  // v30.2: metrics counter for tx/rpc/autostop instrumentation (STAT-02)
  metricsCounter?: IMetricsCounter;
  // v30.8: reputation cache for REPUTATION_THRESHOLD policy evaluation (Phase 320)
  reputationCache?: import('../services/erc8004/reputation-cache-service.js').ReputationCacheService;
  // v30.8: EIP-712 metadata for set_agent_wallet approval (Phase 321)
  eip712Metadata?: {
    approvalType: 'EIP712';
    typedDataJson: string;
    agentId: string;
    newWallet: string;
    deadline: string;
  };
  // v30.11 Phase 331: action tier override context
  actionProviderKey?: string;
  actionName?: string;
  actionDefaultTier?: PolicyTier;
  // #251: resolved RPC URL for Smart Account publicClient creation
  resolvedRpcUrl?: string;
  // v31.4: ApiDirectResult from action provider resolve() (HDESIGN-01)
  actionResult?: import('@waiaas/core').ApiDirectResult;
  // #443: policy-specific approval timeout (from SPENDING_LIMIT rules.approval_timeout)
  policyApprovalTimeout?: number;
  // v32.0: contract name registry for notification enrichment
  contractNameRegistry?: ContractNameRegistry;
}

// ---------------------------------------------------------------------------
// [Phase 331] Action tier override resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the effective tier for an action.
 * Priority: Settings override > provider hardcoded defaultTier.
 *
 * @param providerKey - Provider key, e.g. 'jupiter_swap'
 * @param actionName - Action name, e.g. 'swap'
 * @param actionDefaultTier - Provider hardcoded default tier
 * @param settingsService - SettingsService (optional, undefined = use default)
 * @returns The effective tier for this action
 */
export function resolveActionTier(
  providerKey: string,
  actionName: string,
  actionDefaultTier: PolicyTier,
  settingsService?: SettingsService,
): PolicyTier {
  if (!settingsService) return actionDefaultTier;
  const tierKey = `actions.${providerKey}_${actionName}_tier`;
  try {
    const override = settingsService.get(tierKey);
    if (override && override !== '') return override as PolicyTier;
  } catch { /* key not found -- use default */ }
  return actionDefaultTier;
}

// ---------------------------------------------------------------------------
// Helper: safe request field accessors for union type
// ---------------------------------------------------------------------------

/** Safely extract `amount` from SendTransactionRequest | TransactionRequest. */
export function getRequestAmount(req: SendTransactionRequest | TransactionRequest): string {
  if ('amount' in req && typeof req.amount === 'string') return req.amount;
  return '0';
}

/** Safely extract `to` from SendTransactionRequest | TransactionRequest. */
export function getRequestTo(req: SendTransactionRequest | TransactionRequest): string {
  if ('to' in req && typeof req.to === 'string') return req.to;
  return '';
}

// ---------------------------------------------------------------------------
// v32.0: Contract name resolution for notification {to} field
// ---------------------------------------------------------------------------

/**
 * Truncate an address for display in notifications.
 * EVM: '0xabcd...1234', Solana: 'ABCD...5678'
 */
export function truncateAddress(address: string): string {
  if (address.length <= 10) return address;
  if (address.startsWith('0x') || address.startsWith('0X')) {
    const hex = address.slice(2).toLowerCase();
    return `0x${hex.slice(0, 4)}...${hex.slice(-4)}`;
  }
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

/**
 * Resolve {to} for notifications: CONTRACT_CALL gets human-readable name,
 * other types get raw address. Format: "Name (0xabcd...1234)" or raw address.
 *
 * - CONTRACT_CALL with known contract: "Uniswap V3 (0xe592...1564)"
 * - CONTRACT_CALL with unknown contract: raw address (no name prefix)
 * - TRANSFER / TOKEN_TRANSFER / other: raw address unchanged
 */
export function resolveNotificationTo(
  req: SendTransactionRequest | TransactionRequest,
  network: string,
  registry?: ContractNameRegistry,
): string {
  const rawTo = getRequestTo(req);
  if (!rawTo) return '';

  // Only resolve for CONTRACT_CALL type
  const txType = ('type' in req && req.type) ? req.type : 'TRANSFER';
  if (txType !== 'CONTRACT_CALL' || !registry) return rawTo;

  const result = registry.resolve(rawTo, network);
  // fallback source means no name found -- return raw address as-is
  if (result.source === 'fallback') return rawTo;
  // Named: "Protocol Name (0xabcd...1234)"
  return `${result.name} (${truncateAddress(rawTo)})`;
}

/** Safely extract `memo` from SendTransactionRequest | TransactionRequest. */
export function getRequestMemo(req: SendTransactionRequest | TransactionRequest): string | undefined {
  if ('memo' in req && typeof req.memo === 'string') return req.memo;
  return undefined;
}

// ---------------------------------------------------------------------------
// Helper: format notification amount with token symbol
// ---------------------------------------------------------------------------


/**
 * Format raw blockchain amount to human-readable string with token symbol.
 * e.g. "1000000000000000000" -> "1 ETH", "100000000" -> "100 USDC"
 */
export function formatNotificationAmount(
  req: SendTransactionRequest | TransactionRequest,
  chain: string,
): string {
  const raw = getRequestAmount(req);
  if (raw === '0' || raw === '') return '0';

  try {
    if ('type' in req && req.type === 'TOKEN_TRANSFER') {
      const r = req as TokenTransferRequest;
      const decimals = r.token.decimals ?? 18;
      const symbol = r.token.symbol ?? r.token.address?.slice(0, 8) ?? 'TKN';
      return `${formatAmount(BigInt(raw), decimals)} ${symbol}`;
    }

    if ('type' in req && req.type === 'APPROVE') {
      const r = req as ApproveRequest;
      const decimals = r.token.decimals ?? 18;
      const symbol = r.token.symbol ?? r.token.address?.slice(0, 8) ?? 'TKN';
      return `${formatAmount(BigInt(raw), decimals)} ${symbol}`;
    }

    if ('type' in req && req.type === 'NFT_TRANSFER') {
      const r = req as NftTransferRequest;
      return `${r.amount ?? '1'} NFT (${r.token.standard})`;
    }

    // Native transfer / CONTRACT_CALL with value
    const decimals = NATIVE_DECIMALS[chain] ?? 18;
    const symbol = NATIVE_SYMBOLS[chain] ?? chain.toUpperCase();
    return `${formatAmount(BigInt(raw), decimals)} ${symbol}`;
  } catch {
    return raw;
  }
}

// ---------------------------------------------------------------------------
// Helper: resolve display amount for notification messages
// ---------------------------------------------------------------------------

/**
 * Convert amountUsd to display currency string for notification variables.
 * Returns empty string on failure (graceful fallback -- no display_amount in message).
 */
export async function resolveDisplayAmount(
  amountUsd: number | null | undefined,
  settingsService?: SettingsService,
  forexRateService?: IForexRateService,
): Promise<string> {
  if (!amountUsd || !settingsService || !forexRateService) return '';
  try {
    const currency = settingsService.get('display.currency') ?? 'USD';
    if (currency === 'USD') return `($${amountUsd.toFixed(2)})`;
    const rate = await forexRateService.getRate(currency as CurrencyCode);
    if (!rate) return `($${amountUsd.toFixed(2)})`;
    return `(${formatDisplayCurrency(amountUsd, currency, rate.rate)})`;
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Helper: extract policy type from evaluation reason string
// ---------------------------------------------------------------------------

export function extractPolicyType(reason: string | undefined): string {
  if (!reason) return '';
  if (reason.includes('not in allowed list') || reason.includes('Token transfer not allowed')) return 'ALLOWED_TOKENS';
  if (reason.includes('not whitelisted') || reason.includes('Contract calls disabled')) return 'CONTRACT_WHITELIST';
  if (reason.includes('Method not whitelisted')) return 'METHOD_WHITELIST';
  if (reason.includes('not in approved list') || reason.includes('Token approvals disabled')) return 'APPROVED_SPENDERS';
  if (reason.includes('not in whitelist') || reason.includes('not in allowed addresses')) return 'WHITELIST';
  if (reason.includes('not in allowed networks')) return 'ALLOWED_NETWORKS';
  if (reason.includes('exceeds limit') || reason.includes('Unlimited token approval')) return 'APPROVE_AMOUNT_LIMIT';
  if (reason.includes('Spending limit')) return 'SPENDING_LIMIT';
  return '';
}

// ---------------------------------------------------------------------------
// Helper: build type-specific TransactionParam for policy evaluation
// ---------------------------------------------------------------------------

export interface TransactionParam {
  type: string;
  amount: string;
  toAddress: string;
  chain: string;
  network?: string;
  tokenAddress?: string;
  assetId?: string;       // CAIP-19 asset identifier from token.assetId
  contractAddress?: string;
  selector?: string;
  spenderAddress?: string;
  approveAmount?: string;
  /** Token decimals for token_limits human-readable conversion (TOKEN_TRANSFER/APPROVE only). */
  tokenDecimals?: number;
  /** Action provider name for provider-trust policy bypass (set by ActionProviderRegistry). */
  actionProvider?: string;
}

export function buildTransactionParam(
  req: SendTransactionRequest | TransactionRequest,
  txType: string,
  chain: string,
): TransactionParam {
  switch (txType) {
    case 'TOKEN_TRANSFER': {
      const r = req as { to: string; amount: string; token: { address: string; assetId?: string; decimals: number } };
      return {
        type: 'TOKEN_TRANSFER',
        amount: r.amount,
        toAddress: r.to,
        chain,
        tokenAddress: r.token.address,
        assetId: r.token.assetId,
        tokenDecimals: r.token.decimals,
      };
    }
    case 'CONTRACT_CALL': {
      const r = req as { to: string; calldata?: string; value?: string; actionProvider?: string };
      return {
        type: 'CONTRACT_CALL',
        amount: r.value ?? '0',
        toAddress: r.to,
        chain,
        contractAddress: r.to,
        selector: r.calldata?.slice(0, 10),
        // Pass through actionProvider for provider-trust policy bypass
        ...(r.actionProvider ? { actionProvider: r.actionProvider } : {}),
      };
    }
    case 'APPROVE': {
      const r = req as { spender: string; amount: string; token: { address: string; assetId?: string; decimals: number } };
      return {
        type: 'APPROVE',
        amount: r.amount,
        toAddress: r.spender,
        chain,
        tokenAddress: r.token.address,
        assetId: r.token.assetId,
        spenderAddress: r.spender,
        approveAmount: r.amount,
        tokenDecimals: r.token.decimals,
      };
    }
    case 'NFT_TRANSFER': {
      const r = req as NftTransferRequest;
      return {
        type: 'NFT_TRANSFER',
        amount: r.amount ?? '1',
        toAddress: r.to,
        chain,
        contractAddress: r.token.address,
        assetId: r.token.assetId,
      };
    }
    case 'CONTRACT_DEPLOY': {
      const r = req as ContractDeployRequest;
      return {
        type: 'CONTRACT_DEPLOY',
        amount: r.value ?? '0',
        toAddress: '', // no recipient for contract deployment
        chain,
        contractAddress: '', // will be populated after deployment
      };
    }
    case 'TRANSFER':
    default: {
      const r = req as { to: string; amount: string };
      return {
        type: 'TRANSFER',
        amount: r.amount,
        toAddress: r.to,
        chain,
      };
    }
  }
}
