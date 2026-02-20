/**
 * Enum DB CHECK constraint consistency integration tests (IT-01~06).
 *
 * Uses in-memory SQLite + pushSchema to create a real database,
 * then verifies that CHECK constraints match SSoT enum arrays.
 *
 * @see docs/49-enum-config-consistency-verification.md
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Database as DatabaseType } from 'better-sqlite3';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import { generateCheckConstraint } from '../infrastructure/database/checks.js';
import {
  WALLET_STATUSES,
  CHAIN_TYPES,
  ENVIRONMENT_TYPES,
  NETWORK_TYPES,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
  POLICY_TYPES,
  POLICY_TIERS,
  NOTIFICATION_LOG_STATUSES,
} from '@waiaas/core';

// ---------------------------------------------------------------------------
// Setup: in-memory DB with full schema
// ---------------------------------------------------------------------------

let sqlite: DatabaseType;

beforeAll(() => {
  const conn = createDatabase(':memory:');
  sqlite = conn.sqlite;
  pushSchema(sqlite);
});

afterAll(() => {
  sqlite?.close();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCreateSql(tableName: string): string {
  const row = sqlite
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { sql: string } | undefined;
  if (!row) throw new Error(`Table '${tableName}' not found`);
  return row.sql;
}

/**
 * Extract enum values from a CHECK constraint in CREATE TABLE SQL.
 */
function extractCheckValues(createSql: string, column: string): string[] | null {
  const escapedCol = column.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`${escapedCol}\\s+IS\\s+NULL\\s+OR\\s+${escapedCol}\\s+IN\\s*\\(([^)]+)\\)`, 'i'),
    new RegExp(`${escapedCol}\\s+IN\\s*\\(([^)]+)\\)`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = createSql.match(pattern);
    if (match?.[1]) {
      return match[1]
        .split(',')
        .map(v => v.trim().replace(/^'|'$/g, ''))
        .filter(v => v.length > 0);
    }
  }
  return null;
}

function nowTs(): number {
  return Math.floor(Date.now() / 1000);
}

// ---------------------------------------------------------------------------
// IT-01: SSoT values INSERT success
// ---------------------------------------------------------------------------

