/**
 * Comprehensive tests for the WAIaaS daemon SQLite database module.
 *
 * Tests cover:
 * 1. Schema creation -- all 7 tables exist after pushSchema
 * 2. PRAGMA verification -- all 7 PRAGMAs applied correctly
 * 3. CHECK constraints -- valid/invalid enum values
 * 4. UUID v7 ordering -- chronological sort by string comparison
 * 5. Foreign key behavior -- CASCADE, RESTRICT, SET NULL
 * 6. closeDatabase -- WAL checkpoint and connection close
 *
 * All tests use in-memory SQLite (':memory:') to avoid filesystem side effects.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Database as DatabaseType } from 'better-sqlite3';
import { createDatabase, closeDatabase, pushSchema, generateId } from '../infrastructure/database/index.js';

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let sqlite: DatabaseType;

beforeEach(() => {
  const conn = createDatabase(':memory:');
  sqlite = conn.sqlite;
  pushSchema(sqlite);
});

afterEach(() => {
  try {
    sqlite.close();
  } catch {
    // already closed in some tests
  }
});

// ---------------------------------------------------------------------------
// Helper: get current epoch seconds
// ---------------------------------------------------------------------------

const now = () => Math.floor(Date.now() / 1000);

// ---------------------------------------------------------------------------
// 1. Schema creation tests
// ---------------------------------------------------------------------------

describe('Schema creation', () => {
  it('should create all 9 tables', () => {
    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as Array<{ name: string }>;

    const tableNames = tables.map((t) => t.name).sort();
    expect(tableNames).toEqual([
      'agents',
      'audit_log',
      'key_value_store',
      'notification_logs',
      'pending_approvals',
      'policies',
      'schema_version',
      'sessions',
      'transactions',
    ]);
  });

  it('agents table should have correct columns', () => {
    const columns = sqlite.prepare("PRAGMA table_info('agents')").all() as Array<{
      name: string;
      type: string;
      notnull: number;
    }>;

    const colNames = columns.map((c) => c.name);
    expect(colNames).toContain('id');
    expect(colNames).toContain('name');
    expect(colNames).toContain('chain');
    expect(colNames).toContain('network');
    expect(colNames).toContain('public_key');
    expect(colNames).toContain('status');
    expect(colNames).toContain('owner_address');
    expect(colNames).toContain('owner_verified');
    expect(colNames).toContain('created_at');
    expect(colNames).toContain('updated_at');
    expect(colNames).toContain('suspended_at');
    expect(colNames).toContain('suspension_reason');
    expect(colNames).toHaveLength(12);
  });

  it('transactions table should have correct columns including v0.6 and v0.10 additions', () => {
    const columns = sqlite.prepare("PRAGMA table_info('transactions')").all() as Array<{
      name: string;
    }>;

    const colNames = columns.map((c) => c.name);
    // v0.6 additions
    expect(colNames).toContain('token_mint');
    expect(colNames).toContain('contract_address');
    expect(colNames).toContain('method_signature');
    expect(colNames).toContain('spender_address');
    expect(colNames).toContain('approved_amount');
    // v0.10 additions
    expect(colNames).toContain('parent_id');
    expect(colNames).toContain('batch_index');
  });

  it('audit_log id column should be AUTOINCREMENT (not UUID v7)', () => {
    const columns = sqlite.prepare("PRAGMA table_info('audit_log')").all() as Array<{
      name: string;
      type: string;
      pk: number;
    }>;

    const idCol = columns.find((c) => c.name === 'id');
    expect(idCol).toBeDefined();
    expect(idCol!.type).toBe('INTEGER');
    expect(idCol!.pk).toBe(1);

    // Verify AUTOINCREMENT by checking sqlite_sequence table exists
    // (SQLite creates sqlite_sequence when AUTOINCREMENT is used)
    sqlite.prepare("INSERT INTO audit_log (timestamp, event_type, actor, details) VALUES (?, ?, ?, ?)").run(
      now(),
      'TEST_EVENT',
      'system',
      '{}',
    );
    const seq = sqlite
      .prepare("SELECT * FROM sqlite_sequence WHERE name = 'audit_log'")
      .get() as { name: string; seq: number } | undefined;
    expect(seq).toBeDefined();
    expect(seq!.name).toBe('audit_log');
  });

  it('key_value_store table should have key, value, and updated_at columns', () => {
    const columns = sqlite.prepare("PRAGMA table_info('key_value_store')").all() as Array<{
      name: string;
    }>;

    const colNames = columns.map((c) => c.name);
    expect(colNames).toEqual(['key', 'value', 'updated_at']);
  });
});

// ---------------------------------------------------------------------------
// 2. PRAGMA verification tests
// ---------------------------------------------------------------------------

describe('PRAGMA verification', () => {
  it('journal_mode should be WAL (memory DB reports "memory")', () => {
    const result = sqlite.pragma('journal_mode') as Array<{ journal_mode: string }>;
    // In-memory databases always report 'memory' for journal_mode since WAL requires
    // a file. The PRAGMA is still set without error; file-based DBs would report 'wal'.
    expect(result[0]!.journal_mode).toBe('memory');
  });

  it('foreign_keys should be ON (1)', () => {
    const result = sqlite.pragma('foreign_keys') as Array<{ foreign_keys: number }>;
    expect(result[0]!.foreign_keys).toBe(1);
  });

  it('busy_timeout should be 5000', () => {
    const result = sqlite.pragma('busy_timeout') as Array<{ timeout: number }>;
    expect(result[0]!.timeout).toBe(5000);
  });

  it('synchronous should be NORMAL (1)', () => {
    const result = sqlite.pragma('synchronous') as Array<{ synchronous: number }>;
    expect(result[0]!.synchronous).toBe(1);
  });

  it('cache_size should be -64000', () => {
    const result = sqlite.pragma('cache_size') as Array<{ cache_size: number }>;
    expect(result[0]!.cache_size).toBe(-64000);
  });

  it('temp_store should be MEMORY (2)', () => {
    const result = sqlite.pragma('temp_store') as Array<{ temp_store: number }>;
    expect(result[0]!.temp_store).toBe(2);
  });

  it('mmap_size pragma should be accepted (in-memory may return empty)', () => {
    // In-memory databases don't support mmap; the pragma may return an empty result.
    // The important thing is that createDatabase set it without error.
    // File-based verification is done in the "PRAGMA verification (file-based)" suite.
    const result = sqlite.pragma('mmap_size') as Array<Record<string, number>>;
    // In-memory: result may be empty array or [{mmap_size: 0}]
    expect(Array.isArray(result)).toBe(true);
  });
});

describe('PRAGMA verification (file-based)', () => {
  let tmpDir: string;
  let fileSqlite: DatabaseType;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'waiaas-test-'));
    const conn = createDatabase(join(tmpDir, 'test.db'));
    fileSqlite = conn.sqlite;
  });

  afterEach(() => {
    try { fileSqlite.close(); } catch { /* already closed */ }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('journal_mode should be WAL on file-based database', () => {
    const result = fileSqlite.pragma('journal_mode') as Array<{ journal_mode: string }>;
    expect(result[0]!.journal_mode).toBe('wal');
  });

  it('mmap_size should be 268435456 on file-based database', () => {
    const result = fileSqlite.pragma('mmap_size') as Array<Record<string, number>>;
    const value = Object.values(result[0]!)[0];
    expect(value).toBe(268435456);
  });
});

