/**
 * ECDSA secp256k1 raw bytes signer capability.
 *
 * Uses viem for secp256k1 signing with optional keccak256 hashing.
 *
 * @since v31.12
 */
import { privateKeyToAccount } from 'viem/accounts';
import { keccak256 } from 'viem';
import type { ISignerCapability, SigningParams, SigningResult, EcdsaSecp256k1SigningParams } from '../types.js';
import { SigningError } from '../signing-error.js';

export class EcdsaSignBytesCapability implements ISignerCapability {
  readonly scheme = 'ecdsa-secp256k1' as const;

  canSign(params: SigningParams): boolean {
    if (params.scheme !== 'ecdsa-secp256k1') return false;
    const p = params as EcdsaSecp256k1SigningParams;
    return typeof p.privateKey === 'string' && p.privateKey.length > 0;
  }

  async sign(params: SigningParams): Promise<SigningResult> {
    const p = params as EcdsaSecp256k1SigningParams;
    try {
      const account = privateKeyToAccount(p.privateKey);
      const hashData = p.hashData !== false; // default true

      if (hashData) {
        // Hash with keccak256 then sign via signMessage (which does personal_sign with EIP-191 prefix)
        // For raw ECDSA signing we use signMessage with the hash as raw
        const hash = keccak256(p.data as `0x${string}`);
        const signature = await account.signMessage({ message: { raw: hash } });
        return { signature };
      } else {
        // Sign raw bytes directly (data must be 32 bytes / 0x-prefixed 64 hex chars)
        const signature = await account.signMessage({ message: { raw: p.data as `0x${string}` } });
        return { signature };
      }
    } catch (err) {
      throw new SigningError(
        `ECDSA secp256k1 signing failed: ${(err as Error).message}`,
        'ecdsa-secp256k1',
        'SIGNING_FAILED',
        err as Error,
      );
    }
  }
}
