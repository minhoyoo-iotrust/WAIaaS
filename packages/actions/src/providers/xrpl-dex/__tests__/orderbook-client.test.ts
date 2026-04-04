/**
 * Tests for XrplOrderbookClient.
 * Mocks xrpl.Client.request() to test all RPC wrapper methods.
 *
 * @see Phase 02-01 Task 3
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock xrpl module before importing the client
vi.mock('xrpl', () => {
  const mockRequest = vi.fn();
  const MockClient = vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn().mockReturnValue(true),
    request: mockRequest,
  }));
  return { Client: MockClient, __mockRequest: mockRequest };
});

import { XrplOrderbookClient } from '../orderbook-client.js';

// Get the mock request function
async function getMockRequest() {
  const xrpl = await import('xrpl');
  return (xrpl as unknown as { __mockRequest: ReturnType<typeof vi.fn> }).__mockRequest;
}

describe('XrplOrderbookClient', () => {
  let client: XrplOrderbookClient;
  let mockRequest: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    client = new XrplOrderbookClient('wss://test.xrpl.org');
    mockRequest = await getMockRequest();
  });

  // -------------------------------------------------------------------------
  // Connection lifecycle
  // -------------------------------------------------------------------------

  describe('connection', () => {
    it('lazy connects on first query', async () => {
      mockRequest.mockResolvedValueOnce({
        result: { offers: [] },
      }).mockResolvedValueOnce({
        result: { offers: [] },
      });

      await client.getOrderbook({ currency: 'XRP' }, { currency: 'USD', issuer: 'rIssuer' }, 10);
      // Should have connected and made requests
      expect(mockRequest).toHaveBeenCalledTimes(2);
    });

    it('disconnect cleans up', async () => {
      // First connect
      mockRequest.mockResolvedValue({ result: { offers: [] } });
      await client.getOrderbook({ currency: 'XRP' }, { currency: 'USD', issuer: 'rIssuer' }, 10);

      await client.disconnect();
      // Should throw after disconnect
      expect(() => client.getClient()).toThrow('not connected');
    });
  });

  // -------------------------------------------------------------------------
  // getOrderbook
  // -------------------------------------------------------------------------

  describe('getOrderbook', () => {
    it('queries both sides (asks + bids)', async () => {
      // Asks: selling XRP for USD
      mockRequest.mockResolvedValueOnce({
        result: {
          offers: [
            {
              TakerGets: '10000000', // 10 XRP
              TakerPays: { currency: 'USD', issuer: 'rIssuer', value: '5' },
              owner_funds: '50000000',
              Sequence: 100,
            },
          ],
        },
      });
      // Bids: selling USD for XRP
      mockRequest.mockResolvedValueOnce({
        result: {
          offers: [
            {
              TakerGets: { currency: 'USD', issuer: 'rIssuer', value: '4.8' },
              TakerPays: '10000000', // 10 XRP
              owner_funds: '100',
              Sequence: 200,
            },
          ],
        },
      });

      const result = await client.getOrderbook(
        { currency: 'XRP' },
        { currency: 'USD', issuer: 'rIssuer' },
        10,
      );

      expect(result.asks).toHaveLength(1);
      expect(result.asks[0]!.price).toBeCloseTo(0.5, 5); // 5 USD / 10 XRP
      expect(result.asks[0]!.amount).toBe(10); // 10 XRP
      expect(result.asks[0]!.total).toBe(5); // 5 USD
      expect(result.asks[0]!.ownerFunds).toBe('50000000');
      expect(result.asks[0]!.sequence).toBe(100);

      expect(result.bids).toHaveLength(1);
      expect(result.bids[0]!.price).toBeCloseTo(0.48, 5); // 4.8 USD / 10 XRP
      expect(result.bids[0]!.amount).toBe(10); // 10 XRP
      expect(result.bids[0]!.sequence).toBe(200);

      // Spread = best ask - best bid
      expect(result.spread).toBeCloseTo(0.02, 5);
    });

    it('returns NaN spread when one side is empty', async () => {
      mockRequest.mockResolvedValueOnce({ result: { offers: [] } });
      mockRequest.mockResolvedValueOnce({ result: { offers: [] } });

      const result = await client.getOrderbook(
        { currency: 'XRP' },
        { currency: 'USD', issuer: 'rIssuer' },
        10,
      );

      expect(result.asks).toHaveLength(0);
      expect(result.bids).toHaveLength(0);
      expect(isNaN(result.spread)).toBe(true);
    });

    it('handles IOU-IOU pair', async () => {
      mockRequest.mockResolvedValueOnce({
        result: {
          offers: [
            {
              TakerGets: { currency: 'EUR', issuer: 'rIssuerA', value: '100' },
              TakerPays: { currency: 'USD', issuer: 'rIssuerB', value: '110' },
              owner_funds: '500',
              Sequence: 300,
            },
          ],
        },
      });
      mockRequest.mockResolvedValueOnce({ result: { offers: [] } });

      const result = await client.getOrderbook(
        { currency: 'EUR', issuer: 'rIssuerA' },
        { currency: 'USD', issuer: 'rIssuerB' },
        5,
      );

      expect(result.asks).toHaveLength(1);
      expect(result.asks[0]!.price).toBeCloseTo(1.1, 5); // 110 USD / 100 EUR
      expect(result.asks[0]!.amount).toBe(100);
    });
  });

  // -------------------------------------------------------------------------
  // getAccountOffers
  // -------------------------------------------------------------------------

  describe('getAccountOffers', () => {
    it('returns normalized offer list', async () => {
      mockRequest.mockResolvedValueOnce({
        result: {
          offers: [
            {
              seq: 12345,
              taker_gets: '5000000',
              taker_pays: { currency: 'USD', issuer: 'rIssuer', value: '2.5' },
              flags: 0,
            },
            {
              seq: 12346,
              taker_gets: { currency: 'USD', issuer: 'rIssuer', value: '10' },
              taker_pays: '20000000',
              flags: 0x00020000,
              expiration: 828662400,
            },
          ],
        },
      });

      const offers = await client.getAccountOffers('rMyAddress', 50);

      expect(offers).toHaveLength(2);
      expect(offers[0]).toEqual({
        seq: 12345,
        takerGets: '5000000 drops',
        takerPays: '2.5 USD',
        flags: 0,
        expiration: undefined,
      });
      expect(offers[1]).toEqual({
        seq: 12346,
        takerGets: '10 USD',
        takerPays: '20000000 drops',
        flags: 0x00020000,
        expiration: 828662400,
      });
    });

    it('returns empty array when no offers', async () => {
      mockRequest.mockResolvedValueOnce({ result: { offers: [] } });
      const offers = await client.getAccountOffers('rMyAddress', 50);
      expect(offers).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // checkTrustLine
  // -------------------------------------------------------------------------

  describe('checkTrustLine', () => {
    it('returns true when trust line exists', async () => {
      mockRequest.mockResolvedValueOnce({
        result: {
          lines: [
            { currency: 'USD', account: 'rIssuer', balance: '100', limit: '1000000000000000' },
          ],
        },
      });

      const result = await client.checkTrustLine('rMyAddress', 'USD', 'rIssuer');
      expect(result).toBe(true);
    });

    it('returns false when trust line does not exist', async () => {
      mockRequest.mockResolvedValueOnce({
        result: {
          lines: [
            { currency: 'EUR', account: 'rIssuer', balance: '50', limit: '1000000000000000' },
          ],
        },
      });

      const result = await client.checkTrustLine('rMyAddress', 'USD', 'rIssuer');
      expect(result).toBe(false);
    });

    it('returns false when no lines at all', async () => {
      mockRequest.mockResolvedValueOnce({ result: { lines: [] } });
      const result = await client.checkTrustLine('rMyAddress', 'USD', 'rIssuer');
      expect(result).toBe(false);
    });

    it('returns false on account not found error', async () => {
      mockRequest.mockRejectedValueOnce(new Error('actNotFound'));
      const result = await client.checkTrustLine('rUnknown', 'USD', 'rIssuer');
      expect(result).toBe(false);
    });

    it('matches currency case-insensitively', async () => {
      mockRequest.mockResolvedValueOnce({
        result: {
          lines: [
            { currency: 'usd', account: 'rIssuer', balance: '0', limit: '1000' },
          ],
        },
      });

      const result = await client.checkTrustLine('rMyAddress', 'USD', 'rIssuer');
      expect(result).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // getAccountReserve
  // -------------------------------------------------------------------------

  describe('getAccountReserve', () => {
    it('calculates available balance correctly', async () => {
      mockRequest.mockResolvedValueOnce({
        result: {
          account_data: {
            Balance: '50000000', // 50 XRP
            OwnerCount: 5,
          },
        },
      });

      const reserve = await client.getAccountReserve('rMyAddress');

      expect(reserve.balance).toBe('50000000');
      expect(reserve.ownerCount).toBe(5);
      expect(reserve.baseReserve).toBe(1_000_000);
      expect(reserve.ownerReserve).toBe(200_000);
      // Available: 50000000 - 1000000 - (5 * 200000) = 50000000 - 2000000 = 48000000
      expect(reserve.availableBalance).toBe('48000000');
    });

    it('returns 0 available when balance < reserves', async () => {
      mockRequest.mockResolvedValueOnce({
        result: {
          account_data: {
            Balance: '1500000', // 1.5 XRP
            OwnerCount: 10,
          },
        },
      });

      const reserve = await client.getAccountReserve('rMyAddress');
      expect(reserve.availableBalance).toBe('0');
    });

    it('handles zero owner count', async () => {
      mockRequest.mockResolvedValueOnce({
        result: {
          account_data: {
            Balance: '10000000', // 10 XRP
            OwnerCount: 0,
          },
        },
      });

      const reserve = await client.getAccountReserve('rMyAddress');
      // Available: 10000000 - 1000000 = 9000000
      expect(reserve.availableBalance).toBe('9000000');
    });
  });

  // -------------------------------------------------------------------------
  // ensureConnected — concurrent connect guard
  // -------------------------------------------------------------------------

  describe('ensureConnected concurrent guard', () => {
    it('deduplicates concurrent connect calls', async () => {
      const xrpl = await import('xrpl');
      const MockClient = xrpl.Client as unknown as ReturnType<typeof vi.fn>;

      // Create a client that is initially not connected
      let connectResolve: () => void;
      const connectPromise = new Promise<void>((resolve) => {
        connectResolve = resolve;
      });

      MockClient.mockImplementation(() => ({
        connect: vi.fn().mockReturnValue(connectPromise),
        disconnect: vi.fn().mockResolvedValue(undefined),
        isConnected: vi.fn().mockReturnValue(false),
        request: vi.fn(),
      }));

      const freshClient = new XrplOrderbookClient('wss://test.example.com');

      // Fire two concurrent ensureConnected calls
      const p1 = freshClient.ensureConnected();
      const p2 = freshClient.ensureConnected();

      // Resolve the connect
      connectResolve!();
      await p1;
      await p2;

      // Both should have resolved without creating two clients
      expect(MockClient).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // disconnect — error handling
  // -------------------------------------------------------------------------

  describe('disconnect error handling', () => {
    it('ignores disconnect errors gracefully', async () => {
      const xrpl = await import('xrpl');
      const MockClient = xrpl.Client as unknown as ReturnType<typeof vi.fn>;

      MockClient.mockImplementation(() => ({
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockRejectedValue(new Error('WebSocket already closed')),
        isConnected: vi.fn().mockReturnValue(false),
        request: vi.fn(),
      }));

      const freshClient = new XrplOrderbookClient('wss://test.example.com');
      await freshClient.ensureConnected();

      // Should not throw despite disconnect error
      await expect(freshClient.disconnect()).resolves.toBeUndefined();
    });
  });
});