describe('IT-01: SSoT values INSERT success', () => {
  it('wallets.status accepts all WALLET_STATUSES values', () => {
    const ts = nowTs();
    for (const status of WALLET_STATUSES) {
      const id = `test-w-${status}-${Date.now()}`;
      expect(() => {
        sqlite.prepare(
          `INSERT INTO wallets (id, name, chain, environment, public_key, status, created_at, updated_at)
           VALUES (?, ?, 'solana', 'testnet', ?, ?, ?, ?)`
        ).run(id, `test-${status}`, `pk-${id}`, status, ts, ts);
      }).not.toThrow();
    }
  });

  it('transactions.type accepts all TRANSACTION_TYPES values', () => {
    const ts = nowTs();
    // Need a wallet for FK
    const wId = `test-w-txtype-${Date.now()}`;
    sqlite.prepare(
      `INSERT INTO wallets (id, name, chain, environment, public_key, status, created_at, updated_at)
       VALUES (?, 'tx-type-test', 'solana', 'testnet', ?, 'ACTIVE', ?, ?)`
    ).run(wId, `pk-${wId}`, ts, ts);

    for (const type of TRANSACTION_TYPES) {
      const txId = `test-tx-${type}-${Date.now()}`;
      expect(() => {
        sqlite.prepare(
          `INSERT INTO transactions (id, wallet_id, chain, type, status, created_at)
           VALUES (?, ?, 'solana', ?, 'PENDING', ?)`
        ).run(txId, wId, type, ts);
      }).not.toThrow();
    }
  });

  it('transactions.status accepts all TRANSACTION_STATUSES values', () => {
    const ts = nowTs();
    const wId = `test-w-txstatus-${Date.now()}`;
    sqlite.prepare(
      `INSERT INTO wallets (id, name, chain, environment, public_key, status, created_at, updated_at)
       VALUES (?, 'tx-status-test', 'solana', 'testnet', ?, 'ACTIVE', ?, ?)`
    ).run(wId, `pk-${wId}`, ts, ts);

    for (const status of TRANSACTION_STATUSES) {
      const txId = `test-tx-s-${status}-${Date.now()}`;
      expect(() => {
        sqlite.prepare(
          `INSERT INTO transactions (id, wallet_id, chain, type, status, created_at)
           VALUES (?, ?, 'solana', 'TRANSFER', ?, ?)`
        ).run(txId, wId, status, ts);
      }).not.toThrow();
    }
  });

  it('policies.type accepts all POLICY_TYPES values', () => {
    const ts = nowTs();
    for (const type of POLICY_TYPES) {
      const pId = `test-p-${type}-${Date.now()}`;
      expect(() => {
        sqlite.prepare(
          `INSERT INTO policies (id, type, rules, created_at, updated_at)
           VALUES (?, ?, '{}', ?, ?)`
        ).run(pId, type, ts, ts);
      }).not.toThrow();
    }
  });

  it('notification_logs.status accepts all NOTIFICATION_LOG_STATUSES values', () => {
    const ts = nowTs();
    for (const status of NOTIFICATION_LOG_STATUSES) {
      const nId = `test-n-${status}-${Date.now()}`;
      expect(() => {
        sqlite.prepare(
          `INSERT INTO notification_logs (id, event_type, channel, status, created_at)
           VALUES (?, 'TX_CONFIRMED', 'telegram', ?, ?)`
        ).run(nId, status, ts);
      }).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// IT-02: Non-SSoT values rejected by CHECK constraint
// ---------------------------------------------------------------------------

describe('IT-02: Non-SSoT values rejected by CHECK', () => {
  it('wallets.status rejects PAUSED', () => {
    const ts = nowTs();
    const id = `test-reject-${Date.now()}`;
    expect(() => {
      sqlite.prepare(
        `INSERT INTO wallets (id, name, chain, environment, public_key, status, created_at, updated_at)
         VALUES (?, 'reject-test', 'solana', 'testnet', ?, 'PAUSED', ?, ?)`
      ).run(id, `pk-${id}`, ts, ts);
    }).toThrow(/SQLITE_CONSTRAINT|CHECK/);
  });

  it('transactions.type rejects UNKNOWN_TYPE', () => {
    const ts = nowTs();
    const wId = `test-w-reject-type-${Date.now()}`;
    sqlite.prepare(
      `INSERT INTO wallets (id, name, chain, environment, public_key, status, created_at, updated_at)
       VALUES (?, 'reject-type-test', 'solana', 'testnet', ?, 'ACTIVE', ?, ?)`
    ).run(wId, `pk-${wId}`, ts, ts);

    expect(() => {
      sqlite.prepare(
        `INSERT INTO transactions (id, wallet_id, chain, type, status, created_at)
         VALUES ('reject-tx', ?, 'solana', 'UNKNOWN_TYPE', 'PENDING', ?)`
      ).run(wId, ts);
    }).toThrow(/SQLITE_CONSTRAINT|CHECK/);
  });

  it('policies.type rejects INVALID_POLICY', () => {
    const ts = nowTs();
    expect(() => {
      sqlite.prepare(
        `INSERT INTO policies (id, type, rules, created_at, updated_at)
         VALUES ('reject-pol', 'INVALID_POLICY', '{}', ?, ?)`
      ).run(ts, ts);
    }).toThrow(/SQLITE_CONSTRAINT|CHECK/);
  });

  it('notification_logs.status rejects pending', () => {
    const ts = nowTs();
    expect(() => {
      sqlite.prepare(
        `INSERT INTO notification_logs (id, event_type, channel, status, created_at)
         VALUES ('reject-nlog', 'TX_CONFIRMED', 'telegram', 'pending', ?)`
      ).run(ts);
    }).toThrow(/SQLITE_CONSTRAINT|CHECK/);
  });
});

// ---------------------------------------------------------------------------
// IT-03: sqlite_master CHECK SQL matches SSoT arrays
// ---------------------------------------------------------------------------

describe('IT-03: sqlite_master CHECK SQL matches SSoT', () => {
  const checks: Array<{
    table: string;
    column: string;
    ssot: readonly string[];
    label: string;
  }> = [
    { table: 'wallets', column: 'chain', ssot: CHAIN_TYPES, label: 'wallets.chain' },
    { table: 'wallets', column: 'environment', ssot: ENVIRONMENT_TYPES, label: 'wallets.environment' },
    { table: 'wallets', column: 'default_network', ssot: NETWORK_TYPES, label: 'wallets.default_network' },
    { table: 'wallets', column: 'status', ssot: WALLET_STATUSES, label: 'wallets.status' },
    { table: 'transactions', column: 'type', ssot: TRANSACTION_TYPES, label: 'transactions.type' },
    { table: 'transactions', column: 'status', ssot: TRANSACTION_STATUSES, label: 'transactions.status' },
    { table: 'transactions', column: 'tier', ssot: POLICY_TIERS, label: 'transactions.tier' },
    { table: 'transactions', column: 'network', ssot: NETWORK_TYPES, label: 'transactions.network' },
    { table: 'policies', column: 'type', ssot: POLICY_TYPES, label: 'policies.type' },
    { table: 'policies', column: 'network', ssot: NETWORK_TYPES, label: 'policies.network' },
    { table: 'notification_logs', column: 'status', ssot: NOTIFICATION_LOG_STATUSES, label: 'notification_logs.status' },
  ];

  for (const { table, column, ssot, label } of checks) {
    it(`${label}: CHECK values match SSoT array`, () => {
      const createSql = getCreateSql(table);
      const dbValues = extractCheckValues(createSql, column);
      expect(dbValues).not.toBeNull();
      expect([...dbValues!].sort()).toEqual([...ssot].sort());
    });
  }
});

// ---------------------------------------------------------------------------
// IT-04: SSoT-derived CHECK constraint count
// ---------------------------------------------------------------------------

describe('IT-04: expected CHECK constraints exist', () => {
  it('SSoT-derived CHECK constraints across 4 tables (wallets, transactions, policies, notification_logs)', () => {
    // wallets: chain, environment, default_network, status, owner_approval_method = 5 SSoT + owner_verified(IN) = 6 IN-based
    // transactions: type, status, tier, network = 4 IN-based
    // policies: type, network = 2 IN-based
    // notification_logs: status = 1 IN-based
    // Total IN-based: 6+4+2+1 = 13

    const tables = ['wallets', 'transactions', 'policies', 'notification_logs'];
    let inBasedCheckCount = 0;

    for (const table of tables) {
      const sql = getCreateSql(table);
      // Count CHECK(...IN...) patterns (includes owner_verified IN (0,1))
      const matches = sql.match(/CHECK\s*\([^)]*\bIN\b\s*\([^)]*\)/g);
      if (matches) inBasedCheckCount += matches.length;
    }

    // 13 IN-based CHECK constraints (12 SSoT-derived + 1 owner_verified boolean)
    expect(inBasedCheckCount).toBe(13);
  });
});

// ---------------------------------------------------------------------------
// IT-05: audit_log.event_type has no CHECK (extensible design)
// ---------------------------------------------------------------------------

describe('IT-05: audit_log extensibility', () => {
  it('audit_log.event_type accepts arbitrary values (no CHECK)', () => {
    const ts = nowTs();
    expect(() => {
      sqlite.prepare(
        `INSERT INTO audit_log (timestamp, event_type, actor, details, severity)
         VALUES (?, 'CUSTOM_EVENT_TYPE', 'test', '{}', 'info')`
      ).run(ts);
    }).not.toThrow();
  });

  it('audit_log.event_type accepts any string', () => {
    const ts = nowTs();
    expect(() => {
      sqlite.prepare(
        `INSERT INTO audit_log (timestamp, event_type, actor, details, severity)
         VALUES (?, 'COMPLETELY_NEW_EVENT', 'test', '{}', 'info')`
      ).run(ts);
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// IT-06: CHECK constraint existence matrix
// ---------------------------------------------------------------------------

describe('IT-06: CHECK constraint existence matrix', () => {
  const matrix: Array<{ table: string; hasCheck: boolean; columns: string[] }> = [
    { table: 'wallets', hasCheck: true, columns: ['chain', 'environment', 'default_network', 'status', 'owner_verified'] },
    { table: 'transactions', hasCheck: true, columns: ['type', 'status', 'tier', 'network'] },
    { table: 'policies', hasCheck: true, columns: ['type', 'network'] },
    { table: 'notification_logs', hasCheck: true, columns: ['status'] },
    { table: 'audit_log', hasCheck: true, columns: ['severity'] }, // severity has CHECK, but not SSoT-derived
    { table: 'token_registry', hasCheck: true, columns: ['source'] }, // source has CHECK, but hardcoded
    { table: 'telegram_users', hasCheck: true, columns: ['role'] }, // role has CHECK, but hardcoded
    { table: 'sessions', hasCheck: false, columns: [] },
    { table: 'key_value_store', hasCheck: false, columns: [] },
    { table: 'pending_approvals', hasCheck: false, columns: [] },
    { table: 'api_keys', hasCheck: false, columns: [] },
    { table: 'settings', hasCheck: true, columns: ['encrypted'] }, // encrypted has IN(0,1)
  ];

  for (const { table, hasCheck, columns } of matrix) {
    it(`${table}: hasCheck=${hasCheck}, columns=[${columns.join(',')}]`, () => {
      const sql = getCreateSql(table);
      const checkMatches = sql.match(/CHECK\s*\(/g);
      if (hasCheck) {
        expect(checkMatches).not.toBeNull();
        expect(checkMatches!.length).toBeGreaterThanOrEqual(1);
      } else {
        // No CHECK constraints
        expect(checkMatches).toBeNull();
      }
    });
  }
});

// ---------------------------------------------------------------------------
// generateCheckConstraint utility tests (UT-06, UT-07)
// ---------------------------------------------------------------------------

describe('generateCheckConstraint utility', () => {
  it('UT-06: generates correct CHECK SQL from TRANSACTION_STATUSES', () => {
    const result = generateCheckConstraint('status', TRANSACTION_STATUSES);
    const expected = `CHECK (status IN (${TRANSACTION_STATUSES.map(v => `'${v}'`).join(', ')}))`;
    expect(result).toBe(expected);
  });

  it('UT-06b: generates correct CHECK SQL for small enum', () => {
    const result = generateCheckConstraint('chain', CHAIN_TYPES);
    expect(result).toBe("CHECK (chain IN ('solana', 'ethereum'))");
  });

  it('UT-07: rejects values containing single quotes (SQL injection prevention)', () => {
    expect(() => {
      generateCheckConstraint('status', ["ACTIVE", "O'MALLEY"]);
    }).toThrow(/single quote/);
  });

  it('UT-07b: rejects single quote at start', () => {
    expect(() => {
      generateCheckConstraint('status', ["'INJECT"]);
    }).toThrow(/single quote/);
  });
});
