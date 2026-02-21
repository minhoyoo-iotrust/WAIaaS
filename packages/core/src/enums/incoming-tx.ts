import { z } from 'zod';

export const INCOMING_TX_STATUSES = ['DETECTED', 'CONFIRMED'] as const;
export type IncomingTxStatus = (typeof INCOMING_TX_STATUSES)[number];
export const IncomingTxStatusEnum = z.enum(INCOMING_TX_STATUSES);
