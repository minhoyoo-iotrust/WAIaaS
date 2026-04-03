import { describe, it, expect, beforeEach } from 'vitest';
import {
  CHAIN_TYPES,
  ChainTypeEnum,
  NETWORK_TYPES,
  NetworkTypeEnum,
  EVM_NETWORK_TYPES,
  EvmNetworkTypeEnum,
  SOLANA_NETWORK_TYPES,
  ENVIRONMENT_TYPES,
  EnvironmentTypeEnum,
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
  NOTIFICATION_LOG_STATUSES,
  NotificationLogStatusEnum,
  AUDIT_ACTIONS,
  AuditActionEnum,
  KILL_SWITCH_STATES,
  KillSwitchStateEnum,
  OWNER_STATES,
  OwnerStateEnum,
  POSITION_CATEGORIES,
  PositionCategoryEnum,
  POSITION_STATUSES,
  PositionStatusEnum,
  normalizeNetworkInput,
  _resetLegacyWarning,
  NetworkTypeEnumWithLegacy,
} from '../index.js';

describe('Enum SSoT', () => {
  // 16 Enum value count verification
  it('ChainType has 3 values', () => {
    expect(CHAIN_TYPES).toHaveLength(3);
    expect(CHAIN_TYPES).toContain('solana');
    expect(CHAIN_TYPES).toContain('ethereum');
    expect(CHAIN_TYPES).toContain('ripple');
  });

  it('NetworkType has 18 values', () => {
    expect(NETWORK_TYPES).toHaveLength(18);
    // Solana networks
    expect(NETWORK_TYPES).toContain('solana-mainnet');
    expect(NETWORK_TYPES).toContain('solana-devnet');
    expect(NETWORK_TYPES).toContain('solana-testnet');
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
    expect(NETWORK_TYPES).toContain('hyperevm-mainnet');
    expect(NETWORK_TYPES).toContain('hyperevm-testnet');
    // XRPL networks
    expect(NETWORK_TYPES).toContain('xrpl-mainnet');
    expect(NETWORK_TYPES).toContain('xrpl-testnet');
    expect(NETWORK_TYPES).toContain('xrpl-devnet');
  });

  it('EnvironmentType has 2 values', () => {
    expect(ENVIRONMENT_TYPES).toHaveLength(2);
    expect(ENVIRONMENT_TYPES).toContain('testnet');
    expect(ENVIRONMENT_TYPES).toContain('mainnet');
  });

  it('WalletStatus has 5 values', () => {
    expect(WALLET_STATUSES).toHaveLength(5);
    expect(WALLET_STATUSES).toContain('CREATING');
    expect(WALLET_STATUSES).toContain('ACTIVE');
    expect(WALLET_STATUSES).toContain('SUSPENDED');
    expect(WALLET_STATUSES).toContain('TERMINATING');
    expect(WALLET_STATUSES).toContain('TERMINATED');
  });

  it('TransactionStatus has 11 values', () => {
    expect(TRANSACTION_STATUSES).toHaveLength(11);
    expect(TRANSACTION_STATUSES).toContain('SIGNED');
    expect(TRANSACTION_STATUSES).toContain('GAS_WAITING');
  });

  it('TransactionType has 9 values', () => {
    expect(TRANSACTION_TYPES).toHaveLength(9);
    expect(TRANSACTION_TYPES).toContain('SIGN');
    expect(TRANSACTION_TYPES).toContain('X402_PAYMENT');
    expect(TRANSACTION_TYPES).toContain('NFT_TRANSFER');
    expect(TRANSACTION_TYPES).toContain('CONTRACT_DEPLOY');
  });

  it('PolicyType has 19 values', () => {
    expect(POLICY_TYPES).toHaveLength(21);
    expect(POLICY_TYPES).toContain('X402_ALLOWED_DOMAINS');
    expect(POLICY_TYPES).toContain('LENDING_LTV_LIMIT');
    expect(POLICY_TYPES).toContain('LENDING_ASSET_WHITELIST');
    expect(POLICY_TYPES).toContain('PERP_MAX_LEVERAGE');
    expect(POLICY_TYPES).toContain('PERP_MAX_POSITION_USD');
    expect(POLICY_TYPES).toContain('PERP_ALLOWED_MARKETS');
    // v30.8: ERC-8004 reputation threshold
    expect(POLICY_TYPES).toContain('REPUTATION_THRESHOLD');
    // v30.10: ERC-8128 allowed domains
    expect(POLICY_TYPES).toContain('ERC8128_ALLOWED_DOMAINS');
  });

  it('PolicyTier has 4 values', () => {
    expect(POLICY_TIERS).toHaveLength(4);
  });

  it('SessionStatus has 3 values', () => {
    expect(SESSION_STATUSES).toHaveLength(3);
  });

  it('NotificationEventType has 66 values', () => {
    expect(NOTIFICATION_EVENT_TYPES).toHaveLength(66);
    // v28.5: gas condition events
    expect(NOTIFICATION_EVENT_TYPES).toContain('TX_GAS_WAITING');
    expect(NOTIFICATION_EVENT_TYPES).toContain('TX_GAS_CONDITION_MET');
    // v28.6: RPC monitoring events
    expect(NOTIFICATION_EVENT_TYPES).toContain('RPC_ALL_FAILED');
    expect(NOTIFICATION_EVENT_TYPES).toContain('RPC_RECOVERED');
    // v29.2: DeFi monitoring events
    expect(NOTIFICATION_EVENT_TYPES).toContain('LIQUIDATION_WARNING');
    expect(NOTIFICATION_EVENT_TYPES).toContain('MATURITY_WARNING');
    expect(NOTIFICATION_EVENT_TYPES).toContain('MARGIN_WARNING');
    expect(NOTIFICATION_EVENT_TYPES).toContain('LIQUIDATION_IMMINENT');
    // #204: idle session notification
    expect(NOTIFICATION_EVENT_TYPES).toContain('SESSION_IDLE');
    // v30.8: ERC-8004 agent identity events
    expect(NOTIFICATION_EVENT_TYPES).toContain('AGENT_REGISTERED');
    expect(NOTIFICATION_EVENT_TYPES).toContain('AGENT_WALLET_LINKED');
    expect(NOTIFICATION_EVENT_TYPES).toContain('AGENT_WALLET_UNLINKED');
    expect(NOTIFICATION_EVENT_TYPES).toContain('REPUTATION_FEEDBACK_RECEIVED');
    expect(NOTIFICATION_EVENT_TYPES).toContain('REPUTATION_THRESHOLD_TRIGGERED');
    // v30.10: ERC-8128 signed HTTP requests events
    expect(NOTIFICATION_EVENT_TYPES).toContain('ERC8128_SIGNATURE_CREATED');
    expect(NOTIFICATION_EVENT_TYPES).toContain('ERC8128_DOMAIN_BLOCKED');
  });

  it('NotificationLogStatus has 2 values', () => {
    expect(NOTIFICATION_LOG_STATUSES).toHaveLength(2);
    expect(NOTIFICATION_LOG_STATUSES).toContain('sent');
    expect(NOTIFICATION_LOG_STATUSES).toContain('failed');
  });

  it('AuditAction has 26 values', () => {
    expect(AUDIT_ACTIONS).toHaveLength(26);
  });

  it('KillSwitchState has 3 values', () => {
    expect(KILL_SWITCH_STATES).toHaveLength(3);
  });

  it('OwnerState has 3 values', () => {
    expect(OWNER_STATES).toHaveLength(3);
  });

  // DeFi SSoT enums (v29.2)
  describe('DeFi SSoT enums', () => {
    it('POSITION_CATEGORIES has 4 values', () => {
      expect(POSITION_CATEGORIES).toHaveLength(4);
      expect(POSITION_CATEGORIES).toContain('LENDING');
      expect(POSITION_CATEGORIES).toContain('YIELD');
      expect(POSITION_CATEGORIES).toContain('PERP');
      expect(POSITION_CATEGORIES).toContain('STAKING');
    });

    it('PositionCategoryEnum validates correct values', () => {
      for (const cat of POSITION_CATEGORIES) {
        expect(PositionCategoryEnum.parse(cat)).toBe(cat);
      }
      expect(PositionCategoryEnum.safeParse('INVALID').success).toBe(false);
    });

    it('POSITION_STATUSES has 4 values', () => {
      expect(POSITION_STATUSES).toHaveLength(4);
      expect(POSITION_STATUSES).toContain('ACTIVE');
      expect(POSITION_STATUSES).toContain('CLOSED');
      expect(POSITION_STATUSES).toContain('LIQUIDATED');
      expect(POSITION_STATUSES).toContain('MATURED');
    });

    it('PositionStatusEnum validates correct values', () => {
      for (const status of POSITION_STATUSES) {
        expect(PositionStatusEnum.parse(status)).toBe(status);
      }
      expect(PositionStatusEnum.safeParse('INVALID').success).toBe(false);
    });
  });

  // EVM NetworkType subset
  describe('EVM NetworkType subset', () => {
    it('EVM_NETWORK_TYPES has 12 values', () => {
      expect(EVM_NETWORK_TYPES).toHaveLength(12);
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
      expect(EVM_NETWORK_TYPES).toContain('hyperevm-mainnet');
      expect(EVM_NETWORK_TYPES).toContain('hyperevm-testnet');
    });

    it('EvmNetworkTypeEnum validates EVM networks', () => {
      expect(EvmNetworkTypeEnum.parse('ethereum-sepolia')).toBe('ethereum-sepolia');
      expect(EvmNetworkTypeEnum.parse('hyperevm-mainnet')).toBe('hyperevm-mainnet');
      expect(EvmNetworkTypeEnum.parse('hyperevm-testnet')).toBe('hyperevm-testnet');
      expect(() => EvmNetworkTypeEnum.parse('solana-devnet')).toThrow();
    });

    it('SOLANA_NETWORK_TYPES has 3 values', () => {
      expect(SOLANA_NETWORK_TYPES).toHaveLength(3);
      expect(SOLANA_NETWORK_TYPES).toContain('solana-mainnet');
      expect(SOLANA_NETWORK_TYPES).toContain('solana-devnet');
      expect(SOLANA_NETWORK_TYPES).toContain('solana-testnet');
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
      expect(() => validateChainNetwork('solana', 'solana-devnet')).not.toThrow();
      expect(() => validateChainNetwork('solana', 'solana-mainnet')).not.toThrow();
      expect(() => validateChainNetwork('solana', 'solana-testnet')).not.toThrow();
    });

    it('accepts valid EVM chain+network pairs', () => {
      expect(() => validateChainNetwork('ethereum', 'ethereum-sepolia')).not.toThrow();
      expect(() => validateChainNetwork('ethereum', 'polygon-mainnet')).not.toThrow();
      expect(() => validateChainNetwork('ethereum', 'base-mainnet')).not.toThrow();
      expect(() => validateChainNetwork('ethereum', 'arbitrum-mainnet')).not.toThrow();
      expect(() => validateChainNetwork('ethereum', 'optimism-mainnet')).not.toThrow();
    });

    it('rejects Solana network for ethereum chain', () => {
      expect(() => validateChainNetwork('ethereum', 'solana-devnet')).toThrow();
      expect(() => validateChainNetwork('ethereum', 'solana-mainnet')).toThrow();
      expect(() => validateChainNetwork('ethereum', 'solana-testnet')).toThrow();
    });

    it('rejects EVM network for solana chain', () => {
      expect(() => validateChainNetwork('solana', 'ethereum-sepolia')).toThrow();
      expect(() => validateChainNetwork('solana', 'polygon-mainnet')).toThrow();
    });

    it('rejects invalid network values', () => {
      expect(() => validateChainNetwork('ethereum', 'nonexistent' as any)).toThrow();
    });

    it('error message is descriptive', () => {
      expect(() => validateChainNetwork('ethereum', 'solana-devnet')).toThrow(/Invalid network.*solana-devnet.*ethereum/);
      expect(() => validateChainNetwork('solana', 'ethereum-sepolia')).toThrow(/Invalid network.*ethereum-sepolia.*solana/);
    });
  });

  // Zod enum options match as const arrays (all 16 enums)
  it('Zod enum options match as const arrays', () => {
    expect(ChainTypeEnum.options).toEqual([...CHAIN_TYPES]);
    expect(NetworkTypeEnum.options).toEqual([...NETWORK_TYPES]);
    expect(EnvironmentTypeEnum.options).toEqual([...ENVIRONMENT_TYPES]);
    expect(WalletStatusEnum.options).toEqual([...WALLET_STATUSES]);
    expect(TransactionStatusEnum.options).toEqual([...TRANSACTION_STATUSES]);
    expect(TransactionTypeEnum.options).toEqual([...TRANSACTION_TYPES]);
    expect(PolicyTypeEnum.options).toEqual([...POLICY_TYPES]);
    expect(PolicyTierEnum.options).toEqual([...POLICY_TIERS]);
    expect(SessionStatusEnum.options).toEqual([...SESSION_STATUSES]);
    expect(NotificationEventTypeEnum.options).toEqual([...NOTIFICATION_EVENT_TYPES]);
    expect(NotificationLogStatusEnum.options).toEqual([...NOTIFICATION_LOG_STATUSES]);
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

  // NotificationLogStatus Zod parse
  it('Zod parses valid NotificationLogStatus values', () => {
    expect(NotificationLogStatusEnum.parse('sent')).toBe('sent');
    expect(NotificationLogStatusEnum.parse('failed')).toBe('failed');
    expect(() => NotificationLogStatusEnum.parse('pending')).toThrow();
  });

  // normalizeNetworkInput: legacy -> canonical + passthrough
  describe('normalizeNetworkInput', () => {
    beforeEach(() => _resetLegacyWarning());

    it('converts legacy mainnet to solana-mainnet', () => {
      expect(normalizeNetworkInput('mainnet')).toBe('solana-mainnet');
    });

    it('converts legacy devnet to solana-devnet', () => {
      expect(normalizeNetworkInput('devnet')).toBe('solana-devnet');
    });

    it('converts legacy testnet to solana-testnet', () => {
      expect(normalizeNetworkInput('testnet')).toBe('solana-testnet');
    });

    it('passes through canonical solana-mainnet unchanged', () => {
      expect(normalizeNetworkInput('solana-mainnet')).toBe('solana-mainnet');
    });

    it('passes through EVM network unchanged', () => {
      expect(normalizeNetworkInput('ethereum-mainnet')).toBe('ethereum-mainnet');
      expect(normalizeNetworkInput('polygon-amoy')).toBe('polygon-amoy');
    });

    it('passes through unknown network unchanged', () => {
      expect(normalizeNetworkInput('unknown-chain')).toBe('unknown-chain');
    });
  });

  // NetworkTypeEnumWithLegacy accepts both legacy and canonical
  describe('NetworkTypeEnumWithLegacy', () => {
    beforeEach(() => _resetLegacyWarning());

    it('accepts canonical network names', () => {
      expect(NetworkTypeEnumWithLegacy.parse('solana-mainnet')).toBe('solana-mainnet');
      expect(NetworkTypeEnumWithLegacy.parse('ethereum-sepolia')).toBe('ethereum-sepolia');
    });

    it('accepts and normalizes legacy Solana network names', () => {
      expect(NetworkTypeEnumWithLegacy.parse('mainnet')).toBe('solana-mainnet');
      expect(NetworkTypeEnumWithLegacy.parse('devnet')).toBe('solana-devnet');
      expect(NetworkTypeEnumWithLegacy.parse('testnet')).toBe('solana-testnet');
    });

    it('rejects invalid network names', () => {
      expect(() => NetworkTypeEnumWithLegacy.parse('invalid')).toThrow();
    });
  });

  // normalizeNetworkInput CAIP-2 support (TDD RED - Task 1)
  describe('normalizeNetworkInput CAIP-2 (Task 1)', () => {
    it('converts CAIP-2 eip155:1 to ethereum-mainnet', () => {
      expect(normalizeNetworkInput('eip155:1')).toBe('ethereum-mainnet');
    });

    it('converts CAIP-2 solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp to solana-mainnet', () => {
      expect(normalizeNetworkInput('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp')).toBe('solana-mainnet');
    });

    it('passes through unregistered CAIP-2 unchanged', () => {
      expect(normalizeNetworkInput('eip155:99999')).toBe('eip155:99999');
    });
  });

  // CAIP-2 exhaustive mapping test (15 networks) -- TST-01
  describe('normalizeNetworkInput CAIP-2 exhaustive', () => {
    it.each([
      ['eip155:1', 'ethereum-mainnet'],
      ['eip155:11155111', 'ethereum-sepolia'],
      ['eip155:137', 'polygon-mainnet'],
      ['eip155:80002', 'polygon-amoy'],
      ['eip155:42161', 'arbitrum-mainnet'],
      ['eip155:421614', 'arbitrum-sepolia'],
      ['eip155:10', 'optimism-mainnet'],
      ['eip155:11155420', 'optimism-sepolia'],
      ['eip155:8453', 'base-mainnet'],
      ['eip155:84532', 'base-sepolia'],
      ['eip155:999', 'hyperevm-mainnet'],
      ['eip155:998', 'hyperevm-testnet'],
      ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', 'solana-mainnet'],
      ['solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1', 'solana-devnet'],
      ['solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z', 'solana-testnet'],
    ] as const)('converts %s to %s', (caip2, expected) => {
      expect(normalizeNetworkInput(caip2)).toBe(expected);
    });

    it('passes through unregistered CAIP-2 eip155:99999 unchanged', () => {
      expect(normalizeNetworkInput('eip155:99999')).toBe('eip155:99999');
    });

    it('passes through unregistered CAIP-2 solana:UNKNOWN unchanged', () => {
      expect(normalizeNetworkInput('solana:UNKNOWN')).toBe('solana:UNKNOWN');
    });
  });

  // Priority order verification -- TST-02
  describe('normalizeNetworkInput priority order', () => {
    beforeEach(() => _resetLegacyWarning());

    it('CAIP-2 is resolved before legacy mapping', () => {
      // CAIP-2 eip155:1 -> ethereum-mainnet (first priority)
      expect(normalizeNetworkInput('eip155:1')).toBe('ethereum-mainnet');
      // Legacy mainnet -> solana-mainnet (second priority)
      expect(normalizeNetworkInput('mainnet')).toBe('solana-mainnet');
    });

    it('plain string passes through without conversion', () => {
      expect(normalizeNetworkInput('ethereum-mainnet')).toBe('ethereum-mainnet');
      expect(normalizeNetworkInput('base-sepolia')).toBe('base-sepolia');
    });

    it('all three paths coexist: CAIP-2 + legacy + passthrough', () => {
      expect(normalizeNetworkInput('eip155:137')).toBe('polygon-mainnet');    // CAIP-2
      expect(normalizeNetworkInput('devnet')).toBe('solana-devnet');           // legacy
      expect(normalizeNetworkInput('arbitrum-mainnet')).toBe('arbitrum-mainnet'); // passthrough
    });
  });

  // NetworkTypeEnumWithLegacy CAIP-2 integration
  describe('NetworkTypeEnumWithLegacy CAIP-2', () => {
    it('accepts CAIP-2 eip155:1 and normalizes to ethereum-mainnet', () => {
      expect(NetworkTypeEnumWithLegacy.parse('eip155:1')).toBe('ethereum-mainnet');
    });

    it('accepts CAIP-2 solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp and normalizes to solana-mainnet', () => {
      expect(NetworkTypeEnumWithLegacy.parse('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp')).toBe('solana-mainnet');
    });

    it('accepts all 15 CAIP-2 identifiers via z.preprocess', () => {
      const caip2Inputs = [
        'eip155:1', 'eip155:11155111', 'eip155:137', 'eip155:80002',
        'eip155:42161', 'eip155:421614', 'eip155:10', 'eip155:11155420',
        'eip155:8453', 'eip155:84532', 'eip155:999', 'eip155:998',
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
        'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
        'solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z',
      ];
      for (const input of caip2Inputs) {
        expect(() => NetworkTypeEnumWithLegacy.parse(input)).not.toThrow();
      }
    });

    it('rejects unregistered CAIP-2 eip155:99999 with ZodError', () => {
      expect(() => NetworkTypeEnumWithLegacy.parse('eip155:99999')).toThrow();
    });

    it('still accepts canonical and legacy inputs', () => {
      expect(NetworkTypeEnumWithLegacy.parse('ethereum-mainnet')).toBe('ethereum-mainnet');
      expect(NetworkTypeEnumWithLegacy.parse('mainnet')).toBe('solana-mainnet');
    });
  });

  // All enum arrays contain only string values (no duplicates) -- all 18
  it('enum arrays have no duplicate values', () => {
    const allArrays = [
      CHAIN_TYPES, NETWORK_TYPES, SOLANA_NETWORK_TYPES, EVM_NETWORK_TYPES,
      ENVIRONMENT_TYPES, WALLET_STATUSES,
      TRANSACTION_STATUSES, TRANSACTION_TYPES,
      POLICY_TYPES, POLICY_TIERS, SESSION_STATUSES,
      NOTIFICATION_EVENT_TYPES, NOTIFICATION_LOG_STATUSES,
      AUDIT_ACTIONS, KILL_SWITCH_STATES, OWNER_STATES,
      POSITION_CATEGORIES, POSITION_STATUSES,
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
