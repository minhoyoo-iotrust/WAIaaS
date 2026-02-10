import { z } from 'zod';

export const CHAIN_TYPES = ['solana', 'ethereum'] as const;
export type ChainType = (typeof CHAIN_TYPES)[number];
export const ChainTypeEnum = z.enum(CHAIN_TYPES);

export const NETWORK_TYPES = ['mainnet', 'devnet', 'testnet'] as const;
export type NetworkType = (typeof NETWORK_TYPES)[number];
export const NetworkTypeEnum = z.enum(NETWORK_TYPES);
