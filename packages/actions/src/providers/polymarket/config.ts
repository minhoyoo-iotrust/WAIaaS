/**
 * Polymarket configuration constants, contract addresses, EIP-712 domains,
 * API URLs, Admin Settings keys, and defaults.
 *
 * @see design doc 80, Section 2.2 + 4.1 + Appendix A
 */
import type { Hex } from 'viem';

// ---------------------------------------------------------------------------
// Contract Addresses (Polygon Mainnet)
// ---------------------------------------------------------------------------

export const PM_CONTRACTS = {
  /** ERC-1155 Conditional Token Framework */
  CONDITIONAL_TOKENS: '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045' as Hex,
  /** Binary market order matching + settlement */
  CTF_EXCHANGE: '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E' as Hex,
  /** Multi-outcome (Neg Risk) market order matching + settlement */
  NEG_RISK_CTF_EXCHANGE: '0xC5d563A36AE78145C45a50134d48A1215220f80a' as Hex,
  /** NO -> YES token conversion for Neg Risk markets */
  NEG_RISK_ADAPTER: '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296' as Hex,
  /** Collateral token (USDC.e, 6 decimals) */
  USDC_E: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' as Hex,
  /** EIP-1167 proxy wallet factory (out of scope, listed for reference) */
  PROXY_WALLET_FACTORY: '0xaB45c5A4B0c941a2F231C04C3f49182e1A254052' as Hex,
} as const;

// ---------------------------------------------------------------------------
// API URLs
// ---------------------------------------------------------------------------

export const PM_API_URLS = {
  /** CLOB REST API (L1/L2 auth) */
  CLOB: 'https://clob.polymarket.com',
  /** Gamma API (public, market metadata) */
  GAMMA: 'https://gamma-api.polymarket.com',
  /** Data API (public, positions/trades history) */
  DATA: 'https://data-api.polymarket.com',
} as const;

// ---------------------------------------------------------------------------
// EIP-712 Domains
// ---------------------------------------------------------------------------

/** Domain 1: ClobAuth (API Key generation) */
export const CLOB_AUTH_DOMAIN = {
  name: 'ClobAuthDomain',
  version: '1',
  chainId: 137n,
} as const;

/** Domain 2: CTF Exchange (binary market orders) */
export const CTF_EXCHANGE_DOMAIN = {
  name: 'Polymarket CTF Exchange',
  version: '1',
  chainId: 137n,
  verifyingContract: PM_CONTRACTS.CTF_EXCHANGE,
} as const;

/** Domain 3: Neg Risk CTF Exchange (multi-outcome market orders) */
export const NEG_RISK_CTF_EXCHANGE_DOMAIN = {
  name: 'Polymarket CTF Exchange',
  version: '1',
  chainId: 137n,
  verifyingContract: PM_CONTRACTS.NEG_RISK_CTF_EXCHANGE,
} as const;

// ---------------------------------------------------------------------------
// EIP-712 Type Definitions
// ---------------------------------------------------------------------------

/** Order struct (12 fields) for CLOB order signing */
export const ORDER_TYPES = {
  Order: [
    { name: 'salt', type: 'uint256' },
    { name: 'maker', type: 'address' },
    { name: 'signer', type: 'address' },
    { name: 'taker', type: 'address' },
    { name: 'tokenId', type: 'uint256' },
    { name: 'makerAmount', type: 'uint256' },
    { name: 'takerAmount', type: 'uint256' },
    { name: 'expiration', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'feeRateBps', type: 'uint256' },
    { name: 'side', type: 'uint8' },
    { name: 'signatureType', type: 'uint8' },
  ],
} as const;

/** ClobAuth struct (4 fields) for API Key creation signing */
export const CLOB_AUTH_TYPES = {
  ClobAuth: [
    { name: 'address', type: 'address' },
    { name: 'timestamp', type: 'string' },
    { name: 'nonce', type: 'uint256' },
    { name: 'message', type: 'string' },
  ],
} as const;

/** Fixed message for ClobAuth signing */
export const CLOB_AUTH_MESSAGE = 'This message attests that I control the given wallet';

// ---------------------------------------------------------------------------
// Order Side Constants
// ---------------------------------------------------------------------------

export const ORDER_SIDE = {
  BUY: 0,
  SELL: 1,
} as const;

export const SIGNATURE_TYPE = {
  EOA: 0,
  POLY_PROXY: 1,
  POLY_GNOSIS_SAFE: 2,
} as const;

/** Zero address for public taker */
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Hex;

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const PM_DEFAULTS = {
  RATE_LIMIT_MAX_REQUESTS: 10,
  RATE_LIMIT_WINDOW_MS: 1000,
  REQUEST_TIMEOUT_MS: 10_000,
  /** USDC.e uses 6 decimals. Outcome tokens also 6 decimals in CLOB. */
  DECIMALS: 6,
} as const;

// ---------------------------------------------------------------------------
// Admin Settings Keys
// ---------------------------------------------------------------------------

export const PM_SETTINGS = {
  ENABLED: 'actions.polymarket_enabled',
  CLOB_API_URL: 'actions.polymarket_clob_api_url',
  GAMMA_API_URL: 'actions.polymarket_gamma_api_url',
  RATE_LIMIT_MAX_REQUESTS: 'actions.polymarket_rate_limit_max_requests',
  AUTO_APPROVE_CTF: 'actions.polymarket_auto_approve_ctf',
  DEFAULT_ORDER_TYPE: 'actions.polymarket_default_order_type',
  REQUEST_TIMEOUT_MS: 'actions.polymarket_request_timeout_ms',
} as const;

// ---------------------------------------------------------------------------
// Error Codes
// ---------------------------------------------------------------------------

export const PM_ERRORS = {
  API_ERROR: 'ACTION_API_ERROR' as const,
  RATE_LIMITED: 'ACTION_RATE_LIMITED' as const,
  ORDER_REJECTED: 'ACTION_API_ERROR' as const,
  SIGNING_FAILED: 'ACTION_API_ERROR' as const,
  INVALID_MARKET: 'ACTION_API_ERROR' as const,
  INVALID_NETWORK: 'INVALID_NETWORK' as const,
} as const;
