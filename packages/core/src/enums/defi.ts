import { z } from 'zod';

// PositionCategory: DeFi position categories (4 values)
export const POSITION_CATEGORIES = ['LENDING', 'YIELD', 'PERP', 'STAKING'] as const;
export type PositionCategory = (typeof POSITION_CATEGORIES)[number];
export const PositionCategoryEnum = z.enum(POSITION_CATEGORIES);

// PositionStatus: DeFi position statuses (4 values)
export const POSITION_STATUSES = ['ACTIVE', 'CLOSED', 'LIQUIDATED', 'MATURED'] as const;
export type PositionStatus = (typeof POSITION_STATUSES)[number];
export const PositionStatusEnum = z.enum(POSITION_STATUSES);
