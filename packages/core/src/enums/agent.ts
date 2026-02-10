import { z } from 'zod';

export const AGENT_STATUSES = [
  'CREATING',
  'ACTIVE',
  'SUSPENDED',
  'TERMINATING',
  'TERMINATED',
] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];
export const AgentStatusEnum = z.enum(AGENT_STATUSES);
