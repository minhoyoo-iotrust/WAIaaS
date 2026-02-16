/**
 * WAIaaS Event Bus event type definitions.
 *
 * Typed events for the EventBus system:
 * - transaction:completed -- fired after on-chain confirmation (Stage 6)
 * - transaction:failed -- fired on pipeline failure (Stage 5/6 errors)
 * - wallet:activity -- fired on wallet-related activities (TX_REQUESTED, TX_SUBMITTED, SESSION_CREATED, OWNER_SET)
 * - kill-switch:state-changed -- fired on kill switch state transitions (ACTIVE/SUSPENDED/LOCKED)
 *
 * These events are consumed by AutoStopService (Phase 141) and BalanceMonitorService (Phase 142).
 *
 * @see docs/35-notification-architecture.md
 */

// ---------------------------------------------------------------------------
// Event payload interfaces
// ---------------------------------------------------------------------------

export interface TransactionCompletedEvent {
  walletId: string;
  txId: string;
  txHash: string;
  amount?: string;
  network?: string;
  type: string;
  timestamp: number;
}

export interface TransactionFailedEvent {
  walletId: string;
  txId: string;
  error: string;
  network?: string;
  type: string;
  timestamp: number;
}

export interface WalletActivityEvent {
  walletId: string;
  activity: 'TX_REQUESTED' | 'SESSION_CREATED' | 'OWNER_SET' | 'TX_SUBMITTED';
  details?: Record<string, unknown>;
  timestamp: number;
}

export interface KillSwitchStateChangedEvent {
  state: string;
  previousState: string;
  activatedBy: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Event map (typed EventEmitter key -> payload mapping)
// ---------------------------------------------------------------------------

export interface WaiaasEventMap {
  'transaction:completed': TransactionCompletedEvent;
  'transaction:failed': TransactionFailedEvent;
  'wallet:activity': WalletActivityEvent;
  'kill-switch:state-changed': KillSwitchStateChangedEvent;
}
