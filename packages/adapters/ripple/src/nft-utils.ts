/**
 * XLS-20 NFT utility functions for XRPL.
 *
 * Provides helpers for:
 * - Decoding hex-encoded NFT URIs to UTF-8 strings
 * - Parsing NFTokenID to extract taxon and sequence fields
 *
 * @see Phase 473-01 (XLS-20 NFT adapter)
 */

/**
 * Decode a hex-encoded NFT URI to a UTF-8 string.
 * XRPL stores URIs as uppercase hex strings in NFToken objects.
 *
 * @param hexUri - Hex-encoded URI string (e.g., "697066733A2F2F...")
 * @returns Decoded UTF-8 string (e.g., "ipfs://...")
 */
export function decodeNftUri(hexUri: string): string {
  if (!hexUri || hexUri.length === 0) return '';
  // Convert hex pairs to bytes, then decode as UTF-8
  const bytes = new Uint8Array(hexUri.length / 2);
  for (let i = 0; i < hexUri.length; i += 2) {
    bytes[i / 2] = parseInt(hexUri.substring(i, i + 2), 16);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Parse an XLS-20 NFTokenID (64-char hex) to extract embedded fields.
 *
 * NFTokenID structure (256 bits / 64 hex chars):
 *   [0-3]   Flags (16 bits)
 *   [4-7]   TransferFee (16 bits)
 *   [8-47]  Issuer AccountID (160 bits / 40 hex chars)
 *   [48-55] Taxon (32 bits, scrambled with sequence)
 *   [56-63] Sequence (32 bits)
 *
 * Note: The taxon field in the NFTokenID is scrambled (XORed) with the sequence
 * using a deterministic algorithm. This function returns the raw (scrambled) taxon.
 *
 * @param nftTokenId - 64-character hex NFTokenID
 * @returns Parsed fields: flags, transferFee, issuer, taxon (raw), sequence
 */
export function parseNftTokenId(nftTokenId: string): {
  flags: number;
  transferFee: number;
  issuer: string;
  taxon: number;
  sequence: number;
} {
  if (!nftTokenId || nftTokenId.length !== 64) {
    throw new Error(`Invalid NFTokenID: expected 64 hex chars, got ${nftTokenId?.length ?? 0}`);
  }

  const flags = parseInt(nftTokenId.substring(0, 4), 16);
  const transferFee = parseInt(nftTokenId.substring(4, 8), 16);
  const issuer = nftTokenId.substring(8, 48);
  const taxon = parseInt(nftTokenId.substring(48, 56), 16);
  const sequence = parseInt(nftTokenId.substring(56, 64), 16);

  return { flags, transferFee, issuer, taxon, sequence };
}
