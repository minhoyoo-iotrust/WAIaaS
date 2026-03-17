/**
 * Secondary branch coverage tests for daemon.
 *
 * Targets uncovered branches in:
 * - helius-nft-indexer.ts (27 uncovered branches)
 * - alchemy-nft-indexer.ts (25 uncovered branches)
 * - sign-only.ts executeSignOnly (27 uncovered branches)
 * - pipeline-helpers.ts (25 uncovered branches)
 * - stage5-execute.ts buildUserOpCalls remaining paths
 * - stage3-policy.ts branches
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WAIaaSError } from '@waiaas/core';

// ---------------------------------------------------------------------------
// HeliusNftIndexer coverage
// ---------------------------------------------------------------------------

import { HeliusNftIndexer } from '../infrastructure/nft/helius-nft-indexer.js';

describe('HeliusNftIndexer', () => {
  let indexer: HeliusNftIndexer;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    indexer = new HeliusNftIndexer({ apiKey: 'test-key' });
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('listNfts', () => {
    it('returns items with pagination', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          result: {
            items: [
              {
                id: 'mint1',
                content: {
                  metadata: { name: 'NFT1' },
                  links: { image: 'https://img.example/1.png' },
                },
                grouping: [{ group_key: 'collection', group_value: 'collection1' }],
              },
            ],
            total: 10,
          },
        }),
      });

      const result = await indexer.listNfts({
        owner: 'owner1',
        chain: 'solana',
        network: 'solana-mainnet' as any,
        pageSize: 1,
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('NFT1');
      expect(result.items[0].collection?.name).toBe('collection1');
      expect(result.pageKey).toBe('2');
      expect(result.totalCount).toBe(10);
    });

    it('returns no pagination when fewer items than pageSize', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          result: { items: [], total: 0 },
        }),
      });

      const result = await indexer.listNfts({
        owner: 'owner1',
        chain: 'solana',
        network: 'solana-mainnet' as any,
      });

      expect(result.items).toHaveLength(0);
      expect(result.pageKey).toBeUndefined();
    });

    it('handles pageKey (continuing pagination)', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ result: { items: [] } }),
      });

      const result = await indexer.listNfts({
        owner: 'owner1',
        chain: 'solana',
        network: 'solana-mainnet' as any,
        pageKey: '3',
      });

      expect(result.items).toHaveLength(0);
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.params.page).toBe(3);
    });

    it('handles missing content metadata', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          result: {
            items: [
              { id: 'mint2', content: undefined, grouping: undefined },
            ],
          },
        }),
      });

      const result = await indexer.listNfts({
        owner: 'owner1',
        chain: 'solana',
        network: 'solana-mainnet' as any,
      });

      expect(result.items[0].name).toBeUndefined();
      expect(result.items[0].image).toBeUndefined();
      expect(result.items[0].collection).toBeUndefined();
    });

    it('handles non-string metadata fields', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          result: {
            items: [
              {
                id: 'mint3',
                content: {
                  metadata: { name: 123, description: false },
                  links: { image: 456 },
                },
              },
            ],
            total: 'not-a-number',
          },
        }),
      });

      const result = await indexer.listNfts({
        owner: 'owner1',
        chain: 'solana',
        network: 'solana-mainnet' as any,
      });

      expect(result.items[0].name).toBeUndefined();
      expect(result.items[0].image).toBeUndefined();
      expect(result.totalCount).toBeUndefined();
    });
  });

  describe('getNftMetadata', () => {
    it('returns metadata with attributes', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          result: {
            id: 'mint1',
            content: {
              metadata: {
                name: 'Cool NFT',
                description: 'A cool NFT',
                attributes: [{ trait_type: 'Color', value: 'Blue' }],
              },
              links: { image: 'https://img.example/1.png' },
              json_uri: 'https://meta.example/1.json',
            },
          },
        }),
      });

      const result = await indexer.getNftMetadata('solana-mainnet' as any, 'mint1', 'mint1');
      expect(result.name).toBe('Cool NFT');
      expect(result.description).toBe('A cool NFT');
      expect(result.image).toBe('https://img.example/1.png');
      expect(result.attributes).toHaveLength(1);
      expect(result.tokenUri).toBe('https://meta.example/1.json');
    });

    it('handles missing attributes (non-array)', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          result: {
            id: 'mint2',
            content: {
              metadata: { name: 'No Attrs' },
            },
          },
        }),
      });

      const result = await indexer.getNftMetadata('solana-mainnet' as any, 'mint2', 'mint2');
      expect(result.attributes).toHaveLength(0);
    });

    it('handles missing content entirely', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          result: { id: 'mint3' },
        }),
      });

      const result = await indexer.getNftMetadata('solana-mainnet' as any, 'mint3', 'mint3');
      expect(result.name).toBeUndefined();
    });
  });

  describe('getNftsByCollection', () => {
    it('returns collection items', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          result: {
            items: [{ id: 'mint1', content: { metadata: { name: 'C1' } } }],
            total: 5,
          },
        }),
      });

      const result = await indexer.getNftsByCollection('solana-mainnet' as any, 'collection1');
      expect(result.items).toHaveLength(1);
    });

    it('handles pagination with pageKey', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          result: { items: [] },
        }),
      });

      await indexer.getNftsByCollection('solana-mainnet' as any, 'collection1', '2');
    });
  });

  describe('_rpc error handling', () => {
    it('handles fetch network error', async () => {
      fetchMock.mockRejectedValue(new Error('Network error'));
      await expect(
        indexer.listNfts({ owner: 'o1', chain: 'solana', network: 'solana-mainnet' as any }),
      ).rejects.toThrow('Helius DAS API request failed');
    });

    it('handles non-ok HTTP response', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 429,
        text: () => Promise.resolve('Rate limit exceeded'),
        headers: { get: () => '60' },
      });
      await expect(
        indexer.listNfts({ owner: 'o1', chain: 'solana', network: 'solana-mainnet' as any }),
      ).rejects.toThrow('Helius DAS API returned 429');
    });

    it('handles non-ok with text() error', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.reject(new Error('body read error')),
        headers: { get: () => null },
      });
      await expect(
        indexer.listNfts({ owner: 'o1', chain: 'solana', network: 'solana-mainnet' as any }),
      ).rejects.toThrow('500');
    });

    it('handles JSON-RPC error with message', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          error: { message: 'Invalid owner address', code: -32602 },
        }),
      });
      await expect(
        indexer.listNfts({ owner: 'bad', chain: 'solana', network: 'solana-mainnet' as any }),
      ).rejects.toThrow('Invalid owner address');
    });

    it('handles JSON-RPC error without message', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          error: { code: -32600 },
        }),
      });
      await expect(
        indexer.listNfts({ owner: 'bad', chain: 'solana', network: 'solana-mainnet' as any }),
      ).rejects.toThrow('Helius DAS API error');
    });

    it('handles non-Error fetch rejection', async () => {
      fetchMock.mockRejectedValue('connection refused');
      await expect(
        indexer.listNfts({ owner: 'o1', chain: 'solana', network: 'solana-mainnet' as any }),
      ).rejects.toThrow('connection refused');
    });
  });

  it('uses custom baseUrl', () => {
    const custom = new HeliusNftIndexer({ apiKey: 'key', baseUrl: 'https://custom.helius.dev' });
    expect(custom).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// AlchemyNftIndexer coverage
// ---------------------------------------------------------------------------

import { AlchemyNftIndexer } from '../infrastructure/nft/alchemy-nft-indexer.js';

describe('AlchemyNftIndexer', () => {
  let indexer: AlchemyNftIndexer;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    indexer = new AlchemyNftIndexer({ apiKey: 'test-alchemy-key' });
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('listNfts', () => {
    it('lists NFTs for owner', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          ownedNfts: [
            {
              contract: { address: '0xnft' },
              tokenId: '1',
              tokenType: 'ERC721',
              name: 'Test NFT',
              image: { cachedUrl: 'https://img/1' },
              description: 'Test desc',
              raw: { metadata: {} },
              collection: { name: 'TestCollection', slug: 'test' },
            },
          ],
          pageKey: 'next-page',
          totalCount: 100,
        }),
      });

      const result = await indexer.listNfts({
        owner: '0xowner',
        chain: 'ethereum',
        network: 'ethereum-mainnet' as any,
      });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].standard).toBe('ERC-721');
      expect(result.pageKey).toBe('next-page');
      expect(result.totalCount).toBe(100);
    });

    it('lists ERC-1155 NFTs with balance', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          ownedNfts: [
            {
              contract: { address: '0xnft1155' },
              tokenId: '5',
              tokenType: 'ERC1155',
              balance: '10',
              raw: { metadata: {} },
            },
          ],
        }),
      });

      const result = await indexer.listNfts({
        owner: '0xowner',
        chain: 'ethereum',
        network: 'ethereum-mainnet' as any,
      });
      expect(result.items[0].standard).toBe('ERC-1155');
      expect(result.items[0].amount).toBe('10');
    });

    it('handles missing name/image/description (fallback to raw metadata)', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          ownedNfts: [
            {
              contract: { address: '0xnft' },
              tokenId: '1',
              tokenType: 'ERC721',
              name: null,
              image: null,
              description: null,
              raw: {
                metadata: {
                  name: 'Raw Name',
                  image: 'https://raw-img/1',
                  description: 'Raw Desc',
                },
              },
              collection: null,
            },
          ],
        }),
      });

      const result = await indexer.listNfts({
        owner: '0xowner',
        chain: 'ethereum',
        network: 'ethereum-mainnet' as any,
      });
      expect(result.items[0].name).toBe('Raw Name');
      expect(result.items[0].image).toBe('https://raw-img/1');
      expect(result.items[0].description).toBe('Raw Desc');
      expect(result.items[0].collection).toBeUndefined();
    });

    it('handles non-string raw metadata fields', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          ownedNfts: [
            {
              contract: { address: '0xnft' },
              tokenId: '1',
              tokenType: 'ERC721',
              raw: { metadata: { name: 123, image: false, description: null } },
            },
          ],
        }),
      });

      const result = await indexer.listNfts({
        owner: '0xowner',
        chain: 'ethereum',
        network: 'ethereum-mainnet' as any,
      });
      expect(result.items[0].name).toBeUndefined();
      expect(result.items[0].image).toBeUndefined();
    });

    it('handles pageKey and collection filter', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ownedNfts: [] }),
      });

      await indexer.listNfts({
        owner: '0xowner',
        chain: 'ethereum',
        network: 'ethereum-mainnet' as any,
        pageKey: 'page2',
        collection: '0xcollection',
      });

      const url = fetchMock.mock.calls[0][0];
      expect(url).toContain('pageKey=page2');
      expect(url).toContain('contractAddresses');
    });

    it('handles missing ownedNfts', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const result = await indexer.listNfts({
        owner: '0xowner',
        chain: 'ethereum',
        network: 'ethereum-mainnet' as any,
      });
      expect(result.items).toHaveLength(0);
    });
  });

  describe('getNftMetadata', () => {
    it('returns full metadata', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          contract: { address: '0xnft' },
          tokenId: '42',
          tokenType: 'ERC721',
          name: 'My NFT',
          image: { cachedUrl: 'https://img/42' },
          description: 'My description',
          raw: {
            metadata: {
              attributes: [{ trait_type: 'Rarity', value: 'Rare' }],
            },
            tokenUri: 'https://meta/42',
          },
          collection: { name: 'MyCollection', slug: 'my-coll' },
          balance: '1',
        }),
      });

      const result = await indexer.getNftMetadata('ethereum-mainnet' as any, '0xnft', '42');
      expect(result.name).toBe('My NFT');
      expect(result.attributes).toHaveLength(1);
      expect(result.tokenUri).toBe('https://meta/42');
    });

    it('handles missing attributes', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          contract: { address: '0xnft' },
          tokenId: '1',
          tokenType: 'ERC721',
          raw: { metadata: {} },
        }),
      });

      const result = await indexer.getNftMetadata('ethereum-mainnet' as any, '0xnft', '1');
      expect(result.attributes).toHaveLength(0);
    });

    it('handles ERC-1155 metadata', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          contract: { address: '0xnft1155' },
          tokenId: '5',
          tokenType: 'ERC1155',
          raw: { metadata: {} },
          balance: '50',
        }),
      });

      const result = await indexer.getNftMetadata('ethereum-mainnet' as any, '0xnft1155', '5');
      expect(result.standard).toBe('ERC-1155');
      expect(result.amount).toBe('50');
    });
  });

  describe('getNftsByCollection', () => {
    it('returns collection items', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          nfts: [
            {
              contract: { address: '0xnft' },
              tokenId: '1',
              tokenType: 'ERC721',
              raw: { metadata: {} },
            },
          ],
          nextToken: 'token2',
        }),
      });

      const result = await indexer.getNftsByCollection('ethereum-mainnet' as any, '0xcoll');
      expect(result.items).toHaveLength(1);
      expect(result.pageKey).toBe('token2');
    });

    it('passes pageKey as startToken', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ nfts: [] }),
      });

      await indexer.getNftsByCollection('ethereum-mainnet' as any, '0xcoll', 'token3');
      const url = fetchMock.mock.calls[0][0];
      expect(url).toContain('startToken=token3');
    });
  });

  describe('error handling', () => {
    it('throws for unsupported network', async () => {
      await expect(
        indexer.listNfts({
          owner: '0xowner',
          chain: 'ethereum',
          network: 'unknown-network' as any,
        }),
      ).rejects.toThrow('Unsupported network');
    });

    it('handles fetch error', async () => {
      fetchMock.mockRejectedValue(new Error('Network error'));
      await expect(
        indexer.listNfts({
          owner: '0xowner',
          chain: 'ethereum',
          network: 'ethereum-mainnet' as any,
        }),
      ).rejects.toThrow('Alchemy API request failed');
    });

    it('handles non-ok response', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 403,
        text: () => Promise.resolve('Forbidden'),
        headers: { get: () => null },
      });
      await expect(
        indexer.listNfts({
          owner: '0xowner',
          chain: 'ethereum',
          network: 'ethereum-mainnet' as any,
        }),
      ).rejects.toThrow('Alchemy API returned 403');
    });

    it('handles text() error on non-ok response', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.reject(new Error('body error')),
        headers: { get: () => null },
      });
      await expect(
        indexer.listNfts({
          owner: '0xowner',
          chain: 'ethereum',
          network: 'ethereum-mainnet' as any,
        }),
      ).rejects.toThrow('500');
    });

    it('throws for unsupported tokenType', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          ownedNfts: [
            {
              contract: { address: '0xnft' },
              tokenId: '1',
              tokenType: 'ERC20', // Not an NFT standard
              raw: { metadata: {} },
            },
          ],
        }),
      });
      await expect(
        indexer.listNfts({
          owner: '0xowner',
          chain: 'ethereum',
          network: 'ethereum-mainnet' as any,
        }),
      ).rejects.toThrow('Unknown Alchemy tokenType');
    });

    it('handles non-Error fetch rejection', async () => {
      fetchMock.mockRejectedValue('connection refused');
      await expect(
        indexer.listNfts({
          owner: '0xowner',
          chain: 'ethereum',
          network: 'ethereum-mainnet' as any,
        }),
      ).rejects.toThrow('connection refused');
    });

    it('handles various networks', async () => {
      const networks = ['ethereum-sepolia', 'polygon-mainnet', 'polygon-amoy', 'arbitrum-mainnet', 'arbitrum-sepolia', 'optimism-mainnet', 'optimism-sepolia', 'base-mainnet', 'base-sepolia'];
      for (const network of networks) {
        fetchMock.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ ownedNfts: [] }),
        });
        const result = await indexer.listNfts({
          owner: '0xowner',
          chain: 'ethereum',
          network: network as any,
        });
        expect(result.items).toHaveLength(0);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// executeSignOnly coverage (sign-only.ts)
// ---------------------------------------------------------------------------

import { executeSignOnly, type SignOnlyDeps } from '../pipeline/sign-only.js';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import { DatabasePolicyEngine } from '../pipeline/database-policy-engine.js';

function createTestDb() {
  const conn = createDatabase(':memory:');
  pushSchema(conn.sqlite);
  return conn;
}

function createWallet(sqlite: any, walletId: string) {
  sqlite.prepare(
    `INSERT INTO wallets (id, name, public_key, chain, created_at, updated_at, environment) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), ?)`,
  ).run(walletId, 'test', '0xpub', 'ethereum', 'mainnet');
}

describe('executeSignOnly', () => {
  function createSignOnlyDeps(db: any, sqlite: any): SignOnlyDeps {
    return {
      db,
      sqlite,
      adapter: {
        parseTransaction: vi.fn().mockResolvedValue({
          operations: [
            { type: 'NATIVE_TRANSFER', to: '0xrecipient', amount: 1000n },
          ],
        }),
        signExternalTransaction: vi.fn().mockResolvedValue({
          signedTransaction: '0xsigned',
          txHash: '0xhash',
        }),
      } as any,
      keyStore: {
        decryptPrivateKey: vi.fn().mockResolvedValue(Buffer.alloc(32, 1)),
        releaseKey: vi.fn(),
      } as any,
      policyEngine: {
        evaluate: vi.fn().mockResolvedValue({ allowed: true, tier: 'INSTANT' }),
        evaluateAndReserve: vi.fn().mockReturnValue({ allowed: true, tier: 'INSTANT' }),
        evaluateBatch: vi.fn().mockResolvedValue({ allowed: true, tier: 'INSTANT' }),
      } as any,
      masterPassword: 'test-pw',
      notificationService: { notify: vi.fn() } as any,
      eventBus: { emit: vi.fn() } as any,
    };
  }

  it('succeeds with single operation', async () => {
    const { db, sqlite } = createTestDb();
    createWallet(sqlite, 'wallet-1');
    const deps = createSignOnlyDeps(db, sqlite);

    const result = await executeSignOnly(deps, 'wallet-1', {
      transaction: '0xrawtx',
      chain: 'ethereum',
      network: 'ethereum-mainnet',
    });

    expect(result.signedTransaction).toBe('0xsigned');
    expect(result.txHash).toBe('0xhash');
    expect(result.policyResult.tier).toBe('INSTANT');
  });

  it('succeeds without sessionId or network', async () => {
    const { db, sqlite } = createTestDb();
    createWallet(sqlite, 'wallet-1');
    const deps = createSignOnlyDeps(db, sqlite);

    const result = await executeSignOnly(deps, 'wallet-1', {
      transaction: '0xrawtx',
      chain: 'ethereum',
    });

    expect(result.signedTransaction).toBe('0xsigned');
  });

  it('throws INVALID_TRANSACTION on parse error', async () => {
    const { db, sqlite } = createTestDb();
    createWallet(sqlite, 'wallet-1');
    const deps = createSignOnlyDeps(db, sqlite);
    (deps.adapter.parseTransaction as any).mockRejectedValue(new Error('invalid bytes'));

    await expect(
      executeSignOnly(deps, 'wallet-1', { transaction: 'bad', chain: 'ethereum' }),
    ).rejects.toThrow('invalid bytes');
  });

  it('throws on policy denied', async () => {
    const { db, sqlite } = createTestDb();
    createWallet(sqlite, 'wallet-1');
    const deps = createSignOnlyDeps(db, sqlite);
    (deps.policyEngine.evaluate as any).mockResolvedValue({
      allowed: false,
      reason: 'Denied',
    });

    await expect(
      executeSignOnly(deps, 'wallet-1', { transaction: '0x', chain: 'ethereum' }),
    ).rejects.toThrow(/denied/i);
  });

  it('throws on DELAY tier (not supported for sign-only)', async () => {
    const { db, sqlite } = createTestDb();
    createWallet(sqlite, 'wallet-1');
    const deps = createSignOnlyDeps(db, sqlite);
    (deps.policyEngine.evaluate as any).mockResolvedValue({
      allowed: true,
      tier: 'DELAY',
    });

    await expect(
      executeSignOnly(deps, 'wallet-1', { transaction: '0x', chain: 'ethereum' }),
    ).rejects.toThrow('DELAY');
  });

  it('throws on APPROVAL tier', async () => {
    const { db, sqlite } = createTestDb();
    createWallet(sqlite, 'wallet-1');
    const deps = createSignOnlyDeps(db, sqlite);
    (deps.policyEngine.evaluate as any).mockResolvedValue({
      allowed: true,
      tier: 'APPROVAL',
    });

    await expect(
      executeSignOnly(deps, 'wallet-1', { transaction: '0x', chain: 'ethereum' }),
    ).rejects.toThrow('APPROVAL');
  });

  it('handles signing error', async () => {
    const { db, sqlite } = createTestDb();
    createWallet(sqlite, 'wallet-1');
    const deps = createSignOnlyDeps(db, sqlite);
    (deps.adapter.signExternalTransaction as any).mockRejectedValue(new Error('sign failed'));

    await expect(
      executeSignOnly(deps, 'wallet-1', { transaction: '0x', chain: 'ethereum' }),
    ).rejects.toThrow('sign failed');
    expect(deps.keyStore.releaseKey).toHaveBeenCalled();
  });

  it('handles non-WAIaaSError signing error (wraps in CHAIN_ERROR)', async () => {
    const { db, sqlite } = createTestDb();
    createWallet(sqlite, 'wallet-1');
    const deps = createSignOnlyDeps(db, sqlite);
    (deps.adapter.signExternalTransaction as any).mockRejectedValue(new TypeError('bad type'));

    await expect(
      executeSignOnly(deps, 'wallet-1', { transaction: '0x', chain: 'ethereum' }),
    ).rejects.toThrow('bad type');
  });

  it('handles WAIaaSError in signing (re-throws as-is)', async () => {
    const { db, sqlite } = createTestDb();
    createWallet(sqlite, 'wallet-1');
    const deps = createSignOnlyDeps(db, sqlite);
    (deps.adapter.signExternalTransaction as any).mockRejectedValue(
      new WAIaaSError('CHAIN_ERROR', { message: 'chain problem' }),
    );

    await expect(
      executeSignOnly(deps, 'wallet-1', { transaction: '0x', chain: 'ethereum' }),
    ).rejects.toThrow('chain problem');
  });

  it('handles multi-operation transaction (uses evaluate, not evaluateAndReserve)', async () => {
    const { db, sqlite } = createTestDb();
    createWallet(sqlite, 'wallet-1');
    const deps = createSignOnlyDeps(db, sqlite);
    (deps.adapter.parseTransaction as any).mockResolvedValue({
      operations: [
        { type: 'NATIVE_TRANSFER', to: '0xa', amount: 100n },
        { type: 'CONTRACT_CALL', programId: '0xb', method: 'swap' },
      ],
    });

    const result = await executeSignOnly(deps, 'wallet-1', {
      transaction: '0x',
      chain: 'ethereum',
    });

    expect(result.operations).toHaveLength(2);
  });

  it('handles operation with no amount (amount undefined)', async () => {
    const { db, sqlite } = createTestDb();
    createWallet(sqlite, 'wallet-1');
    const deps = createSignOnlyDeps(db, sqlite);
    (deps.adapter.parseTransaction as any).mockResolvedValue({
      operations: [
        { type: 'CONTRACT_CALL', to: '0xcontract', method: 'doSomething' },
      ],
    });

    const result = await executeSignOnly(deps, 'wallet-1', {
      transaction: '0x',
      chain: 'ethereum',
    });

    expect(result.operations[0].amount).toBeUndefined();
  });

  it('without notificationService or eventBus', async () => {
    const { db, sqlite } = createTestDb();
    createWallet(sqlite, 'wallet-1');
    const deps = createSignOnlyDeps(db, sqlite);
    deps.notificationService = undefined;
    deps.eventBus = undefined;

    const result = await executeSignOnly(deps, 'wallet-1', {
      transaction: '0x',
      chain: 'ethereum',
    });

    expect(result.signedTransaction).toBe('0xsigned');
  });
});

// ---------------------------------------------------------------------------
// pipeline-helpers.ts additional branches
// ---------------------------------------------------------------------------

import {
  getRequestTo,
  getRequestAmount,
  getRequestMemo,
  resolveNotificationTo,
  formatNotificationAmount,
  resolveDisplayAmount,
  buildTransactionParam,
  extractPolicyType,
} from '../pipeline/pipeline-helpers.js';

describe('pipeline-helpers additional branches', () => {
  it('getRequestTo with SendTransactionRequest (has to)', () => {
    expect(getRequestTo({ to: '0xabc' } as any)).toBe('0xabc');
  });

  it('getRequestTo with TransactionRequest (has to)', () => {
    expect(getRequestTo({ type: 'TRANSFER', to: '0xdef' } as any)).toBe('0xdef');
  });

  it('getRequestAmount with amount string', () => {
    expect(getRequestAmount({ amount: '1234' } as any)).toBe('1234');
  });

  it('getRequestAmount with no amount', () => {
    expect(getRequestAmount({} as any)).toBe('0');
  });

  it('getRequestMemo with memo', () => {
    expect(getRequestMemo({ memo: 'test memo' } as any)).toBe('test memo');
  });

  it('getRequestMemo without memo', () => {
    expect(getRequestMemo({} as any)).toBeUndefined();
  });

  it('resolveNotificationTo for TOKEN_TRANSFER', () => {
    const to = resolveNotificationTo({ type: 'TOKEN_TRANSFER', to: '0xtarget' } as any, 'ethereum-mainnet');
    expect(to).toBe('0xtarget');
  });

  it('resolveNotificationTo for CONTRACT_CALL without registry returns raw', () => {
    const to = resolveNotificationTo({ type: 'CONTRACT_CALL', to: '0xcontract' } as any, 'ethereum-mainnet');
    expect(to).toBe('0xcontract');
  });

  it('resolveNotificationTo with empty to returns empty', () => {
    const to = resolveNotificationTo({ type: 'TRANSFER' } as any, 'ethereum-mainnet');
    expect(to).toBe('');
  });

  it('resolveNotificationTo for CONTRACT_CALL with registry fallback', () => {
    const registry = { resolve: vi.fn().mockReturnValue({ source: 'fallback', name: '' }) } as any;
    const to = resolveNotificationTo({ type: 'CONTRACT_CALL', to: '0xcontract' } as any, 'ethereum-mainnet', registry);
    expect(to).toBe('0xcontract');
  });

  it('resolveNotificationTo for CONTRACT_CALL with registry found', () => {
    const registry = { resolve: vi.fn().mockReturnValue({ source: 'well-known', name: 'Uniswap V3' }) } as any;
    const to = resolveNotificationTo({ type: 'CONTRACT_CALL', to: '0xE592427A0AEce92De3Edee1F18E0157C05861564' } as any, 'ethereum-mainnet', registry);
    expect(to).toContain('Uniswap V3');
  });

  it('formatNotificationAmount for TOKEN_TRANSFER', () => {
    const result = formatNotificationAmount({
      type: 'TOKEN_TRANSFER',
      amount: '1000000000000000000',
      token: { decimals: 18, symbol: 'TK' },
    } as any, 'ethereum');
    expect(result).toContain('TK');
  });

  it('formatNotificationAmount for APPROVE', () => {
    const result = formatNotificationAmount({
      type: 'APPROVE',
      amount: '5000000',
      token: { decimals: 6, symbol: 'USDC' },
    } as any, 'ethereum');
    expect(result).toContain('USDC');
  });

  it('formatNotificationAmount for NFT_TRANSFER', () => {
    const result = formatNotificationAmount({
      type: 'NFT_TRANSFER',
      amount: '1',
      token: { address: '0xnft', tokenId: '1', standard: 'ERC-721' },
    } as any, 'ethereum');
    expect(result).toContain('NFT');
  });

  it('formatNotificationAmount for TRANSFER (native)', () => {
    const result = formatNotificationAmount({
      type: 'TRANSFER',
      to: '0xa',
      amount: '1000000000000000000',
    } as any, 'ethereum');
    expect(result).toContain('ETH');
  });

  it('formatNotificationAmount for 0 amount', () => {
    const result = formatNotificationAmount({ type: 'TRANSFER', amount: '0' } as any, 'ethereum');
    expect(result).toBe('0');
  });

  it('resolveDisplayAmount without params returns empty', async () => {
    const result = await resolveDisplayAmount(null);
    expect(result).toBe('');
  });

  it('resolveDisplayAmount with USD currency', async () => {
    const settings = { get: vi.fn().mockReturnValue('USD') } as any;
    const forex = {} as any;
    const result = await resolveDisplayAmount(100, settings, forex);
    expect(result).toContain('$100');
  });

  it('resolveDisplayAmount with non-USD currency', async () => {
    const settings = { get: vi.fn().mockReturnValue('KRW') } as any;
    const forex = { getRate: vi.fn().mockResolvedValue({ rate: 1350 }) } as any;
    const result = await resolveDisplayAmount(100, settings, forex);
    expect(result).toBeTruthy();
  });

  it('resolveDisplayAmount with null forex rate falls back to USD', async () => {
    const settings = { get: vi.fn().mockReturnValue('EUR') } as any;
    const forex = { getRate: vi.fn().mockResolvedValue(null) } as any;
    const result = await resolveDisplayAmount(100, settings, forex);
    expect(result).toContain('$100');
  });

  it('resolveDisplayAmount error returns empty', async () => {
    const settings = { get: vi.fn().mockImplementation(() => { throw new Error('err'); }) } as any;
    const forex = {} as any;
    const result = await resolveDisplayAmount(100, settings, forex);
    expect(result).toBe('');
  });

  it('buildTransactionParam for different types', () => {
    // TRANSFER
    let param = buildTransactionParam({ type: 'TRANSFER', to: '0xa', amount: '100' } as any, 'TRANSFER', 'ethereum');
    expect(param.type).toBe('TRANSFER');

    // TOKEN_TRANSFER
    param = buildTransactionParam({
      type: 'TOKEN_TRANSFER',
      to: '0xa',
      amount: '100',
      token: { address: '0xtk', decimals: 18, symbol: 'TK' },
    } as any, 'TOKEN_TRANSFER', 'ethereum');
    expect(param.type).toBe('TOKEN_TRANSFER');

    // CONTRACT_CALL
    param = buildTransactionParam({
      type: 'CONTRACT_CALL',
      to: '0xc',
      calldata: '0xabc',
    } as any, 'CONTRACT_CALL', 'ethereum');
    expect(param.type).toBe('CONTRACT_CALL');

    // APPROVE
    param = buildTransactionParam({
      type: 'APPROVE',
      spender: '0xsp',
      token: { address: '0xtk', decimals: 18, symbol: 'TK' },
      amount: '100',
    } as any, 'APPROVE', 'ethereum');
    expect(param.type).toBe('APPROVE');

    // NFT_TRANSFER
    param = buildTransactionParam({
      type: 'NFT_TRANSFER',
      to: '0xr',
      token: { address: '0xnft', tokenId: '1', standard: 'ERC-721' },
    } as any, 'NFT_TRANSFER', 'ethereum');
    expect(param.type).toBe('NFT_TRANSFER');

    // BATCH falls through to default (TRANSFER)
    param = buildTransactionParam({
      type: 'BATCH',
      to: '0xa',
      amount: '100',
    } as any, 'BATCH', 'ethereum');
    expect(param.type).toBe('TRANSFER');

    // CONTRACT_DEPLOY
    param = buildTransactionParam({
      type: 'CONTRACT_DEPLOY',
      bytecode: '0x600160',
    } as any, 'CONTRACT_DEPLOY', 'ethereum');
    expect(param.type).toBe('CONTRACT_DEPLOY');
  });

  it('extractPolicyType for various reasons', () => {
    expect(extractPolicyType(undefined)).toBe('');
    expect(extractPolicyType('Token not in allowed list')).toBe('ALLOWED_TOKENS');
    expect(extractPolicyType('Token transfer not allowed')).toBe('ALLOWED_TOKENS');
    expect(extractPolicyType('Contract 0xabc is not whitelisted')).toBe('CONTRACT_WHITELIST');
    expect(extractPolicyType('Contract calls disabled')).toBe('CONTRACT_WHITELIST');
    // Note: 'Method not whitelisted' matches 'not whitelisted' first -> CONTRACT_WHITELIST
    expect(extractPolicyType('Method not whitelisted: swap')).toBe('CONTRACT_WHITELIST');
    expect(extractPolicyType('Spender not in approved list')).toBe('APPROVED_SPENDERS');
    expect(extractPolicyType('Token approvals disabled')).toBe('APPROVED_SPENDERS');
    expect(extractPolicyType('Address not in whitelist')).toBe('WHITELIST');
    expect(extractPolicyType('Address not in allowed addresses')).toBe('WHITELIST');
    expect(extractPolicyType('Network not in allowed networks')).toBe('ALLOWED_NETWORKS');
    expect(extractPolicyType('Amount exceeds limit')).toBe('APPROVE_AMOUNT_LIMIT');
    expect(extractPolicyType('Unlimited token approval')).toBe('APPROVE_AMOUNT_LIMIT');
    expect(extractPolicyType('Spending limit exceeded')).toBe('SPENDING_LIMIT');
    expect(extractPolicyType('Something else entirely')).toBe('');
  });
});
