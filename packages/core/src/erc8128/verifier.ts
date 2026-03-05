/**
 * ERC-8128 HTTP Signature Verifier
 *
 * Verifies RFC 9421 HTTP message signatures using EIP-191 ecrecover via viem.
 * Checks: signature validity, Content-Digest integrity, TTL expiry, keyid match.
 */
import { recoverMessageAddress, type Hex } from 'viem';
import { parseKeyId } from './keyid.js';
import { buildContentDigest } from './content-digest.js';
import { buildSignatureBase } from './signature-input-builder.js';
import { SIGNATURE_LABEL } from './constants.js';
import type { VerifyResult } from './types.js';

export interface VerifyHttpSignatureParams {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

/**
 * Verify an ERC-8128 signed HTTP message.
 *
 * @param params - The HTTP request details with signature headers
 * @returns VerifyResult with valid, recoveredAddress, keyid, and optional error
 */
export async function verifyHttpSignature(
  params: VerifyHttpSignatureParams,
): Promise<VerifyResult> {
  const { method, url, headers, body } = params;

  // Case-insensitive header lookup
  const headerMap = new Map<string, string>();
  for (const [key, value] of Object.entries(headers)) {
    headerMap.set(key.toLowerCase(), value);
  }

  // 1. Extract Signature-Input header
  const signatureInputValue = headerMap.get('signature-input');
  if (!signatureInputValue) {
    return {
      valid: false,
      error: 'Missing Signature-Input header',
      recoveredAddress: null,
      keyid: '',
    };
  }

  // 2. Extract Signature header
  const signatureValue = headerMap.get('signature');
  if (!signatureValue) {
    return {
      valid: false,
      error: 'Missing Signature header',
      recoveredAddress: null,
      keyid: '',
    };
  }

  // 3. Parse Signature-Input to extract parameters
  const parsed = parseSignatureInput(signatureInputValue);
  if (!parsed) {
    return {
      valid: false,
      error: 'Failed to parse Signature-Input',
      recoveredAddress: null,
      keyid: '',
    };
  }

  const { coveredComponents, keyid, expires } = parsed;

  // 4. Check expiry
  if (expires !== undefined) {
    const now = Math.floor(Date.now() / 1000);
    if (expires < now) {
      return {
        valid: false,
        error: 'Signature expired',
        recoveredAddress: null,
        keyid,
      };
    }
  }

  // 5. Check Content-Digest integrity
  if (coveredComponents.includes('content-digest') && body !== undefined) {
    const expectedDigest = buildContentDigest(body);
    const actualDigest = headerMap.get('content-digest');
    if (actualDigest !== expectedDigest) {
      return {
        valid: false,
        error: 'Content-Digest mismatch',
        recoveredAddress: null,
        keyid,
      };
    }
  }

  // 6. Reconstruct Signature Base
  const signatureBase = buildSignatureBase({
    method,
    url,
    headers: Object.fromEntries(headerMap),
    coveredComponents,
    signatureInput: signatureInputValue,
  });

  // 7. Extract signature bytes from Signature header (sig1=:base64:)
  const sigMatch = signatureValue.match(
    new RegExp(`^${SIGNATURE_LABEL}=:([A-Za-z0-9+/]+=*):$`),
  );
  if (!sigMatch) {
    return {
      valid: false,
      error: 'Invalid Signature format',
      recoveredAddress: null,
      keyid,
    };
  }

  const sigBase64 = sigMatch[1]!;
  const sigBytes = Buffer.from(sigBase64, 'base64');
  const sigHex = `0x${sigBytes.toString('hex')}` as Hex;

  // 8. Recover address via ecrecover
  let recoveredAddress: string;
  try {
    recoveredAddress = await recoverMessageAddress({
      message: signatureBase,
      signature: sigHex,
    });
  } catch {
    return {
      valid: false,
      error: 'Failed to recover address from signature',
      recoveredAddress: null,
      keyid,
    };
  }

  // 9. Compare recovered address with keyid address
  try {
    const parsedKeyid = parseKeyId(keyid);
    if (
      recoveredAddress.toLowerCase() !== parsedKeyid.address.toLowerCase()
    ) {
      return {
        valid: false,
        error: 'Recovered address does not match keyid',
        recoveredAddress,
        keyid,
      };
    }
  } catch {
    return {
      valid: false,
      error: 'Invalid keyid format',
      recoveredAddress,
      keyid,
    };
  }

  return {
    valid: true,
    recoveredAddress,
    keyid,
  };
}

/**
 * Parse a Signature-Input header value to extract components and parameters.
 */
function parseSignatureInput(value: string): {
  coveredComponents: string[];
  keyid: string;
  algorithm: string;
  created?: number;
  expires?: number;
  nonce?: string;
} | null {
  // Format: sig1=("@method" "@target-uri" ...);created=T;keyid="...";alg="...";expires=T[;nonce="..."]
  const labelPrefix = `${SIGNATURE_LABEL}=`;
  if (!value.startsWith(labelPrefix)) {
    return null;
  }

  const rest = value.slice(labelPrefix.length);

  // Extract component list from parentheses
  const parenMatch = rest.match(/^\(([^)]*)\)/);
  if (!parenMatch) {
    return null;
  }

  const componentStr = parenMatch[1]!;
  const coveredComponents = componentStr
    .split(/\s+/)
    .map((c) => c.replace(/"/g, ''))
    .filter((c) => c.length > 0);

  // Extract parameters after the closing paren
  const paramStr = rest.slice(parenMatch[0].length);

  const keyidMatch = paramStr.match(/;keyid="([^"]*)"/);
  const algMatch = paramStr.match(/;alg="([^"]*)"/);
  const createdMatch = paramStr.match(/;created=(\d+)/);
  const expiresMatch = paramStr.match(/;expires=(\d+)/);
  const nonceMatch = paramStr.match(/;nonce="([^"]*)"/);

  return {
    coveredComponents,
    keyid: keyidMatch?.[1] ?? '',
    algorithm: algMatch?.[1] ?? '',
    created: createdMatch?.[1] ? parseInt(createdMatch[1], 10) : undefined,
    expires: expiresMatch?.[1] ? parseInt(expiresMatch[1], 10) : undefined,
    nonce: nonceMatch?.[1],
  };
}
