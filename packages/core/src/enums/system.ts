import { z } from 'zod';

export const KILL_SWITCH_STATES = ['NORMAL', 'ACTIVATED', 'RECOVERING'] as const;
export type KillSwitchState = (typeof KILL_SWITCH_STATES)[number];
export const KillSwitchStateEnum = z.enum(KILL_SWITCH_STATES);
