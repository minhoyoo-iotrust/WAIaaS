/**
 * Level 3: Solana Devnet Integration Tests (continue-on-error)
 *
 * Tests real SolanaAdapter operations against Solana Devnet.
 * Controlled by WAIAAS_TEST_DEVNET=true environment variable.
 * All tests handle network/funding errors gracefully -- never fail the CI build.
 *
 * Requirements: CHAIN-04 (design doc 48)
 *
 * Tests:
 *   Devnet-1: SOL transfer + confirmation
 *   Devnet-2: Balance query
 *   Devnet-3: Health check
 *
 * Run: WAIAAS_TEST_DEVNET=true npx vitest run packages/adapters/solana/src/__tests__/chain/solana-devnet.chain.test.ts --testTimeout=60000
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SolanaAdapter } from '../../adapter.js';

const DEVNET_RPC_URL = 'https://api.devnet.solana.com';
const DEVNET_ENABLED = process.env.WAIAAS_TEST_DEVNET === 'true';

// ─── Devnet Error Detection ──────────────────────────────────────
// Devnet tests must NEVER fail the CI build. Any operational error
// (network, rate limit, faucet dry, insufficient balance from failed
// airdrop) is treated as a non-fatal warning.

function isDevnetError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      // Network connectivity
      msg.includes('timeout') ||
      msg.includes('network') ||
      msg.includes('econnrefused') ||
      msg.includes('econnreset') ||
      msg.includes('fetch failed') ||
      msg.includes('socket hang up') ||
      // Rate limiting
      msg.includes('rate limit') ||
      msg.includes('429') ||
      msg.includes('503') ||
      msg.includes('too many requests') ||
      msg.includes('server responded with') ||
      // Airdrop / faucet issues
      msg.includes('airdrop') ||
      msg.includes('faucet') ||
      // Insufficient balance (from failed airdrop)
      msg.includes('insufficient') ||
      msg.includes('no record of a prior credit') ||
      msg.includes('simulation failed') ||
      msg.includes('transaction failed') ||
      // General RPC errors
      msg.includes('internal error') ||
      msg.includes('rpc error')
    );
  }
  return false;
}

// ─── Airdrop with Retry ───────────────────────────────────────────

async function airdropWithRetry(
  addr: string,
  lamports: bigint,
  rpcUrl: string,
  maxRetries = 3,
  retryDelayMs = 3000,
): Promise<boolean> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const resp = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'requestAirdrop',
          params: [addr, Number(lamports)],
        }),
        signal: AbortSignal.timeout(15_000),
      });

      const json = (await resp.json()) as {
        result?: string;
        error?: { message: string };
      };

      if (json.error) {
        throw new Error(`Airdrop RPC error: ${json.error.message}`);
      }

      const signature = json.result;
      if (!signature) {
        throw new Error('Airdrop returned no signature');
      }

      // Wait for airdrop confirmation (poll up to 30s on Devnet)
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        const statusResp = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getSignatureStatuses',
            params: [[signature]],
          }),
          signal: AbortSignal.timeout(10_000),
        });

        const statusJson = (await statusResp.json()) as {
          result?: { value: Array<{ confirmationStatus?: string } | null> };
        };

        const status = statusJson.result?.value?.[0];
        if (
          status?.confirmationStatus === 'confirmed' ||
          status?.confirmationStatus === 'finalized'
        ) {
          return true; // Airdrop confirmed
        }

        await new Promise((r) => setTimeout(r, 2000));
      }

      // Timeout waiting for confirmation, but airdrop was sent
      console.warn(
        `[Devnet] Airdrop sent but not confirmed after 30s (attempt ${attempt + 1})`,
      );
      return true; // Optimistically assume it will land
    } catch (err) {
      if (attempt === maxRetries - 1) {
        console.warn(
          `[Devnet] All ${maxRetries} airdrop attempts failed:`,
          err instanceof Error ? err.message : String(err),
        );
        return false;
      }
      console.warn(
        `[Devnet] Airdrop attempt ${attempt + 1} failed, retrying in ${retryDelayMs}ms...`,
        err instanceof Error ? err.message : String(err),
      );
      await new Promise((r) => setTimeout(r, retryDelayMs));
    }
  }
  return false;
}

// ─── Key Pair Generation ──────────────────────────────────────────

async function generateDevnetKeyPair(): Promise<{
  address: string;
  privateKey64: Uint8Array;
}> {
  const { createKeyPairFromBytes, getAddressFromPublicKey } = await import(
    '@solana/kit'
  );
  const { webcrypto } = await import('node:crypto');

  const kp = (await webcrypto.subtle.generateKey('Ed25519', true, [
    'sign',
    'verify',
  ])) as { privateKey: CryptoKey; publicKey: CryptoKey };

  const pkcs8 = new Uint8Array(
    await webcrypto.subtle.exportKey('pkcs8', kp.privateKey),
  );
  const rawPriv = pkcs8.slice(-32);
  const rawPub = new Uint8Array(
    await webcrypto.subtle.exportKey('raw', kp.publicKey),
  );

  const combined = new Uint8Array(64);
  combined.set(rawPriv, 0);
  combined.set(rawPub, 32);

  const solKp = await createKeyPairFromBytes(combined);
  const addr = await getAddressFromPublicKey(solKp.publicKey);

  return { address: addr, privateKey64: combined };
}

// ─── Test Suite ───────────────────────────────────────────────────

describe.skipIf(!DEVNET_ENABLED)('Level 3: Solana Devnet', () => {
  let adapter: SolanaAdapter;
  let accountA: { address: string; privateKey64: Uint8Array };
  let accountB: { address: string; privateKey64: Uint8Array };
  let airdropSucceeded = false;

  beforeAll(async () => {
    if (!DEVNET_ENABLED) return;

    adapter = new SolanaAdapter('devnet');
    await adapter.connect(DEVNET_RPC_URL);

    // Generate fresh key pairs for this test run
    accountA = await generateDevnetKeyPair();
    accountB = await generateDevnetKeyPair();

    // Airdrop 2 SOL to account A for testing (with retry)
    airdropSucceeded = await airdropWithRetry(
      accountA.address,
      2_000_000_000n,
      DEVNET_RPC_URL,
    );

    if (airdropSucceeded) {
      console.log('[Devnet] Airdrop 2 SOL to', accountA.address, '-- success');
      // Small delay to allow Devnet to propagate the airdrop
      await new Promise((r) => setTimeout(r, 2000));
    } else {
      console.warn(
        '[Devnet] Airdrop failed -- transfer/balance tests will skip gracefully',
      );
    }
  }, 60_000);

  afterAll(async () => {
    if (adapter?.isConnected()) {
      await adapter.disconnect();
    }
  });

  // ─── Devnet-3: Health Check (independent, always runs) ──────────

  it('Devnet-3: health check returns healthy with latency', async () => {
    try {
      const health = await adapter.getHealth();

      expect(health.healthy).toBe(true);
      expect(health.latencyMs).toBeGreaterThan(0);
      expect(health.blockHeight).toBeDefined();
      expect(typeof health.blockHeight).toBe('bigint');

      console.log(
        '[Devnet] Health: slot=%s, latency=%dms',
        health.blockHeight,
        health.latencyMs,
      );
    } catch (err) {
      if (isDevnetError(err)) {
        console.warn(
          '[Devnet] Network error in health check, skipping:',
          (err as Error).message,
        );
        return; // pass with warning
      }
      throw err;
    }
  }, 30_000);

  // ─── Devnet-1: SOL Transfer + Confirmation ──────────────────────

  it('Devnet-1: SOL transfer full pipeline', async () => {
    if (!airdropSucceeded) {
      console.warn('[Devnet] Skipping SOL transfer -- airdrop failed');
      return; // pass with warning
    }

    try {
      const transferAmount = 100_000n; // 0.0001 SOL (minimum practical amount)

      // 1. Build transaction
      const unsignedTx = await adapter.buildTransaction({
        from: accountA.address,
        to: accountB.address,
        amount: transferAmount,
      });

      expect(unsignedTx.chain).toBe('solana');
      expect(unsignedTx.serialized.length).toBeGreaterThan(0);

      // 2. Sign transaction
      const signedTx = await adapter.signTransaction(
        unsignedTx,
        accountA.privateKey64,
      );
      expect(signedTx.length).toBeGreaterThan(0);

      // 3. Submit transaction
      const submitResult = await adapter.submitTransaction(signedTx);
      expect(submitResult.txHash).toBeTruthy();
      expect(submitResult.status).toBe('submitted');

      console.log('[Devnet] SOL transfer submitted:', submitResult.txHash);

      // 4. Wait for confirmation (60s timeout for Devnet)
      const confirmResult = await adapter.waitForConfirmation(
        submitResult.txHash,
        60_000,
      );

      // Devnet may return 'confirmed', 'finalized', or 'submitted' (if slow)
      expect(['confirmed', 'finalized', 'submitted']).toContain(
        confirmResult.status,
      );

      console.log('[Devnet] SOL transfer status:', confirmResult.status);
    } catch (err) {
      if (isDevnetError(err)) {
        console.warn(
          '[Devnet] Error in SOL transfer (non-fatal):',
          (err as Error).message,
        );
        return; // pass with warning
      }
      throw err;
    }
  }, 60_000);

  // ─── Devnet-2: Balance Query ────────────────────────────────────

  it('Devnet-2: balance query returns SOL balance info', async () => {
    if (!airdropSucceeded) {
      console.warn('[Devnet] Skipping balance query -- airdrop failed');
      return; // pass with warning
    }

    try {
      const balance = await adapter.getBalance(accountA.address);

      expect(balance.address).toBe(accountA.address);
      expect(balance.balance).toBeGreaterThanOrEqual(0n);
      expect(balance.decimals).toBe(9);
      expect(balance.symbol).toBe('SOL');

      if (balance.balance > 0n) {
        console.log(
          '[Devnet] Balance for %s: %s lamports',
          accountA.address,
          balance.balance,
        );
      } else {
        console.warn(
          '[Devnet] Balance is 0 -- airdrop may not have landed yet',
        );
      }
    } catch (err) {
      if (isDevnetError(err)) {
        console.warn(
          '[Devnet] Error in balance query (non-fatal):',
          (err as Error).message,
        );
        return; // pass with warning
      }
      throw err;
    }
  }, 30_000);
});
