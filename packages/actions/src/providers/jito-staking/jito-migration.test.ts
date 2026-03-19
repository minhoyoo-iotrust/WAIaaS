/**
 * Unit tests for Jito provider smallest-unit migration.
 *
 * Verifies that:
 * - Smallest-unit integer inputs (lamports) pass through as BigInt
 * - Legacy decimal inputs trigger migrateAmount auto-conversion + deprecation warning
 * - JITO_MIN_DEPOSIT_LAMPORTS check works correctly with smallest-unit input
 * - Dynamic on-chain stake pool account lookup is used for manager_fee_account
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JitoStakingActionProvider } from './index.js';
import { JITO_MIN_DEPOSIT_LAMPORTS } from './config.js';
import { base58Decode } from './jito-stake-pool.js';
import type { ActionContext } from '@waiaas/core';

const TEST_WALLET = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const TEST_RPC_URL = 'https://api.mainnet-beta.solana.com';

// Known manager fee and reserve stake accounts used in mocked RPC response
const MOCK_MANAGER_FEE = 'B1aLzaNMeFVAyQ6f3XbbUyKcH2YPHu2fqiEagmiF23VR';
const MOCK_RESERVE_STAKE = 'BgKUXdS29YcHCFrPm5M8oLHiTzZaMDjsebggjoaQ6KFL';

const TEST_CONTEXT: ActionContext = {
  walletAddress: TEST_WALLET,
  walletId: 'test-wallet',
  chain: 'solana',
};

/**
 * Build a fake stake pool account data buffer.
 *
 * SPL Stake Pool Borsh layout (relevant offsets):
 * - reserve_stake:       32 bytes at offset 130
 * - manager_fee_account: 32 bytes at offset 194
 * - total_lamports:      u64 LE at offset 258
 * - pool_token_supply:   u64 LE at offset 266
 */
function buildFakeStakePoolBuffer(): Buffer {
  const buf = Buffer.alloc(300, 0);

  // Write reserve_stake at offset 130
  const reserveBytes = base58Decode(MOCK_RESERVE_STAKE);
  buf.set(reserveBytes, 130);

  // Write manager_fee_account at offset 194
  const managerBytes = base58Decode(MOCK_MANAGER_FEE);
  buf.set(managerBytes, 194);

  // Write total_lamports at offset 258 (1000 SOL in lamports)
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  view.setBigUint64(258, 1_000_000_000_000n, true);
  // Write pool_token_supply at offset 266
  view.setBigUint64(266, 1_000_000_000_000n, true);

  return buf;
}

/** Build a getAccountInfo JSON-RPC response for the stake pool. */
function buildStakePoolRpcResponse(): object {
  const buf = buildFakeStakePoolBuffer();
  return {
    jsonrpc: '2.0',
    id: 1,
    result: {
      value: {
        data: [buf.toString('base64'), 'base64'],
        executable: false,
        lamports: 100000000,
        owner: 'SPoo1Ku8WFXoNDMHPsrGSTSG1Y47rzgn41SLUNakuHy',
        rentEpoch: 0,
      },
    },
  };
}

