/**
 * WAIaaS Event Bus event type definitions.
 *
 * Typed events for the EventBus system (7 event types):
 * - transaction:completed -- fired after on-chain confirmation (Stage 6)
 * - transaction:failed -- fired on pipeline failure (Stage 5/6 errors)
 * - transaction:incoming -- fired when an incoming transfer is detected/confirmed (v27.1)
 * - transaction:incoming:suspicious -- fired when an incoming transfer is flagged suspicious (v27.1)
 * - wallet:activity -- fired on wallet-related activities (TX_REQUESTED, TX_SUBMITTED, SESSION_CREATED, OWNER_SET)
 * - kill-switch:state-changed -- fired on kill switch state transitions (ACTIVE/SUSPENDED/LOCKED)
 * - approval:channel-switched -- fired when approval channel falls back (e.g. WC -> Telegram)
 *
 * These events are consumed by AutoStopService (Phase 141), BalanceMonitorService (Phase 142),
 * and IncomingTxMonitorService (Phase 226).
 *
 * @see docs/35-notification-architecture.md
 * @see docs/76-incoming-tx-monitoring.md
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

export interface ApprovalChannelSwitchedEvent {
  walletId: string;
  txId: string;
  fromChannel: string;
  toChannel: string;
  reason: string;
  timestamp: number;
}

// v27.1 incoming transaction events

export interface IncomingTxEvent {
  walletId: string;
  txHash: string;
  fromAddress: string;
  amount: string;
  tokenAddress: string | null;
  chain: string;
  network: string;
  status: string;
  timestamp: number;
}

export interface IncomingTxSuspiciousEvent extends IncomingTxEvent {
  suspiciousReasons: string[];
}

// ---------------------------------------------------------------------------
// Event map (typed EventEmitter key -> payload mapping)
// ---------------------------------------------------------------------------

export interface WaiaasEventMap {
  'transaction:completed': TransactionCompletedEvent;
  'transaction:failed': TransactionFailedEvent;
  'transaction:incoming': IncomingTxEvent;
  'transaction:incoming:suspicious': IncomingTxSuspiciousEvent;
  'wallet:activity': WalletActivityEvent;
  'kill-switch:state-changed': KillSwitchStateChangedEvent;
  'approval:channel-switched': ApprovalChannelSwitchedEvent;
}
