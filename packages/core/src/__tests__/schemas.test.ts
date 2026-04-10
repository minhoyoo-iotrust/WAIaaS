import { describe, it, expect } from 'vitest';
import {
  WalletSchema,
  CreateWalletRequestSchema,
  CreateSessionRequestSchema,
  TransactionSchema,
  SendTransactionRequestSchema,
  PolicySchema,
  SessionSchema,
  ConfigSchema,
  TransactionRequestSchema,
  TransferRequestSchema,
  TokenTransferRequestSchema,
  ContractCallRequestSchema,
  ApproveRequestSchema,
  BatchRequestSchema,
  GasConditionSchema,
} from '../index.js';

describe('Zod SSoT Schemas', () => {
  describe('CreateWalletRequestSchema', () => {
    it('parses with minimal fields (environment defaults to mainnet)', () => {
      const result = CreateWalletRequestSchema.parse({ name: 'test-agent' });
      expect(result.name).toBe('test-agent');
      expect(result.chain).toBe('solana');
      expect(result.environment).toBe('mainnet');
    });

    it('parses with explicit environment', () => {
      const result = CreateWalletRequestSchema.parse({ name: 'test-agent', environment: 'testnet' });
      expect(result.name).toBe('test-agent');
      expect(result.chain).toBe('solana');
      expect(result.environment).toBe('testnet');
    });

    it('parses with chain=ethereum and mainnet environment', () => {
      const result = CreateWalletRequestSchema.parse({
        name: 'eth-agent',
        chain: 'ethereum',
        environment: 'mainnet',
      });
      expect(result.chain).toBe('ethereum');
      expect(result.environment).toBe('mainnet');
    });

    it('rejects invalid environment value', () => {
      expect(() =>
        CreateWalletRequestSchema.parse({ name: 'test-agent', environment: 'invalid-env' }),
      ).toThrow();
    });

    it('rejects empty name', () => {
      expect(() => CreateWalletRequestSchema.parse({ name: '' })).toThrow();
    });

    it('rejects name exceeding 100 characters', () => {
      expect(() => CreateWalletRequestSchema.parse({ name: 'a'.repeat(101) })).toThrow();
    });
  });

  describe('SendTransactionRequestSchema', () => {
    it('parses valid send request', () => {
      const result = SendTransactionRequestSchema.parse({
        to: 'So11111111111111111111111111111112',
        amount: '1000000000',
      });
      expect(result.to).toBeDefined();
      expect(result.amount).toBe('1000000000');
    });

    it('rejects negative amount', () => {
      expect(() =>
        SendTransactionRequestSchema.parse({
          to: 'addr',
          amount: '-100',
        }),
      ).toThrow();
    });

    it('rejects non-numeric amount', () => {
      expect(() =>
        SendTransactionRequestSchema.parse({
          to: 'addr',
          amount: 'abc',
        }),
      ).toThrow();
    });

    it('accepts optional memo', () => {
      const result = SendTransactionRequestSchema.parse({
        to: 'addr',
        amount: '100',
        memo: 'test memo',
      });
      expect(result.memo).toBe('test memo');
    });
  });

  describe('ConfigSchema', () => {
    it('parses empty object with defaults', () => {
      const result = ConfigSchema.parse({});
      expect(result.server_port).toBe(3100);
      expect(result.server_host).toBe('127.0.0.1');
      expect(result.log_level).toBe('info');
      expect(result.data_dir).toBe('~/.waiaas');
      expect(result.policy_default_tier).toBe('INSTANT');
      expect(result.notification_channels).toEqual([]);
    });

    it('rejects port out of range', () => {
      expect(() => ConfigSchema.parse({ server_port: 99999 })).toThrow();
    });

    it('rejects port zero', () => {
      expect(() => ConfigSchema.parse({ server_port: 0 })).toThrow();
    });

    it('rejects invalid log level', () => {
      expect(() => ConfigSchema.parse({ log_level: 'verbose' })).toThrow();
    });
  });

  describe('WalletSchema', () => {
    it('parses valid wallet with type inference', () => {
      const wallet = WalletSchema.parse({
        id: '01912345-6789-7abc-8def-0123456789ab',
        name: 'test',
        chain: 'solana',
        environment: 'testnet',
        publicKey: 'abc123',
        status: 'ACTIVE',
        ownerAddress: null,
        ownerVerified: false,
        createdAt: 1700000000,
        updatedAt: 1700000000,
      });
      expect(wallet.status).toBe('ACTIVE');
      expect(wallet.chain).toBe('solana');
      expect(wallet.environment).toBe('testnet');
      expect(wallet.ownerAddress).toBeNull();
    });

    it('does not have defaultNetwork field', () => {
      const shape = WalletSchema.shape;
      expect('defaultNetwork' in shape).toBe(false);
    });

    it('rejects invalid chain', () => {
      expect(() =>
        WalletSchema.parse({
          id: '01912345-6789-7abc-8def-0123456789ab',
          name: 'test',
          chain: 'bitcoin',
          environment: 'testnet',
          publicKey: 'abc123',
          status: 'ACTIVE',
          ownerAddress: null,
          ownerVerified: false,
          createdAt: 1700000000,
          updatedAt: 1700000000,
        }),
      ).toThrow();
    });
  });

  describe('SessionSchema', () => {
    it('parses valid session', () => {
      const session = SessionSchema.parse({
        id: '01912345-6789-7abc-8def-0123456789ab',
        walletId: '01912345-6789-7abc-8def-0123456789ac',
        tokenHash: 'sha256hash',
        constraints: null,
        renewalCount: 0,
        maxRenewals: 24,
        expiresAt: 1700003600,
        absoluteExpiresAt: 1700604800,
        createdAt: 1700000000,
        updatedAt: 1700000000,
      });
      expect(session.renewalCount).toBe(0);
    });
  });

  describe('CreateSessionRequestSchema', () => {
    it('does not have defaultWalletId field', () => {
      // v29.3: defaultWalletId removed (default wallet concept removed)
      const shape = CreateSessionRequestSchema._def.schema.shape;
      expect('defaultWalletId' in shape).toBe(false);
    });

    it('parses with walletId', () => {
      const result = CreateSessionRequestSchema.parse({
        walletId: '01912345-6789-7abc-8def-0123456789ab',
      });
      expect(result.walletId).toBe('01912345-6789-7abc-8def-0123456789ab');
    });

    it('parses with walletIds', () => {
      const result = CreateSessionRequestSchema.parse({
        walletIds: ['01912345-6789-7abc-8def-0123456789ab'],
      });
      expect(result.walletIds).toHaveLength(1);
    });

    it('rejects when neither walletId nor walletIds is provided', () => {
      expect(() => CreateSessionRequestSchema.parse({})).toThrow(/Either walletId or walletIds/);
    });
  });

  describe('TransactionSchema', () => {
    it('parses valid transaction', () => {
      const tx = TransactionSchema.parse({
        id: '01912345-6789-7abc-8def-0123456789ab',
        walletId: '01912345-6789-7abc-8def-0123456789ac',
        sessionId: null,
        type: 'TRANSFER',
        status: 'PENDING',
        tier: null,
        chain: 'solana',
        network: null,
        fromAddress: 'from_addr',
        toAddress: 'to_addr',
        amount: '1000000000',
        txHash: null,
        errorMessage: null,
        metadata: null,
        createdAt: 1700000000,
        updatedAt: 1700000000,
      });
      expect(tx.type).toBe('TRANSFER');
      expect(tx.amount).toBe('1000000000');
    });
  });

  describe('PolicySchema', () => {
    it('parses valid policy', () => {
      const policy = PolicySchema.parse({
        id: '01912345-6789-7abc-8def-0123456789ab',
        walletId: '01912345-6789-7abc-8def-0123456789ac',
        type: 'SPENDING_LIMIT',
        ruleConfig: { per_transaction: '1000000000' },
        enabled: true,
        network: null,
        createdAt: 1700000000,
        updatedAt: 1700000000,
      });
      expect(policy.type).toBe('SPENDING_LIMIT');
      expect(policy.enabled).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// discriminatedUnion 5-type TransactionRequestSchema (v1.4)
// ---------------------------------------------------------------------------

describe('TransactionRequestSchema (discriminatedUnion 5-type)', () => {
  describe('TRANSFER', () => {
    it('parses valid TRANSFER request', () => {
      const result = TransactionRequestSchema.parse({
        type: 'TRANSFER',
        to: 'So11111111111111111111111111111112',
        amount: '1000000000',
      });
      expect(result.type).toBe('TRANSFER');
      if (result.type === 'TRANSFER') {
        expect(result.to).toBe('So11111111111111111111111111111112');
        expect(result.amount).toBe('1000000000');
      }
    });

    it('accepts optional memo', () => {
      const result = TransactionRequestSchema.parse({
        type: 'TRANSFER',
        to: 'addr',
        amount: '100',
        memo: 'test memo',
      });
      expect(result.type).toBe('TRANSFER');
      if (result.type === 'TRANSFER') {
        expect(result.memo).toBe('test memo');
      }
    });
  });

  describe('TOKEN_TRANSFER', () => {
    it('parses valid TOKEN_TRANSFER request', () => {
      const result = TransactionRequestSchema.parse({
        type: 'TOKEN_TRANSFER',
        to: 'recipientAddr',
        amount: '1000000',
        token: {
          address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          decimals: 6,
          symbol: 'USDC',
        },
      });
      expect(result.type).toBe('TOKEN_TRANSFER');
      if (result.type === 'TOKEN_TRANSFER') {
        expect(result.token.symbol).toBe('USDC');
        expect(result.token.decimals).toBe(6);
      }
    });
  });

  describe('CONTRACT_CALL', () => {
    it('parses valid CONTRACT_CALL with EVM fields', () => {
      const result = TransactionRequestSchema.parse({
        type: 'CONTRACT_CALL',
        to: '0x1234567890123456789012345678901234567890',
        calldata: '0xa9059cbb',
        value: '0',
      });
      expect(result.type).toBe('CONTRACT_CALL');
      if (result.type === 'CONTRACT_CALL') {
        expect(result.calldata).toBe('0xa9059cbb');
      }
    });

    it('parses valid CONTRACT_CALL with Solana fields', () => {
      const result = TransactionRequestSchema.parse({
        type: 'CONTRACT_CALL',
        to: 'programAddr',
        programId: 'programAddr',
        instructionData: 'AQID',
        accounts: [
          { pubkey: 'acc1', isSigner: true, isWritable: true },
          { pubkey: 'acc2', isSigner: false, isWritable: false },
        ],
      });
      expect(result.type).toBe('CONTRACT_CALL');
      if (result.type === 'CONTRACT_CALL') {
        expect(result.accounts).toHaveLength(2);
      }
    });
  });

  describe('APPROVE', () => {
    it('parses valid APPROVE request', () => {
      const result = TransactionRequestSchema.parse({
        type: 'APPROVE',
        spender: '0xSpenderAddress',
        token: {
          address: '0xTokenAddress',
          decimals: 18,
          symbol: 'WETH',
        },
        amount: '1000000000000000000',
      });
      expect(result.type).toBe('APPROVE');
      if (result.type === 'APPROVE') {
        expect(result.spender).toBe('0xSpenderAddress');
        expect(result.token.symbol).toBe('WETH');
      }
    });
  });

  describe('BATCH', () => {
    it('parses valid BATCH with 2 instructions', () => {
      const result = TransactionRequestSchema.parse({
        type: 'BATCH',
        instructions: [
          { to: 'addr1', amount: '1000' },
          { to: 'addr2', amount: '2000' },
        ],
      });
      expect(result.type).toBe('BATCH');
      if (result.type === 'BATCH') {
        expect(result.instructions).toHaveLength(2);
      }
    });

    it('rejects BATCH with fewer than 2 instructions', () => {
      expect(() =>
        TransactionRequestSchema.parse({
          type: 'BATCH',
          instructions: [{ to: 'addr1', amount: '1000' }],
        }),
      ).toThrow(/at least 2/);
    });

    it('rejects BATCH with more than 20 instructions', () => {
      const instructions = Array.from({ length: 21 }, (_, i) => ({
        to: `addr${i}`,
        amount: `${1000 + i}`,
      }));
      expect(() =>
        TransactionRequestSchema.parse({
          type: 'BATCH',
          instructions,
        }),
      ).toThrow(/maximum 20/);
    });
  });

  describe('invalid type', () => {
    it('rejects unknown type', () => {
      expect(() =>
        TransactionRequestSchema.parse({
          type: 'INVALID',
          to: 'addr',
        }),
      ).toThrow();
    });
  });

  describe('individual schemas', () => {
    it('TransferRequestSchema is independently usable', () => {
      const result = TransferRequestSchema.parse({
        type: 'TRANSFER',
        to: 'addr',
        amount: '100',
      });
      expect(result.type).toBe('TRANSFER');
    });

    it('TokenTransferRequestSchema validates token field', () => {
      expect(() =>
        TokenTransferRequestSchema.parse({
          type: 'TOKEN_TRANSFER',
          to: 'addr',
          amount: '100',
          // missing token
        }),
      ).toThrow();
    });

    it('ApproveRequestSchema rejects non-numeric amount', () => {
      expect(() =>
        ApproveRequestSchema.parse({
          type: 'APPROVE',
          spender: 'addr',
          token: { address: 'mint', decimals: 6, symbol: 'USDC' },
          amount: 'abc',
        }),
      ).toThrow();
    });

    it('ContractCallRequestSchema accepts minimal fields', () => {
      const result = ContractCallRequestSchema.parse({
        type: 'CONTRACT_CALL',
        to: '0xContractAddr',
      });
      expect(result.type).toBe('CONTRACT_CALL');
      expect(result.to).toBe('0xContractAddr');
    });

    it('ContractCallRequestSchema accepts optional actionProvider field', () => {
      const result = ContractCallRequestSchema.parse({
        type: 'CONTRACT_CALL',
        to: '0xContractAddr',
        calldata: '0xdeadbeef',
        actionProvider: 'jupiter_swap',
      });
      expect(result.actionProvider).toBe('jupiter_swap');
    });

    it('ContractCallRequestSchema accepts object without actionProvider field', () => {
      const result = ContractCallRequestSchema.parse({
        type: 'CONTRACT_CALL',
        to: '0xContractAddr',
        calldata: '0xdeadbeef',
      });
      expect(result.actionProvider).toBeUndefined();
    });

    it('BatchRequestSchema accepts mixed instruction types', () => {
      const result = BatchRequestSchema.parse({
        type: 'BATCH',
        instructions: [
          { to: 'addr1', amount: '1000' }, // transfer-like
          { to: 'addr2', amount: '2000', token: { address: 'mint', decimals: 6, symbol: 'USDC' } }, // token-transfer-like
        ],
      });
      expect(result.instructions).toHaveLength(2);
    });
  });
});

// ---------------------------------------------------------------------------
// GasConditionSchema (v28.5)
// ---------------------------------------------------------------------------

describe('GasConditionSchema', () => {
  it('parses with maxGasPrice only', () => {
    const result = GasConditionSchema.parse({ maxGasPrice: '50000000000' });
    expect(result.maxGasPrice).toBe('50000000000');
    expect(result.maxPriorityFee).toBeUndefined();
    expect(result.timeout).toBeUndefined();
  });

  it('parses with maxPriorityFee only', () => {
    const result = GasConditionSchema.parse({ maxPriorityFee: '2000000000' });
    expect(result.maxPriorityFee).toBe('2000000000');
    expect(result.maxGasPrice).toBeUndefined();
  });

  it('parses with both maxGasPrice and maxPriorityFee', () => {
    const result = GasConditionSchema.parse({
      maxGasPrice: '50000000000',
      maxPriorityFee: '2000000000',
    });
    expect(result.maxGasPrice).toBe('50000000000');
    expect(result.maxPriorityFee).toBe('2000000000');
  });

  it('parses with timeout', () => {
    const result = GasConditionSchema.parse({
      maxGasPrice: '50000000000',
      timeout: 3600,
    });
    expect(result.timeout).toBe(3600);
  });

  it('rejects when neither maxGasPrice nor maxPriorityFee is specified', () => {
    expect(() => GasConditionSchema.parse({})).toThrow(/At least one/);
  });

  it('rejects when only timeout is specified (no gas price fields)', () => {
    expect(() => GasConditionSchema.parse({ timeout: 3600 })).toThrow(/At least one/);
  });

  it('rejects non-numeric maxGasPrice', () => {
    expect(() => GasConditionSchema.parse({ maxGasPrice: 'abc' })).toThrow(/numeric string/);
  });

  it('rejects non-numeric maxPriorityFee', () => {
    expect(() => GasConditionSchema.parse({ maxPriorityFee: '1.5' })).toThrow(/numeric string/);
  });

  it('rejects timeout below 60', () => {
    expect(() =>
      GasConditionSchema.parse({ maxGasPrice: '100', timeout: 30 }),
    ).toThrow();
  });

  it('rejects timeout above 86400', () => {
    expect(() =>
      GasConditionSchema.parse({ maxGasPrice: '100', timeout: 100000 }),
    ).toThrow();
  });

  it('accepts timeout boundary: 60', () => {
    const result = GasConditionSchema.parse({ maxGasPrice: '100', timeout: 60 });
    expect(result.timeout).toBe(60);
  });

  it('accepts timeout boundary: 86400', () => {
    const result = GasConditionSchema.parse({ maxGasPrice: '100', timeout: 86400 });
    expect(result.timeout).toBe(86400);
  });

  it('rejects non-integer timeout', () => {
    expect(() =>
      GasConditionSchema.parse({ maxGasPrice: '100', timeout: 3600.5 }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// gasCondition field on 5-type request schemas (v28.5)
// ---------------------------------------------------------------------------

describe('gasCondition on transaction request schemas', () => {
  it('TRANSFER accepts optional gasCondition', () => {
    const result = TransferRequestSchema.parse({
      type: 'TRANSFER',
      to: 'addr',
      amount: '100',
      gasCondition: { maxGasPrice: '50000000000' },
    });
    expect(result.gasCondition).toBeDefined();
    expect(result.gasCondition!.maxGasPrice).toBe('50000000000');
  });

  it('TRANSFER works without gasCondition (backward compat)', () => {
    const result = TransferRequestSchema.parse({
      type: 'TRANSFER',
      to: 'addr',
      amount: '100',
    });
    expect(result.gasCondition).toBeUndefined();
  });

  it('TOKEN_TRANSFER accepts optional gasCondition', () => {
    const result = TokenTransferRequestSchema.parse({
      type: 'TOKEN_TRANSFER',
      to: 'addr',
      amount: '100',
      token: { address: 'mint', decimals: 6, symbol: 'USDC' },
      gasCondition: { maxPriorityFee: '2000000000', timeout: 1800 },
    });
    expect(result.gasCondition).toBeDefined();
    expect(result.gasCondition!.maxPriorityFee).toBe('2000000000');
    expect(result.gasCondition!.timeout).toBe(1800);
  });

  it('CONTRACT_CALL accepts optional gasCondition', () => {
    const result = ContractCallRequestSchema.parse({
      type: 'CONTRACT_CALL',
      to: '0xContract',
      calldata: '0xdeadbeef',
      gasCondition: { maxGasPrice: '100000000000' },
    });
    expect(result.gasCondition).toBeDefined();
  });

  it('APPROVE accepts optional gasCondition', () => {
    const result = ApproveRequestSchema.parse({
      type: 'APPROVE',
      spender: '0xSpender',
      token: { address: '0xToken', decimals: 18, symbol: 'WETH' },
      amount: '1000000000000000000',
      gasCondition: { maxGasPrice: '50000000000', maxPriorityFee: '2000000000' },
    });
    expect(result.gasCondition).toBeDefined();
  });

  it('BATCH accepts optional gasCondition', () => {
    const result = BatchRequestSchema.parse({
      type: 'BATCH',
      instructions: [
        { to: 'addr1', amount: '100' },
        { to: 'addr2', amount: '200' },
      ],
      gasCondition: { maxGasPrice: '50000000000' },
    });
    expect(result.gasCondition).toBeDefined();
  });

  it('rejects invalid gasCondition on TRANSFER', () => {
    expect(() =>
      TransferRequestSchema.parse({
        type: 'TRANSFER',
        to: 'addr',
        amount: '100',
        gasCondition: { timeout: 3600 }, // missing gas price fields
      }),
    ).toThrow(/At least one/);
  });
});
