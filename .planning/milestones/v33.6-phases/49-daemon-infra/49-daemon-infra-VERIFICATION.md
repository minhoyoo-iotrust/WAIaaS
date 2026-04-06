---
phase: 49-daemon-infra
verified: 2026-02-10T03:30:00Z
status: passed
score: 8/8 must-haves verified
---

# Phase 49: 데몬 인프라 Verification Report

**Phase Goal:** @waiaas/daemon 패키지가 SQLite DB, 키스토어, config 로더, 데몬 라이프사이클을 갖추어 "시작-실행-종료"가 가능한 프로세스가 된다

**Verified:** 2026-02-10T03:30:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth   | Status     | Evidence       |
| --- | ------- | ---------- | -------------- |
| 1   | 데몬이 시작되면 7개 테이블이 생성되고 PRAGMA 7개가 적용된 SQLite DB 파일이 존재한다 | ✓ VERIFIED | schema.ts에 7개 테이블 정의, connection.ts에 7개 PRAGMA 적용, pushSchema()가 CREATE TABLE IF NOT EXISTS 실행, 37개 테스트 통과 |
| 2   | 마스터 패스워드로 에이전트 개인키를 암호화 저장한 후, 같은 패스워드로 복호화하면 원본 키와 일치하며, 틀린 패스워드로는 복호화가 실패한다 | ✓ VERIFIED | crypto.ts의 encrypt/decrypt가 AES-256-GCM + Argon2id 구현, keystore.test.ts에서 round-trip 및 wrong password rejection 검증 (32개 테스트 통과) |
| 3   | config.toml 파일의 값이 로드되고, 같은 키에 환경변수가 설정되어 있으면 환경변수 값이 우선한다 | ✓ VERIFIED | loader.ts의 loadConfig() 파이프라인이 smol-toml parse -> detectNestedSections -> applyEnvOverrides -> Zod validate 순으로 실행, env override 우선순위 테스트 통과 (28개 config 테스트) |
| 4   | 데몬 프로세스를 시작한 후 SIGTERM을 보내면 WAL 체크포인트 완료 후 정상 종료되고, PID 파일이 제거된다 | ✓ VERIFIED | daemon.ts shutdown()이 10-step cascade 구현 (Step 8: WAL checkpoint TRUNCATE, Step 10: PID unlink), signal-handler.ts가 SIGTERM -> shutdown() 연결, lifecycle.test.ts에서 shutdown sequence 검증 |
| 5   | 이미 실행 중인 데몬이 있을 때 두 번째 인스턴스를 시작하면 flock 잠금 충돌로 즉시 실패한다 | ✓ VERIFIED | daemon.ts acquireDaemonLock()이 proper-lockfile로 exclusive lock 획득, retries: 0으로 즉시 실패, 'SYSTEM_LOCKED' 에러 throw, lifecycle.test.ts에서 lock contention 검증 |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected    | Status | Details |
| -------- | ----------- | ------ | ------- |
| `packages/daemon/src/infrastructure/database/schema.ts` | 7 table Drizzle ORM definitions with CHECK constraints from enum SSoT | ✓ VERIFIED | 239 lines, exports 7 tables (agents, sessions, transactions, policies, pendingApprovals, auditLog, keyValueStore), buildCheckSql() derives CHECK from CHAIN_TYPES/TRANSACTION_STATUSES etc., imported by connection.ts |
| `packages/daemon/src/infrastructure/database/connection.ts` | createDatabase() with 7 PRAGMAs and closeDatabase() with WAL checkpoint | ✓ VERIFIED | 59 lines, exports createDatabase() applying 7 PRAGMAs in order, closeDatabase() calling wal_checkpoint(TRUNCATE), DatabaseConnection interface, used by daemon.ts Step 2 |
| `packages/daemon/src/infrastructure/keystore/crypto.ts` | AES-256-GCM encrypt/decrypt + Argon2id KDF | ✓ VERIFIED | 120 lines, exports deriveKey (argon2.hash with m=64MiB/t=3/p=4), encrypt (createCipheriv aes-256-gcm), decrypt (createDecipheriv + authTag), EncryptedData interface, used by keystore.ts |
| `packages/daemon/src/infrastructure/keystore/memory.ts` | Sodium guarded memory allocation and zeroing | ✓ VERIFIED | 111 lines, exports allocateGuarded (sodium_malloc), writeToGuarded (mprotect_readwrite -> copy -> mprotect_readonly), zeroAndRelease (sodium_memzero + mprotect_noaccess), isAvailable(), used by keystore.ts |
| `packages/daemon/src/infrastructure/keystore/keystore.ts` | LocalKeyStore class implementing ILocalKeyStore interface | ✓ VERIFIED | 202 lines, exports LocalKeyStore implementing ILocalKeyStore, generateKeyPair (Ed25519 via sodium), decryptPrivateKey (guarded memory), releaseKey, hasKey, deleteKey, lockAll, KeystoreFileV1 interface (format v1), used by daemon.ts Step 3 |
| `packages/daemon/src/infrastructure/config/loader.ts` | loadConfig() with smol-toml parsing, nested section detection, env override, Zod validation | ✓ VERIFIED | 280 lines, exports DaemonConfigSchema (7 sections with flat keys), loadConfig() pipeline, detectNestedSections(), applyEnvOverrides(), parseEnvValue(), used by daemon.ts Step 1 |
| `packages/daemon/src/lifecycle/daemon.ts` | DaemonLifecycle class with start() 6-step sequence and shutdown() 10-step cascade | ✓ VERIFIED | 368 lines, exports DaemonLifecycle with start() (6 steps: config+flock/DB/keystore/adapter-stub/http-stub/workers+PID), shutdown() (10 steps: workers/WAL/keystore-lock/DB-close/PID-cleanup), acquireDaemonLock() via proper-lockfile, withTimeout() utility |
| `packages/daemon/src/lifecycle/workers.ts` | BackgroundWorkers class with register/startAll/stopAll | ✓ VERIFIED | 89 lines, exports BackgroundWorkers, register() for named workers, startAll() with overlap prevention, stopAll() with drain wait (5s), used by daemon.ts Step 6 (wal-checkpoint + session-cleanup workers) |

