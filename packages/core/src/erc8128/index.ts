/**
 * ERC-8128 Signed HTTP Requests - Public API
 *
 * RFC 9421 HTTP message signing + EIP-191 Ethereum signatures.
 */

// Signing and verification
export { signHttpMessage } from './http-message-signer.js';
export type {
  SignHttpMessageParams,
  SignHttpMessageResult,
} from './http-message-signer.js';
export { verifyHttpSignature } from './verifier.js';
export type { VerifyHttpSignatureParams } from './verifier.js';

// Foundation modules
export { buildKeyId, parseKeyId } from './keyid.js';
export { buildContentDigest } from './content-digest.js';
export {
  buildSignatureInput,
  buildSignatureBase,
} from './signature-input-builder.js';
export type {
  BuildSignatureInputParams,
  BuildSignatureBaseParams,
} from './signature-input-builder.js';

// Constants
export {
  DEFAULT_ALGORITHM,
  DEFAULT_COVERED_COMPONENTS,
  SIGNATURE_LABEL,
  ERC8128_ALGORITHMS,
} from './constants.js';

// Zod schemas and types
export {
  SignHttpRequestSchema,
  VerifyResultSchema,
  CoveredComponentsPresetSchema,
  SignatureParamsSchema,
} from './types.js';
export type {
  SignHttpRequest,
  VerifyResult,
  CoveredComponentsPreset,
  SignatureParams,
} from './types.js';
