/**
 * ERC-8128 HTTP message signer capability.
 *
 * Delegates to @waiaas/core erc8128.signHttpMessage().
 *
 * @since v31.12
 */
import { erc8128 } from '@waiaas/core';
import type { ISignerCapability, SigningParams, SigningResult, Erc8128SigningParams } from '../types.js';
import { SigningError } from '../signing-error.js';

export class Erc8128SignerCapability implements ISignerCapability {
  readonly scheme = 'erc8128' as const;

  canSign(params: SigningParams): boolean {
    if (params.scheme !== 'erc8128') return false;
    const p = params as Erc8128SigningParams;
    return (
      typeof p.privateKey === 'string' && p.privateKey.length > 0 &&
      typeof p.chainId === 'number' &&
      typeof p.address === 'string' && p.address.length > 0
    );
  }

  async sign(params: SigningParams): Promise<SigningResult> {
    const p = params as Erc8128SigningParams;
    try {
      const result = await erc8128.signHttpMessage({
        method: p.method,
        url: p.url,
        headers: p.headers,
        body: p.body,
        privateKey: p.privateKey,
        chainId: p.chainId,
        address: p.address,
        coveredComponents: p.coveredComponents,
        preset: p.preset,
        ttlSec: p.ttlSec,
        nonce: p.nonce,
      });

      return {
        signature: JSON.stringify(result.headers),
        metadata: {
          'Signature-Input': result.headers['Signature-Input'],
          'Signature': result.headers['Signature'],
          ...(result.headers['Content-Digest'] && { 'Content-Digest': result.headers['Content-Digest'] }),
          keyid: result.keyid,
          algorithm: result.algorithm,
          created: result.created,
          expires: result.expires,
          coveredComponents: result.coveredComponents,
        },
      };
    } catch (err) {
      throw new SigningError(
        `ERC-8128 signing failed: ${(err as Error).message}`,
        'erc8128',
        'SIGNING_FAILED',
        err as Error,
      );
    }
  }
}
