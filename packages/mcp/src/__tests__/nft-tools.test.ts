/**
 * Tests for 3 NFT MCP tools: list_nfts, get_nft_metadata, transfer_nft.
 *
 * Verifies:
 * - Correct API endpoints called with correct parameters
 * - toToolResult applied to responses
 */

import { describe, it, expect, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient, ApiResult } from '../api-client.js';
import { registerListNfts } from '../tools/list-nfts.js';
import { registerGetNftMetadata } from '../tools/get-nft-metadata.js';
import { registerTransferNft } from '../tools/transfer-nft.js';

// --- Mock ApiClient factory ---
function createMockApiClient(responses: Map<string, ApiResult<unknown>>): ApiClient {
  const defaultOk: ApiResult<unknown> = { ok: true, data: { mock: true } };
  return {
    get: vi.fn(async (path: string) => responses.get(`GET:${path}`) ?? defaultOk),
    post: vi.fn(async (path: string, _body: unknown) => responses.get(`POST:${path}`) ?? defaultOk),
    put: vi.fn(async (path: string, _body: unknown) => responses.get(`PUT:${path}`) ?? defaultOk),
  } as unknown as ApiClient;
}

// --- Tool handler extraction helper ---
function getToolHandler(
  registerFn: (server: McpServer, apiClient: ApiClient) => void,
  apiClient: ApiClient,
): (args: Record<string, unknown>) => Promise<unknown> {
  let capturedHandler: ((args: Record<string, unknown>, extra: unknown) => Promise<unknown>) | undefined;
  const server = {
    tool: (...fnArgs: unknown[]) => {
      capturedHandler = fnArgs[fnArgs.length - 1] as typeof capturedHandler;
    },
  } as unknown as McpServer;

  registerFn(server, apiClient);
  if (!capturedHandler) throw new Error('Handler not captured');
  const handler = capturedHandler;
  return (args) => handler(args, {}) as Promise<unknown>;
}

// =========================================================================
// list_nfts
// =========================================================================

describe('list_nfts tool', () => {
  it('calls GET /v1/wallet/nfts with network param', async () => {
    const nftList = { nfts: [{ tokenId: '1', contractAddress: '0xabc', standard: 'erc721' }], hasMore: false };
    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/wallet/nfts?network=ethereum-mainnet', { ok: true, data: nftList }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerListNfts, apiClient);

    const result = await handler({ network: 'ethereum-mainnet' }) as { content: Array<{ text: string }> };

    expect(apiClient.get).toHaveBeenCalledWith('/v1/wallet/nfts?network=ethereum-mainnet');
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed['hasMore']).toBe(false);
  });

  it('includes optional params: cursor, limit, group_by, wallet_id', async () => {
    const apiClient = createMockApiClient(new Map());
    const handler = getToolHandler(registerListNfts, apiClient);

    await handler({ network: 'polygon-mainnet', cursor: 'abc', limit: 10, group_by: 'collection', wallet_id: 'w1' });

    expect(apiClient.get).toHaveBeenCalledWith(
      '/v1/wallet/nfts?network=polygon-mainnet&cursor=abc&limit=10&groupBy=collection&walletId=w1',
    );
  });
});

// =========================================================================
// get_nft_metadata
// =========================================================================

describe('get_nft_metadata tool', () => {
  it('calls GET /v1/wallet/nfts/{tokenIdentifier} with network', async () => {
    const metadata = { tokenId: '42', contractAddress: '0xabc', standard: 'erc721', name: 'Cool NFT' };
    const responses = new Map<string, ApiResult<unknown>>([
      ['GET:/v1/wallet/nfts/0xabc%3A42?network=ethereum-mainnet', { ok: true, data: metadata }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerGetNftMetadata, apiClient);

    const result = await handler({ token_identifier: '0xabc:42', network: 'ethereum-mainnet' }) as { content: Array<{ text: string }> };

    expect(apiClient.get).toHaveBeenCalledWith('/v1/wallet/nfts/0xabc%3A42?network=ethereum-mainnet');
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed['name']).toBe('Cool NFT');
  });

  it('includes wallet_id param when provided', async () => {
    const apiClient = createMockApiClient(new Map());
    const handler = getToolHandler(registerGetNftMetadata, apiClient);

    await handler({ token_identifier: 'mint123', network: 'solana-mainnet', wallet_id: 'w2' });

    expect(apiClient.get).toHaveBeenCalledWith('/v1/wallet/nfts/mint123?network=solana-mainnet&walletId=w2');
  });
});

// =========================================================================
// transfer_nft
// =========================================================================

describe('transfer_nft tool', () => {
  it('calls POST /v1/transactions/send with NFT_TRANSFER body', async () => {
    const txResult = { id: 'tx-nft-1', status: 'PENDING' };
    const responses = new Map<string, ApiResult<unknown>>([
      ['POST:/v1/transactions/send', { ok: true, data: txResult }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerTransferNft, apiClient);

    const result = await handler({
      to: '0xRecipient',
      token_address: '0xContract',
      token_id: '42',
      standard: 'erc721',
      network: 'ethereum-mainnet',
    }) as { content: Array<{ text: string }> };

    expect(apiClient.post).toHaveBeenCalledWith('/v1/transactions/send', {
      type: 'NFT_TRANSFER',
      to: '0xRecipient',
      token: { address: '0xContract', tokenId: '42', standard: 'erc721' },
      network: 'ethereum-mainnet',
    });
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed['id']).toBe('tx-nft-1');
  });

  it('includes optional amount and wallet_id', async () => {
    const apiClient = createMockApiClient(new Map());
    const handler = getToolHandler(registerTransferNft, apiClient);

    await handler({
      to: 'addr',
      token_address: '0xC',
      token_id: '5',
      standard: 'erc1155',
      network: 'polygon-mainnet',
      amount: '3',
      wallet_id: 'w3',
    });

    expect(apiClient.post).toHaveBeenCalledWith('/v1/transactions/send', {
      type: 'NFT_TRANSFER',
      to: 'addr',
      token: { address: '0xC', tokenId: '5', standard: 'erc1155' },
      network: 'polygon-mainnet',
      amount: '3',
      walletId: 'w3',
    });
  });
});
