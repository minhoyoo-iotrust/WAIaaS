/**
 * JitoStakingActionProvider supplementary unit tests.
 *
 * Focuses on paths not covered by existing jito-staking.test.ts:
 * - humanAmount + decimals conversion
 * - Minimum deposit validation (JITO_MIN_DEPOSIT_LAMPORTS)
 * - humanAmount without decimals error
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JitoStakingActionProvider } from '../index.js';
import { JITO_MIN_DEPOSIT_SOL } from '../config.js';
import { base58Decode } from '../jito-stake-pool.js';
import type { ActionContext, ContractCallRequest } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Shared context & mock RPC
// ---------------------------------------------------------------------------

const TEST_RPC_URL = 'https://api.mainnet-beta.solana.com';

const CONTEXT: ActionContext = {
  walletAddress: 'So11111111111111111111111111111111111111112',
  chain: 'solana',
  walletId: '00000000-0000-0000-0000-000000000001',
};

function buildFakeStakePoolBuffer(): Buffer {
  const buf = Buffer.alloc(300, 0);
  buf.set(base58Decode('BgKUXdS29YcHCFrPm5M8oLHiTzZaMDjsebggjoaQ6KFL'), 130);
  buf.set(base58Decode('B1aLzaNMeFVAyQ6f3XbbUyKcH2YPHu2fqiEagmiF23VR'), 194);
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let fetchSpy: any;
beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(buildStakePoolRpcResponse()), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  );
});
afterEach(() => { fetchSpy?.mockRestore(); });

// ---------------------------------------------------------------------------
// humanAmount conversion tests
// ---------------------------------------------------------------------------

describe('JitoStakingActionProvider - humanAmount conversion', () => {
  it('stake: humanAmount="2.0" with decimals=9 converts to 2000000000 lamports', async () => {
    const provider = new JitoStakingActionProvider({ enabled: true, rpcUrl: TEST_RPC_URL });
    const result = await provider.resolve('stake', {
      humanAmount: '2.0',
      decimals: 9,
    }, CONTEXT);

    const req = result as ContractCallRequest;
    expect(req.type).toBe('CONTRACT_CALL');
    // Verify the value field carries the lamport amount
    expect(req.value).toBe('2000000000');
  });

  it('unstake: humanAmount="1.0" with decimals=9 converts to 1000000000 lamports', async () => {
    const provider = new JitoStakingActionProvider({ enabled: true, rpcUrl: TEST_RPC_URL });
    const result = await provider.resolve('unstake', {
      humanAmount: '1.0',
      decimals: 9,
    }, CONTEXT);

    const req = result as ContractCallRequest;
    expect(req.type).toBe('CONTRACT_CALL');
  });

  it('stake: throws when humanAmount given without decimals', async () => {
    const provider = new JitoStakingActionProvider({ enabled: true, rpcUrl: TEST_RPC_URL });
    await expect(
      provider.resolve('stake', { humanAmount: '2.0' }, CONTEXT),
    ).rejects.toThrow('decimals');
  });

  it('unstake: throws when humanAmount given without decimals', async () => {
    const provider = new JitoStakingActionProvider({ enabled: true, rpcUrl: TEST_RPC_URL });
    await expect(
      provider.resolve('unstake', { humanAmount: '1.0' }, CONTEXT),
    ).rejects.toThrow('decimals');
  });

  it('stake: throws when neither amount nor humanAmount provided', async () => {
    const provider = new JitoStakingActionProvider({ enabled: true, rpcUrl: TEST_RPC_URL });
    await expect(
      provider.resolve('stake', {}, CONTEXT),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Minimum deposit validation tests
// ---------------------------------------------------------------------------

describe('JitoStakingActionProvider - minimum deposit', () => {
  it('stake below minimum (0.01 SOL = 10000000 lamports) throws with minimum message', async () => {
    const provider = new JitoStakingActionProvider({ enabled: true, rpcUrl: TEST_RPC_URL });
    await expect(
      provider.resolve('stake', { amount: '10000000' }, CONTEXT),
    ).rejects.toThrow(`Minimum Jito stake deposit is ${JITO_MIN_DEPOSIT_SOL} SOL`);
  });

  it('stake at exact minimum (0.05 SOL = 50000000 lamports) succeeds', async () => {
    const provider = new JitoStakingActionProvider({ enabled: true, rpcUrl: TEST_RPC_URL });
    const result = await provider.resolve('stake', { amount: '50000000' }, CONTEXT);
    const req = result as ContractCallRequest;
    expect(req.type).toBe('CONTRACT_CALL');
  });

  it('stake above minimum (1.0 SOL) succeeds', async () => {
    const provider = new JitoStakingActionProvider({ enabled: true, rpcUrl: TEST_RPC_URL });
    const result = await provider.resolve('stake', { amount: '1000000000' }, CONTEXT);
    const req = result as ContractCallRequest;
    expect(req.type).toBe('CONTRACT_CALL');
  });

  it('humanAmount stake below minimum throws', async () => {
    const provider = new JitoStakingActionProvider({ enabled: true, rpcUrl: TEST_RPC_URL });
    await expect(
      provider.resolve('stake', { humanAmount: '0.01', decimals: 9 }, CONTEXT),
    ).rejects.toThrow('Minimum');
  });
});
