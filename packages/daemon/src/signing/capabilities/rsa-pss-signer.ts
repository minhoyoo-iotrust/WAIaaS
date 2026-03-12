/**
 * RSA-PSS signer capability.
 *
 * Uses node:crypto for RSA-PSS signing with SHA-256.
 *
 * @since v31.12
 */
import { sign as cryptoSign, constants } from 'node:crypto';
import type { ISignerCapability, SigningParams, SigningResult, RsaPssSigningParams } from '../types.js';
import { SigningError } from '../signing-error.js';

export class RsaPssSignerCapability implements ISignerCapability {
  readonly scheme = 'rsa-pss' as const;

  canSign(params: SigningParams): boolean {
    if (params.scheme !== 'rsa-pss') return false;
    const p = params as RsaPssSigningParams;
    return typeof p.privateKey === 'string' && p.privateKey.length > 0;
  }

  async sign(params: SigningParams): Promise<SigningResult> {
    const p = params as RsaPssSigningParams;
    try {
      const saltLength = p.saltLength ?? 32;
      const sigBuffer = cryptoSign('sha256', Buffer.from(p.data), {
        key: p.privateKey,
        padding: constants.RSA_PKCS1_PSS_PADDING,
        saltLength,
      });
      const signature = sigBuffer.toString('base64');
      return { signature };
    } catch (err) {
      throw new SigningError(
        `RSA-PSS signing failed: ${(err as Error).message}`,
        'rsa-pss',
        'SIGNING_FAILED',
        err as Error,
      );
    }
  }
}
