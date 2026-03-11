/**
 * Credential vault module barrel export.
 */

export {
  deriveCredentialKey,
  encryptCredential,
  decryptCredential,
  type EncryptedCredentialData,
} from './credential-crypto.js';

export {
  type ICredentialVault,
  LocalCredentialVault,
} from './credential-vault.js';
