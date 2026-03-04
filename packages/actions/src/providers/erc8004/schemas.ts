/**
 * Zod input schemas for ERC-8004 Action Provider actions.
 *
 * 8 write action schemas (Zod SSoT) that validate REST/MCP/SDK inputs
 * before resolve() processes them into ContractCallRequest.
 *
 * agentId is string (not bigint) at the interface layer;
 * BigInt conversion happens in resolve().
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Identity Registry schemas
// ---------------------------------------------------------------------------

/** Input schema for register_agent action. */
export const RegisterAgentInputSchema = z.object({
  /** Agent display name (1-100 chars). */
  name: z.string().min(1).max(100),
  /** Optional description (max 500 chars). */
  description: z.string().max(500).optional(),
  /** Optional service endpoint declarations. */
  services: z.array(z.object({
    name: z.string().min(1),
    endpoint: z.string().url(),
    version: z.string().optional(),
  })).optional(),
  /** Optional metadata key-value pairs (string -> string). */
  metadata: z.record(z.string()).optional(),
});

/** Input schema for set_agent_wallet action. */
export const SetAgentWalletInputSchema = z.object({
  /** On-chain agent ID (numeric string). */
  agentId: z.string().min(1),
  /** Deadline timestamp (optional, defaults to 1h from now). */
  deadline: z.string().optional(),
});

/** Input schema for unset_agent_wallet action. */
export const UnsetAgentWalletInputSchema = z.object({
  /** On-chain agent ID (numeric string). */
  agentId: z.string().min(1),
});

/** Input schema for set_agent_uri action. */
export const SetAgentUriInputSchema = z.object({
  /** On-chain agent ID (numeric string). */
  agentId: z.string().min(1),
  /** New registration file URI. */
  uri: z.string().url(),
});

/** Input schema for set_metadata action. */
export const SetMetadataInputSchema = z.object({
  /** On-chain agent ID (numeric string). */
  agentId: z.string().min(1),
  /** Metadata key (1-64 chars). */
  key: z.string().min(1).max(64),
  /** Metadata value (string, encoded to bytes on-chain). */
  value: z.string(),
});

// ---------------------------------------------------------------------------
// Reputation Registry schemas
// ---------------------------------------------------------------------------

/** Input schema for give_feedback action. */
export const GiveFeedbackInputSchema = z.object({
  /** Target agent ID (numeric string). */
  agentId: z.string().min(1),
  /** Feedback value (-100 to 100, integer). */
  value: z.number().int().min(-100).max(100),
  /** Value decimal precision (0-8, default 0). */
  valueDecimals: z.number().int().min(0).max(8).default(0),
  /** Category tag 1 (max 32 chars, optional). */
  tag1: z.string().max(32).optional().default(''),
  /** Category tag 2 (max 32 chars, optional). */
  tag2: z.string().max(32).optional().default(''),
  /** Service endpoint being rated (optional). */
  endpoint: z.string().optional().default(''),
  /** URI to detailed feedback document (optional). */
  feedbackURI: z.string().optional().default(''),
});

/** Input schema for revoke_feedback action. */
export const RevokeFeedbackInputSchema = z.object({
  /** Target agent ID (numeric string). */
  agentId: z.string().min(1),
  /** Index of the feedback to revoke (0-based). */
  feedbackIndex: z.number().int().min(0),
});

// ---------------------------------------------------------------------------
// Validation Registry schemas
// ---------------------------------------------------------------------------

/** Input schema for request_validation action. */
export const RequestValidationInputSchema = z.object({
  /** Target agent ID (numeric string). */
  agentId: z.string().min(1),
  /** Validator address (EVM 0x-prefixed, 40 hex chars). */
  validatorAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Valid EVM address required'),
  /** Description of the validation request (1-1000 chars). */
  requestDescription: z.string().min(1).max(1000),
  /** Optional validation method tag (max 32 chars). */
  tag: z.string().max(32).optional().default(''),
});
