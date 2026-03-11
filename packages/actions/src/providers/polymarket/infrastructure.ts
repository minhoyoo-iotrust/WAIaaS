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
import { PolymarketGammaClient } from './gamma-client.js';
import { PolymarketMarketData } from './market-data.js';
import { PolymarketPositionTracker, type PositionDb } from './position-tracker.js';
import { PolymarketPnlCalculator } from './pnl-calculator.js';
import { PolymarketResolutionMonitor, type PolymarketNotificationEvent } from './resolution-monitor.js';

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
  positions: PositionDb | null;
}

export interface PolymarketInfrastructure {
  clobClient: PolymarketClobClient;
  rateLimiter: PolymarketRateLimiter;
  apiKeyService: PolymarketApiKeyService;
  orderProvider: PolymarketOrderProvider;
  orderbookService: PolymarketOrderbookService;
  approveHelper: PolymarketApproveHelper;
  ctfProvider: PolymarketCtfProvider;
  gammaClient: PolymarketGammaClient;
  marketData: PolymarketMarketData;
  positionTracker: PolymarketPositionTracker | null;
  pnlCalculator: typeof PolymarketPnlCalculator;
  resolutionMonitor: PolymarketResolutionMonitor | null;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create all Polymarket infrastructure components with proper dependency wiring.
 *
 * @param config - Polymarket configuration (URLs, rate limits)
 * @param db - Database interfaces for API keys, orders, and positions
 * @param encryptFn - Encryption function for API key storage
 * @param decryptFn - Decryption function for API key retrieval
 * @param emitNotification - Optional notification callback for resolution events
 */
export function createPolymarketInfrastructure(
  config: PolymarketConfig,
  db: PolymarketDb,
  encryptFn: EncryptFn,
  decryptFn: DecryptFn,
  emitNotification?: (event: PolymarketNotificationEvent) => void,
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

  // 7. Gamma client + MarketData (caching service)
  const gammaClient = new PolymarketGammaClient(config.gammaApiUrl ?? PM_API_URLS.GAMMA);
  const marketData = new PolymarketMarketData(gammaClient);

  // 8. Position tracker (if positions DB provided)
  const positionTracker = db.positions
    ? new PolymarketPositionTracker(db.positions, marketData)
    : null;

  // 9. PnL calculator (stateless)
  const pnlCalculator = PolymarketPnlCalculator;

  // 10. Resolution monitor (if position tracker exists)
  const resolutionMonitor = positionTracker
    ? new PolymarketResolutionMonitor(positionTracker, marketData, emitNotification)
    : null;

  // 11. Order provider (depends on CLOB client, API key service, DB)
  // Wire MarketData.isNegRisk as NegRiskResolver (replaces Phase 371 null)
  const negRiskResolver = { isNegRisk: (tokenId: string) => marketData.isNegRisk(tokenId) };
  const orderProvider = new PolymarketOrderProvider(
    clobClient,
    apiKeyService,
    negRiskResolver,
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
    gammaClient,
    marketData,
    positionTracker,
    pnlCalculator,
    resolutionMonitor,
  };
}
