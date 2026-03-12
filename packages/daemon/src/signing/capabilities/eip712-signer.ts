/**
 * EIP-712 typed data signer capability.
 *
 * Wraps viem's signTypedData for EIP-712 typed data signing.
 *
 * @since v31.12
 */
import { privateKeyToAccount } from 'viem/accounts';
import type { ISignerCapability, SigningParams, SigningResult, Eip712SigningParams } from '../types.js';
import { SigningError } from '../signing-error.js';

export class Eip712SignerCapability implements ISignerCapability {
  readonly scheme = 'eip712' as const;

  canSign(params: SigningParams): boolean {
    if (params.scheme !== 'eip712') return false;
    const p = params as Eip712SigningParams;
    return typeof p.privateKey === 'string' && p.privateKey.length > 0;
  }

  async sign(params: SigningParams): Promise<SigningResult> {
    const p = params as Eip712SigningParams;
    try {
      const account = privateKeyToAccount(p.privateKey);
      const signature = await account.signTypedData({
        domain: p.domain as any,
        types: p.types as any,
        primaryType: p.primaryType,
        message: p.value as any,
      });
      return { signature };
    } catch (err) {
      throw new SigningError(
        `EIP-712 signing failed: ${(err as Error).message}`,
        'eip712',
        'INVALID_KEY',
        err as Error,
      );
    }
  }
}
