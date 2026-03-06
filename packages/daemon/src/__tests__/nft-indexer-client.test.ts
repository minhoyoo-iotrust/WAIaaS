/**
 * Unit tests for NftIndexerClient.
 *
 * Tests indexer resolution, retry logic, caching, and settings integration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NftIndexerClient } from '../infrastructure/nft/nft-indexer-client.js';
import { WAIaaSError } from '@waiaas/core';

// Mock settings service
const mockSettingsService = {
  get: vi.fn(),
  getAll: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
  getAllByCategory: vi.fn(),
};

// Mock fetch for underlying indexer calls
let mockFetch: ReturnType<typeof vi.fn>;

describe('NftIndexerClient', () => {
  let client: NftIndexerClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client = new NftIndexerClient({ settingsService: mockSettingsService as any });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getIndexer', () => {
    it('returns AlchemyNftIndexer for ethereum chain', async () => {
      mockSettingsService.get.mockImplementation((key: string) => {
        if (key === 'actions.alchemy_nft_api_key') return 'test-alchemy-key';
        return '';
      });

      const indexer = client.getIndexer('ethereum');
      expect(indexer.provider).toBe('alchemy');
      expect(indexer.supportedChains).toContain('ethereum');
    });

    it('returns HeliusNftIndexer for solana chain', async () => {
      mockSettingsService.get.mockImplementation((key: string) => {
        if (key === 'actions.helius_das_api_key') return 'test-helius-key';
        return '';
      });

      const indexer = client.getIndexer('solana');
      expect(indexer.provider).toBe('helius');
      expect(indexer.supportedChains).toContain('solana');
    });

    it('throws INDEXER_NOT_CONFIGURED when API key is empty', () => {
      mockSettingsService.get.mockReturnValue('');

      try {
        client.getIndexer('ethereum');
        expect.fail('should have thrown');
      } catch (error: unknown) {
        expect((error as { code: string }).code).toBe('INDEXER_NOT_CONFIGURED');
      }
    });

    it('throws INDEXER_NOT_CONFIGURED when Helius API key is empty', () => {
      mockSettingsService.get.mockReturnValue('');

      try {
        client.getIndexer('solana');
        expect.fail('should have thrown');
      } catch (error: unknown) {
        expect((error as { code: string }).code).toBe('INDEXER_NOT_CONFIGURED');
      }
    });
  });

  describe('retry', () => {
    it('retries on 429/500 with exponential backoff (max 3 retries)', async () => {
      mockSettingsService.get.mockImplementation((key: string) => {
        if (key === 'actions.alchemy_nft_api_key') return 'test-key';
        if (key === 'actions.nft_indexer_cache_ttl_sec') return '300';
        return '';
      });

      // First 2 calls fail with 429, third succeeds
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          text: async () => 'Too Many Requests',
          headers: new Map(),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: async () => 'Internal Server Error',
          headers: new Map(),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ownedNfts: [],
            totalCount: 0,
          }),
        });

      const result = await client.listNfts('ethereum', {
        owner: '0x1',
        network: 'ethereum-mainnet',
        pageSize: 50,
      });

      expect(result.items).toEqual([]);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('respects Retry-After header on 429 responses', async () => {
      mockSettingsService.get.mockImplementation((key: string) => {
        if (key === 'actions.alchemy_nft_api_key') return 'test-key';
        if (key === 'actions.nft_indexer_cache_ttl_sec') return '300';
        return '';
      });

      const headersMap = new Map([['Retry-After', '1']]);
      // 429 with Retry-After, then success
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          text: async () => 'Rate limited',
          headers: { get: (h: string) => headersMap.get(h) ?? null },
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ownedNfts: [], totalCount: 0 }),
        });

      const start = Date.now();
      await client.listNfts('ethereum', {
        owner: '0x1',
        network: 'ethereum-mainnet',
        pageSize: 50,
      });
      const elapsed = Date.now() - start;

      // Should have waited at least ~1000ms for Retry-After
      expect(elapsed).toBeGreaterThanOrEqual(800);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('cache', () => {
    it('caches listNfts results and returns cached on second call within TTL', async () => {
      mockSettingsService.get.mockImplementation((key: string) => {
        if (key === 'actions.alchemy_nft_api_key') return 'test-key';
        if (key === 'actions.nft_indexer_cache_ttl_sec') return '300';
        return '';
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          ownedNfts: [
            {
              contract: { address: '0xabc' },
              tokenId: '1',
              tokenType: 'ERC721',
              name: 'Test NFT',
              balance: '1',
              raw: { metadata: {} },
            },
          ],
          totalCount: 1,
        }),
      });

      const opts = { owner: '0x1', network: 'ethereum-mainnet' as const, pageSize: 50 };

      // First call: fetches from API
      const result1 = await client.listNfts('ethereum', opts);
      expect(result1.items).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second call: returns from cache
      const result2 = await client.listNfts('ethereum', opts);
      expect(result2.items).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledTimes(1); // No new fetch
    });

    it('cache expires after TTL and re-fetches', async () => {
      vi.useFakeTimers();

      mockSettingsService.get.mockImplementation((key: string) => {
        if (key === 'actions.alchemy_nft_api_key') return 'test-key';
        if (key === 'actions.nft_indexer_cache_ttl_sec') return '1'; // 1 second TTL
        return '';
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ownedNfts: [], totalCount: 0 }),
      });

      const opts = { owner: '0x1', network: 'ethereum-mainnet' as const, pageSize: 50 };

      // First call
      await client.listNfts('ethereum', opts);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Advance past TTL
      vi.advanceTimersByTime(2000);

      // Second call after TTL: should re-fetch
      await client.listNfts('ethereum', opts);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it('clearCache invalidates all cached entries', async () => {
      mockSettingsService.get.mockImplementation((key: string) => {
        if (key === 'actions.alchemy_nft_api_key') return 'test-key';
        if (key === 'actions.nft_indexer_cache_ttl_sec') return '300';
        return '';
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ownedNfts: [], totalCount: 0 }),
      });

      const opts = { owner: '0x1', network: 'ethereum-mainnet' as const, pageSize: 50 };

      await client.listNfts('ethereum', opts);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      client.clearCache();

      await client.listNfts('ethereum', opts);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('settings', () => {
    it('uses settings keys actions.alchemy_nft_api_key and actions.helius_das_api_key', () => {
      // Verify the client reads the correct settings keys
      mockSettingsService.get.mockReturnValue('some-key');

      client.getIndexer('ethereum');
      expect(mockSettingsService.get).toHaveBeenCalledWith('actions.alchemy_nft_api_key');

      mockSettingsService.get.mockClear();
      client.getIndexer('solana');
      expect(mockSettingsService.get).toHaveBeenCalledWith('actions.helius_das_api_key');
    });
  });
});
