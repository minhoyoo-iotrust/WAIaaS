/**
 * Ed25519 signer capability.
 *
 * Uses node:crypto ed25519 signing for raw bytes.
 *
 * @since v31.12
 */
import { sign as cryptoSign, createPrivateKey } from 'node:crypto';
import type { ISignerCapability, SigningParams, SigningResult, Ed25519SigningParams } from '../types.js';
import { SigningError } from '../signing-error.js';

export class Ed25519SignBytesCapability implements ISignerCapability {
  readonly scheme = 'ed25519' as const;

  canSign(params: SigningParams): boolean {
    if (params.scheme !== 'ed25519') return false;
    const p = params as Ed25519SigningParams;
    return p.privateKey instanceof Uint8Array && p.privateKey.length > 0;
  }

  async sign(params: SigningParams): Promise<SigningResult> {
    const p = params as Ed25519SigningParams;
    try {
      // Build PKCS8 DER format from raw 32-byte ed25519 seed
      // PKCS8 ed25519 header: 30 2e 02 01 00 30 05 06 03 2b 65 70 04 22 04 20
      const pkcs8Header = Buffer.from(
        '302e020100300506032b657004220420',
        'hex',
      );
      const pkcs8Der = Buffer.concat([pkcs8Header, Buffer.from(p.privateKey)]);

      const keyObject = createPrivateKey({
        key: pkcs8Der,
        format: 'der',
        type: 'pkcs8',
      });

      const sigBuffer = cryptoSign(null, Buffer.from(p.data), keyObject);
      const signature = new Uint8Array(sigBuffer);
      return { signature };
    } catch (err) {
      throw new SigningError(
        `Ed25519 signing failed: ${(err as Error).message}`,
        'ed25519',
        'SIGNING_FAILED',
        err as Error,
      );
    }
  }
}
