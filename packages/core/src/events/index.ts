// Events module: EventBus + typed event definitions
export { EventBus } from './event-bus.js';
export type {
  WaiaasEventMap,
  TransactionCompletedEvent,
  TransactionFailedEvent,
  WalletActivityEvent,
  KillSwitchStateChangedEvent,
} from './event-types.js';
