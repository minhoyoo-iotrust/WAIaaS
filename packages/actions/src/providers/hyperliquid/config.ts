/**
 * Hyperliquid configuration constants, Admin Settings keys, and defaults.
 *
 * @see HDESIGN-03: ExchangeClient shared structure
 * @see HDESIGN-05: Admin Settings keys
 */

// ---------------------------------------------------------------------------
// API URLs
// ---------------------------------------------------------------------------

export const HL_MAINNET_API_URL = 'https://api.hyperliquid.xyz';
export const HL_TESTNET_API_URL = 'https://api.hyperliquid-testnet.xyz';

// ---------------------------------------------------------------------------
// EIP-712 Domains
// ---------------------------------------------------------------------------

/** L1 Action signing domain (phantom agent). Same chainId for mainnet+testnet. */
export const HL_L1_DOMAIN = {
  name: 'Exchange',
  version: '1',
  chainId: 1337,
  verifyingContract: '0x0000000000000000000000000000000000000000' as const,
} as const;

/** User-signed action domain. chainId varies by network. */
export function hlUserSignedDomain(isMainnet: boolean) {
  return {
    name: 'HyperliquidSignTransaction',
    version: '1',
    chainId: isMainnet ? 42161 : 421614,
    verifyingContract: '0x0000000000000000000000000000000000000000' as const,
  } as const;
}

// ---------------------------------------------------------------------------
// Info API Weights
// ---------------------------------------------------------------------------

/** Weight table for /info endpoint rate limiting (Hyperliquid official). */
export const INFO_WEIGHTS: Record<string, number> = {
  clearinghouseState: 20,
  spotClearinghouseState: 20,
  openOrders: 20,
  userFills: 20,
  meta: 2,
  spotMeta: 2,
  allMids: 2,
  fundingHistory: 2,
  subAccounts: 20,
  userFunding: 20,
  l2Book: 2,
};

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const HL_DEFAULTS = {
  LEVERAGE: 1,
  MARGIN_MODE: 'CROSS' as const,
  RATE_LIMIT_WEIGHT_PER_MIN: 600,
  BUILDER_ADDRESS: '',
  BUILDER_FEE: 0,
  ORDER_STATUS_POLL_INTERVAL_MS: 2000,
  REQUEST_TIMEOUT_MS: 10_000,
} as const;

// ---------------------------------------------------------------------------
// Admin Settings Keys
// ---------------------------------------------------------------------------

export const HL_SETTINGS = {
  ENABLED: 'actions.hyperliquid_enabled',
  API_URL: 'actions.hyperliquid_api_url',
  TESTNET_API_URL: 'actions.hyperliquid_testnet_api_url',
  RATE_LIMIT_WEIGHT_PER_MIN: 'actions.hyperliquid_rate_limit_weight_per_min',
  DEFAULT_LEVERAGE: 'actions.hyperliquid_default_leverage',
  DEFAULT_MARGIN_MODE: 'actions.hyperliquid_default_margin_mode',
  BUILDER_ADDRESS: 'actions.hyperliquid_builder_address',
  BUILDER_FEE: 'actions.hyperliquid_builder_fee',
  ORDER_STATUS_POLL_INTERVAL_MS: 'actions.hyperliquid_order_status_poll_interval_ms',
} as const;

// ---------------------------------------------------------------------------
// Error Codes
// ---------------------------------------------------------------------------

export const HL_ERRORS = {
  /** Maps to ChainErrorCode 'ACTION_API_ERROR' */
  API_ERROR: 'ACTION_API_ERROR' as const,
  /** Maps to ChainErrorCode 'ACTION_RATE_LIMITED' */
  RATE_LIMITED: 'ACTION_RATE_LIMITED' as const,
  /** Maps to ChainErrorCode 'ACTION_API_ERROR' */
  INSUFFICIENT_MARGIN: 'ACTION_API_ERROR' as const,
  /** Maps to ChainErrorCode 'ACTION_API_ERROR' */
  ORDER_REJECTED: 'ACTION_API_ERROR' as const,
  /** Maps to ChainErrorCode 'ACTION_API_ERROR' */
  SIGNING_FAILED: 'ACTION_API_ERROR' as const,
  /** Maps to ChainErrorCode 'ACTION_API_ERROR' */
  INVALID_MARKET: 'ACTION_API_ERROR' as const,
} as const;
