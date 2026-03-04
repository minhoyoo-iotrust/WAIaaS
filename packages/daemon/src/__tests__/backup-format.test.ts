/**
 * Tests for backup-format.ts: Binary archive format utilities.
 *
 * Tests the 60-byte fixed header format, entry encoding/decoding,
 * and archive read/write operations for encrypted backup files.
 */

import { describe, it, expect } from 'vitest';
import {
  BACKUP_MAGIC,
  BACKUP_HEADER_SIZE,
  BACKUP_FORMAT_VERSION,
  writeArchive,
  readArchiveHeader,
  readArchiveMetadata,
  encodeEntries,
  decodeEntries,
} from '../infrastructure/backup/backup-format.js';
import type { BackupMetadata } from '../infrastructure/backup/backup-format.js';
import { randomBytes } from 'node:crypto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockMetadata(): BackupMetadata {
  return {
    created_at: '2026-03-03T12:00:00.000Z',
    daemon_version: '2.9.0',
    schema_version: 36,
    kdf: 'argon2id',
    kdf_params: {
      memory_cost: 65536,
      time_cost: 3,
      parallelism: 4,
      hash_length: 32,
    },
    contents: {
      database: { name: 'waiaas.db', size: 1024 },
      config: { name: 'config.toml', size: 128 },
      keystore_files: [{ name: 'wallet-abc.json', size: 512 }],
    },
    checksum: 'sha256:abc123',
  };
}

