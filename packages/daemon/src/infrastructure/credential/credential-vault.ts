/**
 * Credential Vault -- secure encrypted storage for external service credentials.
 *
 * ICredentialVault defines the interface for credential CRUD operations.
 * LocalCredentialVault implements it using the local SQLite database with
 * AES-256-GCM encryption (HKDF-derived key from master password).
 *
 * Resolution priority for name-based lookup:
 *   1. Per-wallet credential (walletId + name match)
 *   2. Global credential (walletId IS NULL + name match)
 *
 * @see docs/81-external-action-design.md D3.6 CredentialVault
 */

import { eq, and, isNull } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { WAIaaSError } from '@waiaas/core';
import type { CreateCredentialParams, CredentialMetadata, DecryptedCredential } from '@waiaas/core';
import { walletCredentials } from '../database/schema.js';
import type * as schema from '../database/schema.js';
import { generateId } from '../database/id.js';
import { encryptCredential, decryptCredential } from './credential-crypto.js';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface ICredentialVault {
  create(walletId: string | null, params: CreateCredentialParams): Promise<CredentialMetadata>;
  get(ref: string, walletId?: string): Promise<DecryptedCredential>;
  list(walletId?: string): Promise<CredentialMetadata[]>;
  delete(ref: string): Promise<void>;
  rotate(ref: string, newValue: string): Promise<CredentialMetadata>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

// UUID v7 regex (loose): 8-4-4-4-12 hex groups
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Build AAD string for a credential row.
 * Format: "{id}:{walletId|global}:{type}"
 */
function buildAad(id: string, walletId: string | null, type: string): string {
  return `${id}:${walletId ?? 'global'}:${type}`;
}

/**
 * Convert a DB row to CredentialMetadata (without value).
 */
function toMetadata(row: typeof walletCredentials.$inferSelect): CredentialMetadata {
  return {
    id: row.id,
    walletId: row.walletId,
    type: row.type as CredentialMetadata['type'],
    name: row.name,
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt instanceof Date
      ? Math.floor(row.createdAt.getTime() / 1000)
      : (row.createdAt as number),
    updatedAt: row.updatedAt instanceof Date
      ? Math.floor(row.updatedAt.getTime() / 1000)
      : (row.updatedAt as number),
  };
}

export class LocalCredentialVault implements ICredentialVault {
  constructor(
    private readonly db: BetterSQLite3Database<typeof schema>,
    private readonly getMasterPassword: () => string,
  ) {}

  // -----------------------------------------------------------------------
  // create
  // -----------------------------------------------------------------------

  async create(
    walletId: string | null,
    params: CreateCredentialParams,
  ): Promise<CredentialMetadata> {
    // Check for duplicate name in same scope
    // (SQLite NULL != NULL for unique indexes, so global duplicates need manual check)
    const existingCondition = walletId
      ? and(eq(walletCredentials.walletId, walletId), eq(walletCredentials.name, params.name))
      : and(isNull(walletCredentials.walletId), eq(walletCredentials.name, params.name));
    const existing = this.db.select().from(walletCredentials).where(existingCondition).get();
    if (existing) {
      throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
        message: `Credential with name "${params.name}" already exists for this scope`,
      });
    }

    const id = generateId();
    const masterPassword = this.getMasterPassword();
    const aad = buildAad(id, walletId, params.type);
    const encrypted = encryptCredential(params.value, masterPassword, aad);
    const now = new Date();

    try {
      this.db
        .insert(walletCredentials)
        .values({
          id,
          walletId,
          type: params.type,
          name: params.name,
          encryptedValue: encrypted.encryptedValue,
          iv: encrypted.iv,
          authTag: encrypted.authTag,
          metadata: JSON.stringify(params.metadata ?? {}),
          expiresAt: params.expiresAt ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    } catch (err: unknown) {
      // SQLite UNIQUE constraint violation (belt-and-suspenders after pre-check above)
      if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
        throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
          message: `Credential with name "${params.name}" already exists for this scope`,
        });
      }
      throw err;
    }

    return {
      id,
      walletId,
      type: params.type,
      name: params.name,
      metadata: params.metadata ?? {},
      expiresAt: params.expiresAt ?? null,
      createdAt: Math.floor(now.getTime() / 1000),
      updatedAt: Math.floor(now.getTime() / 1000),
    };
  }

  // -----------------------------------------------------------------------
  // get
  // -----------------------------------------------------------------------

  async get(ref: string, walletId?: string): Promise<DecryptedCredential> {
    const row = await this.resolveRow(ref, walletId);

    // Check expiry
    if (row.expiresAt !== null) {
      const nowSec = Math.floor(Date.now() / 1000);
      if (row.expiresAt < nowSec) {
        throw new WAIaaSError('CREDENTIAL_EXPIRED', {
          message: `Credential "${row.name}" has expired`,
        });
      }
    }

    const masterPassword = this.getMasterPassword();
    const aad = buildAad(row.id, row.walletId, row.type);
    const value = decryptCredential(
      {
        encryptedValue: row.encryptedValue,
        iv: row.iv,
        authTag: row.authTag,
      },
      masterPassword,
      aad,
    );

    return {
      ...toMetadata(row),
      value,
    };
  }

  // -----------------------------------------------------------------------
  // list
  // -----------------------------------------------------------------------

  async list(walletId?: string): Promise<CredentialMetadata[]> {
    const condition = walletId
      ? eq(walletCredentials.walletId, walletId)
      : isNull(walletCredentials.walletId);

    const rows = this.db
      .select()
      .from(walletCredentials)
      .where(condition)
      .all();

    return rows.map(toMetadata);
  }

  // -----------------------------------------------------------------------
  // delete
  // -----------------------------------------------------------------------

  async delete(ref: string): Promise<void> {
    const row = await this.resolveRow(ref);
    this.db.delete(walletCredentials).where(eq(walletCredentials.id, row.id)).run();
  }

  // -----------------------------------------------------------------------
  // rotate
  // -----------------------------------------------------------------------

  async rotate(ref: string, newValue: string): Promise<CredentialMetadata> {
    const row = await this.resolveRow(ref);
    const masterPassword = this.getMasterPassword();
    const aad = buildAad(row.id, row.walletId, row.type);
    const encrypted = encryptCredential(newValue, masterPassword, aad);
    const now = new Date();

    this.db
      .update(walletCredentials)
      .set({
        encryptedValue: encrypted.encryptedValue,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        updatedAt: now,
      })
      .where(eq(walletCredentials.id, row.id))
      .run();

    return {
      ...toMetadata(row),
      updatedAt: Math.floor(now.getTime() / 1000),
    };
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  /**
   * Resolve a credential reference to a DB row.
   *
   * Reference formats:
   *   1. UUID (direct lookup)
   *   2. Name string (per-wallet priority, then global fallback)
   */
  private async resolveRow(
    ref: string,
    walletId?: string,
  ): Promise<typeof walletCredentials.$inferSelect> {
    // 1. UUID direct lookup
    if (UUID_RE.test(ref)) {
      const row = this.db
        .select()
        .from(walletCredentials)
        .where(eq(walletCredentials.id, ref))
        .get();
      if (!row) {
        throw new WAIaaSError('CREDENTIAL_NOT_FOUND', {
          message: `Credential not found: ${ref}`,
        });
      }
      return row;
    }

    // 2. Name-based resolution with per-wallet priority
    if (walletId) {
      // Try per-wallet first
      const perWallet = this.db
        .select()
        .from(walletCredentials)
        .where(
          and(
            eq(walletCredentials.walletId, walletId),
            eq(walletCredentials.name, ref),
          ),
        )
        .get();
      if (perWallet) return perWallet;
    }

    // Try global fallback
    const global = this.db
      .select()
      .from(walletCredentials)
      .where(
        and(
          isNull(walletCredentials.walletId),
          eq(walletCredentials.name, ref),
        ),
      )
      .get();
    if (global) return global;

    throw new WAIaaSError('CREDENTIAL_NOT_FOUND', {
      message: `Credential not found: ${ref}`,
    });
  }
}
