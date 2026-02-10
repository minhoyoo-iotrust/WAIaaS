import { z } from 'zod';
import {
  ChainTypeEnum,
  NetworkTypeEnum,
  AgentStatusEnum,
} from '../enums/index.js';

export const AgentSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  chain: ChainTypeEnum,
  network: NetworkTypeEnum,
  publicKey: z.string(),
  status: AgentStatusEnum,
  ownerAddress: z.string().nullable(),
  ownerVerified: z.boolean(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Agent = z.infer<typeof AgentSchema>;

export const CreateAgentRequestSchema = z.object({
  name: z.string().min(1).max(100),
  chain: ChainTypeEnum.default('solana'),
  network: NetworkTypeEnum.default('devnet'),
});
export type CreateAgentRequest = z.infer<typeof CreateAgentRequestSchema>;
