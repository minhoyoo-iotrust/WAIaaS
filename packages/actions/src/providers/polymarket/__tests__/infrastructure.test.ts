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
    getApiKeyByWalletId: vi.fn().mockReturnValue(null),
    insertApiKey: vi.fn(),
    deleteApiKeyByWalletId: vi.fn(),
  };
}

function createMockOrderDb() {
  return {
    insertOrder: vi.fn(),
    updateOrderStatus: vi.fn(),
    updateOrderStatusByOrderId: vi.fn(),
  };
}

function createMockPositionDb() {
  return {
    getPositions: vi.fn().mockReturnValue([]),
    getPosition: vi.fn().mockReturnValue(null),
    upsert: vi.fn(),
    updateResolution: vi.fn(),
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
