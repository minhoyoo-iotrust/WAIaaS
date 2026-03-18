/**
 * Coverage tests for daemon route handler branches.
 *
 * Targets uncovered branches in:
 * - stage5-execute.ts buildByType + buildUserOpCalls
 * - external-action-pipeline.ts buildSignedDataParams / buildSignedHttpParams
 * - sign-only.ts executeSignOnly
 * - dry-run.ts executeDryRun
 */

import { describe, it, expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// buildByType coverage (stage5-execute.ts)
// ---------------------------------------------------------------------------

import { buildByType, buildUserOpCalls, ERC721_USEROP_ABI, ERC1155_USEROP_ABI } from '../pipeline/stage5-execute.js';

function makeMockAdapter() {
  return {
    buildTransaction: vi.fn().mockResolvedValue({ raw: '0x', estimatedFee: 1000n }),
    buildTokenTransfer: vi.fn().mockResolvedValue({ raw: '0x', estimatedFee: 1000n }),
    buildContractCall: vi.fn().mockResolvedValue({ raw: '0x', estimatedFee: 1000n }),
    buildApprove: vi.fn().mockResolvedValue({ raw: '0x', estimatedFee: 1000n }),
    buildNftTransferTx: vi.fn().mockResolvedValue({ raw: '0x', estimatedFee: 1000n }),
    buildBatch: vi.fn().mockResolvedValue({ raw: '0x', estimatedFee: 1000n }),
    approveNft: vi.fn().mockResolvedValue({ raw: '0x', estimatedFee: 1000n }),
  } as any;
}

describe('buildByType', () => {
  it('builds TRANSFER', async () => {
    const adapter = makeMockAdapter();
    const request = { type: 'TRANSFER', to: '0xabc', amount: '1000' } as any;
    await buildByType(adapter, request, '0xwallet');
    expect(adapter.buildTransaction).toHaveBeenCalled();
  });

  it('builds TOKEN_TRANSFER', async () => {
    const adapter = makeMockAdapter();
    const request = {
      type: 'TOKEN_TRANSFER',
      to: '0xrecipient',
      amount: '1000',
      token: { address: '0xtoken', decimals: 18, symbol: 'TK' },
    } as any;
    await buildByType(adapter, request, '0xwallet');
    expect(adapter.buildTokenTransfer).toHaveBeenCalled();
  });

  it('builds CONTRACT_CALL with calldata', async () => {
    const adapter = makeMockAdapter();
    const request = {
      type: 'CONTRACT_CALL',
      to: '0xcontract',
      calldata: '0xabcdef',
    } as any;
    await buildByType(adapter, request, '0xwallet');
    expect(adapter.buildContractCall).toHaveBeenCalled();
  });

  it('builds CONTRACT_CALL with programId and instructionData', async () => {
    const adapter = makeMockAdapter();
    const request = {
      type: 'CONTRACT_CALL',
      to: '0xcontract',
      programId: 'SomeProgramId',
      instructionData: btoa('test'), // base64
      accounts: [{ pubkey: '0x1', isSigner: false, isWritable: true }],
    } as any;
    await buildByType(adapter, request, '0xwallet');
    expect(adapter.buildContractCall).toHaveBeenCalledWith(
      expect.objectContaining({ programId: 'SomeProgramId' }),
    );
  });

  it('builds CONTRACT_CALL with preInstructions', async () => {
    const adapter = makeMockAdapter();
    const request = {
      type: 'CONTRACT_CALL',
      to: '0xcontract',
      calldata: '0x',
      preInstructions: [
        {
          programId: 'Prog1',
          data: btoa('instruction-data'),
          accounts: [{ pubkey: '0xa', isSigner: false, isWritable: true }],
        },
      ],
    } as any;
    await buildByType(adapter, request, '0xwallet');
    const call = adapter.buildContractCall.mock.calls[0][0];
    expect(call.preInstructions).toHaveLength(1);
    expect(call.preInstructions[0].programId).toBe('Prog1');
  });

  it('builds CONTRACT_CALL with value', async () => {
    const adapter = makeMockAdapter();
    const request = {
      type: 'CONTRACT_CALL',
      to: '0xcontract',
      calldata: '0x',
      value: '5000',
    } as any;
    await buildByType(adapter, request, '0xwallet');
    expect(adapter.buildContractCall).toHaveBeenCalledWith(
      expect.objectContaining({ value: 5000n }),
    );
  });

  it('builds APPROVE (ERC-20)', async () => {
    const adapter = makeMockAdapter();
    const request = {
      type: 'APPROVE',
      spender: '0xspender',
      token: { address: '0xtoken', decimals: 18, symbol: 'TK' },
      amount: '1000',
    } as any;
    await buildByType(adapter, request, '0xwallet');
    expect(adapter.buildApprove).toHaveBeenCalled();
  });

  it('builds APPROVE with nft (single ERC-721)', async () => {
    const adapter = makeMockAdapter();
    const request = {
      type: 'APPROVE',
      spender: '0xspender',
      token: { address: '0xnft' },
      amount: '0',
      nft: { tokenId: '42', standard: 'ERC-721' },
    } as any;
    await buildByType(adapter, request, '0xwallet');
    expect(adapter.approveNft).toHaveBeenCalledWith(
      expect.objectContaining({ approvalType: 'single' }),
    );
  });

  it('builds APPROVE with nft (all ERC-1155)', async () => {
    const adapter = makeMockAdapter();
    const request = {
      type: 'APPROVE',
      spender: '0xspender',
      token: { address: '0xnft' },
      amount: '1',
      nft: { tokenId: '1', standard: 'ERC-1155' },
    } as any;
    await buildByType(adapter, request, '0xwallet');
    expect(adapter.approveNft).toHaveBeenCalledWith(
      expect.objectContaining({ approvalType: 'all' }),
    );
  });

  it('builds NFT_TRANSFER', async () => {
    const adapter = makeMockAdapter();
    const request = {
      type: 'NFT_TRANSFER',
      to: '0xrecipient',
      token: { address: '0xnft', tokenId: '1', standard: 'ERC-721' },
      amount: '1',
    } as any;
    await buildByType(adapter, request, '0xwallet');
    expect(adapter.buildNftTransferTx).toHaveBeenCalled();
  });

  it('builds NFT_TRANSFER without amount (defaults to 1)', async () => {
    const adapter = makeMockAdapter();
    const request = {
      type: 'NFT_TRANSFER',
      to: '0xrecipient',
      token: { address: '0xnft', tokenId: '1', standard: 'ERC-721' },
    } as any;
    await buildByType(adapter, request, '0xwallet');
    expect(adapter.buildNftTransferTx).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 1n }),
    );
  });

  it('builds CONTRACT_DEPLOY without constructorArgs', async () => {
    const adapter = makeMockAdapter();
    const request = {
      type: 'CONTRACT_DEPLOY',
      bytecode: '0x6080604052',
    } as any;
    await buildByType(adapter, request, '0xwallet');
    expect(adapter.buildContractCall).toHaveBeenCalledWith(
      expect.objectContaining({ to: '', calldata: '0x6080604052' }),
    );
  });

  it('builds CONTRACT_DEPLOY with constructorArgs', async () => {
    const adapter = makeMockAdapter();
    const request = {
      type: 'CONTRACT_DEPLOY',
      bytecode: '0x6080604052',
      constructorArgs: '0xabcdef',
    } as any;
    await buildByType(adapter, request, '0xwallet');
    expect(adapter.buildContractCall).toHaveBeenCalledWith(
      expect.objectContaining({ calldata: '0x6080604052abcdef' }),
    );
  });

  it('builds CONTRACT_DEPLOY with value', async () => {
    const adapter = makeMockAdapter();
    const request = {
      type: 'CONTRACT_DEPLOY',
      bytecode: '0x6080',
      value: '1000',
    } as any;
    await buildByType(adapter, request, '0xwallet');
    expect(adapter.buildContractCall).toHaveBeenCalledWith(
      expect.objectContaining({ value: 1000n }),
    );
  });

  it('builds BATCH with different instruction types', async () => {
    const adapter = makeMockAdapter();
    const request = {
      type: 'BATCH',
      instructions: [
        // APPROVE
        { spender: '0xsp', token: { address: '0xtk', decimals: 18, symbol: 'T' }, amount: '100' },
        // TOKEN_TRANSFER
        { to: '0xr', amount: '200', token: { address: '0xtk', decimals: 18, symbol: 'T' } },
        // CONTRACT_CALL with programId
        { to: '0xc', programId: 'Prog1', instructionData: btoa('data'), accounts: [] },
        // CONTRACT_CALL with calldata
        { to: '0xc2', calldata: '0xabc' },
        // Default TRANSFER
        { to: '0xr2', amount: '500' },
      ],
    } as any;
    await buildByType(adapter, request, '0xwallet');
    expect(adapter.buildBatch).toHaveBeenCalled();
  });

  it('builds BATCH with value in contract call instruction', async () => {
    const adapter = makeMockAdapter();
    const request = {
      type: 'BATCH',
      instructions: [
        { to: '0xc', calldata: '0xabc', value: '999' },
      ],
    } as any;
    await buildByType(adapter, request, '0xwallet');
  });

  it('defaults to TRANSFER when type is missing', async () => {
    const adapter = makeMockAdapter();
    const request = { to: '0xabc', amount: '1000' } as any;
    await buildByType(adapter, request, '0xwallet');
    expect(adapter.buildTransaction).toHaveBeenCalled();
  });

  it('throws for unknown type', async () => {
    const adapter = makeMockAdapter();
    const request = { type: 'INVALID_TYPE', to: '0xabc' } as any;
    await expect(buildByType(adapter, request, '0xwallet')).rejects.toThrow('Unknown transaction type');
  });
});

