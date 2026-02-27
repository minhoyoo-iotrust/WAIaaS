/**
 * Tests for DeFi query methods: getPositions() and getHealthFactor().
 *
 * Verifies:
 * - Correct REST API endpoints called
 * - Query parameters passed correctly
 * - Response types match expected shape
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WAIaaSClient } from '../client.js';

function createMockJwt(sessionId: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sessionId, walletId: 'wallet-1' })).toString('base64url');
  const signature = 'mock-signature';
  return `${header}.${payload}.${signature}`;
}

function mockResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('WAIaaSClient DeFi methods', () => {
  const mockToken = createMockJwt('sess-001');
  let fetchSpy: ReturnType<typeof vi.fn>;
  let client: WAIaaSClient;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    client = new WAIaaSClient({
      baseUrl: 'http://localhost:3000',
      sessionToken: mockToken,
      retryOptions: { maxRetries: 0 },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // getPositions()
  // -----------------------------------------------------------------------

  describe('getPositions()', () => {
    it('calls GET /v1/wallet/positions', async () => {
      const mockBody = { walletId: 'w1', positions: [], totalValueUsd: null };
      fetchSpy.mockResolvedValue(mockResponse(mockBody));

      const result = await client.getPositions();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const url = fetchSpy.mock.calls[0]?.[0] as string;
      expect(url).toBe('http://localhost:3000/v1/wallet/positions');
      expect(result.walletId).toBe('w1');
      expect(result.positions).toEqual([]);
    });

    it('passes wallet_id query param when provided', async () => {
      const mockBody = { walletId: 'wlt-123', positions: [], totalValueUsd: null };
      fetchSpy.mockResolvedValue(mockResponse(mockBody));

      await client.getPositions({ walletId: 'wlt-123' });

      const url = fetchSpy.mock.calls[0]?.[0] as string;
      expect(url).toContain('wallet_id=wlt-123');
    });

    it('returns positions with USD amounts', async () => {
      const mockBody = {
        walletId: 'w1',
        positions: [
          { id: 'p1', category: 'LENDING', provider: 'aave_v3', chain: 'ethereum', amount: '1000', amountUsd: 2500 },
        ],
        totalValueUsd: 2500,
      };
      fetchSpy.mockResolvedValue(mockResponse(mockBody));

      const result = await client.getPositions();

      expect(result.positions).toHaveLength(1);
      expect(result.positions[0]?.amountUsd).toBe(2500);
      expect(result.totalValueUsd).toBe(2500);
    });
  });

  // -----------------------------------------------------------------------
  // getHealthFactor()
  // -----------------------------------------------------------------------

  describe('getHealthFactor()', () => {
    it('calls GET /v1/wallet/health-factor', async () => {
      const mockBody = {
        walletId: 'w1',
        factor: 2.5,
        totalCollateralUsd: 10000,
        totalDebtUsd: 4000,
        currentLtv: 0.4,
        status: 'safe',
      };
      fetchSpy.mockResolvedValue(mockResponse(mockBody));

      const result = await client.getHealthFactor();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const url = fetchSpy.mock.calls[0]?.[0] as string;
      expect(url).toBe('http://localhost:3000/v1/wallet/health-factor');
      expect(result.factor).toBe(2.5);
      expect(result.status).toBe('safe');
    });

    it('passes wallet_id and network query params', async () => {
      const mockBody = { walletId: 'w1', factor: 1.8, totalCollateralUsd: 5000, totalDebtUsd: 2777, currentLtv: 0.55, status: 'warning' };
      fetchSpy.mockResolvedValue(mockResponse(mockBody));

      await client.getHealthFactor({ walletId: 'wlt-456', network: 'ethereum-mainnet' });

      const url = fetchSpy.mock.calls[0]?.[0] as string;
      expect(url).toContain('wallet_id=wlt-456');
      expect(url).toContain('network=ethereum-mainnet');
    });
  });
});
