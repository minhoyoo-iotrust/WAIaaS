/**
 * Action Provider types and interfaces (Zod SSoT).
 *
 * Defines ActionProviderMetadata, ActionDefinition, ActionContext,
 * and IActionProvider for the v1.5 Action Provider framework.
 * Actual provider implementations (ESM plugins) live in the daemon package
 * or in ~/.waiaas/actions/ user plugin directory.
 *
 * Design source: doc 62 (action-provider-architecture).
 */
import { z } from 'zod';
import { ChainTypeEnum } from '../enums/chain.js';
import type { ContractCallRequest } from '../schemas/transaction.schema.js';
import type {
  SignedDataAction,
  SignedHttpAction,
  ResolvedAction,
} from '../schemas/resolved-action.schema.js';

// ---------------------------------------------------------------------------
// Inline AsyncTrackingResult type (mirrors @waiaas/actions to avoid circular dep)
// ---------------------------------------------------------------------------

/**
 * Async tracking result type for IActionProvider.checkStatus().
 * Defined inline to avoid circular dependency (core -> actions).
 * Must stay in sync with AsyncTrackingResult in @waiaas/actions.
 */
export interface ActionProviderTrackingResult {
  state: 'PENDING' | 'COMPLETED' | 'FAILED' | 'TIMEOUT'
    | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELED' | 'SETTLED' | 'EXPIRED';
  details?: Record<string, unknown>;
  nextIntervalOverride?: number;
}

// ---------------------------------------------------------------------------
// Zod SSoT: ActionProviderMetadata
// ---------------------------------------------------------------------------

/** Metadata describing an Action Provider (name, version, chains, flags). */
export const ActionProviderMetadataSchema = z.object({
  /** Provider name: lowercase alphanumeric + underscore, 3-50 chars. */
  name: z.string().regex(/^[a-z][a-z0-9_]*$/).min(3).max(50),
  /** Human-readable description, 10-500 chars. */
  description: z.string().min(10).max(500),
  /** SemVer version string. */
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  /** Supported chains (at least 1). */
  chains: z.array(ChainTypeEnum).min(1),
  /** Whether to expose actions as MCP tools. Defaults to false. */
  mcpExpose: z.boolean().default(false),
  /** Whether this provider requires an API key. Defaults to false. */
  requiresApiKey: z.boolean().default(false),
  /** List of required external API identifiers. Defaults to []. */
  requiredApis: z.array(z.string()).optional().default([]),
  /** Provider category for grouping (e.g. 'Swap', 'Bridge', 'Staking', 'Lending', 'Yield', 'Perp'). */
  category: z.string().min(1).max(50).optional(),
  /** Settings key override for enable/disable toggle (e.g. 'hyperliquid' for all 3 hyperliquid providers). */
  enabledKey: z.string().regex(/^[a-z][a-z0-9_]*$/).optional(),
  /**
   * Whether this provider requires the wallet's decrypted private key
   * to be injected into ActionContext before resolve().
   * Used by providers that sign externally (e.g., Hyperliquid EIP-712).
   * Defaults to false.
   * @see HDESIGN-01: requiresSigningKey pipeline flow
   */
  requiresSigningKey: z.boolean().default(false),
});

/** Action Provider metadata. Derived from ActionProviderMetadataSchema via z.infer. */
export type ActionProviderMetadata = z.infer<typeof ActionProviderMetadataSchema>;

// ---------------------------------------------------------------------------
// Zod SSoT: ActionDefinition
// ---------------------------------------------------------------------------

/** Definition of a single action within a provider. */
export const ActionDefinitionSchema = z.object({
  /** Action name: lowercase alphanumeric + underscore, 3-50 chars. */
  name: z.string().regex(/^[a-z][a-z0-9_]*$/).min(3).max(50),
  /** Human-readable description, 20-1000 chars. */
  description: z.string().min(20).max(1000),
  /** Target chain for this action. */
  chain: ChainTypeEnum,
  /** Zod schema for input validation (duck-typed at registration). */
  inputSchema: z.any(),
  /** Risk level classification. */
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
  /** Default policy tier for this action. */
  defaultTier: z.enum(['INSTANT', 'NOTIFY', 'DELAY', 'APPROVAL']),
});

/** Action definition within a provider. Derived from ActionDefinitionSchema via z.infer. */
export type ActionDefinition = z.infer<typeof ActionDefinitionSchema>;

// ---------------------------------------------------------------------------
// Zod SSoT: ActionContext
// ---------------------------------------------------------------------------

