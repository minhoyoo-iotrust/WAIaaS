/**
 * RPC Transaction Adapter.
 *
 * Converts eth_sendTransaction params to WAIaaS TransactionRequest format,
 * classifying transactions by type based on the `to` and `data` fields.
 *
 * Classification rules (mirrors tx-parser.ts selectors):
 * - to=null/undefined → CONTRACT_DEPLOY
 * - to + data(0xa9059cbb) → TOKEN_TRANSFER
 * - to + data(0x095ea7b3) → APPROVE
 * - to + data(other) → CONTRACT_CALL
 * - to + no data → TRANSFER
 *
 * Pitfall 14: 0x23b872dd (transferFrom) falls through to CONTRACT_CALL.
 * NFT transfers are NOT classified here.
 *
 * @see .planning/research/m31-14-rpc-proxy-PITFALLS.md (Pitfall 14)
 */

// ── ERC-20 Selectors ──────────────────────────────────────────────

const ERC20_TRANSFER_SELECTOR = '0xa9059cbb';
const ERC20_APPROVE_SELECTOR = '0x095ea7b3';

// ── Types ─────────────────────────────────────────────────────────

export interface EthTransactionParams {
  from?: string;
  to?: string | null;
  value?: string;
  data?: string;
  gas?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  nonce?: string;
}

/**
 * Simplified TransactionRequest output for the RPC proxy layer.
 * These are passed to the 6-stage pipeline which validates via Zod.
 */
export type RpcTransactionRequest =
  | { type: 'TRANSFER'; to: string; amount: string; network: string }
  | { type: 'TOKEN_TRANSFER'; tokenAddress: string; to: string; amount: string; network: string }
  | { type: 'APPROVE'; tokenAddress: string; spenderAddress: string; amount: string; network: string }
  | { type: 'CONTRACT_CALL'; to: string; data: string; value: string; network: string }
  | { type: 'CONTRACT_DEPLOY'; bytecode: string; value: string; network: string };

// ── Adapter ───────────────────────────────────────────────────────

export class RpcTransactionAdapter {
  /**
   * Convert eth_sendTransaction params[0] to WAIaaS TransactionRequest.
   */
  convert(params: EthTransactionParams, network: string): RpcTransactionRequest {
    const { to, data, value } = params;

    // CONTRACT_DEPLOY: no `to` field
    if (to === null || to === undefined) {
      return {
        type: 'CONTRACT_DEPLOY',
        bytecode: data ?? '0x',
        value: hexToDecimal(value),
        network,
      };
    }

    // Has data? Classify by selector
    if (data && data !== '0x' && data.length >= 10) {
      const selector = data.slice(0, 10).toLowerCase();

      // ERC-20 transfer(address,uint256)
      if (selector === ERC20_TRANSFER_SELECTOR) {
        const { address: recipient, amount } = decodeAddressAndUint256(data);
        return {
          type: 'TOKEN_TRANSFER',
          tokenAddress: to,
          to: recipient,
          amount,
          network,
        };
      }

      // ERC-20 approve(address,uint256)
      if (selector === ERC20_APPROVE_SELECTOR) {
        const { address: spender, amount } = decodeAddressAndUint256(data);
        return {
          type: 'APPROVE',
          tokenAddress: to,
          spenderAddress: spender,
          amount,
          network,
        };
      }

      // Other contract call (including transferFrom 0x23b872dd → Pitfall 14)
      return {
        type: 'CONTRACT_CALL',
        to,
        data,
        value: hexToDecimal(value),
        network,
      };
    }

    // Native TRANSFER: to + no data (or empty data)
    return {
      type: 'TRANSFER',
      to,
      amount: hexToDecimal(value),
      network,
    };
  }
}

// ── Utility Functions ─────────────────────────────────────────────

/**
 * Convert chain ID number to hex string for eth_chainId responses.
 * e.g., 1 → "0x1", 8453 → "0x2105"
 */
export function toHexChainId(chainId: number): string {
  return '0x' + chainId.toString(16);
}

/**
 * Convert hex value string to decimal string.
 * Returns '0' if undefined, empty, or '0x'.
 */
export function hexToDecimal(hex?: string): string {
  if (!hex || hex === '0x' || hex === '0x0') {
    return '0';
  }
  // Remove 0x prefix and parse as BigInt for large values
  const cleaned = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (!cleaned) return '0';
  return BigInt('0x' + cleaned).toString(10);
}

// ── Internal Helpers ──────────────────────────────────────────────

/**
 * Decode ABI-encoded (address, uint256) from calldata after the 4-byte selector.
 * Used for ERC-20 transfer(address,uint256) and approve(address,uint256).
 */
function decodeAddressAndUint256(data: string): { address: string; amount: string } {
  // data format: 0x{selector:8}{address:64}{uint256:64}
  // Address is bytes 10-74 (last 40 chars of 64-char padded address)
  const addressHex = data.slice(34, 74); // skip 0x + 8 selector + 24 padding
  const amountHex = data.slice(74, 138);

  const address = '0x' + addressHex.toLowerCase();
  const amount = amountHex ? BigInt('0x' + amountHex).toString(10) : '0';

  return { address, amount };
}
