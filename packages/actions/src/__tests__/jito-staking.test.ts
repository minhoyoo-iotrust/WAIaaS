/**
 * JitoStakingActionProvider unit tests.
 *
 * Pure SPL Stake Pool instruction encoding tests -- no MSW needed (no external API calls).
 * IPositionProvider tests use mocked fetch for Solana RPC.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JitoStakingActionProvider } from '../providers/jito-staking/index.js';
import { JITO_MAINNET_ADDRESSES, getJitoAddresses } from '../providers/jito-staking/config.js';
import { base58Decode } from '../providers/jito-staking/jito-stake-pool.js';
import type { ActionContext, ContractCallRequest, PositionQueryContext } from '@waiaas/core';

function makeSolCtx(walletId: string, chain: 'solana' | 'ethereum' = 'solana'): PositionQueryContext {
  return { walletId, walletAddress: walletId, chain, networks: chain === 'solana' ? ['solana-mainnet'] : ['ethereum-mainnet'], environment: 'mainnet', rpcUrls: {} };
}

// ---------------------------------------------------------------------------
// Test constants & mock RPC
// ---------------------------------------------------------------------------

const TEST_RPC_URL = 'https://api.mainnet-beta.solana.com';
const MOCK_MANAGER_FEE = 'B1aLzaNMeFVAyQ6f3XbbUyKcH2YPHu2fqiEagmiF23VR';
const MOCK_RESERVE_STAKE = 'BgKUXdS29YcHCFrPm5M8oLHiTzZaMDjsebggjoaQ6KFL';

function buildFakeStakePoolBuffer(): Buffer {
  const buf = Buffer.alloc(300, 0);
  buf.set(base58Decode(MOCK_RESERVE_STAKE), 130);
  buf.set(base58Decode(MOCK_MANAGER_FEE), 194);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  view.setBigUint64(258, 1_000_000_000_000n, true);
  view.setBigUint64(266, 1_000_000_000_000n, true);
  return buf;
}

function buildStakePoolRpcResponse(): object {
  const buf = buildFakeStakePoolBuffer();
  return {
    jsonrpc: '2.0',
    id: 1,
    result: { value: { data: [buf.toString('base64'), 'base64'], executable: false, lamports: 100000000, owner: 'SPoo1Ku8WFXoNDMHPsrGSTSG1Y47rzgn41SLUNakuHy', rentEpoch: 0 } },
  };
}

// ---------------------------------------------------------------------------
// Test context
// ---------------------------------------------------------------------------

const CONTEXT: ActionContext = {
  walletAddress: 'So11111111111111111111111111111111111111112',
  chain: 'solana',
  walletId: '00000000-0000-0000-0000-000000000001',
};

// ---------------------------------------------------------------------------
// Helper to decode base64 instruction data
// ---------------------------------------------------------------------------

function decodeInstructionData(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

function readLEu64(bytes: Uint8Array, offset: number): bigint {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getBigUint64(offset, true);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('JitoStakingActionProvider', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fetchSpy: any;
  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify(buildStakePoolRpcResponse()), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
  });
  afterEach(() => { fetchSpy?.mockRestore(); });

  describe('stake returns ContractCallRequest with Solana fields', () => {
    it('type=CONTRACT_CALL, programId=SPL_STAKE_POOL, instructionData and accounts present', async () => {
      const provider = new JitoStakingActionProvider({ enabled: true, rpcUrl: TEST_RPC_URL });
      const result = await provider.resolve('stake', { amount: '1.0' }, CONTEXT);

      const req = result as ContractCallRequest;
      expect(req.type).toBe('CONTRACT_CALL');
      expect(req.programId).toBe(JITO_MAINNET_ADDRESSES.stakePoolProgram);
      expect(req.instructionData).toBeTruthy();
      expect(req.accounts).toBeTruthy();
      expect(Array.isArray(req.accounts)).toBe(true);
      expect(req.accounts!.length).toBe(10);
    });
  });

  describe('stake instructionData starts with DepositSol index (14)', () => {
    it('first byte of decoded base64 is 14', async () => {
      const provider = new JitoStakingActionProvider({ enabled: true, rpcUrl: TEST_RPC_URL });
      const result = await provider.resolve('stake', { amount: '1.0' }, CONTEXT);

      const req = result as ContractCallRequest;
      const data = decodeInstructionData(req.instructionData!);
      expect(data[0]).toBe(14);
    });
  });

  describe('unstake returns ContractCallRequest with Solana fields', () => {
    it('type=CONTRACT_CALL, programId, instructionData, accounts present', async () => {
      const provider = new JitoStakingActionProvider({ enabled: true, rpcUrl: TEST_RPC_URL });
      const result = await provider.resolve('unstake', { amount: '1.0' }, CONTEXT);

      const req = result as ContractCallRequest;
      expect(req.type).toBe('CONTRACT_CALL');
      expect(req.programId).toBe(JITO_MAINNET_ADDRESSES.stakePoolProgram);
      expect(req.instructionData).toBeTruthy();
      expect(req.accounts).toBeTruthy();
      expect(Array.isArray(req.accounts)).toBe(true);
      expect(req.accounts!.length).toBe(12);
    });
  });

  describe('unstake instructionData starts with WithdrawSol index (16)', () => {
    it('first byte of decoded base64 is 16', async () => {
      const provider = new JitoStakingActionProvider({ enabled: true, rpcUrl: TEST_RPC_URL });
      const result = await provider.resolve('unstake', { amount: '1.0' }, CONTEXT);

      const req = result as ContractCallRequest;
      const data = decodeInstructionData(req.instructionData!);
      expect(data[0]).toBe(16);
    });
  });

  describe('stake amount "1.0" encodes 1000000000 lamports in instructionData', () => {
    it('decode LE u64 from bytes 1-8 = 1000000000', async () => {
      const provider = new JitoStakingActionProvider({ enabled: true, rpcUrl: TEST_RPC_URL });
      const result = await provider.resolve('stake', { amount: '1.0' }, CONTEXT);

      const req = result as ContractCallRequest;
      const data = decodeInstructionData(req.instructionData!);
      const amount = readLEu64(data, 1);
      expect(amount).toBe(1000000000n);
    });
  });

  describe('zero amount throws', () => {
    it('amount "0" throws "Amount must be greater than 0"', async () => {
      const provider = new JitoStakingActionProvider({ enabled: true, rpcUrl: TEST_RPC_URL });
      await expect(
        provider.resolve('stake', { amount: '0' }, CONTEXT),
      ).rejects.toThrow('Amount must be greater than 0');
    });
  });

  describe('unknown action throws', () => {
    it('throws for unknown action name', async () => {
      const provider = new JitoStakingActionProvider({ enabled: true, rpcUrl: TEST_RPC_URL });
      await expect(
        provider.resolve('unknown_action', { amount: '1.0' }, CONTEXT),
      ).rejects.toThrow('Unknown action');
    });
  });

  describe('metadata', () => {
    it('has correct name, chains, mcpExpose', () => {
      const provider = new JitoStakingActionProvider({ enabled: true, rpcUrl: TEST_RPC_URL });
      expect(provider.metadata.name).toBe('jito_staking');
      expect(provider.metadata.chains).toEqual(['solana']);
      expect(provider.metadata.mcpExpose).toBe(true);
      expect(provider.metadata.requiresApiKey).toBe(false);
      expect(provider.metadata.requiredApis).toEqual([]);
      expect(provider.metadata.version).toBe('1.0.0');
      expect(provider.actions).toHaveLength(2);

      const [stake, unstake] = provider.actions;
      expect(stake!.name).toBe('stake');
      expect(stake!.riskLevel).toBe('medium');
      expect(stake!.defaultTier).toBe('DELAY');
      expect(unstake!.name).toBe('unstake');
      expect(unstake!.riskLevel).toBe('medium');
      expect(unstake!.defaultTier).toBe('DELAY');
    });
  });

  describe('stake decimal "0.5" SOL encodes 500000000 lamports', () => {
    it('verify precise conversion', async () => {
      const provider = new JitoStakingActionProvider({ enabled: true, rpcUrl: TEST_RPC_URL });
      const result = await provider.resolve('stake', { amount: '0.5' }, CONTEXT);

      const req = result as ContractCallRequest;
      const data = decodeInstructionData(req.instructionData!);
      const amount = readLEu64(data, 1);
      expect(amount).toBe(500000000n);
    });
  });

  describe('stake accounts include wallet as signer', () => {
    it('accounts array has wallet address as signer', async () => {
      const provider = new JitoStakingActionProvider({ enabled: true, rpcUrl: TEST_RPC_URL });
      const result = await provider.resolve('stake', { amount: '1.0' }, CONTEXT);

      const req = result as ContractCallRequest;
      const walletAccount = req.accounts!.find(
        (a) => a.pubkey === CONTEXT.walletAddress && a.isSigner,
      );
      expect(walletAccount).toBeDefined();
      expect(walletAccount!.isWritable).toBe(true);
    });
  });

  describe('unstake accounts include wallet as signer', () => {
    it('accounts array has wallet address as signer', async () => {
      const provider = new JitoStakingActionProvider({ enabled: true, rpcUrl: TEST_RPC_URL });
      const result = await provider.resolve('unstake', { amount: '1.0' }, CONTEXT);

      const req = result as ContractCallRequest;
      const walletAccount = req.accounts!.find(
        (a) => a.pubkey === CONTEXT.walletAddress && a.isSigner,
      );
      expect(walletAccount).toBeDefined();
    });
  });

  describe('INSUFFICIENT_BALANCE: large amount is faithfully encoded', () => {
    it('999999999.0 SOL encodes faithfully for pipeline balance check', async () => {
      const provider = new JitoStakingActionProvider({ enabled: true, rpcUrl: TEST_RPC_URL });
      const result = await provider.resolve('stake', { amount: '999999999.0' }, CONTEXT);

      const req = result as ContractCallRequest;
      // Verify the value field carries the lamport amount for pipeline Stage 3 balance check
      expect(req.value).toBe('999999999000000000');

      // Also verify the instruction data carries the same amount
      const data = decodeInstructionData(req.instructionData!);
      const amount = readLEu64(data, 1);
      expect(amount).toBe(999999999000000000n);
    });
  });
});

// ---------------------------------------------------------------------------
// getJitoAddresses helper
// ---------------------------------------------------------------------------

describe('getJitoAddresses', () => {
  it('returns mainnet addresses for mainnet', () => {
    const addrs = getJitoAddresses('mainnet');
    expect(addrs.stakePoolAddress).toBe(JITO_MAINNET_ADDRESSES.stakePoolAddress);
    expect(addrs.jitosolMint).toBe(JITO_MAINNET_ADDRESSES.jitosolMint);
    expect(addrs.stakePoolProgram).toBe(JITO_MAINNET_ADDRESSES.stakePoolProgram);
  });

  it('returns mainnet addresses for testnet (mainnet-only pool)', () => {
    const addrs = getJitoAddresses('testnet');
    expect(addrs.stakePoolAddress).toBe(JITO_MAINNET_ADDRESSES.stakePoolAddress);
  });
});

// ---------------------------------------------------------------------------
// IPositionProvider
// ---------------------------------------------------------------------------

describe('JitoStakingActionProvider IPositionProvider', () => {
  const RPC_URL = 'https://mock-solana-rpc.example.com';
  const WALLET_ID = 'So11111111111111111111111111111111111111112';

  let fetchMock: ReturnType<typeof vi.fn>;
  let provider: JitoStakingActionProvider;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    provider = new JitoStakingActionProvider({ enabled: true, rpcUrl: RPC_URL });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * Build a mock Solana RPC response for getTokenAccountsByOwner.
   */
  function tokenAccountsResponse(uiAmount: number, rawAmount: string): Response {
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: {
          value: [
            {
              pubkey: 'TokenAcct111111111111111111111111111111111',
              account: {
                data: {
                  parsed: {
                    info: {
                      tokenAmount: {
                        amount: rawAmount,
                        decimals: 9,
                        uiAmount,
                        uiAmountString: uiAmount.toString(),
                      },
                    },
                  },
                },
              },
            },
          ],
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  /**
   * Build empty token accounts response (no jitoSOL).
   */
  function emptyTokenAccountsResponse(): Response {
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: { value: [] },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  /**
   * Build stake pool account response with known total_lamports and pool_token_supply.
   * SPL Stake Pool layout: total_lamports at byte 258 (u64 LE), pool_token_supply at byte 266 (u64 LE).
   */
  function stakePoolAccountResponse(totalLamports: bigint, poolTokenSupply: bigint): Response {
    // Build a 300-byte buffer with the stake pool data
    const buffer = new Uint8Array(300);
    const view = new DataView(buffer.buffer);
    view.setBigUint64(258, totalLamports, true);
    view.setBigUint64(266, poolTokenSupply, true);

    const base64Data = Buffer.from(buffer).toString('base64');
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: {
          value: {
            data: [base64Data, 'base64'],
            lamports: 100000000,
            owner: JITO_MAINNET_ADDRESSES.stakePoolProgram,
          },
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  function setupMocks(opts: {
    uiAmount?: number;
    rawAmount?: string;
    totalLamports?: bigint;
    poolTokenSupply?: bigint;
    empty?: boolean;
  }): void {
    fetchMock.mockImplementation(async (_url: string, reqOpts: { body: string }) => {
      const body = JSON.parse(reqOpts.body);
      if (body.method === 'getTokenAccountsByOwner') {
        if (opts.empty) return emptyTokenAccountsResponse();
        return tokenAccountsResponse(
          opts.uiAmount ?? 2.0,
          opts.rawAmount ?? '2000000000',
        );
      }
      if (body.method === 'getAccountInfo') {
        return stakePoolAccountResponse(
          opts.totalLamports ?? 1150000000n,
          opts.poolTokenSupply ?? 1000000000n,
        );
      }
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: null }));
    });
  }

  it('getProviderName returns jito_staking', () => {
    expect(provider.getProviderName()).toBe('jito_staking');
  });

  it('getSupportedCategories returns [STAKING]', () => {
    expect(provider.getSupportedCategories()).toEqual(['STAKING']);
  });

  it('getPositions with jitoSOL balance 2e9 returns 1 STAKING PositionUpdate', async () => {
    setupMocks({ uiAmount: 2.0, rawAmount: '2000000000' });

    const positions = await provider.getPositions(makeSolCtx(WALLET_ID));
    expect(positions).toHaveLength(1);
    expect(positions[0]!.category).toBe('STAKING');
    expect(positions[0]!.provider).toBe('jito_staking');
    expect(positions[0]!.chain).toBe('solana');
    expect(positions[0]!.assetId).toContain('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp');
    expect(positions[0]!.amount).toBe('2');
    expect(positions[0]!.status).toBe('ACTIVE');
  });

  it('getPositions includes metadata.underlyingAmount with SOL equivalent', async () => {
    // exchange rate = 1150000000 / 1000000000 = 1.15
    // SOL equivalent = 2.0 * 1.15 = 2.3
    setupMocks({
      uiAmount: 2.0,
      rawAmount: '2000000000',
      totalLamports: 1150000000n,
      poolTokenSupply: 1000000000n,
    });

    const positions = await provider.getPositions(makeSolCtx(WALLET_ID));
    expect(positions).toHaveLength(1);
    expect(positions[0]!.metadata.token).toBe('jitoSOL');
    expect(positions[0]!.metadata.underlyingToken).toBe('SOL');
    expect(Number(positions[0]!.metadata.underlyingAmount as string)).toBeCloseTo(2.3, 4);
    expect(positions[0]!.metadata.exchangeRate).toBeCloseTo(1.15, 4);
  });

  it('getPositions with zero jitoSOL balance returns empty array', async () => {
    setupMocks({ empty: true });

    const positions = await provider.getPositions(makeSolCtx(WALLET_ID));
    expect(positions).toEqual([]);
  });

  it('getPositions returns empty array on RPC error (no throw)', async () => {
    fetchMock.mockRejectedValue(new Error('RPC connection failed'));

    const positions = await provider.getPositions(makeSolCtx(WALLET_ID));
    expect(positions).toEqual([]);
  });

  it('getPositions returns [] for ethereum wallet (chain guard)', async () => {
    const positions = await provider.getPositions(makeSolCtx(WALLET_ID, 'ethereum'));
    expect(positions).toEqual([]);
  });

  it('getPositions uses ctx.networks[0] for network field (MCHN-08)', async () => {
    setupMocks({ uiAmount: 1.0, rawAmount: '1000000000' });

    const ctx: PositionQueryContext = {
      walletId: WALLET_ID,
      walletAddress: WALLET_ID,
      chain: 'solana',
      networks: ['solana-devnet'],
      environment: 'testnet',
      rpcUrls: {},
    };
    const positions = await provider.getPositions(ctx);
    expect(positions).toHaveLength(1);
    expect(positions[0]!.network).toBe('solana-devnet');
    // CAIP-2 should use solana-devnet identifier
    expect(positions[0]!.assetId).toContain('solana:');
  });
});
