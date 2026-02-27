/**
 * Position Provider types and interfaces.
 *
 * IPositionProvider is a read-only interface for PositionTracker
 * to periodically sync DeFi position data. Does NOT extend IActionProvider.
 *
 * Design source: m29-00 design doc section 6.1.
 */
import type { PositionCategory, PositionStatus } from '../enums/defi.js';

/**
 * Position update data for batch upsert into defi_positions table.
 * Matches defi_positions column structure for direct DB insertion.
 */
export interface PositionUpdate {
  walletId: string;
  category: PositionCategory;
  provider: string;
  chain: string;
  network?: string | null;
  assetId?: string | null;
  amount: string;
  amountUsd?: number | null;
  metadata: Record<string, unknown>;
  status: PositionStatus;
  openedAt: number;
  closedAt?: number | null;
}

/**
 * Read-only position data source for PositionTracker.
 *
 * Any provider that participates in position tracking must implement
 * this interface. ILendingProvider implementations typically implement
 * both IActionProvider and IPositionProvider.
 */
export interface IPositionProvider {
  getPositions(walletId: string): Promise<PositionUpdate[]>;
  getProviderName(): string;
  getSupportedCategories(): PositionCategory[];
}
