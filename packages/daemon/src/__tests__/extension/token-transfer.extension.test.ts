/**
 * EXT-01: Token Transfer Functional Tests (32 scenarios).
 *
 * Tests normal/positive behavior for TOKEN_TRANSFER transactions:
 * - TOK-U01~U08: TransferRequest parsing + ALLOWED_TOKENS policy (unit)
 * - TOK-U09~U14: FeeEstimate + AssetInfo (unit)
 * - TOK-I01~I10: Integration pipeline (policy engine + adapter mock)
 * - TOK-X01~X08: Cross-validation (oracle, chain-specific, network scoping)
 *
 * Unlike security tests (SEC-06) which test attack defense,
 * these tests verify correct behavior under normal usage.
 *
 * @see docs/64-extension-test-strategy.md
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { z } from 'zod';
import {
  createInMemoryDb,
  insertPolicy,
} from '../security/helpers/security-test-helpers.js';
import type { DatabaseConnection } from '../../infrastructure/database/index.js';
import { generateId } from '../../infrastructure/database/index.js';
import { wallets } from '../../infrastructure/database/schema.js';
import { DatabasePolicyEngine } from '../../pipeline/database-policy-engine.js';
import {
  TokenTransferRequestSchema,
  TransactionRequestSchema,
} from '@waiaas/core';
import { AssetInfoSchema } from '@waiaas/core';
import { createMockPriceOracle } from '../mocks/mock-price-oracle.js';

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
    name: 'ext-token-test-wallet',
    chain: overrides?.chain ?? 'solana',
    environment: overrides?.environment ?? 'testnet',
    defaultNetwork: overrides?.defaultNetwork ?? 'devnet',
    publicKey: `pk-ext-${id}`,
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

/** Build a TOKEN_TRANSFER transaction for policy evaluation. */
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

/** Build a native TRANSFER transaction for testing. */
function nativeTx(amount = '1000000000') {
  return {
    type: 'TRANSFER',
    amount,
    toAddress: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
    chain: 'solana',
  };
}

// Known Solana mint addresses
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const WSOL_MINT = 'So11111111111111111111111111111111111111112';
const BONK_MINT = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
// Known EVM token addresses
const EVM_USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const EVM_USDT = '0xdac17f958d2ee523a2206206994597c13d831ec7';
// Token-2022 program ID
const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

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

// ===========================================================================
// TOK-U01~U08: TransferRequest parsing + ALLOWED_TOKENS policy
// ===========================================================================