**All 8 artifacts VERIFIED** (existence + substantive + wired)

### Key Link Verification

| From | To  | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| schema.ts | @waiaas/core enums | import AGENT_STATUSES, TRANSACTION_STATUSES, CHAIN_TYPES, etc. | ✓ WIRED | Lines 23-31 import 7 enum arrays, buildCheckSql() uses them in CHECK constraints (lines 65-67, 144-151) |
| connection.ts | better-sqlite3 | new Database(dbPath) + sqlite.pragma() calls | ✓ WIRED | Lines 16-17 import Database/DatabaseType, 34-43 call sqlite.pragma() 7 times, 56 calls pragma for WAL checkpoint |
| keystore.ts | ILocalKeyStore | implements ILocalKeyStore interface | ✓ WIRED | Line 18 imports ILocalKeyStore, line 63 declares `export class LocalKeyStore implements ILocalKeyStore`, TypeScript enforces 5 methods + constructor |
| crypto.ts | argon2 + node:crypto | argon2.hash for KDF + createCipheriv/createDecipheriv for AES-GCM | ✓ WIRED | Line 10 imports createCipheriv/createDecipheriv, line 11 imports argon2, line 54 calls argon2.hash, line 78 calls createCipheriv, line 102 calls createDecipheriv |
| memory.ts | sodium-native | sodium.sodium_malloc + sodium_memzero + sodium_mprotect_readonly | ✓ WIRED | Lines 57-66 use sodium_malloc, line 107 calls sodium_memzero, lines 83-89 call mprotect_readonly/readwrite/noaccess |
| loader.ts | smol-toml + zod | parse(tomlContent) -> detectNestedSections -> applyEnvOverrides -> DaemonConfigSchema.parse | ✓ WIRED | Line 12 imports parse from smol-toml, line 13 imports z from zod, line 19 exports DaemonConfigSchema (Zod schema), lines 258-280 implement loadConfig() pipeline |
| daemon.ts | createDatabase + LocalKeyStore + acquireDaemonLock | Calls in startup Steps 1-3 | ✓ WIRED | Line 29 imports createDatabase/pushSchema, line 30 imports LocalKeyStore type, line 134 calls acquireDaemonLock(), line 155 calls createDatabase(), line 173-175 dynamic import LocalKeyStore |
| daemon.ts | BackgroundWorkers + shutdown sequence | Step 6 starts workers (WAL checkpoint + session cleanup), shutdown Steps 7-10 stop workers/WAL/keystore/DB | ✓ WIRED | Line 33 imports BackgroundWorkers, lines 212-237 register + start workers, lines 276-333 shutdown cascade calls workers.stopAll()/sqlite.pragma('wal_checkpoint(TRUNCATE)')/keyStore.lockAll()/sqlite.close()/unlinkSync(pidPath) |

**All 8 key links WIRED**

### Requirements Coverage

