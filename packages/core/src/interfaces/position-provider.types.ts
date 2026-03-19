/**
 * Position Provider types and interfaces.
 *
 * IPositionProvider is a read-only interface for PositionTracker
 * to periodically sync DeFi position data. Does NOT extend IActionProvider.
 *
 * Design source: m29-00 design doc section 6.1.
 */
import type { PositionCategory, PositionStatus } from '../enums/defi.js';
import type { ChainType, NetworkType, EnvironmentType } from '../enums/chain.js';

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
  environment?: string;
}

/**
 * Context passed to IPositionProvider.getPositions() containing wallet
 * chain/network/environment information needed for multi-chain position queries.
 *
 * Constructed by PositionTracker from wallet metadata + RPC config.
 * @see INTF-01
 */
export interface PositionQueryContext {
  walletId: string;
  walletAddress: string; // on-chain address (0x... or base58)
  chain: ChainType;
  networks: readonly NetworkType[];
  environment: EnvironmentType;
  rpcUrls: Record<string, string>; // network -> rpcUrl mapping
}

/**
 * Read-only position data source for PositionTracker.
 *
 * Any provider that participates in position tracking must implement
 * this interface. ILendingProvider implementations typically implement
 * both IActionProvider and IPositionProvider.
 */
export interface IPositionProvider {
  getPositions(ctx: PositionQueryContext): Promise<PositionUpdate[]>;
  getProviderName(): string;
  getSupportedCategories(): PositionCategory[];
}
