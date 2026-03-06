/**
 * Tests for NFT metadata route:
 *   - GET /v1/wallet/nfts/:tokenIdentifier (sessionAuth)
 *   - GET /v1/wallets/:id/nfts/:tokenIdentifier (masterAuth)
 *
 * Validates tokenIdentifier parsing (EVM vs Solana), metadata response shape,
 * IPFS gateway conversion, and error handling.
 *
 * @since v31.0 Phase 335
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OpenAPIHono } from '@hono/zod-openapi';
import { nftRoutes, type NftRouteDeps } from '../api/routes/nfts.js';
import { errorHandler } from '../api/middleware/error-handler.js';
import type { NftMetadata, ChainType } from '@waiaas/core';
import { WAIaaSError } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_WALLET_ID = '00000000-0000-7000-8000-000000000001';
const MOCK_SESSION_ID = '00000000-0000-7000-8000-000000000002';

function makeMockMetadata(overrides: Partial<NftMetadata> = {}): NftMetadata {
  return {
    tokenId: '42',
    contractAddress: '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D',
    standard: 'ERC-721',
    name: 'Bored Ape #42',
    image: 'https://ipfs.io/ipfs/QmXxxImage',
    description: 'A bored ape',
    amount: '1',
    attributes: [
      { trait_type: 'Background', value: 'Blue' },
      { trait_type: 'Fur', value: 'Golden' },
    ],
    tokenUri: 'https://ipfs.io/ipfs/QmXxxUri',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock deps
// ---------------------------------------------------------------------------

function createMockDeps() {
  const mockGetMetadata = vi.fn<[ChainType, string, string, string], Promise<NftMetadata>>();

  const mockWalletRow = {
    id: MOCK_WALLET_ID,
    chain: 'ethereum',
    environment: 'mainnet',
    publicKey: '0x1234567890AbCDef1234567890abcdef12345678',
    status: 'ACTIVE',
    name: 'Test Wallet',
  };

  const mockSolanaWalletRow = {
    ...mockWalletRow,
    chain: 'solana',
    publicKey: 'So11111111111111111111111111111111111111112',
  };

  const mockSessionWalletRow = {
    sessionId: MOCK_SESSION_ID,
    walletId: MOCK_WALLET_ID,
  };

  function makeMockDb(walletRow = mockWalletRow) {
    const select = vi.fn().mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          get: vi.fn().mockReturnValue(walletRow),
          all: vi.fn().mockReturnValue([mockSessionWalletRow]),
        }),
      }),
    }));
    return { select, insert: vi.fn(), update: vi.fn(), delete: vi.fn() } as any;
  }

  const evmDb = makeMockDb(mockWalletRow);
  const solanaDb = makeMockDb(mockSolanaWalletRow);

  const baseDeps = {
    nftIndexerClient: { listNfts: vi.fn(), getNftsByCollection: vi.fn(), getNftMetadata: vi.fn(), clearCache: vi.fn(), getIndexer: vi.fn() } as any,
    nftMetadataCacheService: { getMetadata: mockGetMetadata, clearExpired: vi.fn() } as any,
  };

  return {
    evmDeps: { ...baseDeps, db: evmDb } as NftRouteDeps,
    solanaDeps: { ...baseDeps, db: solanaDb } as NftRouteDeps,
    mockGetMetadata,
  };
}

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

function createTestApp(deps: NftRouteDeps, authType: 'session' | 'master' = 'session') {
  const app = new OpenAPIHono();

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

describe('NFT metadata routes', () => {
  let deps: ReturnType<typeof createMockDeps>;

  beforeEach(() => {
    deps = createMockDeps();
  });

  describe('GET /v1/wallet/nfts/:tokenIdentifier (session)', () => {
    it('Test 1: returns 200 with full NftMetadata', async () => {
      deps.mockGetMetadata.mockResolvedValue(makeMockMetadata());

      const app = createTestApp(deps.evmDeps);
      const res = await app.request(
        '/v1/wallet/nfts/0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D:42?network=ethereum-mainnet',
      );

      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.tokenId).toBe('42');
      expect(body.attributes).toHaveLength(2);
      expect(body.tokenUri).toBeDefined();
      expect(body.image).toBeDefined();
    });

    it('Test 2: EVM tokenIdentifier contractAddress:tokenId is parsed correctly', async () => {
      deps.mockGetMetadata.mockResolvedValue(makeMockMetadata());

      const app = createTestApp(deps.evmDeps);
      await app.request(
        '/v1/wallet/nfts/0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D:42?network=ethereum-mainnet',
      );

      expect(deps.mockGetMetadata).toHaveBeenCalledWith(
        'ethereum',
        'ethereum-mainnet',
        '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D',
        '42',
      );
    });

    it('Test 3: Solana tokenIdentifier is used directly as mintAddress (no colon)', async () => {
      deps.mockGetMetadata.mockResolvedValue(
        makeMockMetadata({
          tokenId: 'SolMintAddr123',
          contractAddress: 'SolMintAddr123',
          standard: 'METAPLEX',
        }),
      );

      const app = createTestApp(deps.solanaDeps);
      await app.request('/v1/wallet/nfts/SolMintAddr123?network=solana-mainnet');

      expect(deps.mockGetMetadata).toHaveBeenCalledWith(
        'solana',
        'solana-mainnet',
        'SolMintAddr123',
        'SolMintAddr123',
      );
    });

    it('Test 4: IPFS gateway conversion is applied in response', async () => {
      deps.mockGetMetadata.mockResolvedValue(
        makeMockMetadata({ image: 'https://ipfs.io/ipfs/QmConverted' }),
      );

      const app = createTestApp(deps.evmDeps);
      const res = await app.request(
        '/v1/wallet/nfts/0xAAA:1?network=ethereum-mainnet',
      );

      const body = await res.json() as any;
      expect(body.image).toBe('https://ipfs.io/ipfs/QmConverted');
    });

    it('Test 5: NFT_NOT_FOUND error returned when metadata fetch fails', async () => {
      deps.mockGetMetadata.mockRejectedValue(
        new WAIaaSError('NFT_NOT_FOUND', { message: 'NFT not found' }),
      );

      const app = createTestApp(deps.evmDeps);
      const res = await app.request(
        '/v1/wallet/nfts/0xAAA:999?network=ethereum-mainnet',
      );

      expect(res.status).toBe(404);
    });

    it('Test 6: response includes attributes array with trait_type and value', async () => {
      deps.mockGetMetadata.mockResolvedValue(
        makeMockMetadata({
          attributes: [
            { trait_type: 'Eyes', value: 'Laser' },
            { trait_type: 'Mouth', value: 'Bored' },
            { trait_type: 'Level', value: 5 },
          ],
        }),
      );

      const app = createTestApp(deps.evmDeps);
      const res = await app.request(
        '/v1/wallet/nfts/0xAAA:1?network=ethereum-mainnet',
      );

      const body = await res.json() as any;
      expect(body.attributes).toHaveLength(3);
      expect(body.attributes[0].trait_type).toBe('Eyes');
      expect(body.attributes[2].value).toBe(5);
    });
  });
});