/** Context passed to resolve() containing wallet and session info. */
export const ActionContextSchema = z.object({
  /** Wallet address (public key). */
  walletAddress: z.string().min(1),
  /** Target chain. */
  chain: ChainTypeEnum,
  /** Wallet UUID. */
  walletId: z.string(),
  /** Session UUID (optional for admin-initiated actions). */
  sessionId: z.string().optional(),
  /**
   * Decrypted private key (Hex string).
   * Only provided when the action provider has requiresSigningKey=true.
   * Cleared from memory immediately after resolve() returns.
   * @see HDESIGN-01: requiresSigningKey pipeline flow
   */
  privateKey: z.string().optional(),
});

/** Execution context for action resolution. Derived from ActionContextSchema via z.infer. */
export type ActionContext = z.infer<typeof ActionContextSchema>;

// ---------------------------------------------------------------------------
// ApiDirectResult (v31.4: API-based trading, HDESIGN-01)
// ---------------------------------------------------------------------------

/**
 * Result type for providers that execute via external API rather than
 * on-chain transactions. Stage 5 branches on this type to skip
 * the build/simulate/sign/submit flow.
 *
 * @see HDESIGN-01: ApiDirectResult pipeline integration
 */
export interface ApiDirectResult {
  /** Discriminant field -- always true for API-direct results. */
  readonly __apiDirect: true;
  /** External identifier from the API (e.g., Hyperliquid order ID). */
  externalId: string;
  /** Execution status. */
  status: 'success' | 'partial' | 'pending';
  /** Provider name that produced this result. */
  provider: string;
  /** Action name that was executed. */
  action: string;
  /** Provider-specific response data. */
  data: Record<string, unknown>;
  /** Optional metadata for display/logging. */
  metadata?: {
    market?: string;
    side?: string;
    size?: string;
    price?: string;
    [key: string]: unknown;
  };
}

/**
 * Type guard for ApiDirectResult.
 * Checks for __apiDirect === true discriminant.
 */
export function isApiDirectResult(result: unknown): result is ApiDirectResult {
  return (
    typeof result === 'object' &&
    result !== null &&
    !Array.isArray(result) &&
    '__apiDirect' in result &&
    (result as Record<string, unknown>).__apiDirect === true
  );
}

// ---------------------------------------------------------------------------
// IActionProvider interface
// ---------------------------------------------------------------------------

/**
 * Action Provider contract.
 *
 * Implementations resolve action parameters into:
 * - ContractCallRequest (on-chain transaction)
 * - ContractCallRequest[] (multi-step on-chain, e.g., approve + swap)
 * - ApiDirectResult (API-based execution, e.g., Hyperliquid DEX)
 * - SignedDataAction (off-chain signed data, e.g., EIP-712, HMAC)
 * - SignedHttpAction (signed HTTP request, e.g., ERC-8128)
 * - ResolvedAction[] (mixed array of any kind)
 *
 * Existing providers returning ContractCallRequest are fully backward
 * compatible -- the return type is a union superset.
 */
export interface IActionProvider {
  /** Provider metadata (name, version, chains, flags). */
  readonly metadata: ActionProviderMetadata;
  /** Available actions exposed by this provider. */
  readonly actions: readonly ActionDefinition[];
  /**
   * Resolve action parameters into one of 6 return types.
   *
   * For ContractCallRequest returns, values are re-validated via
   * ContractCallRequestSchema.parse() by ActionProviderRegistry.
   * For ApiDirectResult returns, Stage 5 skips on-chain execution.
   * For SignedDataAction/SignedHttpAction, the new off-chain pipeline handles
   * credential resolution, signing, and async tracking.
   * For ResolvedAction[], each element is routed to the appropriate pipeline.
   */
  resolve(
    actionName: string,
    params: Record<string, unknown>,
    context: ActionContext,
  ): Promise<
    | ContractCallRequest
    | ContractCallRequest[]
    | ApiDirectResult
    | SignedDataAction
    | SignedHttpAction
    | ResolvedAction[]
  >;

  /**
   * Check the current status of an off-chain action (optional).
   * Used by ExternalActionTracker to delegate venue-specific status polling.
   * Providers that resolve signedData/signedHttp actions should implement this.
   *
   * @param actionId - The external action ID (e.g., order ID)
   * @param metadata - Tracking metadata (venue, operation, etc.)
   * @returns Tracking result with 9-state
   */
  checkStatus?(
    actionId: string,
    metadata: Record<string, unknown>,
  ): Promise<ActionProviderTrackingResult>;

  /**
   * Execute a signed payload against an external service (optional).
   * Used by the off-chain pipeline after signing is complete.
   * The signed payload format depends on the signingScheme.
   *
   * @param actionName - The action name being executed
   * @param signedPayload - The signed payload to submit
   * @param context - Action execution context
   * @returns Execution result with provider-specific data
   */
  execute?(
    actionName: string,
    signedPayload: unknown,
    context: ActionContext,
  ): Promise<Record<string, unknown>>;
}