// ---------------------------------------------------------------------------
// 3. CHECK constraint tests
// ---------------------------------------------------------------------------

describe('CHECK constraints', () => {
  const ts = now();

  describe('agents', () => {
    it('should accept valid status ACTIVE', () => {
      expect(() => {
        sqlite.prepare(
          `INSERT INTO agents (id, name, chain, network, public_key, status, owner_verified, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(generateId(), 'Test Agent', 'solana', 'mainnet', 'pubkey1', 'ACTIVE', 0, ts, ts);
      }).not.toThrow();
    });

    it('should reject invalid status INVALID_STATUS', () => {
      expect(() => {
        sqlite.prepare(
          `INSERT INTO agents (id, name, chain, network, public_key, status, owner_verified, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(generateId(), 'Test Agent', 'solana', 'mainnet', 'pubkey2', 'INVALID_STATUS', 0, ts, ts);
      }).toThrow(/CHECK/i);
    });

    it('should accept valid chain solana', () => {
      expect(() => {
        sqlite.prepare(
          `INSERT INTO agents (id, name, chain, network, public_key, status, owner_verified, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(generateId(), 'Test Agent', 'solana', 'mainnet', 'pubkey3', 'CREATING', 0, ts, ts);
      }).not.toThrow();
    });

    it('should reject invalid chain bitcoin', () => {
      expect(() => {
        sqlite.prepare(
          `INSERT INTO agents (id, name, chain, network, public_key, status, owner_verified, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(generateId(), 'Test Agent', 'bitcoin', 'mainnet', 'pubkey4', 'CREATING', 0, ts, ts);
      }).toThrow(/CHECK/i);
    });
  });

  describe('transactions', () => {
    let agentId: string;

    beforeEach(() => {
      agentId = generateId();
      sqlite.prepare(
        `INSERT INTO agents (id, name, chain, network, public_key, status, owner_verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(agentId, 'Test Agent', 'solana', 'mainnet', `pubkey-tx-${Math.random()}`, 'ACTIVE', 0, ts, ts);
    });

    it('should accept valid type TRANSFER', () => {
      expect(() => {
        sqlite.prepare(
          `INSERT INTO transactions (id, agent_id, chain, type, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(generateId(), agentId, 'solana', 'TRANSFER', 'PENDING', ts);
      }).not.toThrow();
    });

    it('should reject invalid type INVALID_TYPE', () => {
      expect(() => {
        sqlite.prepare(
          `INSERT INTO transactions (id, agent_id, chain, type, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(generateId(), agentId, 'solana', 'INVALID_TYPE', 'PENDING', ts);
      }).toThrow(/CHECK/i);
    });

    it('should accept valid status PARTIAL_FAILURE', () => {
      expect(() => {
        sqlite.prepare(
          `INSERT INTO transactions (id, agent_id, chain, type, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(generateId(), agentId, 'solana', 'BATCH', 'PARTIAL_FAILURE', ts);
      }).not.toThrow();
    });

    it('should accept NULL tier (nullable with CHECK)', () => {
      expect(() => {
        sqlite.prepare(
          `INSERT INTO transactions (id, agent_id, chain, type, status, tier, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(generateId(), agentId, 'solana', 'TRANSFER', 'PENDING', null, ts);
      }).not.toThrow();
    });

    it('should accept valid tier INSTANT', () => {
      expect(() => {
        sqlite.prepare(
          `INSERT INTO transactions (id, agent_id, chain, type, status, tier, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(generateId(), agentId, 'solana', 'TRANSFER', 'PENDING', 'INSTANT', ts);
      }).not.toThrow();
    });
  });

  describe('audit_log', () => {
    it('should accept valid severity info', () => {
      expect(() => {
        sqlite.prepare(
          `INSERT INTO audit_log (timestamp, event_type, actor, details, severity)
           VALUES (?, ?, ?, ?, ?)`,
        ).run(ts, 'AGENT_CREATED', 'system', '{}', 'info');
      }).not.toThrow();
    });

    it('should reject invalid severity debug', () => {
      expect(() => {
        sqlite.prepare(
          `INSERT INTO audit_log (timestamp, event_type, actor, details, severity)
           VALUES (?, ?, ?, ?, ?)`,
        ).run(ts, 'AGENT_CREATED', 'system', '{}', 'debug');
      }).toThrow(/CHECK/i);
    });
  });

  describe('policies', () => {
    it('should accept valid type SPENDING_LIMIT', () => {
      expect(() => {
        sqlite.prepare(
          `INSERT INTO policies (id, type, rules, priority, enabled, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(generateId(), 'SPENDING_LIMIT', '{}', 0, 1, ts, ts);
      }).not.toThrow();
    });

    it('should reject invalid type INVALID_POLICY', () => {
      expect(() => {
        sqlite.prepare(
          `INSERT INTO policies (id, type, rules, priority, enabled, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(generateId(), 'INVALID_POLICY', '{}', 0, 1, ts, ts);
      }).toThrow(/CHECK/i);
    });
  });
});

// ---------------------------------------------------------------------------
// 4. UUID v7 ordering tests
// ---------------------------------------------------------------------------

describe('UUID v7 ordering', () => {
  it('should generate IDs that sort chronologically by string comparison', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 10; i++) {
      ids.push(generateId());
      // Small delay to ensure different ms timestamps
      await new Promise((r) => setTimeout(r, 2));
    }

    const sorted = [...ids].sort();
    expect(sorted).toEqual(ids);
  });

  it('should order agents by id matching chronological creation order', async () => {
    const ts0 = now();
    const createdIds: string[] = [];

    for (let i = 0; i < 5; i++) {
      const id = generateId();
      createdIds.push(id);
      sqlite.prepare(
        `INSERT INTO agents (id, name, chain, network, public_key, status, owner_verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, `Agent ${i}`, 'solana', 'mainnet', `uuid-test-pk-${i}`, 'ACTIVE', 0, ts0, ts0);
      await new Promise((r) => setTimeout(r, 2));
    }

    const rows = sqlite
      .prepare('SELECT id FROM agents ORDER BY id')
      .all() as Array<{ id: string }>;

    const dbIds = rows.map((r) => r.id);
    expect(dbIds).toEqual(createdIds);
  });
});

// ---------------------------------------------------------------------------
// 5. Foreign key tests
// ---------------------------------------------------------------------------

describe('Foreign key constraints', () => {
  const ts0 = now();

  it('should reject session with non-existent agentId', () => {
    expect(() => {
      sqlite.prepare(
        `INSERT INTO sessions (id, agent_id, token_hash, expires_at, absolute_expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(generateId(), 'non-existent-agent-id', 'hash123', ts0 + 3600, ts0 + 86400, ts0);
    }).toThrow(/FOREIGN KEY/i);
  });

  it('should CASCADE delete sessions when agent is deleted', () => {
    const agentId = generateId();
    const sessionId = generateId();

    sqlite.prepare(
      `INSERT INTO agents (id, name, chain, network, public_key, status, owner_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(agentId, 'Agent', 'solana', 'mainnet', 'pk-fk-cascade', 'ACTIVE', 0, ts0, ts0);

    sqlite.prepare(
      `INSERT INTO sessions (id, agent_id, token_hash, expires_at, absolute_expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(sessionId, agentId, 'hash456', ts0 + 3600, ts0 + 86400, ts0);

    // Verify session exists
    const before = sqlite.prepare('SELECT COUNT(*) as cnt FROM sessions WHERE id = ?').get(sessionId) as { cnt: number };
    expect(before.cnt).toBe(1);

    // Delete agent -> should cascade
    sqlite.prepare('DELETE FROM agents WHERE id = ?').run(agentId);

    const after = sqlite.prepare('SELECT COUNT(*) as cnt FROM sessions WHERE id = ?').get(sessionId) as { cnt: number };
    expect(after.cnt).toBe(0);
  });

  it('should RESTRICT delete agent with transactions', () => {
    const agentId = generateId();
    const txId = generateId();

    sqlite.prepare(
      `INSERT INTO agents (id, name, chain, network, public_key, status, owner_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(agentId, 'Agent', 'solana', 'mainnet', 'pk-fk-restrict', 'ACTIVE', 0, ts0, ts0);

    sqlite.prepare(
      `INSERT INTO transactions (id, agent_id, chain, type, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(txId, agentId, 'solana', 'TRANSFER', 'CONFIRMED', ts0);

    // Delete should fail due to RESTRICT
    expect(() => {
      sqlite.prepare('DELETE FROM agents WHERE id = ?').run(agentId);
    }).toThrow(/FOREIGN KEY/i);
  });

  it('should SET NULL session_id on transactions when session is deleted', () => {
    const agentId = generateId();
    const sessionId = generateId();
    const txId = generateId();

    sqlite.prepare(
      `INSERT INTO agents (id, name, chain, network, public_key, status, owner_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(agentId, 'Agent', 'solana', 'mainnet', 'pk-fk-setnull', 'ACTIVE', 0, ts0, ts0);

    sqlite.prepare(
      `INSERT INTO sessions (id, agent_id, token_hash, expires_at, absolute_expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(sessionId, agentId, 'hash789', ts0 + 3600, ts0 + 86400, ts0);

    sqlite.prepare(
      `INSERT INTO transactions (id, agent_id, session_id, chain, type, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(txId, agentId, sessionId, 'solana', 'TRANSFER', 'PENDING', ts0);

    // Delete session -> transaction.session_id should become NULL
    sqlite.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);

    const tx = sqlite.prepare('SELECT session_id FROM transactions WHERE id = ?').get(txId) as { session_id: string | null };
    expect(tx.session_id).toBeNull();
  });

  it('should CASCADE delete pending_approvals when transaction is deleted', () => {
    const agentId = generateId();
    const txId = generateId();
    const approvalId = generateId();

    sqlite.prepare(
      `INSERT INTO agents (id, name, chain, network, public_key, status, owner_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(agentId, 'Agent', 'solana', 'mainnet', 'pk-fk-pa-cascade', 'ACTIVE', 0, ts0, ts0);

    sqlite.prepare(
      `INSERT INTO transactions (id, agent_id, chain, type, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(txId, agentId, 'solana', 'TRANSFER', 'PENDING', ts0);

    sqlite.prepare(
      `INSERT INTO pending_approvals (id, tx_id, required_by, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(approvalId, txId, ts0 + 1800, ts0 + 3600, ts0);

    // We need to delete the transaction. But RESTRICT on agents prevents deleting agent.
    // So we directly delete the transaction (which would fail if it has FK from pending_approvals with RESTRICT, but it's CASCADE).
    // Actually, we can't delete the transaction because agents FK is RESTRICT.
    // But that's the other direction. Let's delete the transaction directly.
    // Wait -- can we? Yes, we delete the transaction row itself, which cascades to pending_approvals.
    // The RESTRICT is on agents -> transactions (you can't delete the agent), not on transactions themselves.
    sqlite.prepare('DELETE FROM transactions WHERE id = ?').run(txId);

    const after = sqlite.prepare('SELECT COUNT(*) as cnt FROM pending_approvals WHERE id = ?').get(approvalId) as { cnt: number };
    expect(after.cnt).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 6. closeDatabase tests
// ---------------------------------------------------------------------------

describe('closeDatabase', () => {
  it('should close the connection without error', () => {
    const conn = createDatabase(':memory:');
    pushSchema(conn.sqlite);

    expect(() => {
      closeDatabase(conn.sqlite);
    }).not.toThrow();
  });

  it('should throw on queries after close', () => {
    const conn = createDatabase(':memory:');
    pushSchema(conn.sqlite);
    closeDatabase(conn.sqlite);

    expect(() => {
      conn.sqlite.prepare("SELECT 1").get();
    }).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 7. createDatabase returns valid instances
// ---------------------------------------------------------------------------

describe('createDatabase', () => {
  it('should return sqlite and db instances', () => {
    const conn = createDatabase(':memory:');
    expect(conn.sqlite).toBeDefined();
    expect(conn.db).toBeDefined();
    conn.sqlite.close();
  });
});
