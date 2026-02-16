/**
 * SEC-06-01~32 Token policy attack scenarios.
 *
 * Tests 32 attack vectors against ALLOWED_TOKENS policy:
 * Default deny, case-insensitive bypass, empty tokens array,
 * disabled policy, global vs wallet override, network scoping,
 * BigInt boundary, special character injection, and boundary variations.
 *
 * @see docs/64-extension-test-strategy.md
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createInMemoryDb,
  insertPolicy,
} from '../helpers/security-test-helpers.js';
import type { DatabaseConnection } from '../../../infrastructure/database/index.js';
import { generateId } from '../../../infrastructure/database/index.js';
import { wallets } from '../../../infrastructure/database/schema.js';
import { DatabasePolicyEngine } from '../../../pipeline/database-policy-engine.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let conn: DatabaseConnection;
let engine: DatabasePolicyEngine;
let walletId: string;

async function insertTestWallet(
  connection: DatabaseConnection,
  overrides?: { chain?: string; environment?: string; defaultNetwork?: string },
): Promise<string> {
  const id = generateId();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  await connection.db.insert(wallets).values({
    id,
    name: 'sec-token-test-wallet',
    chain: overrides?.chain ?? 'solana',
    environment: overrides?.environment ?? 'testnet',
    defaultNetwork: overrides?.defaultNetwork ?? 'devnet',
    publicKey: `pk-sec-${id}`,
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

/**
 * Build a TOKEN_TRANSFER transaction for policy evaluation.
 */
function tokenTx(
  tokenAddress: string,
  amount = '1000000',
  opts?: { toAddress?: string; chain?: string; network?: string },
) {
  return {
    type: 'TOKEN_TRANSFER',
    tokenAddress,
    amount,
    toAddress: opts?.toAddress ?? 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
    chain: opts?.chain ?? 'solana',
    ...(opts?.network ? { network: opts.network } : {}),
  };
}

/**
 * Build a native TRANSFER transaction for testing non-applicability.
 */
function nativeTx(amount = '1000000000') {
  return {
    type: 'TRANSFER',
    amount,
    toAddress: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
    chain: 'solana',
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  conn = createInMemoryDb();
  engine = new DatabasePolicyEngine(conn.db);
  walletId = await insertTestWallet(conn);
});

afterEach(() => {
  try {
    conn.sqlite.close();
  } catch {
    // already closed
  }
});

// ---------------------------------------------------------------------------
// SEC-06-01: ALLOWED_TOKENS not configured -> TOKEN_TRANSFER default deny
// ---------------------------------------------------------------------------

describe('SEC-06-01: ALLOWED_TOKENS not configured -> TOKEN_TRANSFER default deny', () => {
  it('denies TOKEN_TRANSFER when no ALLOWED_TOKENS policy exists', async () => {
    // Must have at least one enabled policy for engine to evaluate
    // (no policies = INSTANT passthrough)
    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '1000000000',
        notify_max: '10000000000',
        delay_max: '50000000000',
        delay_seconds: 300,
      }),
      priority: 10,
    });

    const result = await engine.evaluate(walletId, tokenTx('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'));
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('no ALLOWED_TOKENS policy configured');
  });
});

// ---------------------------------------------------------------------------
// SEC-06-02: Token not in allowed list -> deny
// ---------------------------------------------------------------------------

