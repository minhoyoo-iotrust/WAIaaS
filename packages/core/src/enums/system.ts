import { z } from 'zod';

export const KILL_SWITCH_STATES = ['ACTIVE', 'SUSPENDED', 'LOCKED'] as const;
export type KillSwitchState = (typeof KILL_SWITCH_STATES)[number];
export const KillSwitchStateEnum = z.enum(KILL_SWITCH_STATES);
