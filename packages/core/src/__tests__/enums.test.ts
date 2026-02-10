import { describe, it, expect } from 'vitest';
import {
  CHAIN_TYPES,
  ChainTypeEnum,
  NETWORK_TYPES,
  NetworkTypeEnum,
  AGENT_STATUSES,
  AgentStatusEnum,
  TRANSACTION_STATUSES,
  TransactionStatusEnum,
  TRANSACTION_TYPES,
  TransactionTypeEnum,
  POLICY_TYPES,
  PolicyTypeEnum,
  POLICY_TIERS,
  PolicyTierEnum,
  SESSION_STATUSES,
  SessionStatusEnum,
  NOTIFICATION_EVENT_TYPES,
  NotificationEventTypeEnum,
  AUDIT_ACTIONS,
  AuditActionEnum,
  KILL_SWITCH_STATES,
  KillSwitchStateEnum,
  OWNER_STATES,
  OwnerStateEnum,
} from '../index.js';

describe('Enum SSoT', () => {
  // 12 Enum value count verification
  it('ChainType has 2 values', () => {
    expect(CHAIN_TYPES).toHaveLength(2);
    expect(CHAIN_TYPES).toContain('solana');
    expect(CHAIN_TYPES).toContain('ethereum');
  });

  it('NetworkType has 3 values', () => {
    expect(NETWORK_TYPES).toHaveLength(3);
    expect(NETWORK_TYPES).toContain('mainnet');
    expect(NETWORK_TYPES).toContain('devnet');
    expect(NETWORK_TYPES).toContain('testnet');
  });

  it('AgentStatus has 5 values', () => {
    expect(AGENT_STATUSES).toHaveLength(5);
    expect(AGENT_STATUSES).toContain('CREATING');
    expect(AGENT_STATUSES).toContain('ACTIVE');
    expect(AGENT_STATUSES).toContain('SUSPENDED');
    expect(AGENT_STATUSES).toContain('TERMINATING');
    expect(AGENT_STATUSES).toContain('TERMINATED');
  });

  it('TransactionStatus has 9 values', () => {
    expect(TRANSACTION_STATUSES).toHaveLength(9);
  });

  it('TransactionType has 5 values', () => {
    expect(TRANSACTION_TYPES).toHaveLength(5);
  });

  it('PolicyType has 10 values', () => {
    expect(POLICY_TYPES).toHaveLength(10);
  });

  it('PolicyTier has 4 values', () => {
    expect(POLICY_TIERS).toHaveLength(4);
  });

  it('SessionStatus has 3 values', () => {
    expect(SESSION_STATUSES).toHaveLength(3);
  });

  it('NotificationEventType has 16 values', () => {
    expect(NOTIFICATION_EVENT_TYPES).toHaveLength(16);
  });

  it('AuditAction has 23 values', () => {
    expect(AUDIT_ACTIONS).toHaveLength(23);
  });

  it('KillSwitchState has 3 values', () => {
    expect(KILL_SWITCH_STATES).toHaveLength(3);
  });

  it('OwnerState has 3 values', () => {
    expect(OWNER_STATES).toHaveLength(3);
  });

  // Zod enum options match as const arrays
  it('Zod enum options match as const arrays', () => {
    expect(ChainTypeEnum.options).toEqual([...CHAIN_TYPES]);
    expect(NetworkTypeEnum.options).toEqual([...NETWORK_TYPES]);
    expect(AgentStatusEnum.options).toEqual([...AGENT_STATUSES]);
    expect(TransactionStatusEnum.options).toEqual([...TRANSACTION_STATUSES]);
    expect(TransactionTypeEnum.options).toEqual([...TRANSACTION_TYPES]);
    expect(PolicyTypeEnum.options).toEqual([...POLICY_TYPES]);
    expect(PolicyTierEnum.options).toEqual([...POLICY_TIERS]);
    expect(SessionStatusEnum.options).toEqual([...SESSION_STATUSES]);
    expect(NotificationEventTypeEnum.options).toEqual([...NOTIFICATION_EVENT_TYPES]);
    expect(AuditActionEnum.options).toEqual([...AUDIT_ACTIONS]);
    expect(KillSwitchStateEnum.options).toEqual([...KILL_SWITCH_STATES]);
    expect(OwnerStateEnum.options).toEqual([...OWNER_STATES]);
  });

  // Valid value Zod parse success
  it('Zod parses valid ChainType values', () => {
    expect(ChainTypeEnum.parse('solana')).toBe('solana');
    expect(ChainTypeEnum.parse('ethereum')).toBe('ethereum');
  });

  // Invalid value Zod parse failure
  it('Zod rejects invalid ChainType values', () => {
    expect(() => ChainTypeEnum.parse('bitcoin')).toThrow();
  });

  // All enum arrays contain only string values (no duplicates)
  it('enum arrays have no duplicate values', () => {
    const allArrays = [
      CHAIN_TYPES, NETWORK_TYPES, AGENT_STATUSES,
      TRANSACTION_STATUSES, TRANSACTION_TYPES,
      POLICY_TYPES, POLICY_TIERS, SESSION_STATUSES,
      NOTIFICATION_EVENT_TYPES, AUDIT_ACTIONS,
      KILL_SWITCH_STATES, OWNER_STATES,
    ];
    for (const arr of allArrays) {
      const unique = new Set(arr);
      expect(unique.size).toBe(arr.length);
      for (const val of arr) {
        expect(typeof val).toBe('string');
      }
    }
  });
});
