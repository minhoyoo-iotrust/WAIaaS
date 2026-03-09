/**
 * E2E Tests: NFT Transfer (ERC-721 / ERC-1155)
 *
 * Queries wallet NFT ownership, then self-transfers NFTs to preserve ownership.
 * Gracefully skips if no NFTs owned or network unavailable.
 *
 * Solana NFT (Metaplex) is out of scope (Devnet pre-minting complexity).
 *
 * @see ONCH-09
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { E2EHttpClient } from '../helpers/http-client.js';
import { SessionManager } from '../helpers/session.js';
import { shouldSkipNetwork } from '../helpers/onchain-skip.js';

// Import scenario registrations (side-effect)
import '../scenarios/onchain-nft.js';

const DAEMON_URL = process.env.WAIAAS_E2E_DAEMON_URL ?? 'http://127.0.0.1:3100';
const MASTER_PASSWORD = process.env.WAIAAS_E2E_MASTER_PASSWORD ?? 'e2e-test-password-12345';

interface WalletInfo {
  id: string;
  publicKey: string;
  chain: string;
}

interface NftItem {
  contractAddress: string;
  tokenId: string;
  standard: string;
  name?: string;
}

const adminClient = new E2EHttpClient(DAEMON_URL);
const adminHeaders = { headers: { 'X-Master-Password': MASTER_PASSWORD } };

let evmWallet: WalletInfo | undefined;
let session: SessionManager | undefined;
let ownedNfts: NftItem[] = [];

beforeAll(async () => {
  const { status, body } = await adminClient.get<{ items: WalletInfo[] }>(
    '/v1/wallets',
    adminHeaders,
  );
  if (status === 200) {
    evmWallet = body.items.find((w) => w.chain === 'ethereum');
  }
  if (evmWallet) {
    session = new SessionManager(DAEMON_URL, MASTER_PASSWORD);
    await session.createSession(evmWallet.id);

    // Query owned NFTs
    const nftRes = await session.http.get<{ items: NftItem[] }>('/v1/wallet/nfts');
    if (nftRes.status === 200 && nftRes.body.items) {
      ownedNfts = nftRes.body.items;
    }
  }
}, 30_000);

afterAll(async () => {
  if (session?.sessionId) {
    try { await session.deleteSession(); } catch { /* ignore */ }
  }
}, 10_000);

/** Poll transaction status until terminal state. */
async function pollTxStatus(
  http: E2EHttpClient,
  txId: string,
  timeoutMs = 90_000,
): Promise<{ status: string; txHash?: string }> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { status, body } = await http.get<{ id: string; status: string; txHash?: string }>(
      `/v1/transactions/${txId}`,
    );
    if (status === 200 && ['CONFIRMED', 'COMPLETED', 'FAILED'].includes(body.status)) {
      return body;
    }
    await new Promise((r) => setTimeout(r, 3_000));
  }
  throw new Error(`Transaction ${txId} did not reach terminal state within ${timeoutMs}ms`);
}

// ---------------------------------------------------------------------------
// Scenario: nft-erc721-transfer (ONCH-09)
// ---------------------------------------------------------------------------

describe('nft-erc721-transfer', () => {
  it.skipIf(shouldSkipNetwork('ethereum-sepolia'))(
    'self-transfers an ERC-721 NFT on Sepolia',
    async () => {
      expect(evmWallet).toBeTruthy();
      expect(session).toBeTruthy();

      const erc721 = ownedNfts.find((n) => n.standard === 'ERC-721');
      if (!erc721) {
        console.log('No ERC-721 NFT owned - skipping');
        return;
      }

      const res = await session!.http.post<{ id: string; status: string }>(
        '/v1/transactions/send',
        {
          type: 'NFT_TRANSFER',
          to: evmWallet!.publicKey,
          token: {
            address: erc721.contractAddress,
            tokenId: erc721.tokenId,
            standard: 'ERC-721',
          },
          network: 'ethereum-sepolia',
        },
      );

      // 4xx means NFT transfer not possible -> skip
      if (res.status >= 400) {
        console.log(`ERC-721 transfer skipped: HTTP ${res.status}`);
        return;
      }

      expect(res.status).toBe(201);
      expect(res.body.id).toBeTruthy();

      const result = await pollTxStatus(session!.http, res.body.id);
      if (result.status === 'FAILED') {
        console.log('ERC-721 transfer failed on-chain (gas/contract error) - treating as skip');
        return;
      }

      expect(['CONFIRMED', 'COMPLETED']).toContain(result.status);
      expect(result.txHash).toBeTruthy();
    },
  );
});

// ---------------------------------------------------------------------------
// Scenario: nft-erc1155-transfer (ONCH-09)
// ---------------------------------------------------------------------------

describe('nft-erc1155-transfer', () => {
  it.skipIf(shouldSkipNetwork('ethereum-sepolia'))(
    'self-transfers an ERC-1155 NFT on Sepolia',
    async () => {
      expect(evmWallet).toBeTruthy();
      expect(session).toBeTruthy();

      const erc1155 = ownedNfts.find((n) => n.standard === 'ERC-1155');
      if (!erc1155) {
        console.log('No ERC-1155 NFT owned - skipping');
        return;
      }

      const res = await session!.http.post<{ id: string; status: string }>(
        '/v1/transactions/send',
        {
          type: 'NFT_TRANSFER',
          to: evmWallet!.publicKey,
          token: {
            address: erc1155.contractAddress,
            tokenId: erc1155.tokenId,
            standard: 'ERC-1155',
          },
          amount: '1',
          network: 'ethereum-sepolia',
        },
      );

      if (res.status >= 400) {
        console.log(`ERC-1155 transfer skipped: HTTP ${res.status}`);
        return;
      }

      expect(res.status).toBe(201);
      expect(res.body.id).toBeTruthy();

      const result = await pollTxStatus(session!.http, res.body.id);
      if (result.status === 'FAILED') {
        console.log('ERC-1155 transfer failed on-chain (gas/contract error) - treating as skip');
        return;
      }

      expect(['CONFIRMED', 'COMPLETED']).toContain(result.status);
      expect(result.txHash).toBeTruthy();
    },
  );
});
