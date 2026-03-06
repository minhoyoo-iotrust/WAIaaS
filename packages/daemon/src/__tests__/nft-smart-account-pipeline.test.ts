/**
 * Smart account UserOp tests for NFT_TRANSFER.
 *
 * Tests:
 * 1. buildUserOpCalls with NFT_TRANSFER ERC-721 returns safeTransferFrom(from,to,tokenId) encoded
 * 2. buildUserOpCalls with NFT_TRANSFER ERC-1155 returns safeTransferFrom(from,to,id,amount,data) encoded
 * 3. buildUserOpCalls with NFT_TRANSFER METAPLEX throws CHAIN_ERROR
 *
 * @see packages/daemon/src/pipeline/stages.ts (buildUserOpCalls)
 */

import { describe, it, expect } from 'vitest';
import { encodeFunctionData, type Hex } from 'viem';
import { WAIaaSError, type NftTransferRequest } from '@waiaas/core';
import { buildUserOpCalls } from '../pipeline/stages.js';

// ABI definitions matching those added to stages.ts
const ERC721_SAFETRFN_ABI = [
  { type: 'function' as const, name: 'safeTransferFrom' as const, inputs: [
    { name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'tokenId', type: 'uint256' },
  ], outputs: [] },
] as const;

const ERC1155_SAFETRFN_ABI = [
  { type: 'function' as const, name: 'safeTransferFrom' as const, inputs: [
    { name: 'from', type: 'address' }, { name: 'to', type: 'address' },
    { name: 'id', type: 'uint256' }, { name: 'amount', type: 'uint256' }, { name: 'data', type: 'bytes' },
  ], outputs: [] },
] as const;

const WALLET_ADDR = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

describe('NFT_TRANSFER Smart Account (buildUserOpCalls)', () => {
  it('ERC-721 returns single call with safeTransferFrom(from,to,tokenId)', () => {
    const req: NftTransferRequest = {
      type: 'NFT_TRANSFER',
      to: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      token: { address: '0xcccccccccccccccccccccccccccccccccccccccc', tokenId: '42', standard: 'ERC-721' },
      amount: '1',
    };

    const calls = buildUserOpCalls(req, WALLET_ADDR);

    expect(calls).toHaveLength(1);
    expect(calls[0].to).toBe('0xcccccccccccccccccccccccccccccccccccccccc');
    expect(calls[0].value).toBe(0n);

    // Verify calldata matches expected encoding
    const expectedData = encodeFunctionData({
      abi: ERC721_SAFETRFN_ABI,
      functionName: 'safeTransferFrom',
      args: [WALLET_ADDR as Hex, '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Hex, 42n],
    });
    expect(calls[0].data).toBe(expectedData);
  });

  it('ERC-1155 returns single call with safeTransferFrom(from,to,id,amount,data)', () => {
    const req: NftTransferRequest = {
      type: 'NFT_TRANSFER',
      to: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      token: { address: '0xdddddddddddddddddddddddddddddddddddddd', tokenId: '10', standard: 'ERC-1155' },
      amount: '5',
    };

    const calls = buildUserOpCalls(req, WALLET_ADDR);

    expect(calls).toHaveLength(1);
    expect(calls[0].to).toBe('0xdddddddddddddddddddddddddddddddddddddd');
    expect(calls[0].value).toBe(0n);

    const expectedData = encodeFunctionData({
      abi: ERC1155_SAFETRFN_ABI,
      functionName: 'safeTransferFrom',
      args: [WALLET_ADDR as Hex, '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Hex, 10n, 5n, '0x' as Hex],
    });
    expect(calls[0].data).toBe(expectedData);
  });

  it('METAPLEX throws CHAIN_ERROR (Solana not supported in Smart Account)', () => {
    const req: NftTransferRequest = {
      type: 'NFT_TRANSFER',
      to: 'SolRecipient',
      token: { address: 'MintAddr', tokenId: 'MintAddr', standard: 'METAPLEX' },
      amount: '1',
    };

    expect(() => buildUserOpCalls(req, WALLET_ADDR)).toThrow(WAIaaSError);
    expect(() => buildUserOpCalls(req, WALLET_ADDR)).toThrow(/Smart Account.*does not support.*METAPLEX/);
  });

  it('does not break existing TRANSFER UserOp', () => {
    const req = { type: 'TRANSFER' as const, to: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', amount: '1000' };
    const calls = buildUserOpCalls(req);
    expect(calls).toHaveLength(1);
    expect(calls[0].data).toBe('0x');
    expect(calls[0].value).toBe(1000n);
  });
});