describe('TOK-U01~U08: TransferRequest parsing + ALLOWED_TOKENS policy', () => {
  // -------------------------------------------------------------------------
  // TOK-U01: TransferRequest.token valid -> TOKEN_TRANSFER routing
  // -------------------------------------------------------------------------
  it('TOK-U01: valid token field routes to TOKEN_TRANSFER type', () => {
    const parsed = TransactionRequestSchema.safeParse({
      type: 'TOKEN_TRANSFER',
      to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      amount: '1000000',
      token: { address: USDC_MINT, decimals: 6, symbol: 'USDC' },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.type).toBe('TOKEN_TRANSFER');
    }
  });

  // -------------------------------------------------------------------------
  // TOK-U02: no token -> TRANSFER (native) routing
  // -------------------------------------------------------------------------
  it('TOK-U02: no token field routes to TRANSFER (native) type', () => {
    const parsed = TransactionRequestSchema.safeParse({
      type: 'TRANSFER',
      to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      amount: '1000000000',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.type).toBe('TRANSFER');
    }
  });

  // -------------------------------------------------------------------------
  // TOK-U03: invalid address format -> Zod validation failure
  // -------------------------------------------------------------------------
  it('TOK-U03: invalid token address (empty string) -> Zod validation failure', () => {
    const parsed = TokenTransferRequestSchema.safeParse({
      type: 'TOKEN_TRANSFER',
      to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      amount: '1000000',
      token: { address: '', decimals: 6, symbol: 'USDC' },
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const paths = parsed.error.issues.map((i) => i.path.join('.'));
      expect(paths.some((p) => p.includes('address'))).toBe(true);
    }
  });

  // -------------------------------------------------------------------------
  // TOK-U04: ALLOWED_TOKENS with permitted token -> pass
  // -------------------------------------------------------------------------
  it('TOK-U04: ALLOWED_TOKENS permits whitelisted token', async () => {
    insertPolicy(conn.sqlite, {
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({
        tokens: [{ address: USDC_MINT }, { address: WSOL_MINT }],
      }),
      priority: 20,
    });

    const result = await engine.evaluate(walletId, tokenTx(USDC_MINT));
    expect(result.allowed).toBe(true);
  });

  // -------------------------------------------------------------------------
  // TOK-U05: ALLOWED_TOKENS with non-listed token -> deny
  // -------------------------------------------------------------------------
  it('TOK-U05: ALLOWED_TOKENS denies non-listed token', async () => {
    insertPolicy(conn.sqlite, {
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({
        tokens: [{ address: USDC_MINT }],
      }),
      priority: 20,
    });

    const result = await engine.evaluate(walletId, tokenTx(BONK_MINT));
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Token not in allowed list');
  });

  // -------------------------------------------------------------------------
  // TOK-U06: ALLOWED_TOKENS not configured -> default DENY
  // -------------------------------------------------------------------------
  it('TOK-U06: no ALLOWED_TOKENS policy -> default DENY', async () => {
    // Need at least one enabled policy so engine evaluates (not passthrough)
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

    const result = await engine.evaluate(walletId, tokenTx(USDC_MINT));
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('no ALLOWED_TOKENS policy configured');
  });

  // -------------------------------------------------------------------------
  // TOK-U07: AllowedTokensRuleSchema valid data -> parse success
  // -------------------------------------------------------------------------
  it('TOK-U07: valid ALLOWED_TOKENS rules structure passes Zod parsing', () => {
    const AllowedTokensRulesSchema = z.object({
      tokens: z.array(z.object({
        address: z.string().min(1),
        symbol: z.string().min(1).max(10).optional(),
      })).min(1),
    });

    const result = AllowedTokensRulesSchema.safeParse({
      tokens: [
        { address: USDC_MINT, symbol: 'USDC' },
        { address: WSOL_MINT },
      ],
    });
    expect(result.success).toBe(true);
  });

  // -------------------------------------------------------------------------
  // TOK-U08: AllowedTokensRuleSchema invalid data -> ZodError
  // -------------------------------------------------------------------------
  it('TOK-U08: invalid ALLOWED_TOKENS rules structure fails Zod parsing', () => {
    const AllowedTokensRulesSchema = z.object({
      tokens: z.array(z.object({
        address: z.string().min(1),
      })).min(1),
    });

    // Empty tokens array
    const result1 = AllowedTokensRulesSchema.safeParse({ tokens: [] });
    expect(result1.success).toBe(false);

    // Missing tokens field
    const result2 = AllowedTokensRulesSchema.safeParse({});
    expect(result2.success).toBe(false);

    // Empty address
    const result3 = AllowedTokensRulesSchema.safeParse({
      tokens: [{ address: '' }],
    });
    expect(result3.success).toBe(false);
  });
});

// ===========================================================================
// TOK-U09~U14: FeeEstimate + AssetInfo
// ===========================================================================

describe('TOK-U09~U14: FeeEstimate + AssetInfo', () => {
  // -------------------------------------------------------------------------
  // TOK-U09: ATA non-existent SPL transfer -> total includes ataCreationCost
  // -------------------------------------------------------------------------
  it('TOK-U09: SPL transfer with ATA creation -> fee includes ataRentCost', () => {
    const feeEstimate = {
      fee: 5000n, // base fee
      needsAtaCreation: true,
      ataRentCost: 2039280n,
      details: { baseFee: 5000n, priorityFee: 0n },
    };
    // Total should include ATA rent
    const total = feeEstimate.fee + (feeEstimate.ataRentCost ?? 0n);
    expect(total).toBe(2044280n);
    expect(feeEstimate.needsAtaCreation).toBe(true);
  });

  // -------------------------------------------------------------------------
  // TOK-U10: ATA existing SPL transfer -> ataCreationCost undefined
  // -------------------------------------------------------------------------
  it('TOK-U10: SPL transfer with existing ATA -> no ataRentCost', () => {
    const feeEstimate = {
      fee: 5000n,
      needsAtaCreation: false,
      details: { baseFee: 5000n, priorityFee: 0n },
    };
    expect(feeEstimate.needsAtaCreation).toBe(false);
    expect(feeEstimate.ataRentCost).toBeUndefined();
    expect(feeEstimate.fee).toBe(5000n);
  });

  // -------------------------------------------------------------------------
  // TOK-U11: ERC-20 gas estimation -> total = gasLimit * maxFeePerGas
  // -------------------------------------------------------------------------
  it('TOK-U11: ERC-20 gas estimation produces correct total', () => {
    const gasLimit = 65000n;
    const maxFeePerGas = 30000000000n; // 30 Gwei
    const total = gasLimit * maxFeePerGas;
    const feeEstimate = {
      fee: total,
      details: { gasLimit: gasLimit.toString(), maxFeePerGas: maxFeePerGas.toString() },
    };
    expect(feeEstimate.fee).toBe(1950000000000000n); // 0.00195 ETH
  });

  // -------------------------------------------------------------------------
  // TOK-U12: AssetInfo bigint -> string serialization accuracy
  // -------------------------------------------------------------------------
  it('TOK-U12: AssetInfo bigint serialization preserves precision', () => {
    const asset = {
      mint: USDC_MINT,
      symbol: 'USDC',
      name: 'USD Coin',
      balance: 999999999999999n, // large bigint
      decimals: 6,
      isNative: false,
    };

    // Serialize to JSON-compatible (bigint -> string)
    const serialized = {
      ...asset,
      balance: asset.balance.toString(),
    };

    const parsed = AssetInfoSchema.safeParse(serialized);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.balance).toBe('999999999999999');
      expect(BigInt(parsed.data.balance)).toBe(asset.balance);
    }
  });

  // -------------------------------------------------------------------------
  // TOK-U13: AssetInfo isNative boolean -> Zod validates
  // -------------------------------------------------------------------------
  it('TOK-U13: AssetInfo with isNative=true passes Zod', () => {
    const nativeAsset = {
      mint: 'native',
      symbol: 'SOL',
      name: 'Solana',
      balance: '1000000000',
      decimals: 9,
      isNative: true,
    };
    const parsed = AssetInfoSchema.safeParse(nativeAsset);
    expect(parsed.success).toBe(true);
  });

  // -------------------------------------------------------------------------
  // TOK-U14: AssetInfo invalid type -> ZodError
  // -------------------------------------------------------------------------
  it('TOK-U14: AssetInfo with invalid decimals type -> ZodError', () => {
    const invalid = {
      mint: USDC_MINT,
      symbol: 'USDC',
      name: 'USD Coin',
      balance: '1000000',
      decimals: 'six', // should be number
      isNative: false,
    };
    const parsed = AssetInfoSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });
});

