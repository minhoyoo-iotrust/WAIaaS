import { z } from 'zod';
import { PolicyTypeEnum } from '../enums/policy.js';

export const PolicySchema = z.object({
  id: z.string().uuid(),
  agentId: z.string().uuid(),
  type: PolicyTypeEnum,
  ruleConfig: z.record(z.unknown()),
  enabled: z.boolean(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Policy = z.infer<typeof PolicySchema>;

/**
 * CreatePolicyRequestSchema - body for POST /v1/policies.
 *
 * agentId is optional (null = global policy).
 * rules is a free-form JSON object validated per-type at route level.
 */
export const CreatePolicyRequestSchema = z.object({
  agentId: z.string().uuid().optional(),
  type: PolicyTypeEnum,
  rules: z.record(z.unknown()),
  priority: z.number().int().default(0),
  enabled: z.boolean().default(true),
});
export type CreatePolicyRequest = z.infer<typeof CreatePolicyRequestSchema>;

/**
 * UpdatePolicyRequestSchema - body for PUT /v1/policies/:id.
 *
 * All fields optional (partial update).
 */
export const UpdatePolicyRequestSchema = z.object({
  rules: z.record(z.unknown()).optional(),
  priority: z.number().int().optional(),
  enabled: z.boolean().optional(),
});
export type UpdatePolicyRequest = z.infer<typeof UpdatePolicyRequestSchema>;
