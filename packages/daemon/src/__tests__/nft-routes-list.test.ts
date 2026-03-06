/**
 * Tests for NFT list routes:
 *   - GET /v1/wallet/nfts (sessionAuth)
 *   - GET /v1/wallets/:id/nfts (masterAuth)
 *
 * Validates NFT listing with pagination, collection grouping,
 * and required network parameter.
 *
 * @since v31.0 Phase 335
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OpenAPIHono } from '@hono/zod-openapi';
import { nftRoutes, type NftRouteDeps } from '../api/routes/nfts.js';
import { errorHandler } from '../api/middleware/error-handler.js';
import type { NftListResult, NftItem, ChainType } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_WALLET_ID = '00000000-0000-7000-8000-000000000001';
const MOCK_SESSION_ID = '00000000-0000-7000-8000-000000000002';
const MOCK_PUBLIC_KEY = '0x1234567890AbCDef1234567890abcdef12345678';

function makeNftItem(overrides: Partial<NftItem> = {}): NftItem {
  return {
    tokenId: '42',
    contractAddress: '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D',
    standard: 'ERC-721',
    name: 'Bored Ape #42',
    image: 'https://ipfs.io/ipfs/QmXxx',
    description: 'A bored ape',
    amount: '1',
    collection: { name: 'Bored Ape Yacht Club', slug: 'bayc' },
    assetId: 'eip155:1/erc721:0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D-42',
    ...overrides,
  };
}

function makeNftListResult(items: NftItem[], pageKey?: string): NftListResult {
  return { items, pageKey, totalCount: items.length };
}

// ---------------------------------------------------------------------------
// Mock deps
// ---------------------------------------------------------------------------

function createMockDeps() {
  const mockListNfts = vi.fn<[ChainType, any], Promise<NftListResult>>();
  const mockGetNftsByCollection = vi.fn<[ChainType, string, string, string?], Promise<NftListResult>>();

  // Mock DB: select().from().where().get() chain
  const mockWalletRow = {
    id: MOCK_WALLET_ID,
    chain: 'ethereum',
    environment: 'mainnet',
    publicKey: MOCK_PUBLIC_KEY,
    status: 'ACTIVE',
    name: 'Test Wallet',
  };

  const mockSessionWalletRow = {
    sessionId: MOCK_SESSION_ID,
    walletId: MOCK_WALLET_ID,
  };

  // Build chainable mock DB
  const get = vi.fn();
  const all = vi.fn();
  const where = vi.fn().mockReturnValue({ get, all });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  const mockDb = { select, insert: vi.fn(), update: vi.fn(), delete: vi.fn() } as any;

  // Configure DB to return wallet and session_wallet data
  // This will be set per-test as needed
  function configureDbForSession() {
    // First call: resolveWalletId -> session_wallets lookup (auto-resolve single wallet)
    // Second call: wallet lookup from wallets table
    let callCount = 0;
    select.mockImplementation(() => {
      callCount++;
      return { from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({
        get: vi.fn().mockImplementation(() => {
          if (callCount <= 1) return mockSessionWalletRow;
          return mockWalletRow;
        }),
        all: vi.fn().mockReturnValue([mockSessionWalletRow]),
      })})};
    });
  }

  function configureDbForMaster() {
    select.mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          get: vi.fn().mockReturnValue(mockWalletRow),
          all: vi.fn().mockReturnValue([mockWalletRow]),
        }),
      }),
    }));
  }

  const deps: NftRouteDeps = {
    db: mockDb,
    nftIndexerClient: {
      listNfts: mockListNfts,
      getNftsByCollection: mockGetNftsByCollection,
      getNftMetadata: vi.fn(),
      clearCache: vi.fn(),
      getIndexer: vi.fn(),
    } as any,
  };

  return {
    deps,
    mockListNfts,
    mockGetNftsByCollection,
    configureDbForSession,
    configureDbForMaster,
  };
}

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

function createTestApp(deps: NftRouteDeps, authType: 'session' | 'master' = 'session') {
  const app = new OpenAPIHono();

  // Mock auth middleware that sets sessionId
  if (authType === 'session') {
    app.use('*', async (c, next) => {
      c.set('sessionId' as never, MOCK_SESSION_ID as never);
      await next();
    });
  }

  app.route('/v1', nftRoutes(deps));
  app.onError(errorHandler);
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NFT list routes', () => {
  let deps: ReturnType<typeof createMockDeps>;

  beforeEach(() => {
    deps = createMockDeps();
  });

  describe('GET /v1/wallet/nfts (sessionAuth)', () => {
    it('Test 1: returns 200 with NFT list containing all required fields', async () => {
      const items = [makeNftItem(), makeNftItem({ tokenId: '43', name: 'Bored Ape #43' })];
      deps.mockListNfts.mockResolvedValue(makeNftListResult(items));
      deps.configureDbForSession();

      const app = createTestApp(deps.deps);
      const res = await app.request('/v1/wallet/nfts?network=ethereum-mainnet');

      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.items).toHaveLength(2);

      const item = body.items[0];
      expect(item).toHaveProperty('tokenId');
      expect(item).toHaveProperty('contractAddress');
      expect(item).toHaveProperty('standard');
      expect(item).toHaveProperty('name');
      expect(item).toHaveProperty('image');
      expect(item).toHaveProperty('description');
      expect(item).toHaveProperty('amount');
      expect(item).toHaveProperty('collection');
      expect(item).toHaveProperty('assetId');
    });

    it('Test 2: returns 400 without network query parameter', async () => {
      deps.configureDbForSession();
      const app = createTestApp(deps.deps);
      const res = await app.request('/v1/wallet/nfts');

      expect(res.status).toBe(400);
    });

    it('Test 3: passes pageKey to indexer and returns next page cursor', async () => {
      deps.mockListNfts.mockResolvedValue(makeNftListResult([makeNftItem()], 'next-page-key'));
      deps.configureDbForSession();

      const app = createTestApp(deps.deps);
      const res = await app.request('/v1/wallet/nfts?network=ethereum-mainnet&pageKey=abc123');

      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.pageKey).toBe('next-page-key');

      // Verify pageKey was passed to indexer
      expect(deps.mockListNfts).toHaveBeenCalledWith(
        'ethereum',
        expect.objectContaining({ pageKey: 'abc123' }),
      );
    });

    it('Test 4: limits results to pageSize=10', async () => {
      deps.mockListNfts.mockResolvedValue(makeNftListResult([makeNftItem()]));
      deps.configureDbForSession();

      const app = createTestApp(deps.deps);
      await app.request('/v1/wallet/nfts?network=ethereum-mainnet&pageSize=10');

      expect(deps.mockListNfts).toHaveBeenCalledWith(
        'ethereum',
        expect.objectContaining({ pageSize: 10 }),
      );
    });

    it('Test 5: groupBy=collection returns items grouped by collection', async () => {
      const items = [
        makeNftItem({ tokenId: '1', contractAddress: '0xAAA', collection: { name: 'Collection A' } }),
        makeNftItem({ tokenId: '2', contractAddress: '0xAAA', collection: { name: 'Collection A' } }),
        makeNftItem({ tokenId: '3', contractAddress: '0xBBB', collection: { name: 'Collection B' } }),
      ];
      deps.mockListNfts.mockResolvedValue(makeNftListResult(items));
      deps.configureDbForSession();

      const app = createTestApp(deps.deps);
      const res = await app.request('/v1/wallet/nfts?network=ethereum-mainnet&groupBy=collection');

      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.collections).toHaveLength(2);
      expect(body.collections[0].collection.name).toBe('Collection A');
      expect(body.collections[0].nfts).toHaveLength(2);
      expect(body.collections[1].collection.name).toBe('Collection B');
      expect(body.collections[1].nfts).toHaveLength(1);
    });
  });

  describe('GET /v1/wallets/:id/nfts (masterAuth)', () => {
    it('Test 6: returns NFT list for specified wallet', async () => {
      const items = [makeNftItem()];
      deps.mockListNfts.mockResolvedValue(makeNftListResult(items));
      deps.configureDbForMaster();

      const app = createTestApp(deps.deps, 'master');
      const res = await app.request(`/v1/wallets/${MOCK_WALLET_ID}/nfts?network=ethereum-mainnet`);

      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.items).toHaveLength(1);
      expect(body.items[0].tokenId).toBe('42');
    });
  });

  describe('Error handling', () => {
    it('Test 7: INDEXER_NOT_CONFIGURED error surfaced as 400', async () => {
      const { WAIaaSError } = await import('@waiaas/core');
      deps.mockListNfts.mockRejectedValue(
        new WAIaaSError('INDEXER_NOT_CONFIGURED', {
          message: 'NFT indexer API key not configured',
        }),
      );
      deps.configureDbForSession();

      const app = createTestApp(deps.deps);
      const res = await app.request('/v1/wallet/nfts?network=ethereum-mainnet');

      // INDEXER_NOT_CONFIGURED has httpStatus 400
      expect(res.status).toBe(400);
    });
  });
});