describe('Jito smallest-unit migration', () => {
  let provider: JitoStakingActionProvider;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fetchSpy: any;

  beforeEach(() => {
    provider = new JitoStakingActionProvider({ rpcUrl: TEST_RPC_URL });
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Mock global fetch to return fake stake pool RPC data.
    // The provider also calls getTokenAccountsByOwner internally via getAssociatedTokenAddress
    // which does NOT call fetch — ATA is derived locally. So all fetch calls go to getAccountInfo.
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(JSON.stringify(buildStakePoolRpcResponse()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
  });

  afterEach(() => {
    warnSpy.mockRestore();
    fetchSpy.mockRestore();
  });

  describe('stake', () => {
    it('uses smallest-unit (lamports) integer directly', async () => {
      const result = await provider.resolve(
        'stake',
        { amount: '1500000000' }, // 1.5 SOL in lamports
        TEST_CONTEXT,
      );

      expect(result.value).toBe('1500000000');
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('auto-converts legacy decimal input with deprecation warning', async () => {
      const result = await provider.resolve(
        'stake',
        { amount: '1.5' },
        TEST_CONTEXT,
      );

      expect(result.value).toBe('1500000000');
      expect(warnSpy).toHaveBeenCalledOnce();
      expect(warnSpy.mock.calls[0]![0]).toContain('DEPRECATION');
    });

    it('rejects amount below minimum deposit', async () => {
      const belowMin = (JITO_MIN_DEPOSIT_LAMPORTS - 1n).toString();
      await expect(
        provider.resolve('stake', { amount: belowMin }, TEST_CONTEXT),
      ).rejects.toThrow(/Minimum Jito stake deposit/);
    });

    it('uses dynamic manager_fee_account from on-chain stake pool data', async () => {
      const result = await provider.resolve(
        'stake',
        { amount: '1500000000' },
        TEST_CONTEXT,
      );

      // accounts[5] = managerFeeAccount, accounts[6] = referralFeeAccount (same)
      expect((result as { accounts: Array<{ pubkey: string }> }).accounts[5]!.pubkey).toBe(
        MOCK_MANAGER_FEE,
      );
      expect((result as { accounts: Array<{ pubkey: string }> }).accounts[6]!.pubkey).toBe(
        MOCK_MANAGER_FEE,
      );
    });

    it('uses dynamic reserve_stake from on-chain stake pool data', async () => {
      const result = await provider.resolve(
        'stake',
        { amount: '1500000000' },
        TEST_CONTEXT,
      );

      // accounts[2] = reserveStake
      expect((result as { accounts: Array<{ pubkey: string }> }).accounts[2]!.pubkey).toBe(
        MOCK_RESERVE_STAKE,
      );
    });

    it('throws when rpcUrl is not configured', async () => {
      const providerNoRpc = new JitoStakingActionProvider();
      await expect(
        providerNoRpc.resolve('stake', { amount: '1500000000' }, TEST_CONTEXT),
      ).rejects.toThrow(/rpcUrl is required/);
    });
  });

  describe('unstake', () => {
    it('uses smallest-unit (lamports) integer directly', async () => {
      const result = await provider.resolve(
        'unstake',
        { amount: '1000000000' }, // 1 SOL in lamports
        TEST_CONTEXT,
      );

      expect(result.type).toBe('CONTRACT_CALL');
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('uses dynamic manager_fee_account from on-chain stake pool data', async () => {
      const result = await provider.resolve(
        'unstake',
        { amount: '1000000000' },
        TEST_CONTEXT,
      );

      // accounts[6] = managerFeeAccount for WithdrawSol
      expect((result as { accounts: Array<{ pubkey: string }> }).accounts[6]!.pubkey).toBe(
        MOCK_MANAGER_FEE,
      );
    });

    it('uses dynamic reserve_stake from on-chain stake pool data', async () => {
      const result = await provider.resolve(
        'unstake',
        { amount: '1000000000' },
        TEST_CONTEXT,
      );

      // accounts[4] = reserveStake for WithdrawSol
      expect((result as { accounts: Array<{ pubkey: string }> }).accounts[4]!.pubkey).toBe(
        MOCK_RESERVE_STAKE,
      );
    });

    it('throws when rpcUrl is not configured', async () => {
      const providerNoRpc = new JitoStakingActionProvider();
      await expect(
        providerNoRpc.resolve('unstake', { amount: '1000000000' }, TEST_CONTEXT),
      ).rejects.toThrow(/rpcUrl is required/);
    });
  });

  describe('getStakePoolAccounts error paths', () => {
    it('throws when stake pool account not found (null data)', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({
          jsonrpc: '2.0', id: 1, result: { value: null },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
      );
      const { getStakePoolAccounts } = await import('./jito-stake-pool.js');
      await expect(getStakePoolAccounts(TEST_RPC_URL, 'BadAddress')).rejects.toThrow('Stake pool account not found');
    });

    it('throws when account data too short', async () => {
      // Return a buffer shorter than 226 bytes
      const shortBuf = Buffer.alloc(100, 0);
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({
          jsonrpc: '2.0', id: 1, result: { value: { data: [shortBuf.toString('base64'), 'base64'], executable: false, lamports: 0, owner: '', rentEpoch: 0 } },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
      );
      const { getStakePoolAccounts } = await import('./jito-stake-pool.js');
      await expect(getStakePoolAccounts(TEST_RPC_URL, 'SomeAddress')).rejects.toThrow('too short');
    });
  });
});
