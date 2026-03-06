/**
 * Tests for NftMetadataCacheService:
 *   - DB caching with 24h TTL
 *   - IPFS/Arweave gateway URL conversion
 *   - Cache hit/miss/expired behavior
 *   - clearExpired cleanup
 *
 * @since v31.0 Phase 335
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NftMetadata, ChainType } from '@waiaas/core';
import { NftMetadataCacheService } from '../services/nft-metadata-cache.js';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

function makeMockMetadata(overrides: Partial<NftMetadata> = {}): NftMetadata {
  return {
    tokenId: '42',
    contractAddress: '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D',
    standard: 'ERC-721',
    name: 'Bored Ape #42',
    image: 'ipfs://QmXxxImage',
    description: 'A bored ape',
    amount: '1',
    attributes: [
      { trait_type: 'Background', value: 'Blue' },
      { trait_type: 'Fur', value: 'Golden' },
    ],
    tokenUri: 'ipfs://QmXxxUri',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock DB
// ---------------------------------------------------------------------------

function createMockDb() {
  const rows = new Map<string, Record<string, unknown>>();

  const get = vi.fn().mockImplementation(() => null);
  const all = vi.fn().mockImplementation(() => []);
  const run = vi.fn();
  const where = vi.fn().mockReturnValue({ get, all, run });
  const values = vi.fn().mockReturnValue({
    onConflictDoUpdate: vi.fn().mockReturnValue({ run }),
  });
  const set = vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ run }) });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  const insert = vi.fn().mockReturnValue({ values });
  const update = vi.fn().mockReturnValue({ set });
  const deleteFn = vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ run }) });

  return {
    db: { select, insert, update, delete: deleteFn } as any,
    mocks: { select, insert, update, delete: deleteFn, get, all, run, where, from, values, set },
  };
}

// ---------------------------------------------------------------------------
// Mock NftIndexerClient
// ---------------------------------------------------------------------------

function createMockIndexerClient() {
  const getNftMetadata = vi.fn<[ChainType, string, string, string], Promise<NftMetadata>>();
  return {
    client: { getNftMetadata, listNfts: vi.fn(), getNftsByCollection: vi.fn(), clearCache: vi.fn(), getIndexer: vi.fn() } as any,
    getNftMetadata,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NftMetadataCacheService', () => {
  let db: ReturnType<typeof createMockDb>;
  let indexer: ReturnType<typeof createMockIndexerClient>;
  let service: NftMetadataCacheService;

  beforeEach(() => {
    db = createMockDb();
    indexer = createMockIndexerClient();
    service = new NftMetadataCacheService({
      db: db.db,
      nftIndexerClient: indexer.client,
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-06T12:00:00Z'));
  });

  it('Test 1: returns cached metadata when cache entry exists and is not expired', async () => {
    const cached = makeMockMetadata({ image: 'https://ipfs.io/ipfs/QmXxxImage' });
    const now = Math.floor(Date.now() / 1000);
    db.mocks.get.mockReturnValue({
      metadataJson: JSON.stringify(cached),
      cachedAt: new Date(now * 1000),
      expiresAt: new Date((now + 3600) * 1000), // expires in 1h
    });

    const result = await service.getMetadata('ethereum', 'ethereum-mainnet', '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D', '42');

    expect(result.name).toBe('Bored Ape #42');
    expect(indexer.getNftMetadata).not.toHaveBeenCalled();
  });

  it('Test 2: calls indexer and stores result when cache miss', async () => {
    db.mocks.get.mockReturnValue(null); // cache miss
    indexer.getNftMetadata.mockResolvedValue(makeMockMetadata());

    const result = await service.getMetadata('ethereum', 'ethereum-mainnet', '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D', '42');

    expect(indexer.getNftMetadata).toHaveBeenCalledWith('ethereum', 'ethereum-mainnet', '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D', '42');
    expect(result.name).toBe('Bored Ape #42');
    // Verify upsert was called
    expect(db.mocks.insert).toHaveBeenCalled();
  });

  it('Test 3: calls indexer and updates cache when entry is expired', async () => {
    const now = Math.floor(Date.now() / 1000);
    db.mocks.get.mockReturnValue({
      metadataJson: JSON.stringify(makeMockMetadata({ name: 'OLD' })),
      cachedAt: new Date((now - 90000) * 1000),
      expiresAt: new Date((now - 3600) * 1000), // expired 1h ago
    });
    indexer.getNftMetadata.mockResolvedValue(makeMockMetadata({ name: 'NEW' }));

    const result = await service.getMetadata('ethereum', 'ethereum-mainnet', '0xAAA', '1');

    expect(indexer.getNftMetadata).toHaveBeenCalled();
    expect(result.name).toBe('NEW');
  });

  it('Test 4: IPFS URL ipfs://QmXxx is converted to https://ipfs.io/ipfs/QmXxx', async () => {
    db.mocks.get.mockReturnValue(null);
    indexer.getNftMetadata.mockResolvedValue(
      makeMockMetadata({ image: 'ipfs://QmAbcImage', tokenUri: 'ipfs://QmAbcUri' }),
    );

    const result = await service.getMetadata('ethereum', 'ethereum-mainnet', '0xAAA', '1');

    expect(result.image).toBe('https://ipfs.io/ipfs/QmAbcImage');
    expect(result.tokenUri).toBe('https://ipfs.io/ipfs/QmAbcUri');
  });

  it('Test 5: Arweave URL ar://xxx is converted to https://arweave.net/xxx', async () => {
    db.mocks.get.mockReturnValue(null);
    indexer.getNftMetadata.mockResolvedValue(
      makeMockMetadata({ image: 'ar://txid123', tokenUri: 'ar://txid456' }),
    );

    const result = await service.getMetadata('ethereum', 'ethereum-mainnet', '0xAAA', '1');

    expect(result.image).toBe('https://arweave.net/txid123');
    expect(result.tokenUri).toBe('https://arweave.net/txid456');
  });

  it('Test 6: attributes/traits array is preserved in cached metadata', async () => {
    db.mocks.get.mockReturnValue(null);
    const meta = makeMockMetadata({
      attributes: [
        { trait_type: 'Background', value: 'Blue' },
        { trait_type: 'Eyes', value: 'Laser' },
      ],
    });
    indexer.getNftMetadata.mockResolvedValue(meta);

    const result = await service.getMetadata('ethereum', 'ethereum-mainnet', '0xAAA', '1');

    expect(result.attributes).toHaveLength(2);
    expect(result.attributes[0]).toEqual({ trait_type: 'Background', value: 'Blue' });
    expect(result.attributes[1]).toEqual({ trait_type: 'Eyes', value: 'Laser' });
  });

  it('Test 7: clearExpired deletes entries where expiresAt < now', async () => {
    await service.clearExpired();

    expect(db.mocks.delete).toHaveBeenCalled();
  });
});
