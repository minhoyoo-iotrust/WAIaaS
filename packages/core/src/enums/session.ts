import { z } from 'zod';

// SessionStatus: runtime state representation (DB uses expires_at-based expiry)
export const SESSION_STATUSES = ['ACTIVE', 'EXPIRED', 'REVOKED'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];
export const SessionStatusEnum = z.enum(SESSION_STATUSES);
