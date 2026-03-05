/**
 * ERC-8128 HTTP Message Signer
 *
 * Composes foundation modules (keyid, content-digest, signature-input-builder)
 * into a complete signing flow using EIP-191 signMessage via viem.
 */
import { privateKeyToAccount } from 'viem/accounts';
import { buildKeyId } from './keyid.js';
import { buildContentDigest } from './content-digest.js';
import {
  buildSignatureInput,
  buildSignatureBase,
} from './signature-input-builder.js';
import { DEFAULT_ALGORITHM, DEFAULT_COVERED_COMPONENTS, SIGNATURE_LABEL } from './constants.js';

export interface SignHttpMessageParams {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  privateKey: `0x${string}`;
  chainId: number;
  address: string;
  coveredComponents?: string[];
  preset?: 'minimal' | 'standard' | 'strict';
  ttlSec?: number;
  nonce?: string | false;
}

export interface SignHttpMessageResult {
  headers: {
    'Signature-Input': string;
    'Signature': string;
    'Content-Digest'?: string;
  };
  keyid: string;
  algorithm: string;
  created: number;
  expires: number;
  coveredComponents: string[];
}

/**
 * Sign an HTTP message per ERC-8128 (RFC 9421 + EIP-191).
 *
 * @param params - HTTP request details + signing key
 * @returns Signature headers + metadata
 */
export async function signHttpMessage(
  params: SignHttpMessageParams,
): Promise<SignHttpMessageResult> {
  const {
    method,
    url,
    body,
    privateKey,
    chainId,
    address,
    preset = 'standard',
    ttlSec = 300,
  } = params;

  // 1. Resolve covered components
  const presetComponents = DEFAULT_COVERED_COMPONENTS[preset] ?? DEFAULT_COVERED_COMPONENTS['standard']!;
  let coveredComponents = params.coveredComponents
    ? [...params.coveredComponents]
    : [...presetComponents!];

  // 2. Build headers copy with potential Content-Digest
  const headersCopy = { ...params.headers };
  let contentDigest: string | undefined;

  if (body && coveredComponents.includes('content-digest')) {
    contentDigest = buildContentDigest(body);
    headersCopy['Content-Digest'] = contentDigest;
  } else if (!body && coveredComponents.includes('content-digest')) {
    // Remove content-digest from coveredComponents for bodyless requests
    coveredComponents = coveredComponents.filter((c) => c !== 'content-digest');
  }

  // Also remove content-type if no body and it was auto-included
  if (!body && !params.coveredComponents && coveredComponents.includes('content-type')) {
    coveredComponents = coveredComponents.filter((c) => c !== 'content-type');
  }

  // 3. Generate nonce
  let nonce: string | undefined;
  if (params.nonce === false) {
    nonce = undefined;
  } else if (typeof params.nonce === 'string') {
    nonce = params.nonce;
  } else {
    nonce = crypto.randomUUID();
  }

  // 4. Timestamps
  const created = Math.floor(Date.now() / 1000);
  const expires = created + ttlSec;

  // 5. Build keyid
  const keyid = buildKeyId(chainId, address);

  // 6. Build Signature-Input
  const signatureInput = buildSignatureInput({
    coveredComponents,
    keyid,
    algorithm: DEFAULT_ALGORITHM,
    created,
    expires,
    nonce,
  });

  // 7. Build Signature Base
  const signatureBase = buildSignatureBase({
    method,
    url,
    headers: headersCopy,
    coveredComponents,
    signatureInput,
  });

  // 8. Sign with EIP-191
  const account = privateKeyToAccount(privateKey);
  const hexSignature = await account.signMessage({
    message: signatureBase,
  });

  // 9. Convert hex signature to base64
  const sigBytes = hexToBytes(hexSignature);
  const sigBase64 = Buffer.from(sigBytes).toString('base64');

  // 10. Format Signature header: sig1=:base64:
  const signatureHeader = `${SIGNATURE_LABEL}=:${sigBase64}:`;

  // 11. Build result
  const resultHeaders: SignHttpMessageResult['headers'] = {
    'Signature-Input': signatureInput,
    'Signature': signatureHeader,
  };

  if (contentDigest) {
    resultHeaders['Content-Digest'] = contentDigest;
  }

  return {
    headers: resultHeaders,
    keyid,
    algorithm: DEFAULT_ALGORITHM,
    created,
    expires,
    coveredComponents,
  };
}

/**
 * Convert hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
  }
  return bytes;
}
