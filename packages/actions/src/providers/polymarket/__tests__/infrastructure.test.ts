/**
 * Unit tests for Polymarket infrastructure factory.
 *
 * Covers createPolymarketInfrastructure with various configurations
 * (default config, custom config, with/without DB and notification).
 */
import { describe, it, expect, vi } from 'vitest';
import { createPolymarketInfrastructure } from '../infrastructure.js';
import type { PolymarketConfig, PolymarketDb } from '../infrastructure.js';

// ---------------------------------------------------------------------------
// Mock DB interfaces
// ---------------------------------------------------------------------------

function createMockApiKeyDb() {
  return {
    getApiKey: vi.fn().mockResolvedValue(null),
    setApiKey: vi.fn().mockResolvedValue(undefined),
    deleteApiKey: vi.fn().mockResolvedValue(undefined),
    getAllApiKeys: vi.fn().mockResolvedValue([]),
  };
}

function createMockOrderDb() {
  return {
    saveOrder: vi.fn().mockResolvedValue(undefined),
    getOrder: vi.fn().mockResolvedValue(null),
    getOrdersByWallet: vi.fn().mockResolvedValue([]),
    getActiveOrders: vi.fn().mockResolvedValue([]),
    updateOrderStatus: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockPositionDb() {
  return {
    savePosition: vi.fn().mockResolvedValue(undefined),
    getPosition: vi.fn().mockResolvedValue(null),
    getPositionsByWallet: vi.fn().mockResolvedValue([]),
    deletePosition: vi.fn().mockResolvedValue(undefined),
    getActivePositions: vi.fn().mockResolvedValue([]),
  };
}

const mockEncrypt = vi.fn().mockImplementation((s: string) => `enc:${s}`);
const mockDecrypt = vi.fn().mockImplementation((s: string) => s.replace('enc:', ''));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createPolymarketInfrastructure', () => {
  it('creates all infrastructure components with default config', () => {
    const config: PolymarketConfig = {};
    const db: PolymarketDb = {
      apiKeys: createMockApiKeyDb(),
      orders: createMockOrderDb(),
      positions: createMockPositionDb(),
    };

    const infra = createPolymarketInfrastructure(config, db, mockEncrypt, mockDecrypt);

    expect(infra.clobClient).toBeDefined();
    expect(infra.rateLimiter).toBeDefined();
    expect(infra.apiKeyService).toBeDefined();
    expect(infra.orderProvider).toBeDefined();
    expect(infra.orderbookService).toBeDefined();
    expect(infra.approveHelper).toBeDefined();
    expect(infra.ctfProvider).toBeDefined();
    expect(infra.gammaClient).toBeDefined();
    expect(infra.marketData).toBeDefined();
    expect(infra.pnlCalculator).toBeDefined();
  });

  it('creates with custom URLs and rate limit', () => {
    const config: PolymarketConfig = {
      clobApiUrl: 'https://custom-clob.example.com',
      gammaApiUrl: 'https://custom-gamma.example.com',
      rateLimit: { maxRequests: 20, windowMs: 2000 },
    };
    const db: PolymarketDb = {
      apiKeys: createMockApiKeyDb(),
      orders: null,
      positions: null,
    };

    const infra = createPolymarketInfrastructure(config, db, mockEncrypt, mockDecrypt);

    expect(infra.clobClient).toBeDefined();
    expect(infra.rateLimiter).toBeDefined();
    expect(infra.positionTracker).toBeNull();
    expect(infra.resolutionMonitor).toBeNull();
  });

  it('creates positionTracker when positions DB provided', () => {
    const db: PolymarketDb = {
      apiKeys: createMockApiKeyDb(),
      orders: createMockOrderDb(),
      positions: createMockPositionDb(),
    };

    const infra = createPolymarketInfrastructure({}, db, mockEncrypt, mockDecrypt);

    expect(infra.positionTracker).not.toBeNull();
    expect(infra.resolutionMonitor).not.toBeNull();
  });

  it('creates resolutionMonitor with notification callback', () => {
    const db: PolymarketDb = {
      apiKeys: createMockApiKeyDb(),
      orders: createMockOrderDb(),
      positions: createMockPositionDb(),
    };
    const emitNotification = vi.fn();

    const infra = createPolymarketInfrastructure({}, db, mockEncrypt, mockDecrypt, emitNotification);

    expect(infra.resolutionMonitor).not.toBeNull();
  });

  it('returns null for positionTracker and resolutionMonitor when no positions DB', () => {
    const db: PolymarketDb = {
      apiKeys: createMockApiKeyDb(),
      orders: createMockOrderDb(),
      positions: null,
    };

    const infra = createPolymarketInfrastructure({}, db, mockEncrypt, mockDecrypt);

    expect(infra.positionTracker).toBeNull();
    expect(infra.resolutionMonitor).toBeNull();
  });

  it('pnlCalculator is the PolymarketPnlCalculator class', () => {
    const db: PolymarketDb = {
      apiKeys: createMockApiKeyDb(),
      orders: null,
      positions: null,
    };

    const infra = createPolymarketInfrastructure({}, db, mockEncrypt, mockDecrypt);

    expect(infra.pnlCalculator).toBeDefined();
    expect(typeof infra.pnlCalculator.calculateUnrealized).toBe('function');
  });
});
