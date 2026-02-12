import { describe, it, expect } from 'vitest';
import {
  WalletSchema,
  CreateWalletRequestSchema,
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
} from '../index.js';

describe('Zod SSoT Schemas', () => {
  describe('CreateWalletRequestSchema', () => {
    it('parses with minimal fields (network undefined when omitted)', () => {
      const result = CreateWalletRequestSchema.parse({ name: 'test-agent' });
      expect(result.name).toBe('test-agent');
      expect(result.chain).toBe('solana');
      expect(result.network).toBeUndefined();
    });

    it('parses with explicit network', () => {
      const result = CreateWalletRequestSchema.parse({ name: 'test-agent', network: 'devnet' });
      expect(result.name).toBe('test-agent');
      expect(result.chain).toBe('solana');
      expect(result.network).toBe('devnet');
    });

    it('parses with chain=ethereum and EVM network', () => {
      const result = CreateWalletRequestSchema.parse({
        name: 'eth-agent',
        chain: 'ethereum',
        network: 'ethereum-sepolia',
      });
      expect(result.chain).toBe('ethereum');
      expect(result.network).toBe('ethereum-sepolia');
    });

    it('rejects invalid network value', () => {
      expect(() =>
        CreateWalletRequestSchema.parse({ name: 'test-agent', network: 'invalid-network' }),
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
      expect(result.session_default_ttl).toBe(3600);
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
        network: 'devnet',
        publicKey: 'abc123',
        status: 'ACTIVE',
        ownerAddress: null,
        ownerVerified: false,
        createdAt: 1700000000,
        updatedAt: 1700000000,
      });
      expect(wallet.status).toBe('ACTIVE');
      expect(wallet.chain).toBe('solana');
      expect(wallet.ownerAddress).toBeNull();
    });

    it('rejects invalid chain', () => {
      expect(() =>
        WalletSchema.parse({
          id: '01912345-6789-7abc-8def-0123456789ab',
          name: 'test',
          chain: 'bitcoin',
          network: 'devnet',
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
