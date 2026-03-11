/**
 * HMAC-SHA256 signer capability.
 *
 * Uses node:crypto createHmac for HMAC-SHA256 signing.
 *
 * @since v31.12
 */
import { createHmac } from 'node:crypto';
import type { ISignerCapability, SigningParams, SigningResult, HmacSigningParams } from '../types.js';
import { SigningError } from '../signing-error.js';

export class HmacSignerCapability implements ISignerCapability {
  readonly scheme = 'hmac-sha256' as const;

  canSign(params: SigningParams): boolean {
    if (params.scheme !== 'hmac-sha256') return false;
    const p = params as HmacSigningParams;
    return typeof p.secret === 'string' && p.secret.length > 0;
  }

  async sign(params: SigningParams): Promise<SigningResult> {
    const p = params as HmacSigningParams;
    try {
      const encoding = p.encoding ?? 'hex';
      const signature = createHmac('sha256', p.secret)
        .update(p.data)
        .digest(encoding);
      return { signature };
    } catch (err) {
      throw new SigningError(
        `HMAC-SHA256 signing failed: ${(err as Error).message}`,
        'hmac-sha256',
        'SIGNING_FAILED',
        err as Error,
      );
    }
  }
}