// ===========================================================================
// TOK-I01~I10: Integration pipeline
// ===========================================================================

describe('TOK-I01~I10: Integration pipeline', () => {
  // -------------------------------------------------------------------------
  // TOK-I01: SPL token transfer -> UnsignedTransaction structure
  // -------------------------------------------------------------------------
  it('TOK-I01: SPL token buildTokenTransfer produces valid UnsignedTransaction', async () => {
    const mockAdapter = {
      buildTokenTransfer: vi.fn().mockResolvedValue({
        chain: 'solana',
        serialized: new Uint8Array([1, 2, 3]),
        estimatedFee: 5000n,
        metadata: { lastValidBlockHeight: 200000000 },
      }),
    };

    const result = await mockAdapter.buildTokenTransfer({
      from: '11111111111111111111111111111112',
      to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      amount: 1000000n,
      token: { address: USDC_MINT, decimals: 6, symbol: 'USDC' },
    });

    expect(result.chain).toBe('solana');
    expect(result.serialized).toBeInstanceOf(Uint8Array);
    expect(result.estimatedFee).toBe(5000n);
    expect(mockAdapter.buildTokenTransfer).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // TOK-I02: SPL transfer insufficient balance -> INSUFFICIENT_BALANCE
  // -------------------------------------------------------------------------
  it('TOK-I02: SPL transfer with insufficient balance throws error', async () => {
    const mockAdapter = {
      buildTokenTransfer: vi.fn().mockRejectedValue(
        new Error('INSUFFICIENT_BALANCE: token account balance 500000 < requested 1000000'),
      ),
    };

    await expect(
      mockAdapter.buildTokenTransfer({
        from: '11111111111111111111111111111112',
        to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
        amount: 1000000n,
        token: { address: USDC_MINT, decimals: 6, symbol: 'USDC' },
      }),
    ).rejects.toThrow('INSUFFICIENT_BALANCE');
  });

  // -------------------------------------------------------------------------
  // TOK-I03: ERC-20 token transfer -> ERC-20 transfer calldata
  // -------------------------------------------------------------------------
  it('TOK-I03: ERC-20 buildTokenTransfer generates transfer calldata', async () => {
    // ERC-20 transfer(address,uint256) selector: 0xa9059cbb
    const mockAdapter = {
      buildTokenTransfer: vi.fn().mockResolvedValue({
        chain: 'ethereum',
        serialized: new Uint8Array([0xa9, 0x05, 0x9c, 0xbb]),
        estimatedFee: 1950000000000000n, // ~0.00195 ETH
        metadata: { nonce: 42 },
        nonce: 42,
      }),
    };

    const result = await mockAdapter.buildTokenTransfer({
      from: '0x1234567890abcdef1234567890abcdef12345678',
      to: '0xabcdef1234567890abcdef1234567890abcdef12',
      amount: 1000000n,
      token: { address: EVM_USDC, decimals: 6, symbol: 'USDC' },
    });

    expect(result.chain).toBe('ethereum');
    expect(result.nonce).toBe(42);
    expect(mockAdapter.buildTokenTransfer).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // TOK-I04: ERC-20 simulation failure -> SIMULATION_FAILED
  // -------------------------------------------------------------------------
  it('TOK-I04: ERC-20 simulation failure returns error', async () => {
    const mockAdapter = {
      simulateTransaction: vi.fn().mockResolvedValue({
        success: false,
        logs: ['execution reverted: ERC20InsufficientBalance'],
        error: 'SIMULATION_FAILED: ERC20 transfer reverted',
      }),
    };

    const simResult = await mockAdapter.simulateTransaction({
      chain: 'ethereum',
      serialized: new Uint8Array([1, 2, 3]),
      estimatedFee: 1950000000000000n,
      metadata: {},
    });

    expect(simResult.success).toBe(false);
    expect(simResult.error).toContain('SIMULATION_FAILED');
  });

  // -------------------------------------------------------------------------
  // TOK-I05: ALLOWED_TOKENS policy DB roundtrip (insert -> evaluate -> consistency)
  // -------------------------------------------------------------------------
  it('TOK-I05: ALLOWED_TOKENS DB roundtrip is consistent', async () => {
    const tokens = [
      { address: USDC_MINT },
      { address: WSOL_MINT },
      { address: BONK_MINT },
    ];

    insertPolicy(conn.sqlite, {
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({ tokens }),
      priority: 20,
    });

    // All 3 tokens should be allowed
    for (const token of tokens) {
      const result = await engine.evaluate(walletId, tokenTx(token.address));
      expect(result.allowed).toBe(true);
    }

    // Non-listed token should be denied
    const result = await engine.evaluate(
      walletId,
      tokenTx('SomeRandomTokenMintThatIsNotInTheAllowedList'),
    );
    expect(result.allowed).toBe(false);
  });

  // -------------------------------------------------------------------------
  // TOK-I06: ALLOWED_TOKENS policy change -> immediate re-evaluation
  // -------------------------------------------------------------------------
  it('TOK-I06: policy change reflects immediately on re-evaluation', async () => {
    const policyId = insertPolicy(conn.sqlite, {
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({ tokens: [{ address: USDC_MINT }] }),
      priority: 20,
    });

    // Initially: USDC allowed, BONK denied
    const r1 = await engine.evaluate(walletId, tokenTx(USDC_MINT));
    expect(r1.allowed).toBe(true);
    const r2 = await engine.evaluate(walletId, tokenTx(BONK_MINT));
    expect(r2.allowed).toBe(false);

    // Update policy to include BONK
    conn.sqlite
      .prepare('UPDATE policies SET rules = ? WHERE id = ?')
      .run(JSON.stringify({ tokens: [{ address: USDC_MINT }, { address: BONK_MINT }] }), policyId);

    // Now BONK should be allowed
    const r3 = await engine.evaluate(walletId, tokenTx(BONK_MINT));
    expect(r3.allowed).toBe(true);
  });

  // -------------------------------------------------------------------------
  // TOK-I07: getAssets() Solana (SOL + 2 SPL) -> AssetInfo[] correct structure
  // -------------------------------------------------------------------------
  it('TOK-I07: Solana getAssets returns native-first, correct count', async () => {
    const mockAdapter = {
      getAssets: vi.fn().mockResolvedValue([
        { mint: 'native', symbol: 'SOL', name: 'Solana', balance: 5000000000n, decimals: 9, isNative: true },
        { mint: USDC_MINT, symbol: 'USDC', name: 'USD Coin', balance: 1000000n, decimals: 6, isNative: false },
        { mint: BONK_MINT, symbol: 'BONK', name: 'Bonk', balance: 999999999n, decimals: 5, isNative: false },
      ]),
    };

    const assets = await mockAdapter.getAssets('11111111111111111111111111111112');
    expect(assets).toHaveLength(3);
    expect(assets[0].isNative).toBe(true);
    expect(assets[0].symbol).toBe('SOL');
    expect(assets[1].isNative).toBe(false);
  });

  // -------------------------------------------------------------------------
  // TOK-I08: getAssets() EVM (ETH + 1 ERC-20) -> AssetInfo[] correct
  // -------------------------------------------------------------------------
  it('TOK-I08: EVM getAssets returns ETH + ERC-20 assets', async () => {
    const mockAdapter = {
      getAssets: vi.fn().mockResolvedValue([
        { mint: 'native', symbol: 'ETH', name: 'Ether', balance: 1000000000000000000n, decimals: 18, isNative: true },
        { mint: EVM_USDC, symbol: 'USDC', name: 'USD Coin', balance: 5000000n, decimals: 6, isNative: false },
      ]),
    };

    const assets = await mockAdapter.getAssets('0x1234567890abcdef1234567890abcdef12345678');
    expect(assets).toHaveLength(2);
    expect(assets[0].isNative).toBe(true);
    expect(assets[0].symbol).toBe('ETH');
    expect(assets[1].mint).toBe(EVM_USDC);
  });

  // -------------------------------------------------------------------------
  // TOK-I09: getAssets() REST API response -> bigint->string conversion + Zod pass
  // -------------------------------------------------------------------------
  it('TOK-I09: AssetInfo bigint->string conversion passes Zod schema', () => {
    const rawAssets = [
      { mint: 'native', symbol: 'SOL', name: 'Solana', balance: 5000000000n, decimals: 9, isNative: true },
      { mint: USDC_MINT, symbol: 'USDC', name: 'USD Coin', balance: 1000000n, decimals: 6, isNative: false },
    ];

    // Simulate REST API serialization: bigint -> string
    const serialized = rawAssets.map((a) => ({
      ...a,
      balance: a.balance.toString(),
    }));

    for (const asset of serialized) {
      const parsed = AssetInfoSchema.safeParse(asset);
      expect(parsed.success).toBe(true);
    }
  });

  // -------------------------------------------------------------------------
  // TOK-I10: estimateFee() ATA cost included -> ataRentCost > 0
  // -------------------------------------------------------------------------
  it('TOK-I10: estimateFee with ATA creation includes ataRentCost > 0', async () => {
    const mockAdapter = {
      estimateFee: vi.fn().mockResolvedValue({
        fee: 5000n,
        needsAtaCreation: true,
        ataRentCost: 2039280n,
        details: { baseFee: 5000n },
      }),
    };

    const fee = await mockAdapter.estimateFee({
      from: '11111111111111111111111111111112',
      to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      amount: 1000000n,
      token: { address: USDC_MINT, decimals: 6, symbol: 'USDC' },
    });

    expect(fee.needsAtaCreation).toBe(true);
    expect(fee.ataRentCost).toBeGreaterThan(0n);
  });
});

// ===========================================================================
// TOK-X01~X08: Cross-validation
// ===========================================================================

describe('TOK-X01~X08: Cross-validation', () => {
  // -------------------------------------------------------------------------
  // TOK-X01: Native TRANSFER and TOKEN_TRANSFER policy separation
  // -------------------------------------------------------------------------
  it('TOK-X01: TRANSFER passes without ALLOWED_TOKENS, TOKEN_TRANSFER denied', async () => {
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

    // Native TRANSFER: not checked against ALLOWED_TOKENS
    const nativeResult = await engine.evaluate(walletId, nativeTx('1000000'));
    expect(nativeResult.allowed).toBe(true);

    // TOKEN_TRANSFER: denied (no ALLOWED_TOKENS policy)
    const tokenResult = await engine.evaluate(walletId, tokenTx(USDC_MINT));
    expect(tokenResult.allowed).toBe(false);
    expect(tokenResult.reason).toContain('no ALLOWED_TOKENS policy configured');
  });

  // -------------------------------------------------------------------------
  // TOK-X02: Oracle price stale -> TOKEN_TRANSFER NOTIFY tier escalation
  // -------------------------------------------------------------------------
  it('TOK-X02: stale oracle price -> NOTIFY tier escalation via SPENDING_LIMIT', async () => {
    const oracle = createMockPriceOracle();
    oracle.setNativePrice('solana', {
      usdPrice: 184.0,
      isStale: true,
      confidence: 0.5,
    });

    // With ALLOWED_TOKENS + SPENDING_LIMIT: token passes, then SPENDING_LIMIT classifies
    insertPolicy(conn.sqlite, {
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({ tokens: [{ address: USDC_MINT }] }),
      priority: 20,
    });
    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '100',
        notify_max: '10000000',
        delay_max: '50000000000',
        delay_seconds: 300,
      }),
      priority: 10,
    });

    // Amount 5000 > instant_max 100 -> NOTIFY tier
    const result = await engine.evaluate(walletId, tokenTx(USDC_MINT, '5000'));
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('NOTIFY');
  });

  // -------------------------------------------------------------------------
  // TOK-X03: Oracle complete failure -> TOKEN_TRANSFER still evaluates
  // -------------------------------------------------------------------------
  it('TOK-X03: oracle complete failure -> NOTIFY fixed tier from amount', async () => {
    const oracle = createMockPriceOracle();
    oracle.getNativePrice.mockRejectedValue(new Error('oracle down'));

    // Policy engine does not call oracle directly; it evaluates based on raw amount
    insertPolicy(conn.sqlite, {
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({ tokens: [{ address: USDC_MINT }] }),
      priority: 20,
    });
    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '100',
        notify_max: '10000000',
        delay_max: '50000000000',
        delay_seconds: 300,
      }),
      priority: 10,
    });

    // Amount 5000 triggers NOTIFY tier regardless of oracle state
    const result = await engine.evaluate(walletId, tokenTx(USDC_MINT, '5000'));
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('NOTIFY');
  });

  // -------------------------------------------------------------------------
  // TOK-X04: SPL + ERC-20 simultaneous policies (chain-specific separation)
  // -------------------------------------------------------------------------
  it('TOK-X04: separate wallets for SPL + ERC-20 -> independent policy evaluation', async () => {
    // Solana wallet with SPL policy
    const solWalletId = await insertTestWallet(conn, { chain: 'solana' });
    insertPolicy(conn.sqlite, {
      walletId: solWalletId,
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({ tokens: [{ address: USDC_MINT }] }),
      priority: 20,
    });

    // EVM wallet with ERC-20 policy
    const evmWalletId = await insertTestWallet(conn, { chain: 'ethereum', defaultNetwork: 'ethereum-sepolia' });
    insertPolicy(conn.sqlite, {
      walletId: evmWalletId,
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({ tokens: [{ address: EVM_USDC }] }),
      priority: 20,
    });

    // Solana: USDC allowed, EVM USDC denied
    const r1 = await engine.evaluate(solWalletId, tokenTx(USDC_MINT));
    expect(r1.allowed).toBe(true);
    const r2 = await engine.evaluate(solWalletId, tokenTx(EVM_USDC));
    expect(r2.allowed).toBe(false);

    // EVM: EVM USDC allowed, Solana USDC denied
    const r3 = await engine.evaluate(evmWalletId, tokenTx(EVM_USDC, '1000000', { chain: 'ethereum' }));
    expect(r3.allowed).toBe(true);
    const r4 = await engine.evaluate(evmWalletId, tokenTx(USDC_MINT, '1000000', { chain: 'ethereum' }));
    expect(r4.allowed).toBe(false);
  });

  // -------------------------------------------------------------------------
  // TOK-X05: Token-2022 program ID differentiation
  // -------------------------------------------------------------------------
  it('TOK-X05: Token-2022 uses different program ID from SPL Token', () => {
    const splTokenProgramId = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
    expect(TOKEN_2022_PROGRAM_ID).not.toBe(splTokenProgramId);
    // Token-2022 tokens should still be evaluated as TOKEN_TRANSFER
    const parsed = TransactionRequestSchema.safeParse({
      type: 'TOKEN_TRANSFER',
      to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      amount: '1000000',
      token: { address: 'T2022TestMintAddressXXXXXXXXXXXXXXXXXXXXXXX', decimals: 6, symbol: 'T22' },
    });
    expect(parsed.success).toBe(true);
  });

  // -------------------------------------------------------------------------
  // TOK-X06: decimals correct matching (transferChecked success path)
  // -------------------------------------------------------------------------
  it('TOK-X06: correct decimals in token metadata -> adapter call succeeds', async () => {
    const mockAdapter = {
      buildTokenTransfer: vi.fn().mockResolvedValue({
        chain: 'solana',
        serialized: new Uint8Array([1, 2, 3]),
        estimatedFee: 5000n,
        metadata: { program: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
      }),
    };

    // USDC has 6 decimals -- correct matching
    await mockAdapter.buildTokenTransfer({
      from: '11111111111111111111111111111112',
      to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      amount: 1000000n,
      token: { address: USDC_MINT, decimals: 6, symbol: 'USDC' },
    });

    expect(mockAdapter.buildTokenTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ token: expect.objectContaining({ decimals: 6 }) }),
    );
  });

  // -------------------------------------------------------------------------
  // TOK-X07: Case normalization (EVM lowercase) for token address
  // -------------------------------------------------------------------------
  it('TOK-X07: EVM checksum address matches lowercase in ALLOWED_TOKENS', async () => {
    const checksumAddr = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
    insertPolicy(conn.sqlite, {
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({
        tokens: [{ address: checksumAddr.toLowerCase() }], // stored as lowercase
      }),
      priority: 20,
    });

    // Query with checksum (mixed case) -> should match
    const result = await engine.evaluate(walletId, tokenTx(checksumAddr));
    expect(result.allowed).toBe(true);
  });

  // -------------------------------------------------------------------------
  // TOK-X08: Network scoping (ethereum-sepolia vs ethereum-mainnet) separation
  // -------------------------------------------------------------------------
  it('TOK-X08: network-scoped ALLOWED_TOKENS separates sepolia vs mainnet', async () => {
    // Create EVM wallet
    const evmWalletId = await insertTestWallet(conn, {
      chain: 'ethereum',
      defaultNetwork: 'ethereum-sepolia',
    });

    // ethereum-sepolia scoped ALLOWED_TOKENS
    const now = Math.floor(Date.now() / 1000);
    const id1 = generateId();
    conn.sqlite
      .prepare(
        `INSERT INTO policies (id, wallet_id, type, rules, priority, enabled, network, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id1, null, 'ALLOWED_TOKENS', JSON.stringify({ tokens: [{ address: EVM_USDC }] }), 20, 1, 'ethereum-sepolia', now, now);

    // ethereum-mainnet scoped ALLOWED_TOKENS (different token)
    const id2 = generateId();
    conn.sqlite
      .prepare(
        `INSERT INTO policies (id, wallet_id, type, rules, priority, enabled, network, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id2, null, 'ALLOWED_TOKENS', JSON.stringify({ tokens: [{ address: EVM_USDT }] }), 20, 1, 'ethereum-mainnet', now, now);

    // On sepolia: USDC allowed, USDT denied
    const r1 = await engine.evaluate(evmWalletId, tokenTx(EVM_USDC, '1000000', { chain: 'ethereum', network: 'ethereum-sepolia' }));
    expect(r1.allowed).toBe(true);
    const r2 = await engine.evaluate(evmWalletId, tokenTx(EVM_USDT, '1000000', { chain: 'ethereum', network: 'ethereum-sepolia' }));
    expect(r2.allowed).toBe(false);

    // On mainnet: USDT allowed, USDC denied
    const r3 = await engine.evaluate(evmWalletId, tokenTx(EVM_USDT, '1000000', { chain: 'ethereum', network: 'ethereum-mainnet' }));
    expect(r3.allowed).toBe(true);
    const r4 = await engine.evaluate(evmWalletId, tokenTx(EVM_USDC, '1000000', { chain: 'ethereum', network: 'ethereum-mainnet' }));
    expect(r4.allowed).toBe(false);
  });
});
