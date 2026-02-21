import { z } from 'zod';

export const SessionSchema = z.object({
  id: z.string().uuid(),
  walletId: z.string().uuid(),
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

export const CreateSessionRequestSchema = z.object({
  walletId: z.string().uuid().optional(),
  walletIds: z.array(z.string().uuid()).min(1).optional(),
  defaultWalletId: z.string().uuid().optional(),
  ttl: z.number().int().min(300).max(604800).optional(), // defaults to config security.session_ttl (86400)
  constraints: z.record(z.unknown()).nullable().optional(),
}).refine(
  (data) => data.walletId !== undefined || (data.walletIds !== undefined && data.walletIds.length > 0),
  { message: 'Either walletId or walletIds must be provided' },
);
export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;
