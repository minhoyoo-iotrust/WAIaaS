/**
 * Binary archive format utilities for encrypted WAIaaS backup files.
 *
 * Archive layout (60-byte fixed header):
 *   Offset  Size  Field
 *   0x0000  8B    Magic Number ("WAIAAS\x00\x01")
 *   0x0008  2B    Format Version (uint16 LE)
 *   0x000A  2B    Reserved (0x0000)
 *   0x000C  4B    Metadata Length (uint32 LE)
 *   0x0010  16B   KDF Salt
 *   0x0020  12B   AES-GCM Nonce
 *   0x002C  16B   AES-GCM Auth Tag
 *   0x003C  NB    Metadata (plaintext JSON)
 *   0x003C+N MB   Encrypted Payload (AES-256-GCM ciphertext)
 *
 * Entry format (within decrypted payload):
 *   [nameLen:uint16 LE][name:UTF-8][dataLen:uint64 LE][data:bytes]
 *
 * @see docs/306/DESIGN-SPEC.md section 2
 */

import { WAIaaSError } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Magic bytes: "WAIAAS\x00\x01" */
export const BACKUP_MAGIC = Buffer.from([0x57, 0x41, 0x49, 0x41, 0x41, 0x53, 0x00, 0x01]);

/** Format version: 1 */
export const BACKUP_FORMAT_VERSION = 1;

/** Fixed header size: 60 bytes (0x3C) */
export const BACKUP_HEADER_SIZE = 60;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Plaintext metadata stored in the archive (no decryption needed to read). */
export interface BackupMetadata {
  created_at: string;
  daemon_version: string;
  schema_version: number;
  kdf: 'argon2id';
  kdf_params: {
    memory_cost: number;
    time_cost: number;
    parallelism: number;
    hash_length: number;
  };
  contents: {
    database: { name: string; size: number };
    config?: { name: string; size: number };
    keystore_files: Array<{ name: string; size: number }>;
  };
  checksum: string;
}

/** Summary info for a backup file (for list display). */
export interface BackupInfo {
  path: string;
  filename: string;
  size: number;
  created_at: string;
  daemon_version: string;
  schema_version: number;
  file_count: number;
}

/** Parsed archive header fields. */
export interface ArchiveHeader {
  magic: Buffer;
  version: number;
  reserved: number;
  metadataLength: number;
  salt: Buffer;
  nonce: Buffer;
  authTag: Buffer;
}

// ---------------------------------------------------------------------------
// Entry encoding/decoding
// ---------------------------------------------------------------------------

/**
 * Encode entries as [nameLen:uint16 LE][name:UTF-8][dataLen:uint64 LE][data:bytes].
 */
export function encodeEntries(entries: Array<{ name: string; data: Buffer }>): Buffer {
  const parts: Buffer[] = [];

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, 'utf-8');

    // nameLen: uint16 LE
    const nameLenBuf = Buffer.alloc(2);
    nameLenBuf.writeUInt16LE(nameBytes.length, 0);

    // dataLen: uint64 LE (BigUInt64)
    const dataLenBuf = Buffer.alloc(8);
    dataLenBuf.writeBigUInt64LE(BigInt(entry.data.length), 0);

    parts.push(nameLenBuf, nameBytes, dataLenBuf, entry.data);
  }

  return Buffer.concat(parts);
}

/**
 * Decode entries from the payload format.
 */
export function decodeEntries(payload: Buffer): Array<{ name: string; data: Buffer }> {
  const entries: Array<{ name: string; data: Buffer }> = [];
  let offset = 0;

  while (offset < payload.length) {
    // Read nameLen (uint16 LE)
    const nameLen = payload.readUInt16LE(offset);
    offset += 2;

    // Read name (UTF-8)
    const name = payload.subarray(offset, offset + nameLen).toString('utf-8');
    offset += nameLen;

    // Read dataLen (uint64 LE -> BigInt -> Number)
    const dataLen = Number(payload.readBigUInt64LE(offset));
    offset += 8;

    // Read data
    const data = Buffer.from(payload.subarray(offset, offset + dataLen));
    offset += dataLen;

    entries.push({ name, data });
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Archive write
// ---------------------------------------------------------------------------

/**
 * Build a complete archive buffer from components.
 */
export function writeArchive(opts: {
  metadata: BackupMetadata;
  salt: Buffer;
  nonce: Buffer;
  authTag: Buffer;
  encryptedPayload: Buffer;
}): Buffer {
  const metaJson = Buffer.from(JSON.stringify(opts.metadata), 'utf-8');

  // Build 60-byte header
  const header = Buffer.alloc(BACKUP_HEADER_SIZE);
  BACKUP_MAGIC.copy(header, 0);                        // 0x0000: magic (8B)
  header.writeUInt16LE(BACKUP_FORMAT_VERSION, 8);       // 0x0008: version (2B)
  header.writeUInt16LE(0, 10);                          // 0x000A: reserved (2B)
  header.writeUInt32LE(metaJson.length, 12);            // 0x000C: metadata length (4B)
  opts.salt.copy(header, 16);                           // 0x0010: salt (16B)
  opts.nonce.copy(header, 32);                          // 0x0020: nonce (12B)
  opts.authTag.copy(header, 44);                        // 0x002C: authTag (16B)

  return Buffer.concat([header, metaJson, opts.encryptedPayload]);
}

// ---------------------------------------------------------------------------
// Archive read
// ---------------------------------------------------------------------------

/**
 * Parse the first 60 bytes of an archive. Validates magic and version.
 */
export function readArchiveHeader(archive: Buffer): ArchiveHeader {
  if (archive.length < BACKUP_HEADER_SIZE) {
    throw new WAIaaSError('INVALID_BACKUP_FORMAT', {
      message: `Archive too small: ${archive.length} bytes (minimum ${BACKUP_HEADER_SIZE})`,
    });
  }

  const magic = Buffer.from(archive.subarray(0, 8));
  if (!magic.equals(BACKUP_MAGIC)) {
    throw new WAIaaSError('INVALID_BACKUP_FORMAT', {
      message: 'Invalid magic number: not a WAIaaS backup file',
    });
  }

  const version = archive.readUInt16LE(8);
  if (version !== BACKUP_FORMAT_VERSION) {
    throw new WAIaaSError('UNSUPPORTED_BACKUP_VERSION', {
      message: `Unsupported backup format version: ${version} (expected ${BACKUP_FORMAT_VERSION})`,
    });
  }

  const reserved = archive.readUInt16LE(10);
  const metadataLength = archive.readUInt32LE(12);
  const salt = Buffer.from(archive.subarray(16, 32));
  const nonce = Buffer.from(archive.subarray(32, 44));
  const authTag = Buffer.from(archive.subarray(44, 60));

  return { magic, version, reserved, metadataLength, salt, nonce, authTag };
}

/**
 * Extract plaintext JSON metadata from an archive (no decryption needed).
 */
export function readArchiveMetadata(archive: Buffer): BackupMetadata {
  const header = readArchiveHeader(archive);
  const metaStart = BACKUP_HEADER_SIZE;
  const metaEnd = metaStart + header.metadataLength;
  const metaJson = archive.subarray(metaStart, metaEnd).toString('utf-8');
  return JSON.parse(metaJson) as BackupMetadata;
}
