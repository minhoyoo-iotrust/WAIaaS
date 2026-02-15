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
  riskLevel: z.enum(['low', 'medium', 'high']),
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
});

/** Execution context for action resolution. Derived from ActionContextSchema via z.infer. */
export type ActionContext = z.infer<typeof ActionContextSchema>;

// ---------------------------------------------------------------------------
// IActionProvider interface
// ---------------------------------------------------------------------------

/**
 * Action Provider contract.
 *
 * Implementations resolve action parameters into ContractCallRequest objects
 * that are then fed into the existing 6-stage pipeline for policy evaluation,
 * signing, and submission.
 *
 * resolve() MUST return a ContractCallRequest -- never sign or submit directly.
 */
export interface IActionProvider {
  /** Provider metadata (name, version, chains, flags). */
  readonly metadata: ActionProviderMetadata;
  /** Available actions exposed by this provider. */
  readonly actions: readonly ActionDefinition[];
  /**
   * Resolve action parameters into a ContractCallRequest.
   * The return value is re-validated via ContractCallRequestSchema.parse()
   * by ActionProviderRegistry to prevent policy bypass.
   */
  resolve(
    actionName: string,
    params: Record<string, unknown>,
    context: ActionContext,
  ): Promise<ContractCallRequest>;
}
