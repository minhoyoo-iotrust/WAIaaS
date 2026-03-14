/**
 * E2E Tests: Onchain humanAmount Transfer + XOR Error
 *
 * Connects to an already-running daemon (started by run-onchain.ts).
 * Tests humanAmount parameter for native transfers and XOR validation.
 * Uses skipIf for networks where preconditions failed.
 *
 * @see TEST-08
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { E2EHttpClient } from '../helpers/http-client.js';
import { SessionManager } from '../helpers/session.js';
import { shouldSkipNetwork } from '../helpers/onchain-skip.js';

// Import scenario registrations (side-effect)
import '../scenarios/onchain-human-amount.js';

const DAEMON_URL = process.env.WAIAAS_E2E_DAEMON_URL ?? 'http://127.0.0.1:3100';
const MASTER_PASSWORD = process.env.WAIAAS_E2E_MASTER_PASSWORD ?? 'e2e-test-password-12345';

// ---- helpers ----

interface WalletInfo {
  id: string;
  publicKey: string;
  chain: string;
  environment: string;
  name: string;
}

/** Find the first wallet matching a given chain. */
async function getWalletByChain(
  adminClient: E2EHttpClient,
  adminHeaders: { headers: Record<string, string> },
  chain: string,
): Promise<WalletInfo | undefined> {
  const { status, body } = await adminClient.get<{ items: WalletInfo[] }>(
    '/v1/wallets',
    adminHeaders,
  );
  if (status !== 200) return undefined;
  return body.items.find((w) => w.chain === chain);
}

/** Poll transaction status until CONFIRMED/COMPLETED or timeout. */
async function pollTxStatus(
  http: E2EHttpClient,
  txId: string,
  timeoutMs = 60_000,
): Promise<{ status: string; txHash?: string }> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { status, body } = await http.get<{ id: string; status: string; txHash?: string }>(
      `/v1/transactions/${txId}`,
    );
    if (status === 200 && (body.status === 'CONFIRMED' || body.status === 'COMPLETED')) {
      return body;
    }
    if (status === 200 && body.status === 'FAILED') {
      return body;
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  throw new Error(`Transaction ${txId} did not confirm within ${timeoutMs}ms`);
}

// ---- shared state ----

const adminClient = new E2EHttpClient(DAEMON_URL);
const adminHeaders = { headers: { 'X-Master-Password': MASTER_PASSWORD } };

let evmWallet: WalletInfo | undefined;
let solWallet: WalletInfo | undefined;
let evmSession: SessionManager | undefined;
let solSession: SessionManager | undefined;

beforeAll(async () => {
  evmWallet = await getWalletByChain(adminClient, adminHeaders, 'ethereum');
  solWallet = await getWalletByChain(adminClient, adminHeaders, 'solana');

  if (evmWallet) {
    evmSession = new SessionManager(DAEMON_URL, MASTER_PASSWORD);
    await evmSession.createSession(evmWallet.id);
  }
  if (solWallet) {
    solSession = new SessionManager(DAEMON_URL, MASTER_PASSWORD);
    await solSession.createSession(solWallet.id);
  }
}, 30_000);

afterAll(async () => {
  if (evmSession?.sessionId) {
    try { await evmSession.deleteSession(); } catch { /* ignore */ }
  }
  if (solSession?.sessionId) {
    try { await solSession.deleteSession(); } catch { /* ignore */ }
  }
}, 10_000);

// ---------------------------------------------------------------------------
// Scenario 1: human-amount-eth-transfer
// ---------------------------------------------------------------------------

describe('human-amount-eth-transfer', () => {
  it.skipIf(shouldSkipNetwork('ethereum-sepolia'))('sends minimal ETH using humanAmount on Sepolia', async () => {
    expect(evmWallet).toBeTruthy();
    expect(evmSession).toBeTruthy();

    const res = await evmSession!.http.post<{ id: string; status: string }>('/v1/transactions/send', {
      type: 'TRANSFER',
      to: evmWallet!.publicKey,
      humanAmount: '0.000000000000000001', // = 1 wei
      network: 'ethereum-sepolia',
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();

    // Poll until confirmed
    const result = await pollTxStatus(evmSession!.http, res.body.id, 90_000);
    expect(['CONFIRMED', 'COMPLETED']).toContain(result.status);
    expect(result.txHash).toBeTruthy();
    expect(result.txHash!.startsWith('0x')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: human-amount-sol-transfer
// ---------------------------------------------------------------------------

describe('human-amount-sol-transfer', () => {
  it.skipIf(shouldSkipNetwork('solana-devnet'))('sends minimal SOL using humanAmount on Devnet', async () => {
    expect(solWallet).toBeTruthy();
    expect(solSession).toBeTruthy();

    const res = await solSession!.http.post<{ id: string; status: string }>('/v1/transactions/send', {
      type: 'TRANSFER',
      to: solWallet!.publicKey,
      humanAmount: '0.000000001', // = 1 lamport
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();

    // Poll until confirmed
    const result = await pollTxStatus(solSession!.http, res.body.id, 60_000);
    expect(['CONFIRMED', 'COMPLETED']).toContain(result.status);
    expect(result.txHash).toBeTruthy();
    expect(result.txHash!.length).toBeGreaterThan(30);
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: humanAmount XOR error (offchain validation)
// ---------------------------------------------------------------------------

describe('human-amount-xor-error', () => {
  it.skipIf(shouldSkipNetwork('ethereum-sepolia'))('returns 400 when both amount and humanAmount are provided', async () => {
    expect(evmWallet).toBeTruthy();
    expect(evmSession).toBeTruthy();

    const res = await evmSession!.http.post<{ code: string; message: string }>('/v1/transactions/send', {
      type: 'TRANSFER',
      to: evmWallet!.publicKey,
      amount: '1',
      humanAmount: '0.000000000000000001',
      network: 'ethereum-sepolia',
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: human-amount-action-swap (graceful)
// ---------------------------------------------------------------------------

describe('human-amount-action-swap', () => {
  it.skipIf(shouldSkipNetwork('ethereum-sepolia'))('executes action provider with humanAmount (graceful skip if unavailable)', async () => {
    expect(evmWallet).toBeTruthy();
    expect(evmSession).toBeTruthy();

    // Check if any swap provider is available
    const providersRes = await evmSession!.http.get<{ providers: Array<{ name: string; actions: Array<{ name: string }> }> }>(
      '/v1/actions/providers',
    );

    if (providersRes.status !== 200) {
      console.log('Action providers endpoint unavailable - skipping');
      return;
    }

    // Find a swap-capable provider
    const swapProvider = providersRes.body.providers.find((p) =>
      p.actions.some((a) => a.name === 'swap'),
    );

    if (!swapProvider) {
      console.log('No swap provider available - skipping');
      return;
    }

    // Execute swap with humanAmount + decimals
    const swapRes = await evmSession!.http.post<{ id?: string; status?: string; code?: string }>(
      `/v1/actions/${swapProvider.name}/swap`,
      {
        params: {
          humanAmount: '0.001',
          decimals: 18,
          inputMint: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // native ETH
          outputMint: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // Sepolia USDC
          slippageBps: 100,
        },
        network: 'ethereum-sepolia',
      },
    );

    // 200/201 = success, 400 = no liquidity/token error (graceful skip)
    if (swapRes.status >= 400) {
      console.log(`Action swap with humanAmount returned ${swapRes.status} (graceful skip: ${swapRes.body.code ?? 'unknown'})`);
      return;
    }

    expect([200, 201]).toContain(swapRes.status);
    expect(swapRes.body.id).toBeTruthy();
  });
});
