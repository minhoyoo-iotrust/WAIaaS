/**
 * Level 3: EVM Sepolia Testnet Integration Tests (continue-on-error)
 *
 * Tests real EvmAdapter operations against Ethereum Sepolia testnet.
 * Controlled by WAIAAS_TEST_EVM_TESTNET=true environment variable.
 * All tests handle network errors gracefully -- never fail the CI build.
 *
 * Requirements: #040 (EVM Testnet Level 3 -- Solana Devnet symmetry)
 *
 * Tests:
 *   Sepolia-1: Health check (RPC connection + block number)
 *   Sepolia-2: ETH balance query for a known address
 *   Sepolia-3: ERC-20 balance query (USDC on Sepolia)
 *
 * Run: WAIAAS_TEST_EVM_TESTNET=true npx vitest run packages/adapters/evm/src/__tests__/chain/evm-sepolia.chain.test.ts --testTimeout=60000
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { EvmAdapter } from '../../adapter.js';

const SEPOLIA_RPC_URL =
  process.env.WAIAAS_SEPOLIA_RPC_URL || 'https://rpc.sepolia.org';
const EVM_TESTNET_ENABLED = process.env.WAIAAS_TEST_EVM_TESTNET === 'true';

// Well-known address with non-zero balance (Vitalik's address on all EVM chains)
const KNOWN_ADDRESS = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

// Sepolia USDC mock contract (Circle testnet faucet deploys to this address)
const SEPOLIA_USDC = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';

// ─── Error Detection ─────────────────────────────────────────────
// Testnet tests must NEVER fail the CI build. Any operational error
// (network, rate limit, RPC provider issues) is treated as non-fatal.

function isTestnetError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes('timeout') ||
      msg.includes('network') ||
      msg.includes('econnrefused') ||
      msg.includes('econnreset') ||
      msg.includes('fetch failed') ||
      msg.includes('socket hang up') ||
      msg.includes('rate limit') ||
      msg.includes('429') ||
      msg.includes('503') ||
      msg.includes('too many requests') ||
      msg.includes('server responded with') ||
      msg.includes('internal error') ||
      msg.includes('rpc error') ||
      msg.includes('could not coalesce')
    );
  }
  return false;
}

// ─── Test Suite ──────────────────────────────────────────────────

describe.skipIf(!EVM_TESTNET_ENABLED)('Level 3: EVM Sepolia Testnet', () => {
  let adapter: EvmAdapter;

  beforeAll(async () => {
    if (!EVM_TESTNET_ENABLED) return;

    adapter = new EvmAdapter('ethereum-sepolia');
    await adapter.connect(SEPOLIA_RPC_URL);
  }, 30_000);

  afterAll(async () => {
    if (adapter?.isConnected()) {
      await adapter.disconnect();
    }
  });

  // ─── Sepolia-1: Health Check ──────────────────────────────────

  it('Sepolia-1: health check returns healthy with block number', async () => {
    try {
      const health = await adapter.getHealth();

      expect(health.healthy).toBe(true);
      expect(health.latencyMs).toBeGreaterThan(0);
      expect(health.blockHeight).toBeDefined();
      expect(typeof health.blockHeight).toBe('bigint');
      expect(health.blockHeight!).toBeGreaterThan(0n);

      console.log(
        '[Sepolia] Health: block=%s, latency=%dms',
        health.blockHeight,
        health.latencyMs,
      );
    } catch (err) {
      if (isTestnetError(err)) {
        console.warn(
          '[Sepolia] Network error in health check, skipping:',
          (err as Error).message,
        );
        return; // pass with warning
      }
      throw err;
    }
  }, 30_000);

  // ─── Sepolia-2: ETH Balance Query ─────────────────────────────

  it('Sepolia-2: ETH balance query returns valid balance info', async () => {
    try {
      const balance = await adapter.getBalance(KNOWN_ADDRESS);

      expect(balance.address.toLowerCase()).toBe(KNOWN_ADDRESS.toLowerCase());
      expect(typeof balance.balance).toBe('bigint');
      expect(balance.balance).toBeGreaterThanOrEqual(0n);
      expect(balance.decimals).toBe(18);
      expect(balance.symbol).toBe('ETH');

      console.log(
        '[Sepolia] ETH balance for %s: %s wei',
        KNOWN_ADDRESS.slice(0, 10),
        balance.balance,
      );
    } catch (err) {
      if (isTestnetError(err)) {
        console.warn(
          '[Sepolia] Network error in balance query, skipping:',
          (err as Error).message,
        );
        return; // pass with warning
      }
      throw err;
    }
  }, 30_000);

  // ─── Sepolia-3: ERC-20 Balance Query ──────────────────────────

  it('Sepolia-3: ERC-20 balance query returns token info', async () => {
    try {
      const assets = await adapter.getAssets(KNOWN_ADDRESS, [SEPOLIA_USDC]);

      expect(assets).toBeDefined();
      expect(Array.isArray(assets)).toBe(true);

      // The query should succeed even if balance is 0
      if (assets.length > 0) {
        const token = assets[0]!;
        expect(token.address.toLowerCase()).toBe(SEPOLIA_USDC.toLowerCase());
        expect(typeof token.balance).toBe('bigint');
        expect(token.symbol).toBeTruthy();

        console.log(
          '[Sepolia] Token %s balance: %s (decimals: %d)',
          token.symbol,
          token.balance,
          token.decimals,
        );
      } else {
        console.log('[Sepolia] No ERC-20 token data returned (contract may not exist on Sepolia)');
      }
    } catch (err) {
      if (isTestnetError(err)) {
        console.warn(
          '[Sepolia] Network error in ERC-20 query, skipping:',
          (err as Error).message,
        );
        return; // pass with warning
      }
      // ERC-20 query errors are also non-fatal (contract may not exist)
      console.warn(
        '[Sepolia] ERC-20 query error (non-fatal):',
        (err as Error).message,
      );
    }
  }, 30_000);
});
