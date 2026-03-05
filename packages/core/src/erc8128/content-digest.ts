/**
 * ERC-8128 Content-Digest generation per RFC 9530
 *
 * Produces SHA-256 hash of request body in the format: sha-256=:<base64>:
 */
import { createHash } from 'node:crypto';

/**
 * Build a Content-Digest header value per RFC 9530.
 *
 * @param body - The HTTP request body as a UTF-8 string
 * @returns Content-Digest value in `sha-256=:<base64>:` format
 */
export function buildContentDigest(body: string): string {
  const hash = createHash('sha256').update(body, 'utf-8').digest('base64');
  return `sha-256=:${hash}:`;
}