describe('SEC-06-02: token not in allowed list -> deny', () => {
  it('denies TOKEN_TRANSFER when token not in ALLOWED_TOKENS list', async () => {
    insertPolicy(conn.sqlite, {
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({
        tokens: [{ address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' }],
      }),
      priority: 20,
    });

    const result = await engine.evaluate(
      walletId,
      tokenTx('SomeOtherTokenMintAddressThatIsNotListed123'),
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Token not in allowed list');
  });
});

// ---------------------------------------------------------------------------
// SEC-06-03: Token in allowed list -> allowed
// ---------------------------------------------------------------------------

describe('SEC-06-03: token in allowed list -> allowed', () => {
  it('allows TOKEN_TRANSFER when token is in ALLOWED_TOKENS list', async () => {
    const tokenAddr = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    insertPolicy(conn.sqlite, {
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({
        tokens: [{ address: tokenAddr }],
      }),
      priority: 20,
    });

    const result = await engine.evaluate(walletId, tokenTx(tokenAddr));
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SEC-06-04: Case-insensitive token address matching (EVM 0xAbCd vs 0xabcd)
// ---------------------------------------------------------------------------

describe('SEC-06-04: case-insensitive token address matching', () => {
  it('matches EVM token address case-insensitively (checksum vs lowercase)', async () => {
    const checksumAddr = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
    insertPolicy(conn.sqlite, {
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({
        tokens: [{ address: checksumAddr }],
      }),
      priority: 20,
    });

    // Lowercase query -> should still match
    const result = await engine.evaluate(
      walletId,
      tokenTx(checksumAddr.toLowerCase()),
    );
    expect(result.allowed).toBe(true);
  });

  it('matches uppercase query against lowercase policy', async () => {
    const lowerAddr = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
    insertPolicy(conn.sqlite, {
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({
        tokens: [{ address: lowerAddr }],
      }),
      priority: 20,
    });

    // Uppercase query
    const result = await engine.evaluate(
      walletId,
      tokenTx(lowerAddr.toUpperCase()),
    );
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SEC-06-05: Empty tokens array -> all TOKEN_TRANSFER denied
// ---------------------------------------------------------------------------

describe('SEC-06-05: empty tokens array -> all TOKEN_TRANSFER denied', () => {
  it('denies TOKEN_TRANSFER when tokens array is empty', async () => {
    insertPolicy(conn.sqlite, {
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({ tokens: [] }),
      priority: 20,
    });

    const result = await engine.evaluate(
      walletId,
      tokenTx('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Token not in allowed list');
  });
});

// ---------------------------------------------------------------------------
// SEC-06-06: Disabled ALLOWED_TOKENS policy -> default deny behavior
// ---------------------------------------------------------------------------

describe('SEC-06-06: disabled ALLOWED_TOKENS policy -> default deny', () => {
  it('denies TOKEN_TRANSFER when ALLOWED_TOKENS policy is disabled', async () => {
    insertPolicy(conn.sqlite, {
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({
        tokens: [{ address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' }],
      }),
      priority: 20,
      enabled: false, // Disabled
    });

    // Need at least one enabled policy so engine doesn't passthrough
    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '1000000000',
        notify_max: '10000000000',
        delay_max: '50000000000',
        delay_seconds: 300,
      }),
      priority: 10,
    });

    const result = await engine.evaluate(
      walletId,
      tokenTx('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
    );
    // Disabled ALLOWED_TOKENS policy is not loaded -> default deny
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('no ALLOWED_TOKENS policy configured');
  });
});

// ---------------------------------------------------------------------------
// SEC-06-07: Global vs wallet-specific override (4-level priority)
// ---------------------------------------------------------------------------

describe('SEC-06-07: global vs wallet-specific ALLOWED_TOKENS override', () => {
  it('wallet-specific policy overrides global policy', async () => {
    const globalToken = 'GlobalTokenMintAddressXXXXXXXXXXXXXXXXXXX111';
    const walletToken = 'WalletTokenMintAddressXXXXXXXXXXXXXXXXXX222';

    // Global: allows globalToken
    insertPolicy(conn.sqlite, {
      walletId: null,
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({
        tokens: [{ address: globalToken }],
      }),
      priority: 10,
    });

    // Wallet-specific: allows walletToken only
    insertPolicy(conn.sqlite, {
      walletId,
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({
        tokens: [{ address: walletToken }],
      }),
      priority: 10,
    });

    // walletToken: allowed (wallet-specific overrides)
    const result1 = await engine.evaluate(walletId, tokenTx(walletToken));
    expect(result1.allowed).toBe(true);

    // globalToken: denied (wallet-specific policy doesn't include it)
    const result2 = await engine.evaluate(walletId, tokenTx(globalToken));
    expect(result2.allowed).toBe(false);
  });

  it('other wallet without wallet-specific policy uses global policy', async () => {
    const otherWalletId = await insertTestWallet(conn);
    const globalToken = 'GlobalTokenMintAddressXXXXXXXXXXXXXXXXXXX111';

    // Global: allows globalToken
    insertPolicy(conn.sqlite, {
      walletId: null,
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({
        tokens: [{ address: globalToken }],
      }),
      priority: 10,
    });

    // Wallet-specific: for walletId only
    insertPolicy(conn.sqlite, {
      walletId,
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({
        tokens: [{ address: 'WalletOnlyToken' }],
      }),
      priority: 10,
    });

    // otherWalletId uses global -> globalToken allowed
    const result = await engine.evaluate(otherWalletId, tokenTx(globalToken));
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SEC-06-08: EVM checksum address vs lowercase matching
// ---------------------------------------------------------------------------

describe('SEC-06-08: EVM checksum vs lowercase matching', () => {
  it('mixed case policy + mixed case query both resolve correctly', async () => {
    // EIP-55 checksum address
    const checksumAddr = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
    insertPolicy(conn.sqlite, {
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({
        tokens: [{ address: checksumAddr }],
      }),
      priority: 20,
    });

    // All-lowercase query
    const r1 = await engine.evaluate(
      walletId,
      tokenTx('0xdac17f958d2ee523a2206206994597c13d831ec7'),
    );
    expect(r1.allowed).toBe(true);

    // All-uppercase query (except 0x prefix)
    const r2 = await engine.evaluate(
      walletId,
      tokenTx('0xDAC17F958D2EE523A2206206994597C13D831EC7'),
    );
    expect(r2.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SEC-06-09: Solana token mint address matching (base58)
// ---------------------------------------------------------------------------

describe('SEC-06-09: Solana token mint address matching (base58)', () => {
  it('exact Solana mint address match succeeds', async () => {
    const mint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC
    insertPolicy(conn.sqlite, {
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({ tokens: [{ address: mint }] }),
      priority: 20,
    });

    const result = await engine.evaluate(walletId, tokenTx(mint));
    expect(result.allowed).toBe(true);
  });

  it('case-insensitive Solana mint match (toLower both sides)', async () => {
    const mint = 'So11111111111111111111111111111111111111112'; // wSOL
    insertPolicy(conn.sqlite, {
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({ tokens: [{ address: mint }] }),
      priority: 20,
    });

    // Lower-cased query -- engine uses case-insensitive comparison
    const result = await engine.evaluate(walletId, tokenTx(mint.toLowerCase()));
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SEC-06-10: Network scoping (mainnet ALLOWED_TOKENS does not apply on devnet)
// ---------------------------------------------------------------------------

describe('SEC-06-10: network scoping for ALLOWED_TOKENS', () => {
  it('mainnet-scoped ALLOWED_TOKENS does not apply on devnet', async () => {
    const tokenAddr = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

    // Insert mainnet-scoped ALLOWED_TOKENS
    const id = generateId();
    const now = Math.floor(Date.now() / 1000);
    conn.sqlite
      .prepare(
        `INSERT INTO policies (id, wallet_id, type, rules, priority, enabled, network, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        null, // global
        'ALLOWED_TOKENS',
        JSON.stringify({ tokens: [{ address: tokenAddr }] }),
        20,
        1,
        'mainnet', // network-scoped
        now,
        now,
      );

    // Query on devnet -> mainnet policy not loaded -> default deny
    // Need another enabled policy so it doesn't passthrough
    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '1000000000',
        notify_max: '10000000000',
        delay_max: '50000000000',
        delay_seconds: 300,
      }),
      priority: 10,
    });

    const result = await engine.evaluate(
      walletId,
      tokenTx(tokenAddr, '1000000', { network: 'devnet' }),
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('no ALLOWED_TOKENS policy configured');
  });
});

// ---------------------------------------------------------------------------
// SEC-06-11: uint256 max token amount -> BigInt range verification
// ---------------------------------------------------------------------------

describe('SEC-06-11: uint256 max token amount -> BigInt verification', () => {
  it('handles extremely large token amount without overflow', async () => {
    const tokenAddr = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    insertPolicy(conn.sqlite, {
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({ tokens: [{ address: tokenAddr }] }),
      priority: 20,
    });

    // uint256.max amount (token passes ALLOWED_TOKENS, then proceeds to SPENDING_LIMIT)
    const uint256Max = (2n ** 256n - 1n).toString();
    const result = await engine.evaluate(
      walletId,
      tokenTx(tokenAddr, uint256Max),
    );

    // Token is allowed; no SPENDING_LIMIT for TOKEN_TRANSFER amount
    // (SPENDING_LIMIT only evaluates native amount, which is '0' implicitly)
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SEC-06-12: Token address with space/special character injection
// ---------------------------------------------------------------------------

describe('SEC-06-12: token address with special character injection', () => {
  it('spaces in token address do not match clean address', async () => {
    const cleanAddr = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    insertPolicy(conn.sqlite, {
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({ tokens: [{ address: cleanAddr }] }),
      priority: 20,
    });

    // Inject spaces
    const result = await engine.evaluate(
      walletId,
      tokenTx(' EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v '),
    );
    expect(result.allowed).toBe(false);
  });

  it('null byte injection in token address fails', async () => {
    const cleanAddr = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    insertPolicy(conn.sqlite, {
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({ tokens: [{ address: cleanAddr }] }),
      priority: 20,
    });

    const result = await engine.evaluate(
      walletId,
      tokenTx('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v\0extra'),
    );
    expect(result.allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SEC-06-13: TRANSFER type -> ALLOWED_TOKENS not applicable
// ---------------------------------------------------------------------------

describe('SEC-06-13: TRANSFER type -> ALLOWED_TOKENS not applicable', () => {
  it('native TRANSFER is not checked against ALLOWED_TOKENS', async () => {
    insertPolicy(conn.sqlite, {
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({ tokens: [{ address: 'SomeToken' }] }),
      priority: 20,
    });

    // Native TRANSFER -> ALLOWED_TOKENS should not apply
    const result = await engine.evaluate(walletId, nativeTx('1000000'));
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SEC-06-14: One token allowed, another denied (same wallet)
// ---------------------------------------------------------------------------

describe('SEC-06-14: one token allowed, another denied', () => {
  it('allowed token passes, non-listed token denied', async () => {
    const allowedToken = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const deniedToken = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';

    insertPolicy(conn.sqlite, {
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({ tokens: [{ address: allowedToken }] }),
      priority: 20,
    });

    const r1 = await engine.evaluate(walletId, tokenTx(allowedToken));
    expect(r1.allowed).toBe(true);

    const r2 = await engine.evaluate(walletId, tokenTx(deniedToken));
    expect(r2.allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SEC-06-15: Multiple policies -> highest priority ALLOWED_TOKENS applies
// ---------------------------------------------------------------------------

describe('SEC-06-15: multiple ALLOWED_TOKENS -> highest priority wins', () => {
  it('higher priority wallet policy overrides lower priority global', async () => {
    const tokenA = 'TokenAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const tokenB = 'TokenBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

    // Low priority global: allows tokenA
    insertPolicy(conn.sqlite, {
      walletId: null,
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({ tokens: [{ address: tokenA }] }),
      priority: 5,
    });

    // High priority wallet-specific: allows tokenB only
    insertPolicy(conn.sqlite, {
      walletId,
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({ tokens: [{ address: tokenB }] }),
      priority: 100,
    });

    // tokenA denied (wallet-specific overrides global)
    const r1 = await engine.evaluate(walletId, tokenTx(tokenA));
    expect(r1.allowed).toBe(false);

    // tokenB allowed
    const r2 = await engine.evaluate(walletId, tokenTx(tokenB));
    expect(r2.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SEC-06-16~32: Boundary value variations (17 scenarios)
// ---------------------------------------------------------------------------

describe('SEC-06-16: zero-length token address', () => {
  it('empty string token address is denied', async () => {
    insertPolicy(conn.sqlite, {
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({
        tokens: [{ address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' }],
      }),
      priority: 20,
    });

    const result = await engine.evaluate(walletId, tokenTx(''));
    expect(result.allowed).toBe(false);
  });
});

describe('SEC-06-17: very long token address', () => {
  it('extremely long address string is denied', async () => {
    const longAddr = 'A'.repeat(500);
    insertPolicy(conn.sqlite, {
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({
        tokens: [{ address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' }],
      }),
      priority: 20,
    });

    const result = await engine.evaluate(walletId, tokenTx(longAddr));
    expect(result.allowed).toBe(false);
  });
});

describe('SEC-06-18: token amount zero', () => {
  it('zero amount TOKEN_TRANSFER still requires ALLOWED_TOKENS check', async () => {
    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '1000000000',
        notify_max: '10000000000',
        delay_max: '50000000000',
        delay_seconds: 300,
      }),
      priority: 10,
    });

    const result = await engine.evaluate(
      walletId,
      tokenTx('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', '0'),
    );
    // No ALLOWED_TOKENS policy -> denied
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('no ALLOWED_TOKENS policy configured');
  });
});

describe('SEC-06-19: minimum amount (1 unit)', () => {
  it('minimum amount TOKEN_TRANSFER with allowed token succeeds', async () => {
    const token = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    insertPolicy(conn.sqlite, {
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({ tokens: [{ address: token }] }),
      priority: 20,
    });

    const result = await engine.evaluate(walletId, tokenTx(token, '1'));
    expect(result.allowed).toBe(true);
  });
});

describe('SEC-06-20: multiple tokens registered', () => {
  it('multiple tokens in ALLOWED_TOKENS all pass individually', async () => {
    const tokenA = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const tokenB = 'So11111111111111111111111111111111111111112';
    const tokenC = '0xdAC17F958D2ee523a2206206994597C13D831ec7';

    insertPolicy(conn.sqlite, {
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({
        tokens: [{ address: tokenA }, { address: tokenB }, { address: tokenC }],
      }),
      priority: 20,
    });

    for (const token of [tokenA, tokenB, tokenC]) {
      const result = await engine.evaluate(walletId, tokenTx(token));
      expect(result.allowed).toBe(true);
    }
  });
});

describe('SEC-06-21: token address with unicode characters', () => {
  it('unicode-injected address does not match clean address', async () => {
    const cleanAddr = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    insertPolicy(conn.sqlite, {
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({ tokens: [{ address: cleanAddr }] }),
      priority: 20,
    });

    // Inject zero-width space (U+200B)
    const result = await engine.evaluate(
      walletId,
      tokenTx('EPjFWdd5Aufq\u200BSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
    );
    expect(result.allowed).toBe(false);
  });
});

describe('SEC-06-22: TOKEN_TRANSFER missing tokenAddress field', () => {
  it('TOKEN_TRANSFER without tokenAddress is denied', async () => {
    insertPolicy(conn.sqlite, {
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({
        tokens: [{ address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' }],
      }),
      priority: 20,
    });

    // No tokenAddress in transaction param
    const result = await engine.evaluate(walletId, {
      type: 'TOKEN_TRANSFER',
      amount: '1000000',
      toAddress: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      chain: 'solana',
      // tokenAddress intentionally missing
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('missing token address');
  });
});

describe('SEC-06-23: token address partial match attempt', () => {
  it('prefix-only match does not succeed', async () => {
    const fullAddr = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    insertPolicy(conn.sqlite, {
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({ tokens: [{ address: fullAddr }] }),
      priority: 20,
    });

    // Only prefix
    const result = await engine.evaluate(walletId, tokenTx('EPjFWdd5Aufq'));
    expect(result.allowed).toBe(false);
  });
});

describe('SEC-06-24: token address suffix match attempt', () => {
  it('suffix-only match does not succeed', async () => {
    const fullAddr = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    insertPolicy(conn.sqlite, {
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({ tokens: [{ address: fullAddr }] }),
      priority: 20,
    });

    const result = await engine.evaluate(walletId, tokenTx('GkZwyTDt1v'));
    expect(result.allowed).toBe(false);
  });
});

describe('SEC-06-25: EVM token with 0x prefix manipulation', () => {
  it('address without 0x prefix does not match 0x-prefixed policy', async () => {
    const evmAddr = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
    insertPolicy(conn.sqlite, {
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({ tokens: [{ address: evmAddr }] }),
      priority: 20,
    });

    // Strip 0x prefix
    const result = await engine.evaluate(
      walletId,
      tokenTx('A0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'),
    );
    expect(result.allowed).toBe(false);
  });
});

describe('SEC-06-26: single token in list with many requests', () => {
  it('multiple TOKEN_TRANSFER requests all correctly evaluated', async () => {
    const token = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    insertPolicy(conn.sqlite, {
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({ tokens: [{ address: token }] }),
      priority: 20,
    });

    // 5 sequential requests
    for (let i = 0; i < 5; i++) {
      const result = await engine.evaluate(
        walletId,
        tokenTx(token, String(1000000 * (i + 1))),
      );
      expect(result.allowed).toBe(true);
    }
  });
});

describe('SEC-06-27: CONTRACT_CALL type not affected by ALLOWED_TOKENS', () => {
  it('CONTRACT_CALL does not trigger ALLOWED_TOKENS evaluation', async () => {
    insertPolicy(conn.sqlite, {
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({
        tokens: [{ address: 'OnlyThisToken' }],
      }),
      priority: 20,
    });

    // CONTRACT_CALL with CONTRACT_WHITELIST required (separate policy)
    // But ALLOWED_TOKENS should not apply
    const result = await engine.evaluate(walletId, {
      type: 'CONTRACT_CALL',
      amount: '0',
      toAddress: '0x1234567890abcdef1234567890abcdef12345678',
      contractAddress: '0x1234567890abcdef1234567890abcdef12345678',
      chain: 'ethereum',
    });

    // Should be denied by CONTRACT_WHITELIST (default deny), not ALLOWED_TOKENS
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('CONTRACT_WHITELIST');
  });
});

describe('SEC-06-28: APPROVE type not affected by ALLOWED_TOKENS', () => {
  it('APPROVE does not trigger ALLOWED_TOKENS evaluation', async () => {
    insertPolicy(conn.sqlite, {
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({
        tokens: [{ address: 'OnlyThisToken' }],
      }),
      priority: 20,
    });

    const result = await engine.evaluate(walletId, {
      type: 'APPROVE',
      amount: '0',
      toAddress: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      spenderAddress: '0x1234567890abcdef1234567890abcdef12345678',
      chain: 'solana',
    });

    // Should be denied by APPROVED_SPENDERS (default deny), not ALLOWED_TOKENS
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('APPROVED_SPENDERS');
  });
});

describe('SEC-06-29: token address with tab character injection', () => {
  it('tab character in address does not match', async () => {
    const cleanAddr = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    insertPolicy(conn.sqlite, {
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({ tokens: [{ address: cleanAddr }] }),
      priority: 20,
    });

    const result = await engine.evaluate(
      walletId,
      tokenTx('EPjFWdd5AufqSSqeM2qN1xzy\tbapC8G4wEGGkZwyTDt1v'),
    );
    expect(result.allowed).toBe(false);
  });
});

describe('SEC-06-30: token address with newline injection', () => {
  it('newline in address does not match', async () => {
    const cleanAddr = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    insertPolicy(conn.sqlite, {
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({ tokens: [{ address: cleanAddr }] }),
      priority: 20,
    });

    const result = await engine.evaluate(
      walletId,
      tokenTx('EPjFWdd5AufqSSqeM2qN1xzy\nbapC8G4wEGGkZwyTDt1v'),
    );
    expect(result.allowed).toBe(false);
  });
});

describe('SEC-06-31: ALLOWED_TOKENS with SPENDING_LIMIT interaction', () => {
  it('allowed token still subject to SPENDING_LIMIT tier evaluation', async () => {
    const token = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    insertPolicy(conn.sqlite, {
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({ tokens: [{ address: token }] }),
      priority: 20,
    });

    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '1000',
        notify_max: '10000',
        delay_max: '50000',
        delay_seconds: 300,
      }),
      priority: 10,
    });

    // Token is allowed, SPENDING_LIMIT evaluates the amount
    // TOKEN_TRANSFER amount goes through SPENDING_LIMIT as-is
    const result = await engine.evaluate(walletId, tokenTx(token, '5000'));
    expect(result.allowed).toBe(true);
    // 5000 > 1000 (instant_max) -> at least NOTIFY
    expect(result.tier).toBe('NOTIFY');
  });
});

describe('SEC-06-32: large number of tokens in allowed list', () => {
  it('correctly evaluates against a large token list (100 tokens)', async () => {
    const tokens = Array.from({ length: 100 }, (_, i) => ({
      address: `Token${String(i).padStart(40, '0')}`,
    }));

    insertPolicy(conn.sqlite, {
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({ tokens }),
      priority: 20,
    });

    // Token at index 50 should be found
    const target = `Token${String(50).padStart(40, '0')}`;
    const r1 = await engine.evaluate(walletId, tokenTx(target));
    expect(r1.allowed).toBe(true);

    // Token not in list
    const r2 = await engine.evaluate(walletId, tokenTx('NotInTheList'));
    expect(r2.allowed).toBe(false);
  });
});
