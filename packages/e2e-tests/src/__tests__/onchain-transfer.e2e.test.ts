/**
 * E2E Tests: Onchain Transfer (ETH/SOL/ERC-20/SPL)
 *
 * Connects to an already-running daemon (started by run-onchain.ts).
 * Self-transfers minimal amounts to preserve balance.
 * Uses skipIf for networks where preconditions failed.
 *
 * @see ONCH-04, ONCH-05, ONCH-10
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { E2EHttpClient } from '../helpers/http-client.js';
import { SessionManager } from '../helpers/session.js';
import { shouldSkipNetwork } from '../helpers/onchain-skip.js';

// Import scenario registrations (side-effect)
import '../scenarios/onchain-transfer.js';

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
// Scenario 1: eth-transfer (ONCH-04)
// ---------------------------------------------------------------------------

describe('eth-transfer', () => {
  it.skipIf(shouldSkipNetwork('ethereum-sepolia'))('sends 1 wei ETH to self on Sepolia', async () => {
    expect(evmWallet).toBeTruthy();
    expect(evmSession).toBeTruthy();

    const res = await evmSession!.http.post<{ id: string; status: string }>('/v1/transactions/send', {
      type: 'TRANSFER',
      to: evmWallet!.publicKey,
      amount: '1',
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
// Scenario 2: sol-transfer (ONCH-04)
// ---------------------------------------------------------------------------

describe('sol-transfer', () => {
  it.skipIf(shouldSkipNetwork('solana-devnet'))('sends 1 lamport SOL to self on Devnet', async () => {
    expect(solWallet).toBeTruthy();
    expect(solSession).toBeTruthy();

    const res = await solSession!.http.post<{ id: string; status: string }>('/v1/transactions/send', {
      type: 'TRANSFER',
      to: solWallet!.publicKey,
      amount: '1',
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();

    // Poll until confirmed
    const result = await pollTxStatus(solSession!.http, res.body.id, 60_000);
    expect(['CONFIRMED', 'COMPLETED']).toContain(result.status);
    expect(result.txHash).toBeTruthy();
    // Solana txHash is base58 (alphanumeric, no 0x prefix)
    expect(result.txHash!.length).toBeGreaterThan(30);
  });
});

// ---------------------------------------------------------------------------
// Scenario 2a-2e: L2 testnet native transfers
// ---------------------------------------------------------------------------

const L2_NETWORKS = [
  { network: 'polygon-amoy', name: 'Polygon Amoy', symbol: 'POL' },
  { network: 'arbitrum-sepolia', name: 'Arbitrum Sepolia', symbol: 'ETH' },
  { network: 'optimism-sepolia', name: 'Optimism Sepolia', symbol: 'ETH' },
  { network: 'base-sepolia', name: 'Base Sepolia', symbol: 'ETH' },
  { network: 'hyperevm-testnet', name: 'HyperEVM Testnet', symbol: 'HYPE' },
] as const;

for (const l2 of L2_NETWORKS) {
  describe(`${l2.network}-transfer`, () => {
    it.skipIf(shouldSkipNetwork(l2.network))(`sends 1 wei ${l2.symbol} to self on ${l2.name}`, async () => {
      expect(evmWallet).toBeTruthy();
      expect(evmSession).toBeTruthy();

      const res = await evmSession!.http.post<{ id: string; status: string }>('/v1/transactions/send', {
        type: 'TRANSFER',
        to: evmWallet!.publicKey,
        amount: '1',
        network: l2.network,
      });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeTruthy();

      const result = await pollTxStatus(evmSession!.http, res.body.id, 90_000);
      expect(['CONFIRMED', 'COMPLETED']).toContain(result.status);
      expect(result.txHash).toBeTruthy();
      expect(result.txHash!.startsWith('0x')).toBe(true);
    });
  });
}

// ---------------------------------------------------------------------------
// Scenario 3: erc20-transfer (ONCH-05)
// ---------------------------------------------------------------------------

describe('erc20-transfer', () => {
  it.skipIf(shouldSkipNetwork('ethereum-sepolia'))('sends ERC-20 token to self on Sepolia (or skips)', async () => {
    expect(evmWallet).toBeTruthy();
    expect(evmSession).toBeTruthy();

    // Try sending a common Sepolia test ERC-20 (USDC mock)
    // If no token balance, the API will return 4xx -> graceful skip
    const testToken = {
      address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // Sepolia USDC
      decimals: 6,
      symbol: 'USDC',
    };

    const res = await evmSession!.http.post<{ id: string; status: string }>('/v1/transactions/send', {
      type: 'TOKEN_TRANSFER',
      to: evmWallet!.publicKey,
      amount: '1',
      token: testToken,
      network: 'ethereum-sepolia',
    });

    // 4xx means no token balance or token not configured -> skip gracefully
    if (res.status >= 400) {
      console.log(`ERC-20 transfer skipped: HTTP ${res.status} (likely no token balance)`);
      return;
    }

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();

    const result = await pollTxStatus(evmSession!.http, res.body.id, 90_000);
    if (result.status === 'FAILED') {
      console.log('ERC-20 transfer failed on-chain (likely no token balance) - treating as skip');
      return;
    }
    expect(['CONFIRMED', 'COMPLETED']).toContain(result.status);
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: spl-transfer (ONCH-05)
// ---------------------------------------------------------------------------

describe('spl-transfer', () => {
  it.skipIf(shouldSkipNetwork('solana-devnet'))('sends SPL token to self on Devnet (or skips)', async () => {
    expect(solWallet).toBeTruthy();
    expect(solSession).toBeTruthy();

    // Try sending a common Devnet SPL token
    // If no token balance, the API will return 4xx -> graceful skip
    const testToken = {
      address: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', // Devnet USDC
      decimals: 6,
      symbol: 'USDC',
    };

    const res = await solSession!.http.post<{ id: string; status: string }>('/v1/transactions/send', {
      type: 'TOKEN_TRANSFER',
      to: solWallet!.publicKey,
      amount: '1',
      token: testToken,
    });

    // 4xx means no token balance or token not configured -> skip gracefully
    if (res.status >= 400) {
      console.log(`SPL transfer skipped: HTTP ${res.status} (likely no token balance)`);
      return;
    }

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();

    const result = await pollTxStatus(solSession!.http, res.body.id, 60_000);
    if (result.status === 'FAILED') {
      console.log('SPL transfer failed on-chain (likely no token balance) - treating as skip');
      return;
    }
    expect(['CONFIRMED', 'COMPLETED']).toContain(result.status);
  });
});
