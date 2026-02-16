import { describe, it, expect } from 'vitest';
import {
  CHAIN_TYPES,
  ChainTypeEnum,
  NETWORK_TYPES,
  NetworkTypeEnum,
  EVM_NETWORK_TYPES,
  EvmNetworkTypeEnum,
  SOLANA_NETWORK_TYPES,
  validateChainNetwork,
  WALLET_STATUSES,
  WalletStatusEnum,
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

  it('NetworkType has 13 values', () => {
    expect(NETWORK_TYPES).toHaveLength(13);
    // Solana networks
    expect(NETWORK_TYPES).toContain('mainnet');
    expect(NETWORK_TYPES).toContain('devnet');
    expect(NETWORK_TYPES).toContain('testnet');
    // EVM networks
    expect(NETWORK_TYPES).toContain('ethereum-mainnet');
    expect(NETWORK_TYPES).toContain('ethereum-sepolia');
    expect(NETWORK_TYPES).toContain('polygon-mainnet');
    expect(NETWORK_TYPES).toContain('polygon-amoy');
    expect(NETWORK_TYPES).toContain('arbitrum-mainnet');
    expect(NETWORK_TYPES).toContain('arbitrum-sepolia');
    expect(NETWORK_TYPES).toContain('optimism-mainnet');
    expect(NETWORK_TYPES).toContain('optimism-sepolia');
    expect(NETWORK_TYPES).toContain('base-mainnet');
    expect(NETWORK_TYPES).toContain('base-sepolia');
  });

  it('WalletStatus has 5 values', () => {
    expect(WALLET_STATUSES).toHaveLength(5);
    expect(WALLET_STATUSES).toContain('CREATING');
    expect(WALLET_STATUSES).toContain('ACTIVE');
    expect(WALLET_STATUSES).toContain('SUSPENDED');
    expect(WALLET_STATUSES).toContain('TERMINATING');
    expect(WALLET_STATUSES).toContain('TERMINATED');
  });

  it('TransactionStatus has 10 values', () => {
    expect(TRANSACTION_STATUSES).toHaveLength(10);
    expect(TRANSACTION_STATUSES).toContain('SIGNED');
  });

  it('TransactionType has 7 values', () => {
    expect(TRANSACTION_TYPES).toHaveLength(7);
    expect(TRANSACTION_TYPES).toContain('SIGN');
    expect(TRANSACTION_TYPES).toContain('X402_PAYMENT');
  });

  it('PolicyType has 12 values', () => {
    expect(POLICY_TYPES).toHaveLength(12);
    expect(POLICY_TYPES).toContain('X402_ALLOWED_DOMAINS');
  });

  it('PolicyTier has 4 values', () => {
    expect(POLICY_TIERS).toHaveLength(4);
  });

  it('SessionStatus has 3 values', () => {
    expect(SESSION_STATUSES).toHaveLength(3);
  });

  it('NotificationEventType has 24 values', () => {
    expect(NOTIFICATION_EVENT_TYPES).toHaveLength(24);
  });

  it('AuditAction has 25 values', () => {
    expect(AUDIT_ACTIONS).toHaveLength(25);
  });

  it('KillSwitchState has 3 values', () => {
    expect(KILL_SWITCH_STATES).toHaveLength(3);
  });

  it('OwnerState has 3 values', () => {
    expect(OWNER_STATES).toHaveLength(3);
  });

  // EVM NetworkType subset
  describe('EVM NetworkType subset', () => {
    it('EVM_NETWORK_TYPES has 10 values', () => {
      expect(EVM_NETWORK_TYPES).toHaveLength(10);
      expect(EVM_NETWORK_TYPES).toContain('ethereum-mainnet');
      expect(EVM_NETWORK_TYPES).toContain('ethereum-sepolia');
      expect(EVM_NETWORK_TYPES).toContain('polygon-mainnet');
      expect(EVM_NETWORK_TYPES).toContain('polygon-amoy');
      expect(EVM_NETWORK_TYPES).toContain('arbitrum-mainnet');
      expect(EVM_NETWORK_TYPES).toContain('arbitrum-sepolia');
      expect(EVM_NETWORK_TYPES).toContain('optimism-mainnet');
      expect(EVM_NETWORK_TYPES).toContain('optimism-sepolia');
      expect(EVM_NETWORK_TYPES).toContain('base-mainnet');
      expect(EVM_NETWORK_TYPES).toContain('base-sepolia');
    });

    it('EvmNetworkTypeEnum validates EVM networks', () => {
      expect(EvmNetworkTypeEnum.parse('ethereum-sepolia')).toBe('ethereum-sepolia');
      expect(() => EvmNetworkTypeEnum.parse('devnet')).toThrow();
    });

    it('SOLANA_NETWORK_TYPES has 3 values', () => {
      expect(SOLANA_NETWORK_TYPES).toHaveLength(3);
      expect(SOLANA_NETWORK_TYPES).toContain('mainnet');
      expect(SOLANA_NETWORK_TYPES).toContain('devnet');
      expect(SOLANA_NETWORK_TYPES).toContain('testnet');
    });

    it('every EVM network is in NETWORK_TYPES', () => {
      for (const evmNetwork of EVM_NETWORK_TYPES) {
        expect(NETWORK_TYPES).toContain(evmNetwork);
      }
    });
  });

  // validateChainNetwork
  describe('validateChainNetwork', () => {
    it('accepts valid Solana chain+network pairs', () => {
      expect(() => validateChainNetwork('solana', 'devnet')).not.toThrow();
      expect(() => validateChainNetwork('solana', 'mainnet')).not.toThrow();
      expect(() => validateChainNetwork('solana', 'testnet')).not.toThrow();
    });

    it('accepts valid EVM chain+network pairs', () => {
      expect(() => validateChainNetwork('ethereum', 'ethereum-sepolia')).not.toThrow();
      expect(() => validateChainNetwork('ethereum', 'polygon-mainnet')).not.toThrow();
      expect(() => validateChainNetwork('ethereum', 'base-mainnet')).not.toThrow();
      expect(() => validateChainNetwork('ethereum', 'arbitrum-mainnet')).not.toThrow();
      expect(() => validateChainNetwork('ethereum', 'optimism-mainnet')).not.toThrow();
    });

    it('rejects Solana network for ethereum chain', () => {
      expect(() => validateChainNetwork('ethereum', 'devnet')).toThrow();
      expect(() => validateChainNetwork('ethereum', 'mainnet')).toThrow();
      expect(() => validateChainNetwork('ethereum', 'testnet')).toThrow();
    });

    it('rejects EVM network for solana chain', () => {
      expect(() => validateChainNetwork('solana', 'ethereum-sepolia')).toThrow();
      expect(() => validateChainNetwork('solana', 'polygon-mainnet')).toThrow();
    });

    it('rejects invalid network values', () => {
      expect(() => validateChainNetwork('ethereum', 'nonexistent' as any)).toThrow();
    });

    it('error message is descriptive', () => {
      expect(() => validateChainNetwork('ethereum', 'devnet')).toThrow(/Invalid network.*devnet.*ethereum/);
      expect(() => validateChainNetwork('solana', 'ethereum-sepolia')).toThrow(/Invalid network.*ethereum-sepolia.*solana/);
    });
  });

  // Zod enum options match as const arrays
  it('Zod enum options match as const arrays', () => {
    expect(ChainTypeEnum.options).toEqual([...CHAIN_TYPES]);
    expect(NetworkTypeEnum.options).toEqual([...NETWORK_TYPES]);
    expect(WalletStatusEnum.options).toEqual([...WALLET_STATUSES]);
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
      CHAIN_TYPES, NETWORK_TYPES, WALLET_STATUSES,
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
