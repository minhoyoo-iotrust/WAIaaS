import { z } from 'zod';

// OwnerState: runtime-derived state (not stored in DB). See 25-sqlite SS4.12.1
export const OWNER_STATES = ['NONE', 'GRACE', 'LOCKED'] as const;
export type OwnerState = (typeof OWNER_STATES)[number];
export const OwnerStateEnum = z.enum(OWNER_STATES);
