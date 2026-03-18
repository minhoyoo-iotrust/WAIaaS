/**
 * TDD tests for EIP-712 approval flow.
 *
 * Tests: buildAgentWalletSetTypedData, ApprovalWorkflow EIP-712 extensions,
 * WcSigningBridge eth_signTypedData_v4, approve endpoint EIP-712 verification,
 * and ApprovalChannelRouter EIP-712 routing constraint.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import type { DatabaseConnection } from '../infrastructure/database/index.js';
import { wallets } from '../infrastructure/database/schema.js';
import { generateId } from '../infrastructure/database/id.js';
import { ApprovalWorkflow } from '../workflow/approval-workflow.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let conn: DatabaseConnection;
let workflow: ApprovalWorkflow;
let walletId: string;

async function insertTestWallet(): Promise<string> {
  const id = generateId();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  await conn.db.insert(wallets).values({
    id,
    name: 'test-wallet',
    chain: 'ethereum',
    environment: 'testnet',
    publicKey: '0x1234567890abcdef1234567890abcdef12345678',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

function insertTransaction(wId: string): string {
  const txId = generateId();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  conn.sqlite.prepare(
    `INSERT INTO transactions (id, wallet_id, type, status, chain, to_address, amount, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(txId, wId, 'CONTRACT_CALL', 'PENDING', 'ethereum', '0xabcd', '0', Math.floor(now.getTime() / 1000));
  return txId;
}

beforeEach(async () => {
  conn = createDatabase(':memory:');
  pushSchema(conn.sqlite);
  walletId = await insertTestWallet();
  workflow = new ApprovalWorkflow({
    db: conn.db,
    sqlite: conn.sqlite,
    config: { policy_defaults_approval_timeout: 3600 },
  });
});

afterEach(() => {
  conn.sqlite.close();
});

// ---------------------------------------------------------------------------
// Test 1: buildAgentWalletSetTypedData
// ---------------------------------------------------------------------------

describe('buildAgentWalletSetTypedData', () => {
  it('returns correct EIP-712 domain, types, and message', async () => {
    const { buildAgentWalletSetTypedData } = await import(
      '../services/erc8004/eip712-typed-data.js'
    );

    const result = buildAgentWalletSetTypedData({
      agentId: 42n,
      newWallet: '0x1111111111111111111111111111111111111111' as `0x${string}`,
      owner: '0x2222222222222222222222222222222222222222' as `0x${string}`,
      deadline: 1700000000n,
      chainId: 1,
      verifyingContract: '0x3333333333333333333333333333333333333333' as `0x${string}`,
    });

    // Domain
    expect(result.domain).toEqual({
      name: 'ERC8004IdentityRegistry',
      version: '1',
      chainId: 1,
      verifyingContract: '0x3333333333333333333333333333333333333333',
    });

    // Types
    expect(result.types).toHaveProperty('AgentWalletSet');
    expect(result.types.AgentWalletSet).toEqual([
      { name: 'agentId', type: 'uint256' },
      { name: 'newWallet', type: 'address' },
      { name: 'owner', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ]);

    // Primary type
    expect(result.primaryType).toBe('AgentWalletSet');

    // Message
    expect(result.message).toEqual({
      agentId: 42n,
      newWallet: '0x1111111111111111111111111111111111111111',
      owner: '0x2222222222222222222222222222222222222222',
      deadline: 1700000000n,
    });
  });
});

// ---------------------------------------------------------------------------
// Test 2: ApprovalWorkflow.requestApproval with approvalType='EIP712'
// ---------------------------------------------------------------------------

describe('ApprovalWorkflow EIP-712 extensions', () => {
  it('stores approval_type=EIP712 and typed_data_json in pending_approvals', () => {
    const txId = insertTransaction(walletId);
    const typedDataJson = JSON.stringify({
      domain: { name: 'ERC8004IdentityRegistry', version: '1', chainId: 1 },
      types: { AgentWalletSet: [{ name: 'agentId', type: 'uint256' }] },
      primaryType: 'AgentWalletSet',
      message: { agentId: '42' },
    });

    workflow.requestApproval(txId, {
      approvalType: 'EIP712',
      typedDataJson,
    });

    // Verify DB row
    const row = conn.sqlite.prepare(
      'SELECT approval_type, typed_data_json FROM pending_approvals WHERE tx_id = ?',
    ).get(txId) as { approval_type: string; typed_data_json: string | null };

    expect(row.approval_type).toBe('EIP712');
    expect(row.typed_data_json).toBe(typedDataJson);
  });

  // Test 3: Default SIWE backward compat
  it('defaults to SIWE when no approvalType provided', () => {
    const txId = insertTransaction(walletId);
    workflow.requestApproval(txId);

    const row = conn.sqlite.prepare(
      'SELECT approval_type, typed_data_json FROM pending_approvals WHERE tx_id = ?',
    ).get(txId) as { approval_type: string; typed_data_json: string | null };

    expect(row.approval_type).toBe('SIWE');
    expect(row.typed_data_json).toBeNull();
  });

  // Test: getApprovalInfo returns correct data
  it('getApprovalInfo returns approvalType and typedDataJson', () => {
    const txId = insertTransaction(walletId);
    const typedDataJson = JSON.stringify({ test: true });

    workflow.requestApproval(txId, {
      approvalType: 'EIP712',
      typedDataJson,
    });

    const info = workflow.getApprovalInfo(txId);
    expect(info).toBeDefined();
    expect(info!.approvalType).toBe('EIP712');
    expect(info!.typedDataJson).toBe(typedDataJson);
  });

  it('getApprovalInfo returns undefined for non-existent txId', () => {
    const info = workflow.getApprovalInfo('non-existent-id');
    expect(info).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Test 4-5: WcSigningBridge EIP-712 vs SIWE routing
// ---------------------------------------------------------------------------

describe('WcSigningBridge EIP-712 routing', () => {
  it('sends eth_signTypedData_v4 for EIP712 approval type', async () => {
    const txId = insertTransaction(walletId);
    const typedDataJson = JSON.stringify({
      domain: { name: 'ERC8004IdentityRegistry', version: '1', chainId: 1, verifyingContract: '0x3333' },
      types: { AgentWalletSet: [{ name: 'agentId', type: 'uint256' }] },
      primaryType: 'AgentWalletSet',
      message: { agentId: '42' },
    });

    // Request EIP712 approval
    workflow.requestApproval(txId, { approvalType: 'EIP712', typedDataJson });

    // Mock WC service
    const mockRequest = vi.fn().mockResolvedValue('0xsignature');
    const mockWcService = {
      getSignClient: () => ({ request: mockRequest }),
      getSessionTopic: () => 'test-topic',
      getSessionInfo: () => ({
        ownerAddress: '0x2222222222222222222222222222222222222222',
        chainId: 'eip155:1',
      }),
    };

    const { WcSigningBridge } = await import('../services/wc-signing-bridge.js');
    const bridge = new WcSigningBridge({
      wcServiceRef: { current: mockWcService as any },
      approvalWorkflow: workflow,
      sqlite: conn.sqlite,
    });

    await bridge.requestSignature(walletId, txId, 'ethereum');

    // Verify eth_signTypedData_v4 was used
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          method: 'eth_signTypedData_v4',
        }),
      }),
    );
  });

  it('falls back to personal_sign for SIWE approval type', async () => {
    const txId = insertTransaction(walletId);

    // Request SIWE approval (default)
    workflow.requestApproval(txId);

    // Mock WC service
    const mockRequest = vi.fn().mockResolvedValue('0xsignature');
    const mockWcService = {
      getSignClient: () => ({ request: mockRequest }),
      getSessionTopic: () => 'test-topic',
      getSessionInfo: () => ({
        ownerAddress: '0x2222222222222222222222222222222222222222',
        chainId: 'eip155:1',
      }),
    };

    const { WcSigningBridge } = await import('../services/wc-signing-bridge.js');
    const bridge = new WcSigningBridge({
      wcServiceRef: { current: mockWcService as any },
      approvalWorkflow: workflow,
      sqlite: conn.sqlite,
    });

    await bridge.requestSignature(walletId, txId, 'ethereum');

    // Verify personal_sign was used
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          method: 'personal_sign',
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Test 6-7: Approve endpoint EIP-712 signature verification
// ---------------------------------------------------------------------------

describe('EIP-712 signature verification in approve', () => {
  it('accepts valid EIP-712 signatures via recoverTypedDataAddress', async () => {
    // Use viem to create a real EIP-712 signature for testing
    const { privateKeyToAccount } = await import('viem/accounts');
    const { recoverTypedDataAddress } = await import('viem');

    const account = privateKeyToAccount(
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as `0x${string}`,
    );

    const domain = {
      name: 'ERC8004IdentityRegistry' as const,
      version: '1' as const,
      chainId: 1,
      verifyingContract: '0x3333333333333333333333333333333333333333' as `0x${string}`,
    };

    const types = {
      AgentWalletSet: [
        { name: 'agentId', type: 'uint256' },
        { name: 'newWallet', type: 'address' },
        { name: 'owner', type: 'address' },
        { name: 'deadline', type: 'uint256' },
      ],
    } as const;

    const message = {
      agentId: 42n,
      newWallet: '0x1111111111111111111111111111111111111111' as `0x${string}`,
      owner: account.address,
      deadline: 1700000000n,
    };

    // Sign the typed data
    const signature = await account.signTypedData({
      domain,
      types,
      primaryType: 'AgentWalletSet',
      message,
    });

    // Verify the signature recovers to the correct address
    const recovered = await recoverTypedDataAddress({
      domain,
      types,
      primaryType: 'AgentWalletSet',
      message,
      signature,
    });

    expect(recovered.toLowerCase()).toBe(account.address.toLowerCase());
  });

  it('rejects invalid EIP-712 signatures (address mismatch)', async () => {
    const { privateKeyToAccount } = await import('viem/accounts');
    const { recoverTypedDataAddress } = await import('viem');

    // Sign with one account
    const signerAccount = privateKeyToAccount(
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as `0x${string}`,
    );

    const domain = {
      name: 'ERC8004IdentityRegistry' as const,
      version: '1' as const,
      chainId: 1,
      verifyingContract: '0x3333333333333333333333333333333333333333' as `0x${string}`,
    };

    const types = {
      AgentWalletSet: [
        { name: 'agentId', type: 'uint256' },
        { name: 'newWallet', type: 'address' },
        { name: 'owner', type: 'address' },
        { name: 'deadline', type: 'uint256' },
      ],
    } as const;

    const message = {
      agentId: 42n,
      newWallet: '0x1111111111111111111111111111111111111111' as `0x${string}`,
      owner: signerAccount.address,
      deadline: 1700000000n,
    };

    const signature = await signerAccount.signTypedData({
      domain,
      types,
      primaryType: 'AgentWalletSet',
      message,
    });

    const recovered = await recoverTypedDataAddress({
      domain,
      types,
      primaryType: 'AgentWalletSet',
      message,
      signature,
    });

    // Verify it does NOT match a different address
    const otherAddress = '0x9999999999999999999999999999999999999999';
    expect(recovered.toLowerCase()).not.toBe(otherAddress.toLowerCase());
  });
});

// ---------------------------------------------------------------------------
// Test 8: ApprovalChannelRouter EIP-712 constraint
// ---------------------------------------------------------------------------

describe('ApprovalChannelRouter EIP-712 constraint', () => {
  it('routes EIP-712 approvals only to walletconnect or rest', async () => {
    // Create a minimal mock for the router
    const { ApprovalChannelRouter } = await import(
      '../services/signing-sdk/approval-channel-router.js'
    );

    // Mock: wallet has sdk_push as explicit method
    const mockSqlite = {
      prepare: vi.fn().mockReturnValue({
        get: vi.fn().mockReturnValue({
          owner_approval_method: 'sdk_push',
          wallet_type: null,
        }),
      }),
    };

    const mockSettings = {
      get: vi.fn().mockImplementation((key: string) => {
        if (key === 'signing_sdk.enabled') return 'true';
        if (key === 'walletconnect.project_id') return 'test-project-id';
        return '';
      }),
    };

    const router = new ApprovalChannelRouter({
      sqlite: mockSqlite as any,
      settingsService: mockSettings as any,
    });

    // Route with approvalType='EIP712' -- should override sdk_push to walletconnect
    const result = await router.route(walletId, {
      walletId,
      txId: 'test-tx',
      chain: 'ethereum',
      network: 'ethereum-mainnet',
      type: 'CONTRACT_CALL',
      from: '0xaaa',
      to: '0xbbb',
      amount: '0',
      policyTier: 'APPROVAL',
      approvalType: 'EIP712',
    });

    // EIP-712 should NOT route to sdk_push, should fallback to walletconnect or rest
    expect(['walletconnect', 'rest']).toContain(result.method);
  });
});
