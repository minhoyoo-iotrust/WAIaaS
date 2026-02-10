import { describe, it, expect } from 'vitest';
// Interfaces are compile-time only. Import succeeding = exports are correct.
import type {
  IChainAdapter,
  ILocalKeyStore,
  IPolicyEngine,
  INotificationChannel,
} from '../index.js';
import type {
  TransferRequest,
  UnsignedTransaction,
  SimulationResult,
  SubmitResult,
  BalanceInfo,
  HealthInfo,
  TokenAmount,
  PolicyEvaluation,
  NotificationPayload,
} from '../index.js';

describe('interfaces export verification', () => {
  it('IChainAdapter type is importable', () => {
    const _check: IChainAdapter | null = null;
    expect(_check).toBeNull();
  });

  it('ILocalKeyStore type is importable', () => {
    const _check: ILocalKeyStore | null = null;
    expect(_check).toBeNull();
  });

  it('IPolicyEngine type is importable', () => {
    const _check: IPolicyEngine | null = null;
    expect(_check).toBeNull();
  });

  it('INotificationChannel type is importable', () => {
    const _check: INotificationChannel | null = null;
    expect(_check).toBeNull();
  });

  it('chain adapter common types are importable', () => {
    const _req: TransferRequest | null = null;
    const _tx: UnsignedTransaction | null = null;
    const _sim: SimulationResult | null = null;
    const _sub: SubmitResult | null = null;
    const _bal: BalanceInfo | null = null;
    const _health: HealthInfo | null = null;
    const _amt: TokenAmount | null = null;
    const _eval: PolicyEvaluation | null = null;
    const _payload: NotificationPayload | null = null;
    expect(_req).toBeNull();
    expect(_tx).toBeNull();
    expect(_sim).toBeNull();
    expect(_sub).toBeNull();
    expect(_bal).toBeNull();
    expect(_health).toBeNull();
    expect(_amt).toBeNull();
    expect(_eval).toBeNull();
    expect(_payload).toBeNull();
  });
});
