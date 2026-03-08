/**
 * HyperliquidSigner: EIP-712 signing for L1 Actions (phantom agent) and User-Signed Actions.
 *
 * @see HDESIGN-02: EIP-712 signing spec
 */
import { encode } from '@msgpack/msgpack';
import {
  keccak256,
  concat,
  hexToBytes,
  numberToHex,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { HL_L1_DOMAIN, hlUserSignedDomain } from './config.js';
import { USER_ACTION_TYPES, type OrderWire } from './schemas.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Remove trailing zeros from a decimal string.
 * "100.00" -> "100", "1.50" -> "1.5", "0.0010" -> "0.001", "10" -> "10"
 */
export function removeTrailingZeros(s: string): string {
  if (!s.includes('.')) return s;
  let result = s.replace(/0+$/, '');
  if (result.endsWith('.')) result = result.slice(0, -1);
  return result;
}

/**
 * Convert an order to wire format with canonical field order.
 * CRITICAL: field order must match Python SDK signing.py for msgpack compatibility.
 */
export function orderToWire(
  assetIndex: number,
  isBuy: boolean,
  limitPx: string,
  sz: string,
  reduceOnly: boolean,
  orderType: { limit?: { tif: string }; trigger?: { isMarket: boolean; triggerPx: string; tpsl: string } },
  cloid?: string,
): OrderWire {
  const wire: OrderWire = {
    a: assetIndex,
    b: isBuy,
    p: removeTrailingZeros(limitPx),
    s: removeTrailingZeros(sz),
    r: reduceOnly,
    t: orderType,
  };
  if (cloid) {
    wire.c = cloid;
  }
  return wire;
}

/**
 * Parse r, s, v from a 65-byte compact signature.
 */
function parseSignature(sig: Hex): { r: Hex; s: Hex; v: number } {
  const bytes = hexToBytes(sig);
  const r = numberToHex(BigInt('0x' + Buffer.from(bytes.slice(0, 32)).toString('hex')), { size: 32 });
  const s = numberToHex(BigInt('0x' + Buffer.from(bytes.slice(32, 64)).toString('hex')), { size: 32 });
  const v = bytes[64]!;
  return { r, s, v };
}

// ---------------------------------------------------------------------------
// HyperliquidSigner
// ---------------------------------------------------------------------------

/**
 * Static methods for Hyperliquid EIP-712 signing.
 * No instance state -- all methods are static.
 */
export class HyperliquidSigner {
  /**
   * Sign an L1 action using the phantom agent pattern.
   *
   * Flow:
   * 1. Normalize decimal strings (remove trailing zeros)
   * 2. Msgpack encode the action
   * 3. Build connectionId: keccak256(encoded + nonce + vaultBytes)
   * 4. Sign phantom agent via EIP-712
   */
  static async signL1Action(
    action: Record<string, unknown>,
    nonce: number,
    isMainnet: boolean,
    privateKey: Hex,
    vaultAddress?: Hex,
  ): Promise<{ r: Hex; s: Hex; v: number }> {
    // Step 1: msgpack encode the action (field order must be canonical)
    const encoded = encode(action);

    // Step 2: nonce bytes (8 bytes big-endian)
    const nonceBytes = new Uint8Array(8);
    const nonceBig = BigInt(nonce);
    for (let i = 7; i >= 0; i--) {
      nonceBytes[i] = Number(nonceBig >> BigInt((7 - i) * 8) & 0xFFn);
    }

    // Step 3: vault address bytes
    const vaultBytes = vaultAddress
      ? new Uint8Array([0x01, ...hexToBytes(vaultAddress)])
      : new Uint8Array([0x00]);

    // Step 4: keccak256 -> connectionId
    const connectionId = keccak256(
      concat([new Uint8Array(encoded), nonceBytes, vaultBytes]),
    );

    // Step 5: phantom agent
    const phantomAgent = {
      source: isMainnet ? 'a' : 'b',
      connectionId,
    };

    // Step 6: EIP-712 sign
    const account = privateKeyToAccount(privateKey);
    const signature = await account.signTypedData({
      domain: HL_L1_DOMAIN,
      types: {
        Agent: [
          { name: 'source', type: 'string' },
          { name: 'connectionId', type: 'bytes32' },
        ],
      },
      primaryType: 'Agent',
      message: phantomAgent,
    });

    return parseSignature(signature);
  }

  /**
   * Sign a user-signed action (withdraw, transfer, sub-account, etc.).
   * Uses HyperliquidSignTransaction domain with network-specific chainId.
   */
  static async signUserSignedAction(
    actionType: string,
    action: Record<string, unknown>,
    isMainnet: boolean,
    privateKey: Hex,
  ): Promise<{ r: Hex; s: Hex; v: number }> {
    const typesDef = USER_ACTION_TYPES[actionType];
    if (!typesDef) {
      throw new Error(`Unknown user-signed action type: ${actionType}`);
    }

    const account = privateKeyToAccount(privateKey);
    const primaryType = `HyperliquidTransaction:${actionType}`;

    const signature = await account.signTypedData({
      domain: hlUserSignedDomain(isMainnet),
      types: {
        [primaryType]: typesDef,
      },
      primaryType,
      message: action,
    });

    return parseSignature(signature);
  }
}
