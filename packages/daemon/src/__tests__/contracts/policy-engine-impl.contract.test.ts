/**
 * CT-3: IPolicyEngine Contract Test -- DatabasePolicyEngine execution.
 *
 * Validates that DatabasePolicyEngine passes the same shared contract
 * suite as MockPolicyEngine. Uses in-memory SQLite + Drizzle.
 *
 * Also tests DefaultPolicyEngine (v1.1 passthrough) for completeness.
 */
import { describe, afterEach } from 'vitest';
import { policyEngineContractTests } from '../../../../core/src/__tests__/contracts/policy-engine.contract.js';
import { createDatabase, pushSchema } from '../../infrastructure/database/index.js';
import type { DatabaseConnection } from '../../infrastructure/database/index.js';
import { DatabasePolicyEngine } from '../../pipeline/database-policy-engine.js';
import { DefaultPolicyEngine } from '../../pipeline/default-policy-engine.js';

// ---------------------------------------------------------------------------
// Cleanup tracking
// ---------------------------------------------------------------------------

const connections: DatabaseConnection[] = [];

afterEach(() => {
  for (const conn of connections) {
    try {
      conn.sqlite.close();
    } catch {
      // Ignore close errors
    }
  }
  connections.length = 0;
});

// ---------------------------------------------------------------------------
// Run contract tests
// ---------------------------------------------------------------------------

describe('CT-3: IPolicyEngine Contract Tests (daemon implementations)', () => {
  describe('DefaultPolicyEngine', () => {
    policyEngineContractTests(() => new DefaultPolicyEngine());
  });

  describe('DatabasePolicyEngine (empty DB)', () => {
    policyEngineContractTests(async () => {
      // Create in-memory SQLite DB with schema
      const conn = createDatabase(':memory:');
      pushSchema(conn.sqlite);
      connections.push(conn);
      return new DatabasePolicyEngine(conn.db);
    });
  });
});
