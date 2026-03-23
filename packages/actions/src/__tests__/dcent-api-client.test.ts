/**
 * DCent Swap API client unit tests.
 * Covers all public methods and internal helpers (mapError, cache logic).
 * Uses msw to intercept HTTP calls, matching existing test patterns.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { DcentSwapApiClient } from '../providers/dcent-swap/dcent-api-client.js';
import { ChainError } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = 'https://agent-swap.dcentwallet.com';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const CURRENCIES_RESPONSE = [
  { currencyId: 'ETHEREUM', tokenDeviceId: 'ERC20', currencyName: 'Ethereum' },
  { currencyId: 'ERC20/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', tokenDeviceId: 'ERC20', currencyName: 'USDC' },
  { currencyId: 'SOLANA', tokenDeviceId: 'SOL', currencyName: 'Solana' },
];

const QUOTES_RESPONSE = {
  status: 'success',
  fromId: 'ETHEREUM',
  toId: 'ERC20/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  providers: {
    bestOrder: ['sushi_swap'],
    common: [
      {
        id: 'sushi_swap',
        status: 'success',
        providerId: 'sushi_swap',
        providerType: 'swap' as const,
        name: 'Sushi',
        fromAmount: '1000000000000000000',
        expectedAmount: '2049257221',
        spenderContractAddress: '0xAC4c6e212A361c968F1725b4d055b47E63F80b75',
      },
    ],
  },
};

const TX_DATA_RESPONSE = {
  status: 'success',
  txdata: {
    from: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    to: '0xAC4c6e212A361c968F1725b4d055b47E63F80b75',
    data: '0x5f3bd1c8abcdef',
    value: '1000000000000000000',
  },
  networkFee: { gas: '275841', gasPrice: '121236406' },
};


// ---------------------------------------------------------------------------
// MSW server
// ---------------------------------------------------------------------------

const server = setupServer(
  http.get(`${BASE_URL}/api/swap/v3/get_supported_currencies`, () => {
    return HttpResponse.json(CURRENCIES_RESPONSE);
  }),
  http.post(`${BASE_URL}/api/swap/v3/get_quotes`, () => {
    return HttpResponse.json(QUOTES_RESPONSE);
  }),
  http.post(`${BASE_URL}/api/swap/v3/get_dex_swap_transaction_data`, () => {
    return HttpResponse.json(TX_DATA_RESPONSE);
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function createClient(overrides: Record<string, unknown> = {}): DcentSwapApiClient {
  return new DcentSwapApiClient({ apiBaseUrl: BASE_URL, ...overrides });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DcentSwapApiClient', () => {
  // -----------------------------------------------------------------------
  // constructor
  // -----------------------------------------------------------------------
  describe('constructor', () => {
    it('creates instance with default config', () => {
      const client = new DcentSwapApiClient();
      expect(client).toBeInstanceOf(DcentSwapApiClient);
    });

    it('creates instance with partial config override', () => {
      const client = new DcentSwapApiClient({
        apiBaseUrl: 'https://custom.example.com',
        requestTimeoutMs: 5000,
      });
      expect(client).toBeInstanceOf(DcentSwapApiClient);
    });

    it('merges partial config with defaults', () => {
      const client = createClient({ currencyCacheTtlMs: 1000 });
      expect(client).toBeInstanceOf(DcentSwapApiClient);
    });
  });

  // -----------------------------------------------------------------------
  // init
  // -----------------------------------------------------------------------
  describe('init', () => {
    it('preloads currencies into cache', async () => {
      const client = createClient();
      await client.init();

      // After init, cache should be populated
      expect(client.isCurrencySupported('ETHEREUM')).toBe(true);
      expect(client.isCurrencySupported('SOLANA')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // getSupportedCurrencies
  // -----------------------------------------------------------------------
  describe('getSupportedCurrencies', () => {
    it('fetches currencies on cache miss (first call)', async () => {
      let fetchCount = 0;
      server.use(
        http.get(`${BASE_URL}/api/swap/v3/get_supported_currencies`, () => {
          fetchCount++;
          return HttpResponse.json(CURRENCIES_RESPONSE);
        }),
      );

      const client = createClient();
      const result = await client.getSupportedCurrencies();

      expect(result).toHaveLength(3);
      expect(result[0]!.currencyId).toBe('ETHEREUM');
      expect(fetchCount).toBe(1);
    });

    it('returns cached data on cache hit (no additional fetch)', async () => {
      let fetchCount = 0;
      server.use(
        http.get(`${BASE_URL}/api/swap/v3/get_supported_currencies`, () => {
          fetchCount++;
          return HttpResponse.json(CURRENCIES_RESPONSE);
        }),
      );

      const client = createClient();

      // First call: cache miss -> fetch
      await client.getSupportedCurrencies();
      expect(fetchCount).toBe(1);

      // Second call: cache hit -> no fetch
      const result2 = await client.getSupportedCurrencies();
      expect(fetchCount).toBe(1);
      expect(result2).toHaveLength(3);
    });

    it('returns stale data and triggers async refresh when cache expired', async () => {
      let fetchCount = 0;
      server.use(
        http.get(`${BASE_URL}/api/swap/v3/get_supported_currencies`, () => {
          fetchCount++;
          return HttpResponse.json(CURRENCIES_RESPONSE);
        }),
      );

      // Very short TTL to force expiration
      const client = createClient({ currencyCacheTtlMs: 1 });

      // First call: cache miss -> fetch
      await client.getSupportedCurrencies();
      expect(fetchCount).toBe(1);

      // Wait for cache to expire
      await new Promise((r) => setTimeout(r, 10));

      // Second call: cache stale -> returns stale data + async refresh
      const result = await client.getSupportedCurrencies();
      expect(result).toHaveLength(3);

      // Wait for async refresh to complete
      await new Promise((r) => setTimeout(r, 50));
      expect(fetchCount).toBe(2);
    });

    it('silently ignores async refresh failure when stale', async () => {
      let fetchCount = 0;
      server.use(
        http.get(`${BASE_URL}/api/swap/v3/get_supported_currencies`, () => {
          fetchCount++;
          if (fetchCount === 1) {
            return HttpResponse.json(CURRENCIES_RESPONSE);
          }
          // Second call fails
          return new HttpResponse(null, { status: 500 });
        }),
      );

      const client = createClient({ currencyCacheTtlMs: 1 });

      // First call: cache miss -> success
      await client.getSupportedCurrencies();

      // Wait for expiry
      await new Promise((r) => setTimeout(r, 10));

      // Second call: stale -> returns old data, async refresh fails silently
      const result = await client.getSupportedCurrencies();
      expect(result).toHaveLength(3);

      // Wait for async refresh to complete (and fail silently)
      await new Promise((r) => setTimeout(r, 50));
      expect(fetchCount).toBe(2);

      // Cache still has old data
      expect(client.isCurrencySupported('ETHEREUM')).toBe(true);
    });

    it('throws on cache miss when API returns error', async () => {
      server.use(
        http.get(`${BASE_URL}/api/swap/v3/get_supported_currencies`, () => {
          return new HttpResponse('Internal Server Error', { status: 500 });
        }),
      );

      const client = createClient();
      await expect(client.getSupportedCurrencies()).rejects.toThrow(ChainError);
    });
  });

  // -----------------------------------------------------------------------
  // getQuotes
  // -----------------------------------------------------------------------
  describe('getQuotes', () => {
    it('returns quotes on success', async () => {
      const client = createClient();
      const result = await client.getQuotes({
        fromId: 'ETHEREUM',
        toId: 'ERC20/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        amount: '1000000000000000000',
        fromDecimals: 18,
        toDecimals: 6,
      });

      expect(result.status).toBe('success');
      expect(result.providers?.common).toHaveLength(1);
      expect(result.providers?.common?.[0]?.providerId).toBe('sushi_swap');
    });

    it('throws ChainError on API failure', async () => {
      server.use(
        http.post(`${BASE_URL}/api/swap/v3/get_quotes`, () => {
          return new HttpResponse('Bad Request', { status: 400 });
        }),
      );

      const client = createClient();
      await expect(
        client.getQuotes({
          fromId: 'ETHEREUM',
          toId: 'INVALID',
          amount: '1',
          fromDecimals: 18,
          toDecimals: 6,
        }),
      ).rejects.toThrow(ChainError);
    });

    it('throws ChainError on rate limit (429)', async () => {
      server.use(
        http.post(`${BASE_URL}/api/swap/v3/get_quotes`, () => {
          return new HttpResponse('Rate limited', { status: 429 });
        }),
      );

      const client = createClient();
      await expect(
        client.getQuotes({
          fromId: 'ETHEREUM',
          toId: 'USDC',
          amount: '1',
          fromDecimals: 18,
          toDecimals: 6,
        }),
      ).rejects.toThrow(ChainError);
    });
  });

  // -----------------------------------------------------------------------
  // getDexSwapTransactionData
  // -----------------------------------------------------------------------
  describe('getDexSwapTransactionData', () => {
    it('returns transaction data on success', async () => {
      const client = createClient();
      const result = await client.getDexSwapTransactionData({
        fromId: 'ETHEREUM',
        toId: 'ERC20/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        fromAmount: '1000000000000000000',
        fromDecimals: 18,
        toDecimals: 6,
        fromWalletAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
        toWalletAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
        providerId: 'sushi_swap',
        isAutoSlippage: true,
        slippage: 1,
      });

      expect(result.status).toBe('success');
      expect(result.txdata?.to).toBe('0xAC4c6e212A361c968F1725b4d055b47E63F80b75');
      expect(result.txdata?.data).toBe('0x5f3bd1c8abcdef');
      expect(result.networkFee?.gas).toBe('275841');
    });

    it('throws ChainError on API failure', async () => {
      server.use(
        http.post(`${BASE_URL}/api/swap/v3/get_dex_swap_transaction_data`, () => {
          return new HttpResponse('Server Error', { status: 500 });
        }),
      );

      const client = createClient();
      await expect(
        client.getDexSwapTransactionData({
          fromId: 'ETHEREUM',
          toId: 'USDC',
          fromAmount: '1',
          fromDecimals: 18,
          toDecimals: 6,
          fromWalletAddress: '0xwallet',
          toWalletAddress: '0xwallet',
          providerId: 'sushi_swap',
          isAutoSlippage: true,
          slippage: 1,
        }),
      ).rejects.toThrow(ChainError);
    });
  });


  // -----------------------------------------------------------------------
  // isCurrencySupported
  // -----------------------------------------------------------------------
  describe('isCurrencySupported', () => {
    it('returns false when cache is empty', () => {
      const client = createClient();
      expect(client.isCurrencySupported('ETHEREUM')).toBe(false);
    });

    it('returns true for cached currency', async () => {
      const client = createClient();
      await client.init();
      expect(client.isCurrencySupported('ETHEREUM')).toBe(true);
      expect(client.isCurrencySupported('SOLANA')).toBe(true);
    });

    it('returns false for unknown currency', async () => {
      const client = createClient();
      await client.init();
      expect(client.isCurrencySupported('BITCOIN_CASH')).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // getCurrencyMap
  // -----------------------------------------------------------------------
  describe('getCurrencyMap', () => {
    it('returns empty map when cache is not loaded', () => {
      const client = createClient();
      const map = client.getCurrencyMap();
      expect(map.size).toBe(0);
    });

    it('returns populated map after init', async () => {
      const client = createClient();
      await client.init();
      const map = client.getCurrencyMap();
      expect(map.size).toBe(3);
      expect(map.get('ETHEREUM')?.currencyName).toBe('Ethereum');
      expect(map.get('SOLANA')?.currencyName).toBe('Solana');
    });

    it('returns readonly map (cannot modify)', async () => {
      const client = createClient();
      await client.init();
      const map = client.getCurrencyMap();
      // ReadonlyMap does not expose set/delete at the type level
      expect(typeof (map as Map<string, unknown>).get).toBe('function');
      expect(map.has('ETHEREUM')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // mapError (tested indirectly via API methods throwing)
  // -----------------------------------------------------------------------
  describe('mapError', () => {
    it('passes through ChainError unchanged', async () => {
      // Force the base class post to throw a ChainError (e.g. rate limit)
      server.use(
        http.post(`${BASE_URL}/api/swap/v3/get_quotes`, () => {
          return new HttpResponse('Rate limited', { status: 429 });
        }),
      );

      const client = createClient();
      try {
        await client.getQuotes({
          fromId: 'A',
          toId: 'B',
          amount: '1',
          fromDecimals: 18,
          toDecimals: 6,
        });
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ChainError);
        // ChainError from base class (ACTION_RATE_LIMITED) should pass through
        expect((err as ChainError).code).toBe('ACTION_RATE_LIMITED');
      }
    });

    it('wraps generic Error into ChainError with ACTION_API_ERROR', async () => {
      // Cause a Zod parse error by returning invalid data
      server.use(
        http.post(`${BASE_URL}/api/swap/v3/get_quotes`, () => {
          // Return data that does not match DcentQuotesResponseSchema
          // (missing required 'status' field -> Zod will throw ZodError)
          return HttpResponse.json({ invalid: true });
        }),
      );

      const client = createClient();
      try {
        await client.getQuotes({
          fromId: 'A',
          toId: 'B',
          amount: '1',
          fromDecimals: 18,
          toDecimals: 6,
        });
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ChainError);
        expect((err as ChainError).code).toBe('ACTION_API_ERROR');
        expect((err as ChainError).message).toContain('DCent API error');
      }
    });

    it('wraps unknown non-Error value into ChainError', async () => {
      // We need to trigger a throw of a non-Error value from within post().
      // The easiest way: mock the post method at the prototype level to throw a string.
      const client = createClient();
      const originalPost = Object.getPrototypeOf(Object.getPrototypeOf(client)).post;

      // Temporarily replace the base class post to throw a non-Error
      Object.getPrototypeOf(Object.getPrototypeOf(client)).post = async () => {
        throw 'some string error';
      };

      try {
        await client.getQuotes({
          fromId: 'A',
          toId: 'B',
          amount: '1',
          fromDecimals: 18,
          toDecimals: 6,
        });
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ChainError);
        expect((err as ChainError).code).toBe('ACTION_API_ERROR');
        expect((err as ChainError).message).toContain('DCent API unknown error');
        expect((err as ChainError).message).toContain('some string error');
      } finally {
        // Restore original post
        Object.getPrototypeOf(Object.getPrototypeOf(client)).post = originalPost;
      }
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------
  describe('edge cases', () => {
    it('handles empty currencies array', async () => {
      server.use(
        http.get(`${BASE_URL}/api/swap/v3/get_supported_currencies`, () => {
          return HttpResponse.json([]);
        }),
      );

      const client = createClient();
      const result = await client.getSupportedCurrencies();
      expect(result).toHaveLength(0);
      expect(client.getCurrencyMap().size).toBe(0);
    });

    it('cache refreshes correctly with updated data', async () => {
      let callCount = 0;
      server.use(
        http.get(`${BASE_URL}/api/swap/v3/get_supported_currencies`, () => {
          callCount++;
          if (callCount === 1) {
            return HttpResponse.json([
              { currencyId: 'ETHEREUM', tokenDeviceId: 'ERC20', currencyName: 'Ethereum' },
            ]);
          }
          return HttpResponse.json([
            { currencyId: 'ETHEREUM', tokenDeviceId: 'ERC20', currencyName: 'Ethereum' },
            { currencyId: 'BITCOIN', tokenDeviceId: 'BTC', currencyName: 'Bitcoin' },
          ]);
        }),
      );

      const client = createClient({ currencyCacheTtlMs: 1 });

      // First fetch: 1 currency
      const first = await client.getSupportedCurrencies();
      expect(first).toHaveLength(1);

      // Wait for cache to expire
      await new Promise((r) => setTimeout(r, 10));

      // Stale while revalidate: returns stale (1 currency)
      const stale = await client.getSupportedCurrencies();
      expect(stale).toHaveLength(1);

      // Wait for async refresh
      await new Promise((r) => setTimeout(r, 50));

      // Now cache should have 2 currencies, but within TTL
      expect(client.isCurrencySupported('BITCOIN')).toBe(true);
      expect(client.getCurrencyMap().size).toBe(2);
    });

    it('multiple concurrent init calls do not break cache', async () => {
      const client = createClient();
      // Fire multiple inits concurrently
      await Promise.all([client.init(), client.init(), client.init()]);
      expect(client.isCurrencySupported('ETHEREUM')).toBe(true);
      expect(client.getCurrencyMap().size).toBe(3);
    });
  });

  describe('debugDumpDir', () => {
    it('creates debug dumper when debugDumpDir is set', async () => {
      const { mkdtempSync, rmSync, existsSync, readdirSync } = await import('node:fs');
      const { tmpdir } = await import('node:os');
      const { join } = await import('node:path');
      const dir = mkdtempSync(join(tmpdir(), 'dcent-test-'));
      try {
        const client = new DcentSwapApiClient({ debugDumpDir: dir });
        // Client should be usable; dumper records internally
        await client.init();
        // Dump directory should exist and contain a session file
        expect(existsSync(dir)).toBe(true);
        const files = readdirSync(dir).filter((f: string) => f.endsWith('.json'));
        expect(files.length).toBeGreaterThanOrEqual(1);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('records getQuotes call to dump file', async () => {
      const { mkdtempSync, rmSync, readFileSync } = await import('node:fs');
      const { tmpdir } = await import('node:os');
      const { join } = await import('node:path');
      const dir = mkdtempSync(join(tmpdir(), 'dcent-dump-'));
      try {
        const client = new DcentSwapApiClient({ debugDumpDir: dir, apiBaseUrl: BASE_URL });
        await client.init();
        await client.getQuotes({ fromId: 'ETHEREUM', toId: 'ERC20/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', amount: '1000000000000000000', fromDecimals: 18, toDecimals: 6 });
        const dump = JSON.parse(readFileSync(client['dumper']!.filePath, 'utf-8'));
        expect(dump.calls.length).toBeGreaterThanOrEqual(2); // init + getQuotes
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('records getDexSwapTransactionData call to dump file', async () => {
      const { mkdtempSync, rmSync, readFileSync } = await import('node:fs');
      const { tmpdir } = await import('node:os');
      const { join } = await import('node:path');
      const dir = mkdtempSync(join(tmpdir(), 'dcent-dump-'));
      try {
        const client = new DcentSwapApiClient({ debugDumpDir: dir, apiBaseUrl: BASE_URL });
        await client.init();
        await client.getDexSwapTransactionData({ fromId: 'ETHEREUM', toId: 'ERC20/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', amount: '1000000000000000000', fromDecimals: 18, toDecimals: 6, provider: 'sushi_swap', walletAddress: '0x1234567890123456789012345678901234567890' });
        const dump = JSON.parse(readFileSync(client['dumper']!.filePath, 'utf-8'));
        expect(dump.calls.length).toBeGreaterThanOrEqual(2); // init + getTxData
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('records error to dump file when getQuotes fails', async () => {
      const { mkdtempSync, rmSync, readFileSync } = await import('node:fs');
      const { tmpdir } = await import('node:os');
      const { join } = await import('node:path');
      const dir = mkdtempSync(join(tmpdir(), 'dcent-dump-'));
      server.use(
        http.post(`${BASE_URL}/api/swap/v3/get_quotes`, () => HttpResponse.json({ error: 'fail' }, { status: 500 })),
      );
      try {
        const client = new DcentSwapApiClient({ debugDumpDir: dir, apiBaseUrl: BASE_URL });
        await client.init();
        await client.getQuotes({ fromId: 'ETHEREUM', toId: 'ERC20/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', amount: '1', fromDecimals: 18, toDecimals: 6 }).catch(() => {});
        const dump = JSON.parse(readFileSync(client['dumper']!.filePath, 'utf-8'));
        const errCall = dump.calls.find((c: Record<string, unknown>) => c.error);
        expect(errCall).toBeDefined();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('records error to dump file when getDexSwapTransactionData fails', async () => {
      const { mkdtempSync, rmSync, readFileSync } = await import('node:fs');
      const { tmpdir } = await import('node:os');
      const { join } = await import('node:path');
      const dir = mkdtempSync(join(tmpdir(), 'dcent-dump-'));
      server.use(
        http.post(`${BASE_URL}/api/swap/v3/get_dex_swap_transaction_data`, () => HttpResponse.json({ error: 'fail' }, { status: 500 })),
      );
      try {
        const client = new DcentSwapApiClient({ debugDumpDir: dir, apiBaseUrl: BASE_URL });
        await client.init();
        await client.getDexSwapTransactionData({ fromId: 'ETHEREUM', toId: 'ERC20/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', amount: '1', fromDecimals: 18, toDecimals: 6, provider: 'sushi', walletAddress: '0x1234' }).catch(() => {});
        const dump = JSON.parse(readFileSync(client['dumper']!.filePath, 'utf-8'));
        const errCall = dump.calls.find((c: Record<string, unknown>) => c.error);
        expect(errCall).toBeDefined();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('works without debugDumpDir (no dumper)', () => {
      const client = new DcentSwapApiClient();
      // Should work normally without dump
      expect(client).toBeDefined();
    });
  });
});
