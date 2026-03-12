/**
 * Personal sign (EIP-191) signer capability.
 *
 * Wraps viem's signMessage for personal_sign operations.
 *
 * @since v31.12
 */
import { privateKeyToAccount } from 'viem/accounts';
import type { ISignerCapability, SigningParams, SigningResult, PersonalSigningParams } from '../types.js';
import { SigningError } from '../signing-error.js';

export class PersonalSignCapability implements ISignerCapability {
  readonly scheme = 'personal' as const;

  canSign(params: SigningParams): boolean {
    if (params.scheme !== 'personal') return false;
    const p = params as PersonalSigningParams;
    return typeof p.privateKey === 'string' && p.privateKey.length > 0;
  }

  async sign(params: SigningParams): Promise<SigningResult> {
    const p = params as PersonalSigningParams;
    try {
      const account = privateKeyToAccount(p.privateKey);
      // viem signMessage accepts string or hex (0x-prefixed raw bytes)
      const signature = await account.signMessage({
        message: p.message.startsWith('0x')
          ? { raw: p.message as `0x${string}` }
          : p.message,
      });
      return { signature };
    } catch (err) {
      throw new SigningError(
        `Personal sign failed: ${(err as Error).message}`,
        'personal',
        'SIGNING_FAILED',
        err as Error,
      );
    }
  }
}
