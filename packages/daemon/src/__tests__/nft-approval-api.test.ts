/**
 * NFT approval status query API tests.
 *
 * Tests the GET /wallet/nfts/:tokenIdentifier/approvals route.
 *
 * @see packages/daemon/src/api/routes/nfts.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { WAIaaSError } from '@waiaas/core';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import type { DatabaseConnection } from '../infrastructure/database/index.js';
import { wallets } from '../infrastructure/database/schema.js';
import { generateId } from '../infrastructure/database/id.js';

import { nftApprovalRoutes, type NftApprovalRouteDeps } from '../api/routes/nft-approvals.js';

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let conn: DatabaseConnection;
let walletId: string;
const WALLET_PK = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

async function insertTestWallet(chain = 'ethereum', environment = 'mainnet'): Promise<string> {
  const id = generateId();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  await conn.db.insert(wallets).values({
    id,
    name: 'test-wallet',
    chain,
    environment,
    publicKey: WALLET_PK,
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

function createMockAdapterPool(overrides: Record<string, any> = {}) {
  const mockAdapter = {
    getNftApprovalStatus: vi.fn().mockResolvedValue({
      tokenId: '42',
      contractAddress: '0xNftContract',
      standard: 'ERC-721',
      approvals: [
        { operator: '0xOperator', approved: true, type: 'single' },
      ],
    }),
    ...overrides,
  };
  return {
    resolve: vi.fn().mockResolvedValue(mockAdapter),
    _mockAdapter: mockAdapter,
  };
}

/** Create a test Hono app with WAIaaSError handler (mirrors daemon error middleware). */
function createTestApp(wId: string, deps: NftApprovalRouteDeps): Hono {
  const app = new Hono();
  app.onError((err, c) => {
    if (err instanceof WAIaaSError) {
      return c.json(
        { code: err.code, message: err.message, retryable: err.retryable },
        err.httpStatus as any,
      );
    }
    return c.json({ code: 'INTERNAL', message: err.message, retryable: false }, 500);
  });
  app.use('*', async (c, next) => {
    c.set('walletId' as any, wId);
    await next();
  });
  app.route('/', nftApprovalRoutes(deps));
  return app;
}

describe('NFT approval status query API', () => {
  beforeEach(async () => {
    conn = createDatabase(':memory:');
    pushSchema(conn.sqlite);
    walletId = await insertTestWallet();
  });

  afterEach(() => {
    conn.sqlite.close();
  });

  it('GET /wallet/nfts/:tokenIdentifier/approvals returns approval status', async () => {
    const pool = createMockAdapterPool();
    const deps: NftApprovalRouteDeps = {
      db: conn.db,
      adapterPool: pool as any,
    };

    const app = createTestApp(walletId, deps);

    const res = await app.request('/wallet/nfts/0xNftContract-42/approvals?network=ethereum-mainnet');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('tokenId');
    expect(body).toHaveProperty('contractAddress');
    expect(body).toHaveProperty('approvals');
    expect(Array.isArray(body.approvals)).toBe(true);
  });

  it('GET /wallet/nfts/:tokenIdentifier/approvals requires network param', async () => {
    const pool = createMockAdapterPool();
    const deps: NftApprovalRouteDeps = {
      db: conn.db,
      adapterPool: pool as any,
    };

    const app = createTestApp(walletId, deps);

    const res = await app.request('/wallet/nfts/0xNftContract-42/approvals');

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('NETWORK_REQUIRED');
  });

  it('GET /wallet/nfts/:tokenIdentifier/approvals with invalid identifier returns 400', async () => {
    const pool = createMockAdapterPool();
    const deps: NftApprovalRouteDeps = {
      db: conn.db,
      adapterPool: pool as any,
    };

    const app = createTestApp(walletId, deps);

    // Missing tokenId in identifier
    const res = await app.request('/wallet/nfts/invalidformat/approvals?network=ethereum-mainnet');

    // No dash in identifier -> parseTokenIdentifier returns null -> WAIaaSError INVALID_TOKEN_IDENTIFIER
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('INVALID_TOKEN_IDENTIFIER');
  });

  it('returns correct ERC-721 approval data', async () => {
    const pool = createMockAdapterPool();
    const deps: NftApprovalRouteDeps = {
      db: conn.db,
      adapterPool: pool as any,
    };

    const app = createTestApp(walletId, deps);

    const res = await app.request('/wallet/nfts/0xNftContract-42/approvals?network=ethereum-mainnet&operator=0xOperator');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tokenId).toBe('42');
    expect(body.contractAddress).toBe('0xNftContract');
    expect(body.approvals[0]).toMatchObject({
      operator: '0xOperator',
      approved: true,
      type: 'single',
    });
  });
});
