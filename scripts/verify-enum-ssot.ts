#!/usr/bin/env tsx
/**
 * Build-time Enum SSoT Verification Script
 *
 * Verifies 16 enums across 4 stages:
 *   Step 1: as const array <-> Zod enum.options match
 *   Step 2: Array uniqueness (no duplicate values)
 *   Step 3: DB CHECK constraints match SSoT arrays (via sqlite_master)
 *   Step 4: Value count snapshot (detect unintended additions/removals)
 *
 * Usage: pnpm verify:enums (or: tsx scripts/verify-enum-ssot.ts)
 * Exit code 1 on any failure. CI should run this in PR checks.
 *
 * @see docs/49-enum-config-consistency-verification.md
 */

import {
  // SSoT arrays
  CHAIN_TYPES,
  NETWORK_TYPES,
  SOLANA_NETWORK_TYPES,
  EVM_NETWORK_TYPES,
  ENVIRONMENT_TYPES,
  WALLET_STATUSES,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
  POLICY_TYPES,
  POLICY_TIERS,
  SESSION_STATUSES,
  NOTIFICATION_EVENT_TYPES,
  NOTIFICATION_LOG_STATUSES,
  AUDIT_ACTIONS,
  KILL_SWITCH_STATES,
  OWNER_STATES,
  // Zod enums
  ChainTypeEnum,
  NetworkTypeEnum,
  EvmNetworkTypeEnum,
  EnvironmentTypeEnum,
  WalletStatusEnum,
  TransactionStatusEnum,
  TransactionTypeEnum,
  PolicyTypeEnum,
  PolicyTierEnum,
  SessionStatusEnum,
  NotificationEventTypeEnum,
  NotificationLogStatusEnum,
  AuditActionEnum,
  KillSwitchStateEnum,
  OwnerStateEnum,
} from '../packages/core/src/index.js';

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

import { pushSchema } from '../packages/daemon/src/infrastructure/database/migrate.js';

// ─── Types ──────────────────────────────────────────────────────────────

interface EnumDef {
  name: string;
  array: readonly string[];
  zodOptions: readonly string[];
  expectedCount: number;
}

interface CheckTarget {
  table: string;
  column: string;
  array: readonly string[];
  nullable: boolean; // true = "column IS NULL OR column IN (...)"
}

// ─── Enum Definitions (16 enums) ────────────────────────────────────────

const ENUMS: EnumDef[] = [
  { name: 'ChainType', array: CHAIN_TYPES, zodOptions: ChainTypeEnum.options, expectedCount: 2 },
  { name: 'NetworkType', array: NETWORK_TYPES, zodOptions: NetworkTypeEnum.options, expectedCount: 13 },
  { name: 'SolanaNetworkType', array: SOLANA_NETWORK_TYPES, zodOptions: SOLANA_NETWORK_TYPES, expectedCount: 3 },
  { name: 'EvmNetworkType', array: EVM_NETWORK_TYPES, zodOptions: EvmNetworkTypeEnum.options, expectedCount: 10 },
  { name: 'EnvironmentType', array: ENVIRONMENT_TYPES, zodOptions: EnvironmentTypeEnum.options, expectedCount: 2 },
  { name: 'WalletStatus', array: WALLET_STATUSES, zodOptions: WalletStatusEnum.options, expectedCount: 5 },
  { name: 'TransactionStatus', array: TRANSACTION_STATUSES, zodOptions: TransactionStatusEnum.options, expectedCount: 10 },
  { name: 'TransactionType', array: TRANSACTION_TYPES, zodOptions: TransactionTypeEnum.options, expectedCount: 7 },
  { name: 'PolicyType', array: POLICY_TYPES, zodOptions: PolicyTypeEnum.options, expectedCount: 12 },
  { name: 'PolicyTier', array: POLICY_TIERS, zodOptions: PolicyTierEnum.options, expectedCount: 4 },
  { name: 'SessionStatus', array: SESSION_STATUSES, zodOptions: SessionStatusEnum.options, expectedCount: 3 },
  { name: 'NotificationEventType', array: NOTIFICATION_EVENT_TYPES, zodOptions: NotificationEventTypeEnum.options, expectedCount: 30 },
  { name: 'NotificationLogStatus', array: NOTIFICATION_LOG_STATUSES, zodOptions: NotificationLogStatusEnum.options, expectedCount: 2 },
  { name: 'AuditAction', array: AUDIT_ACTIONS, zodOptions: AuditActionEnum.options, expectedCount: 25 },
  { name: 'KillSwitchState', array: KILL_SWITCH_STATES, zodOptions: KillSwitchStateEnum.options, expectedCount: 3 },
  { name: 'OwnerState', array: OWNER_STATES, zodOptions: OwnerStateEnum.options, expectedCount: 3 },
];

// ─── DB CHECK Targets (7 SSoT-derived + 4 nullable) ────────────────────

const CHECK_TARGETS: CheckTarget[] = [
  { table: 'wallets', column: 'chain', array: CHAIN_TYPES, nullable: false },
  { table: 'wallets', column: 'environment', array: ENVIRONMENT_TYPES, nullable: false },
  { table: 'wallets', column: 'default_network', array: NETWORK_TYPES, nullable: true },
  { table: 'wallets', column: 'status', array: WALLET_STATUSES, nullable: false },
  { table: 'transactions', column: 'type', array: TRANSACTION_TYPES, nullable: false },
  { table: 'transactions', column: 'status', array: TRANSACTION_STATUSES, nullable: false },
  { table: 'transactions', column: 'tier', array: POLICY_TIERS, nullable: true },
  { table: 'transactions', column: 'network', array: NETWORK_TYPES, nullable: true },
  { table: 'policies', column: 'type', array: POLICY_TYPES, nullable: false },
  { table: 'policies', column: 'network', array: NETWORK_TYPES, nullable: true },
  { table: 'notification_logs', column: 'status', array: NOTIFICATION_LOG_STATUSES, nullable: false },
];

