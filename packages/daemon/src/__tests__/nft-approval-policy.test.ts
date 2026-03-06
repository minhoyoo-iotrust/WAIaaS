/**
 * NFT APPROVE+nft routing and NFT_TRANSFER policy evaluation tests.
 *
 * Tests:
 * 1-3: buildByType APPROVE with nft field routes to adapter.approveNft
 * 4-5: buildUserOpCalls APPROVE with nft field encodes NFT approval
 * 6-9: DatabasePolicyEngine NFT_TRANSFER policy (CONTRACT_WHITELIST, default tier, RATE_LIMIT)
 *
 * @see packages/daemon/src/pipeline/stages.ts
 * @see packages/daemon/src/pipeline/database-policy-engine.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { encodeFunctionData, type Hex } from 'viem';
import type { ApproveRequest } from '@waiaas/core';
import { buildByType, buildUserOpCalls, ERC721_USEROP_ABI, ERC1155_USEROP_ABI } from '../pipeline/stages.js';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import type { DatabaseConnection } from '../infrastructure/database/index.js';
import { wallets, policies } from '../infrastructure/database/schema.js';
import { generateId } from '../infrastructure/database/id.js';
import { DatabasePolicyEngine } from '../pipeline/database-policy-engine.js';
import { SettingsService } from '../infrastructure/settings/settings-service.js';
import { DaemonConfigSchema } from '../infrastructure/config/loader.js';

// ---------------------------------------------------------------------------
// Mock adapter
// ---------------------------------------------------------------------------

function createMockAdapter() {
  return {
    buildTransaction: vi.fn().mockResolvedValue({ raw: 'native-tx' }),
    buildTokenTransfer: vi.fn().mockResolvedValue({ raw: 'token-tx' }),
    buildContractCall: vi.fn().mockResolvedValue({ raw: 'contract-tx' }),
    buildApprove: vi.fn().mockResolvedValue({ raw: 'approve-tx' }),
    buildBatch: vi.fn().mockResolvedValue({ raw: 'batch-tx' }),
    buildNftTransferTx: vi.fn().mockResolvedValue({ raw: 'nft-transfer-tx' }),
    approveNft: vi.fn().mockResolvedValue({ raw: 'nft-approve-tx' }),
    simulate: vi.fn().mockResolvedValue({ success: true }),
    signTransaction: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    sendTransaction: vi.fn().mockResolvedValue({ txId: '0xnft123', status: 'SUBMITTED' }),
    transferNft: vi.fn().mockResolvedValue({ txId: '0xnft123', status: 'SUBMITTED' }),
    getBalance: vi.fn(),
    getHealth: vi.fn(),
    waitForConfirmation: vi.fn(),
    getNetworkType: vi.fn().mockReturnValue('ethereum-mainnet'),
    getChainType: vi.fn().mockReturnValue('ethereum'),
    getTransactionStatus: vi.fn(),
    getTokenBalance: vi.fn(),
    getTokenInfo: vi.fn(),
    estimateFee: vi.fn().mockResolvedValue({ fee: '1000' }),
    getNonce: vi.fn().mockResolvedValue(0),
    listSplTokens: vi.fn(),
    generateKeypair: vi.fn(),
    supportsNetwork: vi.fn().mockReturnValue(true),
  };
}

// ---------------------------------------------------------------------------
// Policy test helpers
// ---------------------------------------------------------------------------

let conn: DatabaseConnection;
let walletId: string;

async function insertTestWallet(): Promise<string> {
  const id = generateId();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  await conn.db.insert(wallets).values({
    id,
    name: 'test-wallet',
    chain: 'ethereum',
    environment: 'mainnet',
    publicKey: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

async function insertPolicy(overrides: {
  walletId?: string | null;
  type: string;
  rules: string;
  priority?: number;
  enabled?: boolean;
}): Promise<string> {
  const id = generateId();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  await conn.db.insert(policies).values({
    id,
    walletId: overrides.walletId ?? null,
    type: overrides.type,
    rules: overrides.rules,
    priority: overrides.priority ?? 0,
    enabled: overrides.enabled ?? true,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

// ---------------------------------------------------------------------------
// Tests: APPROVE+nft routing
// ---------------------------------------------------------------------------

describe('APPROVE+nft routing in buildByType', () => {
  let adapter: ReturnType<typeof createMockAdapter>;

  beforeEach(() => {
    adapter = createMockAdapter();
  });

  it('ERC-721 single approve (amount=0) calls adapter.approveNft with approvalType=single', async () => {
    const req: ApproveRequest = {
      type: 'APPROVE',
      spender: '0xOperator',
      token: { address: '0xNftContract', decimals: 0, symbol: 'NFT' },
      amount: '0',
      nft: { tokenId: '42', standard: 'ERC-721' },
    };

    await buildByType(adapter as any, req, '0xSender');

    expect(adapter.approveNft).toHaveBeenCalledWith({
      from: '0xSender',
      spender: '0xOperator',
      token: { address: '0xNftContract', tokenId: '42', standard: 'ERC-721' },
      approvalType: 'single',
    });
    expect(adapter.buildApprove).not.toHaveBeenCalled();
  });

  it('ERC-721 setApprovalForAll (amount!=0) calls adapter.approveNft with approvalType=all', async () => {
    const req: ApproveRequest = {
      type: 'APPROVE',
      spender: '0xOperator',
      token: { address: '0xNftContract', decimals: 0, symbol: 'NFT' },
      amount: '1',
      nft: { tokenId: '0', standard: 'ERC-721' },
    };

    await buildByType(adapter as any, req, '0xSender');

    expect(adapter.approveNft).toHaveBeenCalledWith(expect.objectContaining({
      approvalType: 'all',
    }));
  });

  it('METAPLEX single approve calls adapter.approveNft with standard=METAPLEX', async () => {
    const req: ApproveRequest = {
      type: 'APPROVE',
      spender: 'SolOperator',
      token: { address: 'MintAddr', decimals: 0, symbol: 'NFT' },
      amount: '0',
      nft: { tokenId: 'MintAddr', standard: 'METAPLEX' },
    };

    await buildByType(adapter as any, req, 'SolSender');

    expect(adapter.approveNft).toHaveBeenCalledWith({
      from: 'SolSender',
      spender: 'SolOperator',
      token: { address: 'MintAddr', tokenId: 'MintAddr', standard: 'METAPLEX' },
      approvalType: 'single',
    });
  });

  it('APPROVE without nft field still calls adapter.buildApprove (ERC-20 path)', async () => {
    const req: ApproveRequest = {
      type: 'APPROVE',
      spender: '0xSpender',
      token: { address: '0xToken', decimals: 18, symbol: 'USDC' },
      amount: '1000000000',
    };

    await buildByType(adapter as any, req, '0xSender');

    expect(adapter.buildApprove).toHaveBeenCalled();
    expect(adapter.approveNft).not.toHaveBeenCalled();
  });
});

describe('APPROVE+nft in buildUserOpCalls', () => {
  const WALLET = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

  it('ERC-721 single approve encodes approve(spender, tokenId)', () => {
    const req: ApproveRequest = {
      type: 'APPROVE',
      spender: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      token: { address: '0xcccccccccccccccccccccccccccccccccccccccc', decimals: 0, symbol: 'NFT' },
      amount: '0',
      nft: { tokenId: '42', standard: 'ERC-721' },
    };

    const calls = buildUserOpCalls(req, WALLET);
    expect(calls).toHaveLength(1);
    expect(calls[0].to).toBe('0xcccccccccccccccccccccccccccccccccccccccc');

    const expected = encodeFunctionData({
      abi: ERC721_USEROP_ABI,
      functionName: 'approve',
      args: ['0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Hex, 42n],
    });
    expect(calls[0].data).toBe(expected);
  });

  it('ERC-721 all encodes setApprovalForAll(operator, true)', () => {
    const req: ApproveRequest = {
      type: 'APPROVE',
      spender: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      token: { address: '0xcccccccccccccccccccccccccccccccccccccccc', decimals: 0, symbol: 'NFT' },
      amount: '1',
      nft: { tokenId: '0', standard: 'ERC-721' },
    };

    const calls = buildUserOpCalls(req, WALLET);
    expect(calls).toHaveLength(1);

    const expected = encodeFunctionData({
      abi: ERC721_USEROP_ABI,
      functionName: 'setApprovalForAll',
      args: ['0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Hex, true],
    });
    expect(calls[0].data).toBe(expected);
  });

  it('ERC-1155 all encodes setApprovalForAll with ERC1155 ABI', () => {
    const req: ApproveRequest = {
      type: 'APPROVE',
      spender: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      token: { address: '0xdddddddddddddddddddddddddddddddddddddd', decimals: 0, symbol: 'NFT' },
      amount: '1',
      nft: { tokenId: '10', standard: 'ERC-1155' },
    };

    const calls = buildUserOpCalls(req, WALLET);
    expect(calls).toHaveLength(1);

    const expected = encodeFunctionData({
      abi: ERC1155_USEROP_ABI,
      functionName: 'setApprovalForAll',
      args: ['0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Hex, true],
    });
    expect(calls[0].data).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// Tests: NFT_TRANSFER policy evaluation
// ---------------------------------------------------------------------------

describe('NFT_TRANSFER policy evaluation', () => {
  beforeEach(async () => {
    conn = createDatabase(':memory:');
    pushSchema(conn.sqlite);
    walletId = await insertTestWallet();
  });

  afterEach(() => {
    conn.sqlite.close();
  });

  it('CONTRACT_WHITELIST denies NFT_TRANSFER if contract not whitelisted', async () => {
    const engine = new DatabasePolicyEngine(conn.db, conn.sqlite);

    // Insert a CONTRACT_WHITELIST policy that does NOT include the NFT contract
    await insertPolicy({
      walletId,
      type: 'CONTRACT_WHITELIST',
      rules: JSON.stringify({ contracts: [{ address: '0xOtherContract' }] }),
    });

    const result = await engine.evaluate(walletId, {
      type: 'NFT_TRANSFER',
      amount: '1',
      toAddress: '0xRecipient',
      chain: 'ethereum',
      contractAddress: '0xNftContract',
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('not whitelisted');
  });

  it('CONTRACT_WHITELIST allows NFT_TRANSFER if contract IS whitelisted', async () => {
    const engine = new DatabasePolicyEngine(conn.db, conn.sqlite);

    await insertPolicy({
      walletId,
      type: 'CONTRACT_WHITELIST',
      rules: JSON.stringify({ contracts: [{ address: '0xNftContract' }] }),
    });
    // Also need a SPENDING_LIMIT to avoid INSTANT passthrough issues
    await insertPolicy({
      walletId,
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({ instant_max: '999999', notify_max: '9999999', delay_max: '99999999', delay_seconds: 60 }),
    });

    const result = await engine.evaluate(walletId, {
      type: 'NFT_TRANSFER',
      amount: '1',
      toAddress: '0xRecipient',
      chain: 'ethereum',
      contractAddress: '0xNftContract',
    });

    expect(result.allowed).toBe(true);
  });

  it('no CONTRACT_WHITELIST policy -> default deny for NFT_TRANSFER', async () => {
    const engine = new DatabasePolicyEngine(conn.db, conn.sqlite);

    // No policies at all -- but need at least one policy to trigger evaluation
    await insertPolicy({
      walletId,
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({ instant_max: '999999', notify_max: '9999999', delay_max: '99999999', delay_seconds: 60 }),
    });

    const result = await engine.evaluate(walletId, {
      type: 'NFT_TRANSFER',
      amount: '1',
      toAddress: '0xRecipient',
      chain: 'ethereum',
      contractAddress: '0xNftContract',
    });

    // Default deny for CONTRACT_WHITELIST when no policy exists (same as CONTRACT_CALL)
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Contract calls disabled');
  });

  it('NFT_TRANSFER default tier is APPROVAL when contract whitelisted and settings not overridden', async () => {
    const config = DaemonConfigSchema.parse({});
    const settings = new SettingsService({ db: conn.db, config, masterPassword: 'test-password' });
    const engine = new DatabasePolicyEngine(conn.db, conn.sqlite, settings);

    // Whitelist the NFT contract
    await insertPolicy({
      walletId,
      type: 'CONTRACT_WHITELIST',
      rules: JSON.stringify({ contracts: [{ address: '0xNftContract' }] }),
    });

    const result = await engine.evaluate(walletId, {
      type: 'NFT_TRANSFER',
      amount: '1',
      toAddress: '0xRecipient',
      chain: 'ethereum',
      contractAddress: '0xNftContract',
    });

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('APPROVAL');
  });

  it('no policies at all -> INSTANT passthrough (no contract whitelist check)', async () => {
    const engine = new DatabasePolicyEngine(conn.db, conn.sqlite);

    // No policies at all -- returns INSTANT passthrough
    const result = await engine.evaluate(walletId, {
      type: 'NFT_TRANSFER',
      amount: '1',
      toAddress: '0xRecipient',
      chain: 'ethereum',
      contractAddress: '0xNftContract',
    });

    // When no policies exist at all, INSTANT passthrough applies (Phase 7 compat)
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
  });
});
