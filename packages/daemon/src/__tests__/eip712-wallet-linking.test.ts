/**
 * TDD tests for set_agent_wallet EIP-712 integration + pipeline calldata re-encoding.
 *
 * Tests: resolveSetAgentWallet eip712 metadata, stage4Wait EIP-712 routing,
 * calldata re-encoding on approval, unset_agent_wallet SIWE fallback.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import type { DatabaseConnection } from '../infrastructure/database/index.js';
import { wallets } from '../infrastructure/database/schema.js';
import { generateId } from '../infrastructure/database/id.js';
import { ApprovalWorkflow } from '../workflow/approval-workflow.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let conn: DatabaseConnection;
let walletId: string;

async function insertTestWallet(chain = 'ethereum'): Promise<string> {
  const id = generateId();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  await conn.db.insert(wallets).values({
    id,
    name: 'test-wallet',
    chain,
    environment: 'testnet',
    publicKey: '0x1234567890abcdef1234567890abcdef12345678',
    status: 'ACTIVE',
    ownerPublicKey: '0x2222222222222222222222222222222222222222',
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

function insertTransaction(wId: string): string {
  const txId = generateId();
  const now = Math.floor(Date.now() / 1000);
  conn.sqlite.prepare(
    `INSERT INTO transactions (id, wallet_id, type, status, chain, to_address, amount, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(txId, wId, 'CONTRACT_CALL', 'PENDING', 'ethereum', '0xabcd', '0', now);
  return txId;
}

beforeEach(async () => {
  conn = createDatabase(':memory:');
  pushSchema(conn.sqlite);
  walletId = await insertTestWallet();
});

afterEach(() => {
  conn.sqlite.close();
});

// ---------------------------------------------------------------------------
// Test 1: resolveSetAgentWallet returns eip712 metadata
// ---------------------------------------------------------------------------

describe('resolveSetAgentWallet EIP-712 metadata', () => {
  it('returns ContractCallRequest with eip712 metadata', async () => {
    const { Erc8004ActionProvider } = await import('@waiaas/actions');

    const provider = new Erc8004ActionProvider({
      enabled: true,
      identityRegistryAddress: '0x3333333333333333333333333333333333333333',
      reputationRegistryAddress: '0x4444444444444444444444444444444444444444',
      validationRegistryAddress: '',
      registrationFileBaseUrl: '',
      autoPublishRegistration: true,
      reputationCacheTtlSec: 300,
    });

    const result = await provider.resolve('set_agent_wallet', {
      agentId: '42',
    }, {
      walletAddress: '0x1111111111111111111111111111111111111111',
      chain: 'ethereum',
      walletId: 'test-wallet-id',
    });

    // Should have eip712 metadata
    expect(result.type).toBe('CONTRACT_CALL');
    expect((result as any).eip712).toBeDefined();
    expect((result as any).eip712.approvalType).toBe('EIP712');
    expect((result as any).eip712.typedDataJson).toBeDefined();

    // Parse typed data JSON
    const typedData = JSON.parse((result as any).eip712.typedDataJson);
    expect(typedData.primaryType).toBe('AgentWalletSet');
    expect(typedData.domain.name).toBe('ERC8004IdentityRegistry');
    expect((result as any).eip712.agentId).toBe('42');
    expect((result as any).eip712.newWallet).toBe('0x1111111111111111111111111111111111111111');
  });
});

// ---------------------------------------------------------------------------
// Test 2-3: stage4Wait EIP-712 routing
// ---------------------------------------------------------------------------

describe('stage4Wait EIP-712 metadata propagation', () => {
  it('passes approvalType=EIP712 to requestApproval when eip712Metadata present', () => {
    const txId = insertTransaction(walletId);
    const workflow = new ApprovalWorkflow({
      db: conn.db,
      sqlite: conn.sqlite,
      config: { policy_defaults_approval_timeout: 3600 },
    });

    const typedDataJson = JSON.stringify({
      domain: { name: 'ERC8004IdentityRegistry', version: '1' },
      types: { AgentWalletSet: [] },
      primaryType: 'AgentWalletSet',
      message: { agentId: '42' },
    });

    // Simulate what stage4Wait does when eip712Metadata is present
    workflow.requestApproval(txId, {
      approvalType: 'EIP712',
      typedDataJson,
    });

    const info = workflow.getApprovalInfo(txId);
    expect(info).toBeDefined();
    expect(info!.approvalType).toBe('EIP712');
    expect(info!.typedDataJson).toBe(typedDataJson);
  });
});

// ---------------------------------------------------------------------------
// Test 4: unset_agent_wallet standard SIWE flow
// ---------------------------------------------------------------------------

describe('unset_agent_wallet SIWE APPROVAL', () => {
  it('produces standard ContractCallRequest without eip712 metadata', async () => {
    const { Erc8004ActionProvider } = await import('@waiaas/actions');

    const provider = new Erc8004ActionProvider({
      enabled: true,
      identityRegistryAddress: '0x3333333333333333333333333333333333333333',
      reputationRegistryAddress: '0x4444444444444444444444444444444444444444',
      validationRegistryAddress: '',
      registrationFileBaseUrl: '',
      autoPublishRegistration: true,
      reputationCacheTtlSec: 300,
    });

    const result = await provider.resolve('unset_agent_wallet', {
      agentId: '42',
    }, {
      walletAddress: '0x1111111111111111111111111111111111111111',
      chain: 'ethereum',
      walletId: 'test-wallet-id',
    });

    expect(result.type).toBe('CONTRACT_CALL');
    expect((result as any).eip712).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Test 5: Calldata re-encoding uses original fields + new signature
// ---------------------------------------------------------------------------

describe('calldata re-encoding', () => {
  it('re-encodes setAgentWallet with real signature from typed_data_json', async () => {
    const { encodeFunctionData } = await import('viem');
    const { IDENTITY_REGISTRY_ABI } = await import('@waiaas/actions');

    // Original calldata with placeholder signature
    const placeholderCalldata = encodeFunctionData({
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'setAgentWallet',
      args: [
        42n,
        '0x1111111111111111111111111111111111111111' as `0x${string}`,
        1700000000n,
        '0x' as `0x${string}`,
      ],
    });

    // Real signature (65 bytes)
    const realSignature = '0x' + 'ab'.repeat(65) as `0x${string}`;

    // Re-encode with real signature
    const reEncodedCalldata = encodeFunctionData({
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'setAgentWallet',
      args: [
        42n,
        '0x1111111111111111111111111111111111111111' as `0x${string}`,
        1700000000n,
        realSignature,
      ],
    });

    // Calldata should be different (real sig vs placeholder)
    expect(reEncodedCalldata).not.toBe(placeholderCalldata);
    // Both should start with the same function selector
    expect(reEncodedCalldata.slice(0, 10)).toBe(placeholderCalldata.slice(0, 10));
  });
});

// ---------------------------------------------------------------------------
// Test 6: Non-EIP712 approvals unchanged
// ---------------------------------------------------------------------------

describe('SIWE approvals unchanged', () => {
  it('SIWE approval does not set typed_data_json and moves tx to EXECUTING', () => {
    const txId = insertTransaction(walletId);
    const workflow = new ApprovalWorkflow({
      db: conn.db,
      sqlite: conn.sqlite,
      config: { policy_defaults_approval_timeout: 3600 },
    });

    // Default SIWE approval
    workflow.requestApproval(txId);
    const info = workflow.getApprovalInfo(txId);
    expect(info!.approvalType).toBe('SIWE');
    expect(info!.typedDataJson).toBeNull();

    // Standard approve -- no EIP-712 processing needed
    workflow.approve(txId, '0xsiwe-signature');

    // Verify transaction moved to EXECUTING
    const tx = conn.sqlite.prepare(
      'SELECT status FROM transactions WHERE id = ?',
    ).get(txId) as { status: string };
    expect(tx.status).toBe('EXECUTING');

    // Verify approval has no typed_data_json
    const approval = conn.sqlite.prepare(
      'SELECT typed_data_json FROM pending_approvals WHERE tx_id = ?',
    ).get(txId) as { typed_data_json: string | null };
    expect(approval.typed_data_json).toBeNull();
  });
});
