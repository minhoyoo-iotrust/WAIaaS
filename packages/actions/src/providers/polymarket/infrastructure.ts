/**
 * Polymarket Infrastructure Factory: wires all Polymarket dependencies together.
 *
 * Single entry point for daemon startup to create all Polymarket components
 * with proper dependency injection.
 *
 * @see design doc 80, Section 7.3
 */
import { PM_API_URLS } from './config.js';
import { PolymarketRateLimiter } from './rate-limiter.js';
import { PolymarketClobClient } from './clob-client.js';
import { PolymarketApiKeyService, type ApiKeyDb, type EncryptFn, type DecryptFn } from './api-key-service.js';
import { PolymarketOrderProvider, type OrderDb } from './order-provider.js';
import { PolymarketOrderbookService } from './orderbook-service.js';
import { PolymarketApproveHelper } from './approve-helper.js';
import { PolymarketCtfProvider } from './ctf-provider.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PolymarketConfig {
  clobApiUrl?: string;
  gammaApiUrl?: string;
  rateLimit?: {
    maxRequests: number;
    windowMs: number;
  };
}

export interface PolymarketDb {
  apiKeys: ApiKeyDb;
  orders: OrderDb | null;
}

export interface PolymarketInfrastructure {
  clobClient: PolymarketClobClient;
  rateLimiter: PolymarketRateLimiter;
  apiKeyService: PolymarketApiKeyService;
  orderProvider: PolymarketOrderProvider;
  orderbookService: PolymarketOrderbookService;
  approveHelper: PolymarketApproveHelper;
  ctfProvider: PolymarketCtfProvider;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create all Polymarket infrastructure components with proper dependency wiring.
 *
 * @param config - Polymarket configuration (URLs, rate limits)
 * @param db - Database interfaces for API keys and orders
 * @param encryptFn - Encryption function for API key storage
 * @param decryptFn - Decryption function for API key retrieval
 */
export function createPolymarketInfrastructure(
  config: PolymarketConfig,
  db: PolymarketDb,
  encryptFn: EncryptFn,
  decryptFn: DecryptFn,
): PolymarketInfrastructure {
  // 1. Rate limiter
  const rl = config.rateLimit ?? { maxRequests: 10, windowMs: 1000 };
  const rateLimiter = new PolymarketRateLimiter(rl.maxRequests, rl.windowMs);

  // 2. CLOB client (depends on rate limiter)
  const clobClient = new PolymarketClobClient(
    config.clobApiUrl ?? PM_API_URLS.CLOB,
    rateLimiter,
  );

  // 3. API key service (depends on CLOB client)
  const apiKeyService = new PolymarketApiKeyService(
    clobClient,
    db.apiKeys,
    encryptFn,
    decryptFn,
  );

  // 4. Orderbook service (depends on CLOB client)
  const orderbookService = new PolymarketOrderbookService(clobClient);

  // 5. Approve helper (stateless)
  const approveHelper = new PolymarketApproveHelper();

  // 6. CTF provider (stateless, on-chain operations)
  const ctfProvider = new PolymarketCtfProvider();

  // 7. Order provider (depends on CLOB client, API key service, DB)
  // Note: negRiskResolver is null for now; full MarketData impl in Phase 372-03
  const orderProvider = new PolymarketOrderProvider(
    clobClient,
    apiKeyService,
    null, // negRiskResolver - Phase 372-03
    db.orders,
  );

  return {
    clobClient,
    rateLimiter,
    apiKeyService,
    orderProvider,
    orderbookService,
    approveHelper,
    ctfProvider,
  };
}
