/**
 * Level 2: EVM Anvil E2E Integration Tests
 *
 * Tests real EvmAdapter operations against a local Anvil node (Foundry).
 * No mocks -- uses actual viem + actual EVM execution.
 *
 * Requirements: CHAIN-03 (design doc 48)
 *
 * Prerequisites:
 *   - Anvil running: `anvil` (Foundry must be installed)
 *   - Skips gracefully when Anvil is not running
 *
 * Run: npx vitest run packages/adapters/evm/src/__tests__/chain/evm-anvil.chain.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hexToBytes } from 'viem';
import { foundry } from 'viem/chains';
import { EvmAdapter } from '../../adapter.js';
import {
  isAnvilRunning,
  ANVIL_RPC_URL,
  ANVIL_CHAIN_ID,
  ANVIL_FUNDED_PRIVATE_KEY,
  ANVIL_FUNDED_ADDRESS,
  ANVIL_SECOND_ADDRESS,
  deploySimpleERC20,
} from './helpers/anvil-setup.js';

// -- Anvil availability check --
let anvilAvailable = false;

beforeAll(async () => {
  anvilAvailable = await isAnvilRunning();
  if (!anvilAvailable) {
    console.warn(
      '[Level 2] Anvil not running at %s -- skipping EVM E2E tests. Start with: anvil',
      ANVIL_RPC_URL,
    );
  }
});

describe.skipIf(!anvilAvailable)('Level 2: EVM Anvil E2E', () => {
  let adapter: EvmAdapter;

  // Private key as 32-byte Uint8Array for signTransaction
  const privateKeyBytes = hexToBytes(ANVIL_FUNDED_PRIVATE_KEY as `0x${string}`);

  beforeAll(async () => {
    // Re-check inside describe to handle lazy evaluation
    anvilAvailable = await isAnvilRunning();
    if (!anvilAvailable) return;

    // Create adapter with foundry chain (chainId 31337)
    adapter = new EvmAdapter('ethereum-sepolia', foundry, 'ETH', 'Ether');
    await adapter.connect(ANVIL_RPC_URL);
  }, 10_000);

  afterAll(async () => {
    if (adapter?.isConnected()) {
      await adapter.disconnect();
    }
  });

  // ─── E2E-A1: ETH Transfer Full Flow ─────────────────────────────

  it('E2E-A1: ETH transfer full flow', async () => {
    // 1. Get initial balances
    const senderBefore = await adapter.getBalance(ANVIL_FUNDED_ADDRESS);
    const receiverBefore = await adapter.getBalance(ANVIL_SECOND_ADDRESS);

    const transferAmount = 1_000_000_000_000_000_000n; // 1 ETH

    // 2. Build transaction
    const unsignedTx = await adapter.buildTransaction({
      from: ANVIL_FUNDED_ADDRESS,
      to: ANVIL_SECOND_ADDRESS,
      amount: transferAmount,
    });

    expect(unsignedTx.chain).toBe('ethereum');
    expect(unsignedTx.serialized.length).toBeGreaterThan(0);
    expect(unsignedTx.estimatedFee).toBeGreaterThan(0n);
    expect(unsignedTx.metadata.chainId).toBe(ANVIL_CHAIN_ID);

    // 3. Simulate transaction
    const simResult = await adapter.simulateTransaction(unsignedTx);
    expect(simResult.success).toBe(true);

    // 4. Sign transaction
    const signedTx = await adapter.signTransaction(unsignedTx, privateKeyBytes);
    expect(signedTx).toBeInstanceOf(Uint8Array);
    expect(signedTx.length).toBeGreaterThan(0);

    // 5. Submit transaction
    const submitResult = await adapter.submitTransaction(signedTx);
    expect(submitResult.txHash).toBeTruthy();
    expect(submitResult.status).toBe('submitted');

    // 6. Wait for confirmation
    const confirmResult = await adapter.waitForConfirmation(submitResult.txHash, 30_000);
    expect(confirmResult.status).toBe('confirmed');
    expect(confirmResult.blockNumber).toBeDefined();
    expect(confirmResult.fee).toBeGreaterThan(0n);

    // 7. Verify balance changes
    const senderAfter = await adapter.getBalance(ANVIL_FUNDED_ADDRESS);
    const receiverAfter = await adapter.getBalance(ANVIL_SECOND_ADDRESS);

    // Receiver balance should increase by exactly transferAmount
    expect(receiverAfter.balance - receiverBefore.balance).toBe(transferAmount);

    // Sender balance should decrease by transferAmount + gas fee
    const senderDecrease = senderBefore.balance - senderAfter.balance;
    expect(senderDecrease).toBeGreaterThan(transferAmount); // transferAmount + gas
    expect(senderDecrease).toBeLessThan(transferAmount + 1_000_000_000_000_000n); // gas < 0.001 ETH
  }, 30_000);

  // ─── E2E-A2: ERC-20 Token Transfer ──────────────────────────────

  it('E2E-A2: ERC-20 token transfer via buildTokenTransfer', async () => {
    // 1. Deploy SimpleERC20 (deployer = ANVIL_FUNDED_ADDRESS, gets 1M tokens)
    const tokenAddress = await deploySimpleERC20(ANVIL_RPC_URL);
    expect(tokenAddress).toBeTruthy();
    expect(tokenAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);

    const tokenDecimals = 18;
    const tokenSymbol = 'MTK';
    const transferAmount = 100n * 10n ** BigInt(tokenDecimals); // 100 tokens

    // 2. Build token transfer using EvmAdapter
    const unsignedTx = await adapter.buildTokenTransfer({
      from: ANVIL_FUNDED_ADDRESS,
      to: ANVIL_SECOND_ADDRESS,
      amount: transferAmount,
      token: {
        address: tokenAddress,
        decimals: tokenDecimals,
        symbol: tokenSymbol,
      },
    });

    expect(unsignedTx.chain).toBe('ethereum');
    expect(unsignedTx.serialized.length).toBeGreaterThan(0);
    expect(unsignedTx.metadata.tokenAddress).toBe(tokenAddress);

    // 3. Simulate
    const simResult = await adapter.simulateTransaction(unsignedTx);
    expect(simResult.success).toBe(true);

    // 4. Sign
    const signedTx = await adapter.signTransaction(unsignedTx, privateKeyBytes);
    expect(signedTx.length).toBeGreaterThan(0);

    // 5. Submit
    const submitResult = await adapter.submitTransaction(signedTx);
    expect(submitResult.txHash).toBeTruthy();
    expect(submitResult.status).toBe('submitted');

    // 6. Wait for confirmation
    const confirmResult = await adapter.waitForConfirmation(submitResult.txHash, 30_000);
    expect(confirmResult.status).toBe('confirmed');

    // 7. Verify token balance via getTokenInfo + direct RPC check
    //    Use viem directly to read the balanceOf
    const { createPublicClient, http } = await import('viem');
    const publicClient = createPublicClient({
      chain: foundry,
      transport: http(ANVIL_RPC_URL),
    });

    const balance = await publicClient.readContract({
      address: tokenAddress as `0x${string}`,
      abi: [
        {
          type: 'function',
          name: 'balanceOf',
          stateMutability: 'view',
          inputs: [{ name: 'account', type: 'address' }],
          outputs: [{ name: '', type: 'uint256' }],
        },
      ] as const,
      functionName: 'balanceOf',
      args: [ANVIL_SECOND_ADDRESS as `0x${string}`],
    });

    expect(balance).toBe(transferAmount);
  }, 30_000);

  // ─── E2E-A3: Gas Estimation Verification ─────────────────────────

  it('E2E-A3: gas estimation returns valid fee with safety margin', async () => {
    const feeEstimate = await adapter.estimateFee({
      from: ANVIL_FUNDED_ADDRESS,
      to: ANVIL_SECOND_ADDRESS,
      amount: 1_000_000_000_000_000n, // 0.001 ETH
    });

    // Fee should be a positive bigint
    expect(feeEstimate.fee).toBeGreaterThan(0n);
    expect(typeof feeEstimate.fee).toBe('bigint');

    // Details should contain gas parameters
    expect(feeEstimate.details).toBeDefined();
    const details = feeEstimate.details!;
    expect(details.gasLimit).toBeDefined();
    expect(details.maxFeePerGas).toBeDefined();
    expect(details.maxPriorityFeePerGas).toBeDefined();

    // Gas limit for simple ETH transfer: 21000 base * 1.2 safety margin = 25200
    const gasLimit = details.gasLimit as bigint;
    expect(gasLimit).toBe(25200n); // 21000 * 120 / 100

    // Verify safety margin: gasLimit should be 120% of base gas (21000)
    const baseGas = 21000n;
    expect(gasLimit).toBe((baseGas * 120n) / 100n);

    // Fee = gasLimit * maxFeePerGas
    const maxFeePerGas = details.maxFeePerGas as bigint;
    expect(feeEstimate.fee).toBe(gasLimit * maxFeePerGas);
  }, 10_000);
});
