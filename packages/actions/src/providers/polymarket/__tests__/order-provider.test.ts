/**
 * Tests for PolymarketOrderProvider: 5 CLOB trading actions.
 *
 * Plan 371-03 Task 2: OrderProvider tests.
 */
import { describe, it, expect, vi } from 'vitest';
import { isApiDirectResult } from '@waiaas/core';
import { PolymarketOrderProvider } from '../order-provider.js';
import type { NegRiskResolver, OrderDb } from '../order-provider.js';
import type { PolymarketClobClient } from '../clob-client.js';
import type { PolymarketApiKeyService } from '../api-key-service.js';
import type { ActionContext } from '@waiaas/core';
import type { Hex } from 'viem';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const WALLET_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Hex;
const PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as Hex;

const TEST_CONTEXT: ActionContext = {
  walletAddress: WALLET_ADDRESS,
  chain: 'ethereum',
  walletId: 'wallet-001',
  sessionId: 'session-001',
  privateKey: PRIVATE_KEY,
};

const API_CREDS = {
  apiKey: 'ak-1',
  secret: Buffer.from('test-hmac-secret-32b!').toString('base64'),
  passphrase: 'pp-1',
};

function createMockClobClient() {
  return {
    postOrder: vi.fn().mockResolvedValue({ orderID: 'clob-ord-123', success: true }),
    cancelOrder: vi.fn().mockResolvedValue(undefined),
    cancelAll: vi.fn().mockResolvedValue(undefined),
  } as unknown as PolymarketClobClient;
}

function createMockApiKeyService() {
  return {
    ensureApiKeys: vi.fn().mockResolvedValue(API_CREDS),
  } as unknown as PolymarketApiKeyService;
}

function createMockNegRiskResolver(isNeg = false): NegRiskResolver {
  return { isNegRisk: vi.fn().mockResolvedValue(isNeg) };
}

function createMockOrderDb(): OrderDb {
  return {
    insertOrder: vi.fn(),
    updateOrderStatus: vi.fn(),
    updateOrderStatusByOrderId: vi.fn(),
  };
}

function createProvider(overrides?: {
  clobClient?: PolymarketClobClient;
  apiKeyService?: PolymarketApiKeyService;
  negRiskResolver?: NegRiskResolver | null;
  db?: OrderDb | null;
}) {
  return new PolymarketOrderProvider(
    overrides?.clobClient ?? createMockClobClient(),
    overrides?.apiKeyService ?? createMockApiKeyService(),
    overrides?.negRiskResolver ?? createMockNegRiskResolver(),
    overrides?.db ?? createMockOrderDb(),
    () => 'test-uuid',
  );
}

// ---------------------------------------------------------------------------
// Metadata tests
// ---------------------------------------------------------------------------

describe('PolymarketOrderProvider metadata', () => {
  const provider = createProvider();

  it('has correct provider name', () => {
    expect(provider.metadata.name).toBe('polymarket_order');
  });

  it('has requiresSigningKey=true', () => {
    expect(provider.metadata.requiresSigningKey).toBe(true);
  });

  it('has mcpExpose=true', () => {
    expect(provider.metadata.mcpExpose).toBe(true);
  });

  it('has 5 actions', () => {
    expect(provider.actions).toHaveLength(5);
    const names = provider.actions.map((a) => a.name);
    expect(names).toContain('pm_buy');
    expect(names).toContain('pm_sell');
    expect(names).toContain('pm_cancel_order');
    expect(names).toContain('pm_cancel_all');
    expect(names).toContain('pm_update_order');
  });
});

// ---------------------------------------------------------------------------
// pm_buy tests
// ---------------------------------------------------------------------------

