/**
 * Tests for NFT SDK methods: listNfts(), getNftMetadata(), transferNft().
 *
 * Verifies:
 * - Correct REST API endpoints called
 * - Query parameters and body constructed correctly
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

describe('WAIaaSClient NFT methods', () => {
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
  // listNfts()
  // -----------------------------------------------------------------------

  describe('listNfts()', () => {
    it('calls GET /v1/wallet/nfts with network param', async () => {
      const mockBody = { nfts: [], hasMore: false };
      fetchSpy.mockResolvedValue(mockResponse(mockBody));

      const result = await client.listNfts({ network: 'ethereum-mainnet' });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const url = fetchSpy.mock.calls[0]?.[0] as string;
      expect(url).toBe('http://localhost:3000/v1/wallet/nfts?network=ethereum-mainnet');
      expect(result.nfts).toEqual([]);
      expect(result.hasMore).toBe(false);
    });

    it('includes all optional params', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ nfts: [], hasMore: false }));

      await client.listNfts({
        network: 'polygon-mainnet',
        cursor: 'abc',
        limit: 10,
        groupBy: 'collection',
        walletId: 'w1',
      });

      const url = fetchSpy.mock.calls[0]?.[0] as string;
      expect(url).toContain('network=polygon-mainnet');
      expect(url).toContain('cursor=abc');
      expect(url).toContain('limit=10');
      expect(url).toContain('groupBy=collection');
      expect(url).toContain('walletId=w1');
    });

    it('returns NFT items with collection info', async () => {
      const mockBody = {
        nfts: [{
          tokenId: '42',
          contractAddress: '0xabc',
          standard: 'erc721',
          name: 'Cool NFT',
          image: 'https://ipfs.io/ipfs/Qm...',
          collection: { name: 'Cool Collection', address: '0xabc' },
        }],
        cursor: 'next-page',
        hasMore: true,
      };
      fetchSpy.mockResolvedValue(mockResponse(mockBody));

      const result = await client.listNfts({ network: 'ethereum-mainnet' });

      expect(result.nfts).toHaveLength(1);
      expect(result.nfts[0]!.name).toBe('Cool NFT');
      expect(result.cursor).toBe('next-page');
      expect(result.hasMore).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // getNftMetadata()
  // -----------------------------------------------------------------------

  describe('getNftMetadata()', () => {
    it('calls GET /v1/wallet/nfts/{tokenIdentifier} with network', async () => {
      const mockBody = { tokenId: '42', contractAddress: '0xabc', standard: 'erc721', name: 'Cool NFT' };
      fetchSpy.mockResolvedValue(mockResponse(mockBody));

      const result = await client.getNftMetadata('0xabc:42', { network: 'ethereum-mainnet' });

      const url = fetchSpy.mock.calls[0]?.[0] as string;
      expect(url).toContain('/v1/wallet/nfts/0xabc%3A42');
      expect(url).toContain('network=ethereum-mainnet');
      expect(result.name).toBe('Cool NFT');
    });

    it('passes walletId query param', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ tokenId: '1', contractAddress: '0x1', standard: 'erc721' }));

      await client.getNftMetadata('mint123', { network: 'solana-mainnet', walletId: 'w2' });

      const url = fetchSpy.mock.calls[0]?.[0] as string;
      expect(url).toContain('walletId=w2');
    });

    it('returns metadata with attributes', async () => {
      const mockBody = {
        tokenId: '42',
        contractAddress: '0xabc',
        standard: 'erc721',
        name: 'Cool NFT',
        attributes: [{ traitType: 'color', value: 'blue' }],
        metadata: { extra: 'data' },
      };
      fetchSpy.mockResolvedValue(mockResponse(mockBody));

      const result = await client.getNftMetadata('0xabc:42', { network: 'ethereum-mainnet' });

      expect(result.attributes).toHaveLength(1);
      expect(result.attributes![0]!.traitType).toBe('color');
    });
  });

  // -----------------------------------------------------------------------
  // transferNft()
  // -----------------------------------------------------------------------

  describe('transferNft()', () => {
    it('calls POST /v1/transactions/send with NFT_TRANSFER type', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ id: 'tx-1', status: 'PENDING' }));

      const result = await client.transferNft({
        to: '0xRecipient',
        token: { address: '0xContract', tokenId: '42', standard: 'erc721' },
        network: 'ethereum-mainnet',
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://localhost:3000/v1/transactions/send');
      const body = JSON.parse(opts.body as string) as Record<string, unknown>;
      expect(body.type).toBe('NFT_TRANSFER');
      expect(body.to).toBe('0xRecipient');
      expect(body.token).toEqual({ address: '0xContract', tokenId: '42', standard: 'erc721' });
      expect(body.network).toBe('ethereum-mainnet');
      expect(result.id).toBe('tx-1');
    });

    it('includes optional amount, walletId, and gasCondition', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ id: 'tx-2', status: 'PENDING' }));

      await client.transferNft({
        to: 'addr',
        token: { address: '0xC', tokenId: '5', standard: 'erc1155' },
        network: 'polygon-mainnet',
        amount: '3',
        walletId: 'w3',
        gasCondition: { maxGasPrice: '100000000' },
      });

      const [, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(opts.body as string) as Record<string, unknown>;
      expect(body.amount).toBe('3');
      expect(body.walletId).toBe('w3');
      expect(body.gasCondition).toEqual({ maxGasPrice: '100000000' });
    });
  });
});
