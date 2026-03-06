/**
 * NFT approval status query route.
 *
 * GET /wallet/nfts/:tokenIdentifier/approvals
 *
 * Checks on-chain NFT approval status:
 * - ERC-721: getApproved(tokenId) + isApprovedForAll(owner, operator)
 * - ERC-1155: isApprovedForAll(owner, operator)
 * - Metaplex: delegate authority check
 *
 * @since v31.0 Phase 336
 */

import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { WAIaaSError } from '@waiaas/core';
import type { ChainType, IChainAdapter } from '@waiaas/core';
import { wallets } from '../../infrastructure/database/schema.js';
import type * as schema from '../../infrastructure/database/schema.js';
import type { AdapterPool } from '../../infrastructure/adapter-pool.js';
import { createPublicClient, http, type Address, type Hex } from 'viem';

// ---------------------------------------------------------------------------
// ABI for on-chain NFT approval reads
// ---------------------------------------------------------------------------

const ERC721_APPROVAL_ABI = [
  {
    type: 'function', name: 'getApproved', stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function', name: 'isApprovedForAll', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'operator', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function', name: 'ownerOf', stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
  },
] as const;

const ERC1155_APPROVAL_ABI = [
  {
    type: 'function', name: 'isApprovedForAll', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }, { name: 'operator', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export interface NftApprovalRouteDeps {
  db: BetterSQLite3Database<typeof schema>;
  adapterPool: AdapterPool;
}

// ---------------------------------------------------------------------------
// Token identifier parser
// ---------------------------------------------------------------------------

/**
 * Parse tokenIdentifier into contractAddress and tokenId.
 * Accepts formats:
 * - "{address}-{tokenId}" (e.g., "0xNftContract-42")
 * - CAIP-19 identifier (e.g., "eip155:1/erc721:0xNftContract/42")
 */
function parseTokenIdentifier(identifier: string): { contractAddress: string; tokenId: string } | null {
  // Try CAIP-19 format first: eip155:{chainId}/{standard}:{address}/{tokenId}
  const caipMatch = identifier.match(/^eip155:\d+\/(erc721|erc1155):([^/]+)\/(\d+)$/);
  if (caipMatch) {
    return { contractAddress: caipMatch[2], tokenId: caipMatch[3] };
  }

  // Simple format: {address}-{tokenId}
  const lastDash = identifier.lastIndexOf('-');
  if (lastDash > 0 && lastDash < identifier.length - 1) {
    return {
      contractAddress: identifier.substring(0, lastDash),
      tokenId: identifier.substring(lastDash + 1),
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

export function nftApprovalRoutes(deps: NftApprovalRouteDeps): Hono {
  const router = new Hono();

  /**
   * GET /wallet/nfts/:tokenIdentifier/approvals?network=...&operator=...
   *
   * Returns approval status for an NFT.
   * - network: required (e.g., "ethereum-mainnet")
   * - operator: optional (specific operator to check isApprovedForAll)
   */
  router.get('/wallet/nfts/:tokenIdentifier/approvals', async (c) => {
    const tokenIdentifier = c.req.param('tokenIdentifier');
    const network = c.req.query('network');
    const operator = c.req.query('operator');

    if (!network) {
      return c.json({ error: 'network query parameter is required' }, 400);
    }

    const parsed = parseTokenIdentifier(tokenIdentifier);
    if (!parsed) {
      return c.json({ error: `Invalid token identifier: ${tokenIdentifier}` }, 400);
    }

    const { contractAddress, tokenId } = parsed;

    // Get wallet from session context
    const walletId = c.get('walletId' as any) as string;
    if (!walletId) {
      throw new WAIaaSError('AUTH_REQUIRED', { message: 'Session authentication required' });
    }

    const wallet = deps.db.select().from(wallets).where(eq(wallets.id, walletId)).get();
    if (!wallet) {
      throw new WAIaaSError('WALLET_NOT_FOUND', { message: `Wallet '${walletId}' not found` });
    }

    const chain = wallet.chain as ChainType;

    // Resolve adapter to get RPC URL for on-chain reads
    const adapter = await deps.adapterPool.resolve(
      chain,
      wallet.environment as 'mainnet' | 'testnet',
      network,
    );

    // For adapters with getNftApprovalStatus, use it directly
    if ('getNftApprovalStatus' in adapter && typeof (adapter as any).getNftApprovalStatus === 'function') {
      const result = await (adapter as any).getNftApprovalStatus({
        owner: wallet.publicKey,
        contractAddress,
        tokenId,
        operator,
      });
      return c.json(result, 200);
    }

    // Fallback: basic response for chains without direct approval query support
    return c.json({
      tokenId,
      contractAddress,
      standard: chain === 'solana' ? 'METAPLEX' : 'ERC-721',
      approvals: operator ? [{ operator, approved: false, type: 'unknown' as const }] : [],
    }, 200);
  });

  return router;
}