describe('PolymarketOrderProvider pm_buy', () => {
  it('creates signed order, submits to CLOB, returns ApiDirectResult', async () => {
    const clobClient = createMockClobClient();
    const apiKeyService = createMockApiKeyService();
    const db = createMockOrderDb();
    const provider = createProvider({ clobClient, apiKeyService, db });

    const result = await provider.resolve('pm_buy', {
      tokenId: '12345',
      price: '0.65',
      size: '100',
      orderType: 'GTC',
    }, TEST_CONTEXT);

    expect(isApiDirectResult(result)).toBe(true);
    expect(result.__apiDirect).toBe(true);
    expect(result.provider).toBe('polymarket_order');
    expect(result.action).toBe('pm_buy');
    expect(result.status).toBe('pending');
    expect(result.externalId).toBe('clob-ord-123');
    expect(result.metadata?.side).toBe('BUY');
    expect(result.metadata?.price).toBe('0.65');
    expect(result.metadata?.size).toBe('100');
  });

  it('calls ensureApiKeys before posting order', async () => {
    const apiKeyService = createMockApiKeyService();
    const provider = createProvider({ apiKeyService });

    await provider.resolve('pm_buy', {
      tokenId: '1',
      price: '0.5',
      size: '10',
    }, TEST_CONTEXT);

    expect(apiKeyService.ensureApiKeys).toHaveBeenCalledWith(
      'wallet-001',
      WALLET_ADDRESS,
      PRIVATE_KEY,
    );
  });

  it('checks neg_risk resolver', async () => {
    const negRiskResolver = createMockNegRiskResolver(true);
    const provider = createProvider({ negRiskResolver });

    await provider.resolve('pm_buy', {
      tokenId: '99999',
      price: '0.5',
      size: '10',
    }, TEST_CONTEXT);

    expect(negRiskResolver.isNegRisk).toHaveBeenCalledWith('99999');
  });

  it('persists order to DB', async () => {
    const db = createMockOrderDb();
    const provider = createProvider({ db });

    await provider.resolve('pm_buy', {
      tokenId: '12345',
      price: '0.65',
      size: '100',
    }, TEST_CONTEXT);

    expect(db.insertOrder).toHaveBeenCalledTimes(1);
    const insertedRow = (db.insertOrder as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(insertedRow.side).toBe('BUY');
    expect(insertedRow.price).toBe('0.65');
    expect(insertedRow.size).toBe('100');
    expect(insertedRow.status).toBe('PENDING');
    expect(insertedRow.order_id).toBe('clob-ord-123');
  });

  it('handles all order types (GTC/GTD/FOK/IOC)', async () => {
    const provider = createProvider();

    for (const orderType of ['GTC', 'GTD', 'FOK', 'IOC'] as const) {
      const result = await provider.resolve('pm_buy', {
        tokenId: '1',
        price: '0.5',
        size: '10',
        orderType,
        expiration: orderType === 'GTD' ? 1700000000 : undefined,
      }, TEST_CONTEXT);

      expect(result.__apiDirect).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// pm_sell tests
// ---------------------------------------------------------------------------

describe('PolymarketOrderProvider pm_sell', () => {
  it('creates sell order with side=SELL', async () => {
    const db = createMockOrderDb();
    const provider = createProvider({ db });

    const result = await provider.resolve('pm_sell', {
      tokenId: '12345',
      price: '0.65',
      size: '100',
    }, TEST_CONTEXT);

    expect(result.__apiDirect).toBe(true);
    expect(result.action).toBe('pm_sell');
    expect(result.metadata?.side).toBe('SELL');

    const insertedRow = (db.insertOrder as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(insertedRow.side).toBe('SELL');
  });
});

// ---------------------------------------------------------------------------
// pm_cancel_order tests
// ---------------------------------------------------------------------------

describe('PolymarketOrderProvider pm_cancel_order', () => {
  it('cancels order by ID', async () => {
    const clobClient = createMockClobClient();
    const db = createMockOrderDb();
    const provider = createProvider({ clobClient, db });

    const result = await provider.resolve('pm_cancel_order', {
      orderId: 'ord-abc',
    }, TEST_CONTEXT);

    expect(result.__apiDirect).toBe(true);
    expect(result.action).toBe('pm_cancel_order');
    expect(result.status).toBe('success');
    expect(clobClient.cancelOrder).toHaveBeenCalledTimes(1);
    expect(db.updateOrderStatusByOrderId).toHaveBeenCalledWith('ord-abc', 'CANCELLED', expect.any(Number));
  });
});

// ---------------------------------------------------------------------------
// pm_cancel_all tests
// ---------------------------------------------------------------------------

describe('PolymarketOrderProvider pm_cancel_all', () => {
  it('cancels all orders', async () => {
    const clobClient = createMockClobClient();
    const provider = createProvider({ clobClient });

    const result = await provider.resolve('pm_cancel_all', {}, TEST_CONTEXT);

    expect(result.__apiDirect).toBe(true);
    expect(result.action).toBe('pm_cancel_all');
    expect(clobClient.cancelAll).toHaveBeenCalledTimes(1);
  });

  it('cancels all orders for specific market', async () => {
    const clobClient = createMockClobClient();
    const provider = createProvider({ clobClient });

    await provider.resolve('pm_cancel_all', {
      conditionId: '0xcond123',
    }, TEST_CONTEXT);

    expect(clobClient.cancelAll).toHaveBeenCalledWith(
      expect.any(Object),
      '0xcond123',
    );
  });
});

// ---------------------------------------------------------------------------
// pm_update_order tests
// ---------------------------------------------------------------------------

describe('PolymarketOrderProvider pm_update_order', () => {
  it('cancels existing and returns update result', async () => {
    const clobClient = createMockClobClient();
    const provider = createProvider({ clobClient });

    const result = await provider.resolve('pm_update_order', {
      orderId: 'ord-to-update',
      price: '0.70',
      size: '200',
    }, TEST_CONTEXT);

    expect(result.__apiDirect).toBe(true);
    expect(result.action).toBe('pm_update_order');
    expect(clobClient.cancelOrder).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// getSpendingAmount tests
// ---------------------------------------------------------------------------

describe('PolymarketOrderProvider getSpendingAmount', () => {
  const provider = createProvider();

  it('pm_buy returns price * size in USDC.e 6d', async () => {
    const result = await provider.getSpendingAmount('pm_buy', {
      tokenId: '1',
      price: '0.65',
      size: '100',
    });
    expect(result.amount).toBe(65_000_000n);
    expect(result.asset).toMatch(/^0x/);
  });

  it('pm_sell returns 0', async () => {
    const result = await provider.getSpendingAmount('pm_sell', {
      tokenId: '1',
      price: '0.65',
      size: '100',
    });
    expect(result.amount).toBe(0n);
  });

  it('pm_cancel_order returns 0', async () => {
    const result = await provider.getSpendingAmount('pm_cancel_order', {
      orderId: 'abc',
    });
    expect(result.amount).toBe(0n);
  });

  it('pm_cancel_all returns 0', async () => {
    const result = await provider.getSpendingAmount('pm_cancel_all', {});
    expect(result.amount).toBe(0n);
  });
});