// ---------------------------------------------------------------------------
// buildUserOpCalls coverage (stage5-execute.ts)
// ---------------------------------------------------------------------------

// Valid EVM addresses for viem encodeFunctionData (all lowercase = no checksum validation)
const ADDR1 = '0x0000000000000000000000000000000000000001' as const;
const ADDR2 = '0x0000000000000000000000000000000000000002' as const;
const ADDR3 = '0x0000000000000000000000000000000000000003' as const;
const ADDR4 = '0x0000000000000000000000000000000000000004' as const;
const ADDR5 = '0x0000000000000000000000000000000000000005' as const;

describe('buildUserOpCalls', () => {
  it('builds TRANSFER call', () => {
    const request = { type: 'TRANSFER', to: ADDR1, amount: '1000' } as any;
    const calls = buildUserOpCalls(request);
    expect(calls).toHaveLength(1);
    expect(calls[0].value).toBe(1000n);
    expect(calls[0].data).toBe('0x');
  });

  it('builds TOKEN_TRANSFER call', () => {
    const request = {
      type: 'TOKEN_TRANSFER',
      to: ADDR1,
      amount: '1000',
      token: { address: ADDR2, decimals: 18, symbol: 'TK' },
    } as any;
    const calls = buildUserOpCalls(request);
    expect(calls).toHaveLength(1);
    expect(calls[0].value).toBe(0n);
  });

  it('builds CONTRACT_CALL call', () => {
    const request = {
      type: 'CONTRACT_CALL',
      to: ADDR1,
      calldata: '0xdeadbeef',
      value: '500',
    } as any;
    const calls = buildUserOpCalls(request);
    expect(calls).toHaveLength(1);
    expect(calls[0].value).toBe(500n);
    expect(calls[0].data).toBe('0xdeadbeef');
  });

  it('builds CONTRACT_CALL with no calldata', () => {
    const request = {
      type: 'CONTRACT_CALL',
      to: ADDR1,
    } as any;
    const calls = buildUserOpCalls(request);
    expect(calls[0].data).toBe('0x');
    expect(calls[0].value).toBe(0n);
  });

  it('builds APPROVE ERC-20 call', () => {
    const request = {
      type: 'APPROVE',
      spender: ADDR1,
      token: { address: ADDR2, decimals: 18, symbol: 'TK' },
      amount: '9999',
    } as any;
    const calls = buildUserOpCalls(request);
    expect(calls).toHaveLength(1);
  });

  it('builds APPROVE NFT single ERC-721 call', () => {
    const request = {
      type: 'APPROVE',
      spender: ADDR1,
      token: { address: ADDR3 },
      amount: '0',
      nft: { tokenId: '42', standard: 'ERC-721' },
    } as any;
    const calls = buildUserOpCalls(request);
    expect(calls).toHaveLength(1);
  });

  it('builds APPROVE NFT all ERC-721 call (setApprovalForAll)', () => {
    const request = {
      type: 'APPROVE',
      spender: ADDR1,
      token: { address: ADDR3 },
      amount: '1',
      nft: { tokenId: '1', standard: 'ERC-721' },
    } as any;
    const calls = buildUserOpCalls(request);
    expect(calls).toHaveLength(1);
  });

  it('builds APPROVE NFT ERC-1155 setApprovalForAll call', () => {
    const request = {
      type: 'APPROVE',
      spender: ADDR1,
      token: { address: ADDR4 },
      amount: '1',
      nft: { tokenId: '1', standard: 'ERC-1155' },
    } as any;
    const calls = buildUserOpCalls(request);
    expect(calls).toHaveLength(1);
  });

  it('throws for APPROVE NFT METAPLEX (Solana not supported)', () => {
    const request = {
      type: 'APPROVE',
      spender: ADDR1,
      token: { address: ADDR3 },
      amount: '0',
      nft: { tokenId: '1', standard: 'METAPLEX' },
    } as any;
    expect(() => buildUserOpCalls(request)).toThrow('METAPLEX');
  });

  it('builds BATCH call with all instruction types', () => {
    const request = {
      type: 'BATCH',
      instructions: [
        // APPROVE (has spender)
        { spender: ADDR1, token: { address: ADDR2, decimals: 18 }, amount: '100' },
        // TOKEN_TRANSFER (has token)
        { to: ADDR3, amount: '200', token: { address: ADDR2 } },
        // CONTRACT_CALL (has calldata)
        { to: ADDR4, calldata: '0xabc0', value: '50' },
        // Default: native TRANSFER
        { to: ADDR5, amount: '300' },
      ],
    } as any;
    const calls = buildUserOpCalls(request);
    expect(calls).toHaveLength(4);
    expect(calls[2].value).toBe(50n);
    expect(calls[3].data).toBe('0x');
    expect(calls[3].value).toBe(300n);
  });

  it('builds BATCH call with CONTRACT_CALL without value', () => {
    const request = {
      type: 'BATCH',
      instructions: [
        { to: ADDR1, calldata: '0xabc0' },
      ],
    } as any;
    const calls = buildUserOpCalls(request);
    expect(calls[0].value).toBe(0n);
  });

  it('builds BATCH call with empty calldata CONTRACT_CALL', () => {
    const request = {
      type: 'BATCH',
      instructions: [
        { to: ADDR1, calldata: '' },
      ],
    } as any;
    const calls = buildUserOpCalls(request);
    expect(calls[0].data).toBe('0x');
  });

  it('defaults to TRANSFER when type is missing', () => {
    const request = { to: ADDR1, amount: '100' } as any;
    const calls = buildUserOpCalls(request);
    expect(calls[0].data).toBe('0x');
    expect(calls[0].value).toBe(100n);
  });
});

