/**
 * Tests for credential cleanup worker.
 *
 * 3 tests covering:
 * 1. Expired credentials are deleted by cleanup handler
 * 2. Non-expired credentials are NOT deleted
 * 3. Credentials without expiresAt (null) are NOT deleted
 *
 * Uses in-memory SQLite with real schema.
 *
 * @see packages/daemon/src/lifecycle/daemon.ts credential-cleanup worker
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { and, lt, isNotNull } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import type * as schema from '../infrastructure/database/schema.js';
import { walletCredentials } from '../infrastructure/database/schema.js';
import { LocalCredentialVault } from '../infrastructure/credential/index.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_PASSWORD = 'test-master-pw-cleanup';

let db: BetterSQLite3Database<typeof schema>;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeAll(() => {
  const conn = createDatabase(':memory:');
  db = conn.db;
  pushSchema(conn.sqlite);
});

// ---------------------------------------------------------------------------
// Cleanup handler logic (extracted from daemon.ts pattern)
// ---------------------------------------------------------------------------

function runCleanup(): number {
  const nowSec = Math.floor(Date.now() / 1000);
  const result = db
    .delete(walletCredentials)
    .where(
      and(
        isNotNull(walletCredentials.expiresAt),
        lt(walletCredentials.expiresAt, nowSec),
      ),
    )
    .run();
  return result.changes;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('credential-cleanup worker', () => {
  let vault: LocalCredentialVault;

  beforeAll(() => {
    vault = new LocalCredentialVault(db, () => TEST_PASSWORD);
  });

  it('should delete expired credentials', async () => {
    // Create expired credential (1 hour ago)
    const pastExpiry = Math.floor(Date.now() / 1000) - 3600;
    await vault.create(null, {
      type: 'api-key',
      name: `expired-cleanup-${Date.now()}`,
      value: 'will-be-cleaned',
      expiresAt: pastExpiry,
    });

    const deleted = runCleanup();
    expect(deleted).toBeGreaterThanOrEqual(1);
  });

  it('should NOT delete non-expired credentials', async () => {
    const futureExpiry = Math.floor(Date.now() / 1000) + 86400; // +24h
    const name = `future-cleanup-${Date.now()}`;
    const created = await vault.create(null, {
      type: 'api-key',
      name,
      value: 'keep-me',
      expiresAt: futureExpiry,
    });

    runCleanup();

    // Verify it still exists
    const list = await vault.list();
    const found = list.find((c) => c.id === created.id);
    expect(found).toBeDefined();
  });

  it('should NOT delete credentials without expiresAt (null)', async () => {
    const name = `no-expiry-cleanup-${Date.now()}`;
    const created = await vault.create(null, {
      type: 'hmac-secret',
      name,
      value: 'permanent-secret',
    });

    runCleanup();

    // Verify it still exists
    const list = await vault.list();
    const found = list.find((c) => c.id === created.id);
    expect(found).toBeDefined();
  });
});
