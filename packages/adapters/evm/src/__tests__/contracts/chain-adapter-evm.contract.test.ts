/**
 * Contract Test: EvmAdapter
 *
 * Verifies that EvmAdapter passes the shared IChainAdapter contract test suite.
 * Uses vi.mock('viem') to intercept all RPC calls with canned responses.
 *
 * CTST-02: EvmAdapter must pass the same shape-verification tests as MockChainAdapter,
 * with buildBatch throwing BATCH_NOT_SUPPORTED.
 *
 * Some methods with complex internal flows are skipped as they are thoroughly
 * tested in dedicated unit tests. The core value: the SAME shared suite runs
 * against all adapters, including the BATCH_NOT_SUPPORTED assertion for EVM.
 */

import { describe, vi } from 'vitest';

// ---- Mock setup for viem ----

const mockClient = {
  getBlockNumber: vi.fn().mockResolvedValue(100n),
  getBalance: vi.fn().mockResolvedValue(1_000_000_000_000_000_000n), // 1 ETH
  getTransactionCount: vi.fn().mockResolvedValue(5),
  estimateGas: vi.fn().mockResolvedValue(21000n),
  estimateFeesPerGas: vi.fn().mockResolvedValue({
    maxFeePerGas: 30_000_000_000n,
    maxPriorityFeePerGas: 1_000_000_000n,
  }),
  call: vi.fn().mockResolvedValue({ data: '0x' }),
  sendRawTransaction: vi.fn().mockResolvedValue('0xmock-tx-hash-evm'),
  waitForTransactionReceipt: vi.fn().mockResolvedValue({
    status: 'success',
    blockNumber: 101n,
    gasUsed: 21000n,
    effectiveGasPrice: 30_000_000_000n,
  }),
  getTransactionReceipt: vi.fn().mockResolvedValue({
    status: 'success',
    blockNumber: 101n,
    gasUsed: 21000n,
    effectiveGasPrice: 30_000_000_000n,
  }),
  multicall: vi.fn().mockResolvedValue([
    { status: 'success', result: 6 },    // decimals
    { status: 'success', result: 'USDC' }, // symbol
    { status: 'success', result: 'USD Coin' }, // name
  ]),
  chain: { id: 11155111 }, // Sepolia chainId
};

vi.mock('viem', async () => {
  const actual = await vi.importActual<typeof import('viem')>('viem');
  return {
    ...actual,
    createPublicClient: vi.fn(() => mockClient),
    serializeTransaction: vi.fn(() => '0x02f8deadbeef' as const),
    parseTransaction: vi.fn(() => ({
      to: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28' as const,
      value: 1_000_000_000_000_000_000n,
      nonce: 5,
      gas: 25200n,
      maxFeePerGas: 30_000_000_000n,
      maxPriorityFeePerGas: 1_000_000_000n,
      chainId: 11155111,
      type: 'eip1559' as const,
    })),
    hexToBytes: vi.fn((hex: string) => {
      const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
      const bytes = new Uint8Array(clean.length / 2);
      for (let i = 0; i < clean.length; i += 2) {
        bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
      }
      return bytes;
    }),
    toHex: vi.fn((bytes: Uint8Array) => {
      return '0x' + Buffer.from(bytes).toString('hex');
    }),
    encodeFunctionData: vi.fn(() => '0xa9059cbb0000000000000000000000001234567890abcdef1234567890abcdef1234567800000000000000000000000000000000000000000000000000000000000003e8' as const),
  };
});

vi.mock('viem/accounts', () => ({
  privateKeyToAccount: vi.fn(() => ({
    signTransaction: vi.fn(async () => '0xsigned_tx_hex_data_contract_test'),
  })),
}));

import { EvmAdapter } from '../../adapter.js';
import { chainAdapterContractTests } from '@waiaas/core/testing';

// ---- Test Constants ----

const MOCK_RPC_URL = 'http://localhost:18545';
const VALID_EVM_ADDRESS = '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28';
const VALID_EVM_ADDRESS_2 = '0x1234567890abcdef1234567890abcdef12345678';

// ---- Run Contract Tests ----

describe('CT-2: EvmAdapter Contract Tests', () => {
  chainAdapterContractTests(
    async () => {
      const adapter = new EvmAdapter('ethereum-sepolia');
      await adapter.connect(MOCK_RPC_URL);
      return adapter;
    },
    {
      expectedChain: 'ethereum',
      validAddress: VALID_EVM_ADDRESS,
      validAddress2: VALID_EVM_ADDRESS_2,
      batchNotSupported: true, // EVM buildBatch -> BATCH_NOT_SUPPORTED
      rpcUrl: MOCK_RPC_URL,
      privateKey: new Uint8Array(32).fill(0x42), // EVM uses 32-byte private keys
      // Skip methods with complex internal flows already tested in dedicated tests:
      // - signTransaction: needs real account signature flow (tested in evm-adapter.test.ts)
      // - submitTransaction: depends on signTransaction output (tested in evm-adapter.test.ts)
      // - buildTokenTransfer: needs encodeFunctionData + gas estimation chain (tested in evm-token-transfer.test.ts)
      // - buildContractCall: needs calldata validation + gas (tested in evm-adapter.test.ts)
      // - buildApprove: needs encodeFunctionData + gas (tested in evm-adapter.test.ts)
      // - sweepAll: stub (Not implemented, throws)
      // - signExternalTransaction: needs account mock + parseTransaction chain (tested in evm-sign-only.test.ts)
      skipMethods: [
        'signTransaction',
        'submitTransaction',
        'buildTokenTransfer',
        'buildContractCall',
        'buildApprove',
        'sweepAll',
        'signExternalTransaction',
      ],
    },
  );
});
