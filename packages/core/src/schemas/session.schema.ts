import { z } from 'zod';

export const SessionSchema = z.object({
  id: z.string().uuid(),
  agentId: z.string().uuid(),
  tokenHash: z.string(),
  constraints: z.record(z.unknown()).nullable(),
  renewalCount: z.number().int().min(0),
  maxRenewals: z.number().int(),
  expiresAt: z.number().int(),
  absoluteExpiresAt: z.number().int(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Session = z.infer<typeof SessionSchema>;