function makeArchive(opts?: { magic?: Buffer; version?: number }): Buffer {
  const metadata = makeMockMetadata();
  const salt = randomBytes(16);
  const nonce = randomBytes(12);
  const authTag = randomBytes(16);
  const encryptedPayload = randomBytes(256);

  if (opts?.magic || opts?.version !== undefined) {
    // Build manually for invalid test cases
    const metaJson = Buffer.from(JSON.stringify(metadata), 'utf-8');
    const header = Buffer.alloc(60);
    const magic = opts.magic ?? BACKUP_MAGIC;
    magic.copy(header, 0);
    header.writeUInt16LE(opts.version ?? BACKUP_FORMAT_VERSION, 8);
    header.writeUInt16LE(0, 10); // reserved
    header.writeUInt32LE(metaJson.length, 12);
    salt.copy(header, 16);
    nonce.copy(header, 32);
    authTag.copy(header, 44);
    return Buffer.concat([header, metaJson, encryptedPayload]);
  }

  return writeArchive({ metadata, salt, nonce, authTag, encryptedPayload });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('backup-format', () => {
  // Test 1
  it('BACKUP_MAGIC equals Buffer [0x57, 0x41, 0x49, 0x41, 0x41, 0x53, 0x00, 0x01]', () => {
    const expected = Buffer.from([0x57, 0x41, 0x49, 0x41, 0x41, 0x53, 0x00, 0x01]);
    expect(BACKUP_MAGIC).toEqual(expected);
    expect(BACKUP_MAGIC.length).toBe(8);
  });

  // Test 2
  it('BACKUP_HEADER_SIZE equals 60 bytes', () => {
    expect(BACKUP_HEADER_SIZE).toBe(60);
  });

  // Test 3
  it('writeArchive produces archive where first 8 bytes match BACKUP_MAGIC', () => {
    const archive = makeArchive();
    expect(archive.subarray(0, 8)).toEqual(BACKUP_MAGIC);
  });

  // Test 4
  it('writeArchive produces archive where bytes 8-9 are format version uint16 LE = 1', () => {
    const archive = makeArchive();
    expect(archive.readUInt16LE(8)).toBe(1);
  });

  // Test 5
  it('writeArchive produces archive where bytes 12-15 are metadata length matching JSON size', () => {
    const metadata = makeMockMetadata();
    const metaJson = Buffer.from(JSON.stringify(metadata), 'utf-8');
    const archive = writeArchive({
      metadata,
      salt: randomBytes(16),
      nonce: randomBytes(12),
      authTag: randomBytes(16),
      encryptedPayload: randomBytes(128),
    });
    expect(archive.readUInt32LE(12)).toBe(metaJson.length);
  });

  // Test 6
  it('readArchiveHeader extracts magic, version, metadataLength, salt, nonce, authTag from 60-byte header', () => {
    const salt = randomBytes(16);
    const nonce = randomBytes(12);
    const authTag = randomBytes(16);
    const metadata = makeMockMetadata();
    const archive = writeArchive({
      metadata,
      salt,
      nonce,
      authTag,
      encryptedPayload: randomBytes(64),
    });

    const header = readArchiveHeader(archive);
    expect(header.magic).toEqual(BACKUP_MAGIC);
    expect(header.version).toBe(1);
    expect(header.salt).toEqual(salt);
    expect(header.nonce).toEqual(nonce);
    expect(header.authTag).toEqual(authTag);
    expect(header.metadataLength).toBeGreaterThan(0);
  });

  // Test 7
  it('readArchiveHeader throws INVALID_BACKUP_FORMAT for wrong magic bytes', () => {
    const badMagic = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    const archive = makeArchive({ magic: badMagic });
    try {
      readArchiveHeader(archive);
      expect.unreachable('Should have thrown');
    } catch (err: unknown) {
      expect((err as { code: string }).code).toBe('INVALID_BACKUP_FORMAT');
    }
  });

  // Test 8
  it('readArchiveHeader throws UNSUPPORTED_BACKUP_VERSION for version != 1', () => {
    const archive = makeArchive({ version: 99 });
    try {
      readArchiveHeader(archive);
      expect.unreachable('Should have thrown');
    } catch (err: unknown) {
      expect((err as { code: string }).code).toBe('UNSUPPORTED_BACKUP_VERSION');
    }
  });

  // Test 9
  it('readArchiveMetadata extracts plaintext JSON metadata from offset 0x3C', () => {
    const metadata = makeMockMetadata();
    const archive = writeArchive({
      metadata,
      salt: randomBytes(16),
      nonce: randomBytes(12),
      authTag: randomBytes(16),
      encryptedPayload: randomBytes(64),
    });

    const parsed = readArchiveMetadata(archive);
    expect(parsed.created_at).toBe(metadata.created_at);
    expect(parsed.daemon_version).toBe(metadata.daemon_version);
    expect(parsed.schema_version).toBe(metadata.schema_version);
    expect(parsed.kdf).toBe('argon2id');
    expect(parsed.kdf_params).toEqual(metadata.kdf_params);
    expect(parsed.contents.database.name).toBe('waiaas.db');
    expect(parsed.checksum).toBe(metadata.checksum);
  });

  // Test 10
  it('encodeEntries/decodeEntries round-trip preserves entries', () => {
    const entries = [
      { name: 'waiaas.db', data: Buffer.from('database-content') },
      { name: 'config.toml', data: Buffer.from('[daemon]\nport = 3100') },
      { name: 'keystore/wallet-abc.json', data: Buffer.from('{"encrypted": true}') },
    ];

    const encoded = encodeEntries(entries);
    const decoded = decodeEntries(encoded);

    expect(decoded.length).toBe(3);
    expect(decoded[0]!.name).toBe('waiaas.db');
    expect(decoded[0]!.data.toString()).toBe('database-content');
    expect(decoded[1]!.name).toBe('config.toml');
    expect(decoded[1]!.data.toString()).toBe('[daemon]\nport = 3100');
    expect(decoded[2]!.name).toBe('keystore/wallet-abc.json');
    expect(decoded[2]!.data.toString()).toBe('{"encrypted": true}');
  });

  // Additional: empty entries
  it('encodeEntries/decodeEntries handles empty entry list', () => {
    const encoded = encodeEntries([]);
    expect(encoded.length).toBe(0);
    const decoded = decodeEntries(encoded);
    expect(decoded.length).toBe(0);
  });

  // Additional: large data entry
  it('encodeEntries/decodeEntries handles entries with large data', () => {
    const largeData = randomBytes(100_000);
    const entries = [{ name: 'large-file.bin', data: largeData }];
    const encoded = encodeEntries(entries);
    const decoded = decodeEntries(encoded);
    expect(decoded.length).toBe(1);
    expect(decoded[0]!.data).toEqual(largeData);
  });
});