| Requirement | Description | Status | Blocking Issue |
| ----------- | ----------- | ------ | -------------- |
| DB-01 | 7개 테이블이 Drizzle 스키마로 정의되고, Enum SSoT에서 파생된 CHECK 제약이 적용된다 | ✓ SATISFIED | N/A - schema.ts 7 tables with buildCheckSql() from enum SSoT |
| DB-02 | PRAGMA 7개(journal_mode=WAL, foreign_keys=ON, busy_timeout=5000 등)가 데몬 시작 시 실행된다 | ✓ SATISFIED | N/A - connection.ts lines 37-43 apply 7 PRAGMAs |
| DB-03 | UUID v7이 모든 ID 필드에 사용되어 ms 단위 시간순 정렬이 보장된다 | ✓ SATISFIED | N/A - id.ts generateId() uses uuidv7 package, database.test.ts verifies chronological ordering |
| KEY-01 | AES-256-GCM으로 에이전트 개인키를 암호화하고, Argon2id(m=64MiB, t=3, p=4)로 마스터 패스워드에서 키를 파생할 수 있다 | ✓ SATISFIED | N/A - crypto.ts implements AES-256-GCM + Argon2id with doc 26 params |
| KEY-02 | sodium-native guarded memory로 복호화된 키가 메모리에서 보호되고, 사용 후 안전하게 해제된다 | ✓ SATISFIED | N/A - memory.ts allocateGuarded + writeToGuarded + zeroAndRelease |
| KEY-03 | 키스토어 파일이 포맷 v1으로 저장되고, 파일 권한 0600이 적용된다 | ✓ SATISFIED | N/A - keystore.ts KeystoreFileV1 interface, writeKeystore() sets mode 0o600 |
| CFG-01 | smol-toml로 config.toml을 파싱하고, Zod 스키마로 7 섹션 평탄화 키를 검증한다 | ✓ SATISFIED | N/A - loader.ts DaemonConfigSchema 7 sections, loadConfig() parses with smol-toml |
| CFG-02 | 환경변수 오버라이드(WAIAAS_{SECTION}_{KEY})가 toml 값보다 우선 적용된다 (env > toml > default) | ✓ SATISFIED | N/A - loader.ts applyEnvOverrides() applies after toml parse, before Zod |
| LIFE-01 | 6단계 시작 시퀀스가 구현되고, 각 단계별 타임아웃(5~30초, 90초 상한)과 fail-fast/soft 전략이 적용된다 | ✓ SATISFIED | N/A - daemon.ts lines 114-248 implement 6-step startup with withTimeout() |
| LIFE-02 | 10-step 종료 시퀀스가 구현되고, SQLite WAL 체크포인트가 종료 시 완료된다 | ✓ SATISFIED | N/A - daemon.ts lines 253-337 shutdown() with Step 8 WAL checkpoint(TRUNCATE) |
| LIFE-03 | flock 잠금으로 다중 인스턴스가 방지되고, PID 파일이 관리된다 | ✓ SATISFIED | N/A - daemon.ts acquireDaemonLock() via proper-lockfile, PID write/unlink |
| LIFE-04 | BackgroundWorkers(WAL 체크포인트, 세션 만료 정리)가 주기적으로 실행된다 | ✓ SATISFIED | N/A - workers.ts BackgroundWorkers, daemon.ts registers wal-checkpoint (5-min) + session-cleanup (1-min) |

**12/12 requirements SATISFIED**

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| N/A | N/A | No TODO/FIXME/XXX/HACK comments found | N/A | None |
| daemon.ts | 136-333 | console.log/warn for lifecycle events | ℹ️ Info | Acceptable for v1.1 daemon lifecycle logging; will be replaced with structured logger in Phase 50 |

**0 blocker anti-patterns**, **0 warning anti-patterns**, **1 info item**

### Human Verification Required

None. All success criteria are programmatically verifiable through:
1. File existence and structure checks
2. Test suite execution (114 tests across 4 test files)
3. Import/export verification
4. Pattern matching for key implementations

## Summary

Phase 49 goal **ACHIEVED**. All 8 must-haves verified:

1. **Database (Plan 49-01)**: 7 tables with CHECK constraints from enum SSoT, 7 PRAGMAs, UUID v7, 37 tests
2. **Keystore (Plan 49-02)**: AES-256-GCM + Argon2id, sodium guarded memory, format v1, 0600 permissions, 32 tests
3. **Config + Lifecycle (Plan 49-03)**: smol-toml parser, env overrides, DaemonConfigSchema (7 sections), 6-step startup, 10-step shutdown, proper-lockfile, BackgroundWorkers, 45 tests

**Total test coverage:** 114 tests (37 database + 32 keystore + 28 config + 17 lifecycle)

**Key artifacts:**
- 8 core implementation files (schema, connection, crypto, memory, keystore, loader, daemon, workers)
- 4 comprehensive test files
- All exports wired to daemon lifecycle
- All requirements (DB-01~03, KEY-01~03, CFG-01~02, LIFE-01~04) satisfied

**Next phase readiness:**
- Database module ready for transaction storage
- Keystore ready for Ed25519 signing (Solana adapter)
- Config loader ready for Phase 50 API server settings
- DaemonLifecycle stubs (Steps 4-5) ready for Phase 50 HTTP server + adapter initialization
- BackgroundWorkers framework ready for additional workers

---

_Verified: 2026-02-10T03:30:00Z_
_Verifier: Claude (gsd-verifier)_
