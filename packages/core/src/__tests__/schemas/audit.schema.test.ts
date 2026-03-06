import { describe, it, expect } from 'vitest';
import {
  AuditEventTypeSchema,
  AuditSeveritySchema,
  AuditLogItemSchema,
  AuditLogResponseSchema,
  AuditLogQuerySchema,
  AUDIT_EVENT_TYPES,
  AUDIT_SEVERITIES,
} from '../../index.js';

describe('Audit Zod SSoT schemas', () => {
  // ---------- Test 1: AuditEventTypeSchema parses all 23 event types ----------
  it('parses all 23 event types', () => {
    expect(AUDIT_EVENT_TYPES).toHaveLength(23);
    for (const eventType of AUDIT_EVENT_TYPES) {
      expect(AuditEventTypeSchema.parse(eventType)).toBe(eventType);
    }
  });

  // ---------- Test 1b: USEROP_BUILD parses successfully ----------
  it('parses USEROP_BUILD event type', () => {
    expect(AuditEventTypeSchema.parse('USEROP_BUILD')).toBe('USEROP_BUILD');
  });

  // ---------- Test 1c: USEROP_SIGNED parses successfully ----------
  it('parses USEROP_SIGNED event type', () => {
    expect(AuditEventTypeSchema.parse('USEROP_SIGNED')).toBe('USEROP_SIGNED');
  });

  // ---------- Test 2: AuditEventTypeSchema rejects invalid event type ----------
  it('rejects invalid event type string', () => {
    expect(() => AuditEventTypeSchema.parse('INVALID_EVENT')).toThrow();
    expect(() => AuditEventTypeSchema.parse('')).toThrow();
    expect(() => AuditEventTypeSchema.parse(123)).toThrow();
  });

  // ---------- Test 3: AuditSeveritySchema parses valid severities ----------
  it('parses info, warning, critical severities', () => {
    expect(AUDIT_SEVERITIES).toHaveLength(3);
    for (const severity of AUDIT_SEVERITIES) {
      expect(AuditSeveritySchema.parse(severity)).toBe(severity);
    }
  });

  // ---------- Test 4: AuditSeveritySchema rejects invalid severity ----------
  it('rejects invalid severity', () => {
    expect(() => AuditSeveritySchema.parse('error')).toThrow();
    expect(() => AuditSeveritySchema.parse('debug')).toThrow();
    expect(() => AuditSeveritySchema.parse('')).toThrow();
  });

  // ---------- Test 5: AuditLogItemSchema parses complete item ----------
  it('parses a complete audit log item with all fields', () => {
    const input = {
      id: 1,
      timestamp: 1700000000,
      eventType: 'TX_SUBMITTED',
      actor: 'session:abc',
      walletId: '01936d3c-7f8a-7b00-9e4d-aaaaaa000001',
      sessionId: '01936d3c-7f8a-7b00-9e4d-aaaaaa000002',
      txId: '01936d3c-7f8a-7b00-9e4d-aaaaaa000003',
      details: { txHash: '0xabc', chain: 'evm', network: 'ethereum-mainnet' },
      severity: 'info',
      ipAddress: '127.0.0.1',
    };
    const result = AuditLogItemSchema.parse(input);
    expect(result.id).toBe(1);
    expect(result.eventType).toBe('TX_SUBMITTED');
    expect(result.details).toEqual({ txHash: '0xabc', chain: 'evm', network: 'ethereum-mainnet' });
  });

  // ---------- Test 6: AuditLogItemSchema with nullable fields ----------
  it('parses item with nullable fields (walletId, sessionId, txId, ipAddress as null)', () => {
    const input = {
      id: 2,
      timestamp: 1700000001,
      eventType: 'MASTER_AUTH_FAILED',
      actor: 'unknown',
      walletId: null,
      sessionId: null,
      txId: null,
      details: { reason: 'Invalid password', ip: '10.0.0.1' },
      severity: 'critical',
      ipAddress: null,
    };
    const result = AuditLogItemSchema.parse(input);
    expect(result.walletId).toBeNull();
    expect(result.sessionId).toBeNull();
    expect(result.txId).toBeNull();
    expect(result.ipAddress).toBeNull();
  });

  // ---------- Test 7: AuditLogResponseSchema parses full response ----------
  it('parses response with data array, nextCursor, hasMore, optional total', () => {
    const input = {
      data: [
        {
          id: 10,
          timestamp: 1700000010,
          eventType: 'WALLET_CREATED',
          actor: 'master',
          walletId: '01936d3c-7f8a-7b00-9e4d-aaaaaa000001',
          sessionId: null,
          txId: null,
          details: { chain: 'solana', environment: 'mainnet' },
          severity: 'info',
          ipAddress: null,
        },
      ],
      nextCursor: 9,
      hasMore: true,
      total: 100,
    };
    const result = AuditLogResponseSchema.parse(input);
    expect(result.data).toHaveLength(1);
    expect(result.nextCursor).toBe(9);
    expect(result.hasMore).toBe(true);
    expect(result.total).toBe(100);
  });

  // ---------- Test 7b: Response without total ----------
  it('parses response without total field', () => {
    const input = {
      data: [],
      nextCursor: null,
      hasMore: false,
    };
    const result = AuditLogResponseSchema.parse(input);
    expect(result.total).toBeUndefined();
  });

  // ---------- Test 8: AuditLogQuerySchema parses all filters ----------
  it('parses all 6 filters + cursor + limit + include_total', () => {
    const input = {
      wallet_id: '01936d3c-7f8a-7b00-9e4d-aaaaaa000001',
      event_type: 'KILL_SWITCH_ACTIVATED',
      severity: 'critical',
      from: '1700000000',
      to: '1700099999',
      tx_id: '01936d3c-7f8a-7b00-9e4d-aaaaaa000003',
      cursor: '100',
      limit: '20',
      include_total: 'true',
    };
    const result = AuditLogQuerySchema.parse(input);
    expect(result.wallet_id).toBe('01936d3c-7f8a-7b00-9e4d-aaaaaa000001');
    expect(result.event_type).toBe('KILL_SWITCH_ACTIVATED');
    expect(result.severity).toBe('critical');
    expect(result.from).toBe(1700000000);
    expect(result.to).toBe(1700099999);
    expect(result.tx_id).toBe('01936d3c-7f8a-7b00-9e4d-aaaaaa000003');
    expect(result.cursor).toBe(100);
    expect(result.limit).toBe(20);
    expect(result.include_total).toBe(true);
  });

  // ---------- Test 9: AuditLogQuerySchema defaults ----------
  it('applies default limit=50 and include_total=false', () => {
    const result = AuditLogQuerySchema.parse({});
    expect(result.limit).toBe(50);
    expect(result.include_total).toBe(false);
  });

  // ---------- Test 10: AuditLogQuerySchema enforces limit max 200 ----------
  it('enforces limit max 200', () => {
    expect(() => AuditLogQuerySchema.parse({ limit: '201' })).toThrow();
    expect(() => AuditLogQuerySchema.parse({ limit: '0' })).toThrow();
    const result = AuditLogQuerySchema.parse({ limit: '200' });
    expect(result.limit).toBe(200);
  });
});
