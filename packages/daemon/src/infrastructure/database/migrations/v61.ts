/**
 * Database migration v61: Signing primary partial unique index + CHECK triggers.
 *
 * v61: Ensures wallet_type-level signing primary uniqueness:
 *   - Deduplicates existing data (keeps earliest created_at per wallet_type)
 *   - Creates partial unique index on wallet_apps(wallet_type) WHERE signing_enabled = 1
 *   - Creates INSERT/UPDATE triggers to enforce signing_enabled IN (0, 1)
 */

import type { Database } from 'better-sqlite3';
import type { Migration } from '../migrate.js';

export const migrations: Migration[] = [
  {
    version: 61,
    description: 'Signing primary partial unique index + CHECK triggers on wallet_apps',
    up: (sqlite: Database) => {
      const now = Math.floor(Date.now() / 1000);

      // Step 1 (MIG-02): Deduplicate signing_enabled=1 rows within same wallet_type.
      // For each wallet_type group with multiple signing_enabled=1, keep only the one
      // with the earliest created_at (MIN), set the rest to 0.
      sqlite.prepare(`
        UPDATE wallet_apps
        SET signing_enabled = 0, updated_at = ?
        WHERE signing_enabled = 1
          AND id NOT IN (
            SELECT MIN_ID FROM (
              SELECT MIN(id) AS MIN_ID
              FROM (
                SELECT wa_inner.id, wa_inner.wallet_type, wa_inner.created_at,
                       ROW_NUMBER() OVER (PARTITION BY wa_inner.wallet_type ORDER BY wa_inner.created_at ASC) AS rn
                FROM wallet_apps wa_inner
                WHERE wa_inner.signing_enabled = 1
              )
              WHERE rn = 1
              GROUP BY wallet_type
            )
          )
          AND wallet_type IN (
            SELECT wallet_type
            FROM wallet_apps
            WHERE signing_enabled = 1
            GROUP BY wallet_type
            HAVING COUNT(*) > 1
          )
      `).run(now);

      // Step 2 (MIG-01): Create partial unique index.
      // Only one signing_enabled=1 row per wallet_type is allowed.
      sqlite.exec(
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_apps_signing_primary ON wallet_apps(wallet_type) WHERE signing_enabled = 1',
      );

      // Step 3 (MIG-03): Create CHECK triggers for signing_enabled IN (0, 1).
      // SQLite cannot add CHECK constraints after table creation, so use triggers.
      sqlite.exec(`
        CREATE TRIGGER IF NOT EXISTS trg_wallet_apps_signing_check_insert
        BEFORE INSERT ON wallet_apps
        WHEN NEW.signing_enabled NOT IN (0, 1)
        BEGIN
          SELECT RAISE(ABORT, 'signing_enabled must be 0 or 1');
        END
      `);

      sqlite.exec(`
        CREATE TRIGGER IF NOT EXISTS trg_wallet_apps_signing_check_update
        BEFORE UPDATE ON wallet_apps
        WHEN NEW.signing_enabled NOT IN (0, 1)
        BEGIN
          SELECT RAISE(ABORT, 'signing_enabled must be 0 or 1');
        END
      `);
    },
  },
];
