// Keystore module - AES-256-GCM encryption with Argon2id KDF and sodium guarded memory

export { deriveKey, encrypt, decrypt, KDF_PARAMS, type EncryptedData } from './crypto.js';
export { allocateGuarded, writeToGuarded, zeroAndRelease, isAvailable } from './memory.js';
export { LocalKeyStore, type KeystoreFileV1 } from './keystore.js';
