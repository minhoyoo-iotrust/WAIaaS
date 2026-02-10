import { describe, it, expect } from 'vitest';
import {
  AgentSchema,
  CreateAgentRequestSchema,
  TransactionSchema,
  SendTransactionRequestSchema,
  PolicySchema,
  SessionSchema,
  ConfigSchema,
} from '../index.js';

describe('Zod SSoT Schemas', () => {
  describe('CreateAgentRequestSchema', () => {
    it('parses with minimal fields (defaults applied)', () => {
      const result = CreateAgentRequestSchema.parse({ name: 'test-agent' });
      expect(result.name).toBe('test-agent');
      expect(result.chain).toBe('solana');
      expect(result.network).toBe('devnet');
    });

    it('rejects empty name', () => {
      expect(() => CreateAgentRequestSchema.parse({ name: '' })).toThrow();
    });

    it('rejects name exceeding 100 characters', () => {
      expect(() => CreateAgentRequestSchema.parse({ name: 'a'.repeat(101) })).toThrow();
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

  describe('AgentSchema', () => {
    it('parses valid agent with type inference', () => {
      const agent = AgentSchema.parse({
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
      expect(agent.status).toBe('ACTIVE');
      expect(agent.chain).toBe('solana');
      expect(agent.ownerAddress).toBeNull();
    });

    it('rejects invalid chain', () => {
      expect(() =>
        AgentSchema.parse({
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
        agentId: '01912345-6789-7abc-8def-0123456789ac',
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
        agentId: '01912345-6789-7abc-8def-0123456789ac',
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
        agentId: '01912345-6789-7abc-8def-0123456789ac',
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