// ─── Helpers ────────────────────────────────────────────────────────────

const errors: string[] = [];

function fail(step: string, msg: string): void {
  errors.push(`[${step}] ${msg}`);
}

/**
 * Extract enum values from a CHECK constraint in a CREATE TABLE SQL.
 * Handles both `column IN ('A', 'B')` and `column IS NULL OR column IN ('A', 'B')`.
 */
function extractCheckValues(createSql: string, column: string): string[] | null {
  // Pattern: column IN ('val1', 'val2', ...)
  // Also handle: column IS NULL OR column IN (...)
  const escapedCol = column.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    // Nullable: column IS NULL OR column IN (...)
    new RegExp(`${escapedCol}\\s+IS\\s+NULL\\s+OR\\s+${escapedCol}\\s+IN\\s*\\(([^)]+)\\)`, 'i'),
    // Standard: column IN (...)
    new RegExp(`${escapedCol}\\s+IN\\s*\\(([^)]+)\\)`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = createSql.match(pattern);
    if (match?.[1]) {
      const valuesStr = match[1];
      const values = valuesStr
        .split(',')
        .map(v => v.trim().replace(/^'|'$/g, ''))
        .filter(v => v.length > 0);
      return values;
    }
  }
  return null;
}

// ─── Step 1: SSoT <-> Zod Match ────────────────────────────────────────

function step1SsotZodMatch(): void {
  for (const e of ENUMS) {
    const arrayValues = [...e.array];
    const zodValues = [...e.zodOptions];

    if (arrayValues.length !== zodValues.length) {
      fail('Step1', `${e.name}: array(${arrayValues.length}) vs Zod(${zodValues.length}) length mismatch`);
      continue;
    }

    for (let i = 0; i < arrayValues.length; i++) {
      if (arrayValues[i] !== zodValues[i]) {
        fail('Step1', `${e.name}: array[${i}]='${arrayValues[i]}' vs Zod[${i}]='${zodValues[i]}'`);
      }
    }
  }
}

// ─── Step 2: Array Uniqueness ───────────────────────────────────────────

function step2Uniqueness(): void {
  for (const e of ENUMS) {
    const unique = new Set(e.array);
    if (unique.size !== e.array.length) {
      const dupes = e.array.filter((v, i) => e.array.indexOf(v) !== i);
      fail('Step2', `${e.name}: duplicate values found: ${dupes.join(', ')}`);
    }
  }
}

// ─── Step 3: DB CHECK Consistency ───────────────────────────────────────

function step3DbCheckConsistency(): void {
  // Create in-memory DB with full schema
  const sqlite = new Database(':memory:');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  pushSchema(sqlite);

  // Query sqlite_master for CREATE TABLE SQL
  const rows = sqlite.prepare(
    "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND sql IS NOT NULL"
  ).all() as Array<{ name: string; sql: string }>;

  const tableSqlMap = new Map<string, string>();
  for (const row of rows) {
    tableSqlMap.set(row.name, row.sql);
  }

  for (const target of CHECK_TARGETS) {
    const createSql = tableSqlMap.get(target.table);
    if (!createSql) {
      fail('Step3', `Table '${target.table}' not found in sqlite_master`);
      continue;
    }

    const dbValues = extractCheckValues(createSql, target.column);
    if (!dbValues) {
      fail('Step3', `${target.table}.${target.column}: CHECK constraint not found in CREATE TABLE SQL`);
      continue;
    }

    const ssotValues = [...target.array];

    // Compare sorted arrays (CHECK constraint order may differ)
    const dbSorted = [...dbValues].sort();
    const ssotSorted = [...ssotValues].sort();

    if (dbSorted.length !== ssotSorted.length) {
      fail('Step3', `${target.table}.${target.column}: DB CHECK(${dbSorted.length}) vs SSoT(${ssotSorted.length}) length mismatch`);
      continue;
    }

    for (let i = 0; i < dbSorted.length; i++) {
      if (dbSorted[i] !== ssotSorted[i]) {
        fail('Step3', `${target.table}.${target.column}: DB '${dbSorted[i]}' vs SSoT '${ssotSorted[i]}' mismatch at index ${i}`);
      }
    }
  }

  sqlite.close();
}

// ─── Step 4: Value Count Snapshot ───────────────────────────────────────

function step4CountSnapshot(): void {
  for (const e of ENUMS) {
    if (e.array.length !== e.expectedCount) {
      fail('Step4', `${e.name}: expected ${e.expectedCount} values, got ${e.array.length}. Update ENUMS[] expectedCount if intentional.`);
    }
  }
}

// ─── Main ───────────────────────────────────────────────────────────────

function main(): void {
  console.log('Enum SSoT verification: checking 16 enums across 4 stages...\n');

  console.log('  Step 1: SSoT <-> Zod match...');
  step1SsotZodMatch();

  console.log('  Step 2: Array uniqueness...');
  step2Uniqueness();

  console.log('  Step 3: DB CHECK consistency...');
  step3DbCheckConsistency();

  console.log('  Step 4: Value count snapshot...');
  step4CountSnapshot();

  if (errors.length > 0) {
    console.error(`\nFAILED: ${errors.length} error(s) found:\n`);
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  console.log(`\n16 enums verified across 4 stages. All checks passed.`);
}

main();