// ---------------------------------------------------------------------------
// NFT_TRANSFER UserOp calls coverage
// ---------------------------------------------------------------------------

describe('buildUserOpCalls NFT_TRANSFER', () => {
  it('throws for METAPLEX NFT transfer', () => {
    const request = {
      type: 'NFT_TRANSFER',
      to: ADDR2,
      token: { address: ADDR3, tokenId: '1', standard: 'METAPLEX' },
    } as any;
    expect(() => buildUserOpCalls(request, ADDR1)).toThrow('METAPLEX');
  });

  it('builds ERC-721 safeTransferFrom call', () => {
    const request = {
      type: 'NFT_TRANSFER',
      to: ADDR2,
      token: { address: ADDR3, tokenId: '42', standard: 'ERC-721' },
    } as any;
    const calls = buildUserOpCalls(request, ADDR1);
    expect(calls).toHaveLength(1);
    expect(calls[0].value).toBe(0n);
  });

  it('builds ERC-1155 safeTransferFrom call', () => {
    const request = {
      type: 'NFT_TRANSFER',
      to: ADDR2,
      token: { address: ADDR4, tokenId: '5', standard: 'ERC-1155' },
      amount: '3',
    } as any;
    const calls = buildUserOpCalls(request, ADDR1);
    expect(calls).toHaveLength(1);
    expect(calls[0].value).toBe(0n);
  });

  it('builds ERC-1155 with default amount 1', () => {
    const request = {
      type: 'NFT_TRANSFER',
      to: ADDR2,
      token: { address: ADDR4, tokenId: '5', standard: 'ERC-1155' },
    } as any;
    const calls = buildUserOpCalls(request, ADDR1);
    expect(calls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// ERC721/ERC1155 ABI exports
// ---------------------------------------------------------------------------

describe('ABI constants exports', () => {
  it('ERC721_USEROP_ABI has safeTransferFrom, approve, setApprovalForAll', () => {
    const names = ERC721_USEROP_ABI.map((e) => e.name);
    expect(names).toContain('safeTransferFrom');
    expect(names).toContain('approve');
    expect(names).toContain('setApprovalForAll');
  });

  it('ERC1155_USEROP_ABI has safeTransferFrom, setApprovalForAll', () => {
    const names = ERC1155_USEROP_ABI.map((e) => e.name);
    expect(names).toContain('safeTransferFrom');
    expect(names).toContain('setApprovalForAll');
  });
});
