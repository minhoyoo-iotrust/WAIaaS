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
