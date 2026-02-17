# 설계 문서 69: DB 마이그레이션 v6a+v6b 설계

> **Phase:** 105 (v1.4.5 -- 멀티체인 월렛 설계)
> **산출물:** v6a(transactions.network ADD COLUMN) + v6b(wallets 12-step 재생성) 마이그레이션 전략
> **참조 기반:** docs-internal/68-environment-model-design.md, docs-internal/65-migration-strategy.md, migrate.ts(v2/v3 선례)
> **작성일:** 2026-02-14

---

## 1. 마이그레이션 전략 개요

### 1.1 2단계 분리 근거

wallets 테이블의 `network` -> `environment` + `default_network` 전환과 transactions 테이블의 `network` 컬럼 추가를 단일 마이그레이션으로 처리하지 않고, 2단계로 분리한다.

| 단계 | version | 유형 | managesOwnTransaction | 설명 |
|------|---------|------|----------------------|------|
| v6a | 6 | 표준 (ADD COLUMN + UPDATE) | `false` | transactions.network 컬럼 추가 + wallets.network 역참조로 데이터 채움 |
| v6b | 7 | 12-step 재생성 | `true` | wallets 테이블 재생성 (network -> environment + default_network) + FK dependent 테이블 재생성 |

**분리 이유:**

1. **실패 범위 축소:** v6a가 실패하면 transactions만 롤백. v6b가 실패하면 wallets+FK 테이블만 롤백. 단일 마이그레이션이면 전체 롤백.
2. **디버깅 용이:** 각 마이그레이션의 역할이 명확하여 문제 원인 추적이 쉬움.
3. **순서 의존성 명시:** v6a -> v6b 순서가 MIGRATIONS 배열의 version 번호로 강제됨.

### 1.2 버전 번호 체계

```
현재: LATEST_SCHEMA_VERSION = 5 (v1~v5 마이그레이션)
추가: v6a = version 6, v6b = version 7
변경: LATEST_SCHEMA_VERSION = 5 -> 7 (v6b 완료 후)
```

### 1.3 순서 의존성 다이어그램

```
현재(v5) ──> v6a (version 6)           ──> v6b (version 7)
              │                               │
              │ managesOwnTransaction: false   │ managesOwnTransaction: true
              │                               │
              ├─ ALTER TABLE transactions      ├─ CREATE TABLE wallets_new
              │  ADD COLUMN network TEXT       │  (environment + default_network)
              │                               │
              ├─ UPDATE transactions SET       ├─ INSERT INTO wallets_new
              │  network = wallets.network    │  SELECT ... CASE ... FROM wallets
              │  (역참조 -- wallets.network    │  (13개 CASE WHEN 분기)
              │   아직 존재)                    │
              │                               ├─ DROP TABLE wallets
              │                               │
              │                               ├─ ALTER TABLE wallets_new
              │                               │  RENAME TO wallets
              │                               │
              │                               ├─ sessions/transactions/policies/
              │                               │  audit_log 재생성 (FK 재연결)
              │                               │
              │                               ├─ 인덱스 재생성
              │                               │
              │                               └─ PRAGMA foreign_key_check
              │
              └─ wallets.network 컬럼 아직 존재  └─ wallets.network 컬럼 제거됨
```

### 1.4 v6a가 v6b보다 먼저 실행되어야 하는 이유

v6a의 UPDATE 문은 `wallets.network` 컬럼을 역참조하여 transactions에 네트워크 값을 채운다:

```sql
UPDATE transactions SET network = (
  SELECT w.network FROM wallets w WHERE w.id = transactions.wallet_id
)
```

v6b에서는 wallets 테이블을 재생성하면서 `network` 컬럼을 `environment` + `default_network`으로 대체한다. 따라서 v6b 실행 후에는 `wallets.network` 컬럼이 존재하지 않아 v6a의 UPDATE가 실패한다.

**결론:** v6a(version 6)이 반드시 v6b(version 7)보다 먼저 실행되어야 한다. `runMigrations()`가 version 오름차순으로 정렬하여 실행하므로, version 번호만 올바르게 부여하면 순서가 보장된다.

---

## 2. v6a 마이그레이션 상세 (version: 6)

### 2.1 마이그레이션 메타데이터

```typescript
{
  version: 6,
  description: 'Add network column to transactions with backfill from wallets',
  managesOwnTransaction: false,  // 표준 마이그레이션 -- runMigrations가 BEGIN/COMMIT 관리
}
```

`managesOwnTransaction: false`이므로 `runMigrations()`가 자동으로 `BEGIN` / `COMMIT`으로 감싸고, 실패 시 `ROLLBACK`한다. 12-step 재생성이 필요 없으므로 `PRAGMA foreign_keys = OFF`도 불필요하다.

### 2.2 SQL 문 (2개)

**SQL 1: 컬럼 추가**

```sql
ALTER TABLE transactions ADD COLUMN network TEXT
```

- SQLite의 `ALTER TABLE ... ADD COLUMN`은 기존 행에 `NULL` 기본값을 설정한다.
- 이 시점에서 `CHECK` 제약은 추가하지 않는다. SQLite는 `ALTER TABLE ... ADD COLUMN`에서 `CHECK` 제약을 포함한 컬럼 추가를 허용하지만, v6b에서 transactions 테이블을 재생성할 때 CHECK를 함께 추가하는 것이 더 깔끔하다.

**SQL 2: 데이터 역참조**

```sql
UPDATE transactions SET network = (
  SELECT w.network FROM wallets w WHERE w.id = transactions.wallet_id
)
```

- `transactions.wallet_id`는 `wallets(id)` FK로 `ON DELETE RESTRICT`가 걸려있으므로, wallet이 삭제된 transaction은 존재할 수 없다.
- 따라서 서브쿼리는 항상 결과를 반환하며, 역참조 후 모든 transactions.network은 NOT NULL 값을 갖는다.
- wallet이 없는 transaction이 이론적으로 존재하더라도 (DB 무결성 오류 등), network는 NULL로 유지되어 안전하다.

### 2.3 NULL 허용 근거

스키마 레벨에서 `transactions.network`은 nullable(`TEXT` -- NOT NULL 없음)로 유지한다.

| 관점 | 근거 |
|------|------|
| 기존 데이터 안전 | ON DELETE RESTRICT로 보호되어 실제 NULL은 발생하지 않지만, DB 무결성 이상 시 graceful 처리 |
| 향후 유연성 | 외부 트랜잭션 기록, 메타 트랜잭션 등 network가 불확실한 케이스 대비 |
| Zod 일치 | `TransactionSchema.network = NetworkTypeEnum.nullable()` (docs/68 섹션 4.4) |
| CHECK 제약 | v6b에서 추가: `CHECK (network IS NULL OR network IN ({NETWORK_TYPES}))` |

### 2.4 검증 쿼리

마이그레이션 후 다음 쿼리로 역참조 성공을 확인한다:

```sql
-- 기존 데이터 전부 역참조 성공 (NULL 행 없음)
SELECT COUNT(*) FROM transactions WHERE network IS NULL;
-- 기대값: 0
```

이 쿼리는 마이그레이션 테스트에서 실행한다. 프로덕션에서는 `runMigrations()` 성공 후 별도 검증 쿼리를 실행하지 않는다 (v6b의 PRAGMA foreign_key_check로 전체 무결성을 검증).

### 2.5 v6a 의사코드

```typescript
MIGRATIONS.push({
  version: 6,
  description: 'Add network column to transactions with backfill from wallets',
  managesOwnTransaction: false,
  up: (sqlite) => {
    // SQL 1: Add nullable network column
    sqlite.exec('ALTER TABLE transactions ADD COLUMN network TEXT');

    // SQL 2: Backfill from wallets.network via FK relationship
    sqlite.exec(`UPDATE transactions SET network = (
      SELECT w.network FROM wallets w WHERE w.id = transactions.wallet_id
    )`);
  },
});
```

`managesOwnTransaction: false`이므로 `runMigrations()`가 자동으로 트랜잭션을 관리한다. `up()` 내부에서 `BEGIN`/`COMMIT` 호출 금지.

---

## 3. v6b 마이그레이션 상세 (version: 7, managesOwnTransaction: true)

### 3.1 마이그레이션 메타데이터

```typescript
{
  version: 7,
  description: 'Replace wallets.network with environment + default_network (12-step recreation)',
  managesOwnTransaction: true,  // 12-step 재생성 -- PRAGMA foreign_keys=OFF 필요
}
```

`managesOwnTransaction: true`이므로 `runMigrations()`가 `PRAGMA foreign_keys = OFF`를 설정한 후 `up()`을 호출한다. `up()` 내부에서 직접 `BEGIN` / `COMMIT`을 관리한다.

### 3.2 12-Step 재생성 절차

v2(Phase 85) / v3(Phase 89) 마이그레이션의 검증된 패턴을 따른다. v3에서는 agents -> wallets 리네임 시 sessions / transactions / policies / audit_log / notification_logs 5개 FK dependent 테이블을 모두 재생성했다. v6b에서는 동일한 안전 원칙을 따르되, 컬럼 변경이 있는 wallets + transactions만 실질 변경하고, sessions / policies / audit_log는 FK 재연결만 수행한다.

---

**Step 1: BEGIN**

```sql
BEGIN
```

`up()` 내부에서 직접 트랜잭션을 시작한다. `managesOwnTransaction: true`이므로 외부에서 감싸지 않는다.

---

**Step 2: wallets_new 테이블 생성**

```sql
CREATE TABLE wallets_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  chain TEXT NOT NULL CHECK (chain IN ('solana', 'ethereum')),
  environment TEXT NOT NULL CHECK (environment IN ('testnet', 'mainnet')),
  default_network TEXT CHECK (default_network IS NULL OR default_network IN (
    'mainnet', 'devnet', 'testnet',
    'ethereum-mainnet', 'ethereum-sepolia',
    'polygon-mainnet', 'polygon-amoy',
    'arbitrum-mainnet', 'arbitrum-sepolia',
    'optimism-mainnet', 'optimism-sepolia',
    'base-mainnet', 'base-sepolia'
  )),
  public_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'CREATING' CHECK (status IN ('CREATING', 'ACTIVE', 'SUSPENDED', 'TERMINATED')),
  owner_address TEXT,
  owner_verified INTEGER NOT NULL DEFAULT 0 CHECK (owner_verified IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  suspended_at INTEGER,
  suspension_reason TEXT
)
```

변경 사항:
- `network TEXT NOT NULL CHECK (network IN (...))` 제거
- `environment TEXT NOT NULL CHECK (environment IN ('testnet', 'mainnet'))` 추가
- `default_network TEXT CHECK (default_network IS NULL OR default_network IN (...))` 추가 (nullable)

**구현 시 참고:** CHECK 제약의 값 목록은 SSoT 배열(`CHAIN_TYPES`, `ENVIRONMENT_TYPES`, `NETWORK_TYPES`, `WALLET_STATUSES`)에서 `inList()` 유틸로 생성한다. 위 SQL은 현재 SSoT 값을 전개한 형태이다.

---

**Step 3: 데이터 변환 INSERT**

```sql
INSERT INTO wallets_new (
  id, name, chain, environment, default_network,
  public_key, status, owner_address, owner_verified,
  created_at, updated_at, suspended_at, suspension_reason
)
SELECT
  id, name, chain,
  CASE
    -- Solana mainnet (1개)
    WHEN network = 'mainnet' THEN 'mainnet'
    -- Solana testnet (2개)
    WHEN network = 'devnet' THEN 'testnet'
    WHEN network = 'testnet' THEN 'testnet'
    -- EVM mainnet (5개)
    WHEN network = 'ethereum-mainnet' THEN 'mainnet'
    WHEN network = 'polygon-mainnet' THEN 'mainnet'
    WHEN network = 'arbitrum-mainnet' THEN 'mainnet'
    WHEN network = 'optimism-mainnet' THEN 'mainnet'
    WHEN network = 'base-mainnet' THEN 'mainnet'
    -- EVM testnet (5개)
    WHEN network = 'ethereum-sepolia' THEN 'testnet'
    WHEN network = 'polygon-amoy' THEN 'testnet'
    WHEN network = 'arbitrum-sepolia' THEN 'testnet'
    WHEN network = 'optimism-sepolia' THEN 'testnet'
    WHEN network = 'base-sepolia' THEN 'testnet'
    -- Safety fallback (기존 CHECK가 13개 값만 허용하므로 실행 불가)
    ELSE 'testnet'
  END AS environment,
  network AS default_network,
  public_key, status, owner_address, owner_verified,
  created_at, updated_at, suspended_at, suspension_reason
FROM wallets
```

**13개 CASE WHEN 분기 검증 (docs/68 섹션 3.3 deriveEnvironment() 매핑과 1:1 일치):**

| # | network (CASE WHEN) | environment (THEN) | docs/68 deriveEnvironment() | 일치 |
|---|---------------------|--------------------|-----------------------------|------|
| 1 | `mainnet` | `mainnet` | `mainnet` -> `mainnet` | YES |
| 2 | `devnet` | `testnet` | `devnet` -> `testnet` | YES |
| 3 | `testnet` | `testnet` | `testnet` -> `testnet` | YES |
| 4 | `ethereum-mainnet` | `mainnet` | `ethereum-mainnet` -> `mainnet` | YES |
| 5 | `polygon-mainnet` | `mainnet` | `polygon-mainnet` -> `mainnet` | YES |
| 6 | `arbitrum-mainnet` | `mainnet` | `arbitrum-mainnet` -> `mainnet` | YES |
| 7 | `optimism-mainnet` | `mainnet` | `optimism-mainnet` -> `mainnet` | YES |
| 8 | `base-mainnet` | `mainnet` | `base-mainnet` -> `mainnet` | YES |
| 9 | `ethereum-sepolia` | `testnet` | `ethereum-sepolia` -> `testnet` | YES |
| 10 | `polygon-amoy` | `testnet` | `polygon-amoy` -> `testnet` | YES |
| 11 | `arbitrum-sepolia` | `testnet` | `arbitrum-sepolia` -> `testnet` | YES |
| 12 | `optimism-sepolia` | `testnet` | `optimism-sepolia` -> `testnet` | YES |
| 13 | `base-sepolia` | `testnet` | `base-sepolia` -> `testnet` | YES |

**결과: 13/13 전수 매핑 일치. 누락 없음.**

**ELSE 분기:** 기존 wallets 테이블의 `CHECK (network IN (...))` 제약이 13개 NETWORK_TYPES 값만 허용하므로, ELSE 분기는 실행되지 않는다. 만약 CHECK를 우회한 비정상 데이터가 있을 경우 안전하게 `testnet`으로 분류한다.

**default_network = network:** 기존 1:1 모델의 network 값을 그대로 `default_network`에 보존한다. 마이그레이션 직후 모든 행의 `default_network`는 NOT NULL이다.

---

**Step 4: DROP TABLE wallets**

```sql
DROP TABLE wallets
```

기존 wallets 테이블을 삭제한다. `PRAGMA foreign_keys = OFF` 상태이므로 FK 참조 오류가 발생하지 않는다.

---

**Step 5: ALTER TABLE wallets_new RENAME TO wallets**

```sql
ALTER TABLE wallets_new RENAME TO wallets
```

wallets_new를 wallets로 리네임한다.

---

**Step 6: wallets 인덱스 재생성**

```sql
DROP INDEX IF EXISTS idx_wallets_chain_network;
CREATE UNIQUE INDEX idx_wallets_public_key ON wallets(public_key);
CREATE INDEX idx_wallets_status ON wallets(status);
CREATE INDEX idx_wallets_chain_environment ON wallets(chain, environment);
CREATE INDEX idx_wallets_owner_address ON wallets(owner_address);
```

변경 사항:
- `idx_wallets_chain_network` 삭제 (기존 인덱스는 DROP TABLE 시 함께 삭제되지만, IF EXISTS로 안전 처리)
- `idx_wallets_chain_environment` 신규 생성 (chain + environment 복합 인덱스)
- 나머지 인덱스는 기존과 동일하게 재생성

---

**Step 7: sessions 테이블 재생성 (FK 재연결)**

```sql
CREATE TABLE sessions_new (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  constraints TEXT,
  usage_stats TEXT,
  revoked_at INTEGER,
  renewal_count INTEGER NOT NULL DEFAULT 0,
  max_renewals INTEGER NOT NULL DEFAULT 30,
  last_renewed_at INTEGER,
  absolute_expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
)
```

```sql
INSERT INTO sessions_new (
  id, wallet_id, token_hash, expires_at, constraints, usage_stats,
  revoked_at, renewal_count, max_renewals, last_renewed_at,
  absolute_expires_at, created_at
)
SELECT
  id, wallet_id, token_hash, expires_at, constraints, usage_stats,
  revoked_at, renewal_count, max_renewals, last_renewed_at,
  absolute_expires_at, created_at
FROM sessions
```

```sql
DROP TABLE sessions
```

```sql
ALTER TABLE sessions_new RENAME TO sessions
```

sessions 스키마는 변경 없음. FK(`REFERENCES wallets(id)`)를 새 wallets 테이블에 재연결한다. v3 선례를 따라 안전하게 재생성한다.

sessions 인덱스 재생성:

```sql
CREATE INDEX idx_sessions_wallet_id ON sessions(wallet_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX idx_sessions_token_hash ON sessions(token_hash);
```

---

**Step 8: transactions 테이블 재생성**

v6a에서 추가된 `network` 컬럼을 포함하고, `CHECK` 제약을 추가한다.

```sql
CREATE TABLE transactions_new (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  chain TEXT NOT NULL,
  tx_hash TEXT,
  type TEXT NOT NULL CHECK (type IN ('TRANSFER', 'TOKEN_TRANSFER', 'CONTRACT_CALL', 'APPROVE', 'BATCH')),
  amount TEXT,
  to_address TEXT,
  token_mint TEXT,
  contract_address TEXT,
  method_signature TEXT,
  spender_address TEXT,
  approved_amount TEXT,
  parent_id TEXT REFERENCES transactions_new(id) ON DELETE CASCADE,
  batch_index INTEGER,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'QUEUED', 'APPROVED', 'EXECUTING', 'SUBMITTED', 'CONFIRMED', 'FAILED', 'REJECTED')),
  tier TEXT CHECK (tier IS NULL OR tier IN ('AUTO', 'QUEUED', 'APPROVAL')),
  queued_at INTEGER,
  executed_at INTEGER,
  created_at INTEGER NOT NULL,
  reserved_amount TEXT,
  error TEXT,
  metadata TEXT,
  network TEXT CHECK (network IS NULL OR network IN (
    'mainnet', 'devnet', 'testnet',
    'ethereum-mainnet', 'ethereum-sepolia',
    'polygon-mainnet', 'polygon-amoy',
    'arbitrum-mainnet', 'arbitrum-sepolia',
    'optimism-mainnet', 'optimism-sepolia',
    'base-mainnet', 'base-sepolia'
  ))
)
```

변경 사항:
- `network TEXT CHECK (...)` 컬럼 추가 (v6a에서 ADD COLUMN한 것을 CHECK 제약과 함께 정식 포함)
- `parent_id`의 FK는 `transactions_new(id)`를 참조 (v3 선례와 동일)

**구현 시 참고:** CHECK 제약의 값 목록은 SSoT 배열(`TRANSACTION_TYPES`, `TRANSACTION_STATUSES`, `POLICY_TIERS`, `NETWORK_TYPES`)에서 `inList()` 유틸로 생성한다.

```sql
INSERT INTO transactions_new (
  id, wallet_id, session_id, chain, tx_hash, type, amount, to_address,
  token_mint, contract_address, method_signature, spender_address,
  approved_amount, parent_id, batch_index, status, tier, queued_at,
  executed_at, created_at, reserved_amount, error, metadata, network
)
SELECT
  id, wallet_id, session_id, chain, tx_hash, type, amount, to_address,
  token_mint, contract_address, method_signature, spender_address,
  approved_amount, parent_id, batch_index, status, tier, queued_at,
  executed_at, created_at, reserved_amount, error, metadata, network
FROM transactions
```

```sql
DROP TABLE transactions
```

```sql
ALTER TABLE transactions_new RENAME TO transactions
```

transactions 인덱스 재생성:

```sql
CREATE INDEX idx_transactions_wallet_status ON transactions(wallet_id, status);
CREATE INDEX idx_transactions_session_id ON transactions(session_id);
CREATE UNIQUE INDEX idx_transactions_tx_hash ON transactions(tx_hash);
CREATE INDEX idx_transactions_queued_at ON transactions(queued_at);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_contract_address ON transactions(contract_address);
CREATE INDEX idx_transactions_parent_id ON transactions(parent_id);
```

---

**Step 9: policies 테이블 재생성 (FK 재연결)**

```sql
CREATE TABLE policies_new (
  id TEXT PRIMARY KEY,
  wallet_id TEXT REFERENCES wallets(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('SPENDING_LIMIT', 'RATE_LIMIT', 'WHITELIST', 'BLACKLIST', 'ALLOWED_TOKENS', 'CONTRACT_WHITELIST', 'APPROVED_SPENDERS', 'TRANSFER_LIMIT', 'TIME_BASED_LIMIT')),
  rules TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)
```

```sql
INSERT INTO policies_new (id, wallet_id, type, rules, priority, enabled, created_at, updated_at)
SELECT id, wallet_id, type, rules, priority, enabled, created_at, updated_at
FROM policies
```

```sql
DROP TABLE policies
```

```sql
ALTER TABLE policies_new RENAME TO policies
```

**주의:** `policies.network` 컬럼은 Phase 107 범위이다. v6b에서 미리 추가하지 않는다 (스코프 분리 원칙). Phase 107에서 v8 마이그레이션으로 추가할 수 있다.

policies 인덱스 재생성:

```sql
CREATE INDEX idx_policies_wallet_enabled ON policies(wallet_id, enabled);
CREATE INDEX idx_policies_type ON policies(type);
```

**구현 시 참고:** CHECK 제약의 값 목록은 SSoT 배열(`POLICY_TYPES`)에서 `inList()` 유틸로 생성한다.

---

**Step 10: audit_log 테이블 재생성 (FK dependent)**

audit_log는 wallets에 대한 FK 제약이 없지만(wallet_id는 단순 TEXT, FK 미설정), v3 선례를 따라 일관성을 위해 재생성한다.

```sql
CREATE TABLE audit_log_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL,
  wallet_id TEXT,
  session_id TEXT,
  tx_id TEXT,
  details TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  ip_address TEXT
)
```

```sql
INSERT INTO audit_log_new (id, timestamp, event_type, actor, wallet_id, session_id, tx_id, details, severity, ip_address)
SELECT id, timestamp, event_type, actor, wallet_id, session_id, tx_id, details, severity, ip_address
FROM audit_log
```

```sql
DROP TABLE audit_log
```

```sql
ALTER TABLE audit_log_new RENAME TO audit_log
```

audit_log 인덱스 재생성:

```sql
CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp);
CREATE INDEX idx_audit_log_event_type ON audit_log(event_type);
CREATE INDEX idx_audit_log_wallet_id ON audit_log(wallet_id);
CREATE INDEX idx_audit_log_severity ON audit_log(severity);
CREATE INDEX idx_audit_log_wallet_timestamp ON audit_log(wallet_id, timestamp);
```

---

**Step 11: COMMIT**

```sql
COMMIT
```

모든 재생성이 성공하면 트랜잭션을 커밋한다. 실패 시 `catch` 블록에서 `ROLLBACK`을 실행한다.

---

**Step 12: FK 무결성 검증**

```typescript
// Re-enable foreign keys and verify integrity
sqlite.pragma('foreign_keys = ON');
const fkErrors = sqlite.pragma('foreign_key_check') as unknown[];
if (fkErrors.length > 0) {
  throw new Error(`FK integrity violation after v6b: ${JSON.stringify(fkErrors)}`);
}
```

COMMIT 후 `PRAGMA foreign_keys = ON`으로 복원하고, `PRAGMA foreign_key_check`로 전체 DB의 FK 무결성을 검증한다. 오류가 있으면 즉시 예외를 발생시킨다.

### 3.3 마이그레이션 후 검증 쿼리 (테스트에서 실행)

```sql
-- 1. 환경 값 검증 (testnet/mainnet만 존재)
SELECT COUNT(*) FROM wallets WHERE environment NOT IN ('testnet', 'mainnet');
-- 기대값: 0

-- 2. default_network 보존 검증 (마이그레이션 직후 NULL 행 없음)
SELECT COUNT(*) FROM wallets WHERE default_network IS NULL;
-- 기대값: 0

-- 3. transactions.network 보존 검증 (v6a에서 이미 채워짐)
SELECT COUNT(*) FROM transactions WHERE network IS NULL;
-- 기대값: 0

-- 4. FK 무결성 검증
PRAGMA foreign_key_check;
-- 기대값: empty result (행 없음)

-- 5. 인덱스 존재 확인
SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='wallets';
-- 기대값: idx_wallets_public_key, idx_wallets_status, idx_wallets_chain_environment, idx_wallets_owner_address

-- 6. 기존 idx_wallets_chain_network 제거 확인
SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='idx_wallets_chain_network';
-- 기대값: 0

-- 7. CHECK 제약 검증 (잘못된 환경 값 삽입 시도)
-- INSERT INTO wallets (..., environment, ...) VALUES (..., 'staging', ...);
-- 기대값: CHECK constraint failed
```

### 3.4 v6b 의사코드

```typescript
MIGRATIONS.push({
  version: 7,
  description: 'Replace wallets.network with environment + default_network (12-step recreation)',
  managesOwnTransaction: true,
  up: (sqlite) => {
    // Step 1: Begin transaction
    sqlite.exec('BEGIN');

    try {
      // Step 2: Create wallets_new with environment + default_network
      sqlite.exec(`CREATE TABLE wallets_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  chain TEXT NOT NULL CHECK (chain IN (${inList(CHAIN_TYPES)})),
  environment TEXT NOT NULL CHECK (environment IN (${inList(ENVIRONMENT_TYPES)})),
  default_network TEXT CHECK (default_network IS NULL OR default_network IN (${inList(NETWORK_TYPES)})),
  public_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'CREATING' CHECK (status IN (${inList(WALLET_STATUSES)})),
  owner_address TEXT,
  owner_verified INTEGER NOT NULL DEFAULT 0 CHECK (owner_verified IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  suspended_at INTEGER,
  suspension_reason TEXT
)`);

      // Step 3: Data transformation INSERT with 13 CASE WHEN branches
      sqlite.exec(`INSERT INTO wallets_new (
  id, name, chain, environment, default_network,
  public_key, status, owner_address, owner_verified,
  created_at, updated_at, suspended_at, suspension_reason
)
SELECT
  id, name, chain,
  CASE
    WHEN network = 'mainnet' THEN 'mainnet'
    WHEN network = 'devnet' THEN 'testnet'
    WHEN network = 'testnet' THEN 'testnet'
    WHEN network = 'ethereum-mainnet' THEN 'mainnet'
    WHEN network = 'polygon-mainnet' THEN 'mainnet'
    WHEN network = 'arbitrum-mainnet' THEN 'mainnet'
    WHEN network = 'optimism-mainnet' THEN 'mainnet'
    WHEN network = 'base-mainnet' THEN 'mainnet'
    WHEN network = 'ethereum-sepolia' THEN 'testnet'
    WHEN network = 'polygon-amoy' THEN 'testnet'
    WHEN network = 'arbitrum-sepolia' THEN 'testnet'
    WHEN network = 'optimism-sepolia' THEN 'testnet'
    WHEN network = 'base-sepolia' THEN 'testnet'
    ELSE 'testnet'
  END AS environment,
  network AS default_network,
  public_key, status, owner_address, owner_verified,
  created_at, updated_at, suspended_at, suspension_reason
FROM wallets`);

      // Step 4: Drop old wallets table
      sqlite.exec('DROP TABLE wallets');

      // Step 5: Rename new table
      sqlite.exec('ALTER TABLE wallets_new RENAME TO wallets');

      // Step 6: Recreate wallets indexes
      sqlite.exec('DROP INDEX IF EXISTS idx_wallets_chain_network');
      sqlite.exec('CREATE UNIQUE INDEX idx_wallets_public_key ON wallets(public_key)');
      sqlite.exec('CREATE INDEX idx_wallets_status ON wallets(status)');
      sqlite.exec('CREATE INDEX idx_wallets_chain_environment ON wallets(chain, environment)');
      sqlite.exec('CREATE INDEX idx_wallets_owner_address ON wallets(owner_address)');

      // Step 7: Recreate sessions (FK reconnection, no schema change)
      sqlite.exec(`CREATE TABLE sessions_new (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  constraints TEXT,
  usage_stats TEXT,
  revoked_at INTEGER,
  renewal_count INTEGER NOT NULL DEFAULT 0,
  max_renewals INTEGER NOT NULL DEFAULT 30,
  last_renewed_at INTEGER,
  absolute_expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
)`);
      sqlite.exec(`INSERT INTO sessions_new (id, wallet_id, token_hash, expires_at, constraints, usage_stats, revoked_at, renewal_count, max_renewals, last_renewed_at, absolute_expires_at, created_at)
  SELECT id, wallet_id, token_hash, expires_at, constraints, usage_stats, revoked_at, renewal_count, max_renewals, last_renewed_at, absolute_expires_at, created_at FROM sessions`);
      sqlite.exec('DROP TABLE sessions');
      sqlite.exec('ALTER TABLE sessions_new RENAME TO sessions');
      sqlite.exec('CREATE INDEX idx_sessions_wallet_id ON sessions(wallet_id)');
      sqlite.exec('CREATE INDEX idx_sessions_expires_at ON sessions(expires_at)');
      sqlite.exec('CREATE INDEX idx_sessions_token_hash ON sessions(token_hash)');

      // Step 8: Recreate transactions (network column with CHECK, FK reconnection)
      sqlite.exec(`CREATE TABLE transactions_new (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  chain TEXT NOT NULL,
  tx_hash TEXT,
  type TEXT NOT NULL CHECK (type IN (${inList(TRANSACTION_TYPES)})),
  amount TEXT,
  to_address TEXT,
  token_mint TEXT,
  contract_address TEXT,
  method_signature TEXT,
  spender_address TEXT,
  approved_amount TEXT,
  parent_id TEXT REFERENCES transactions_new(id) ON DELETE CASCADE,
  batch_index INTEGER,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN (${inList(TRANSACTION_STATUSES)})),
  tier TEXT CHECK (tier IS NULL OR tier IN (${inList(POLICY_TIERS)})),
  queued_at INTEGER,
  executed_at INTEGER,
  created_at INTEGER NOT NULL,
  reserved_amount TEXT,
  error TEXT,
  metadata TEXT,
  network TEXT CHECK (network IS NULL OR network IN (${inList(NETWORK_TYPES)}))
)`);
      sqlite.exec(`INSERT INTO transactions_new (id, wallet_id, session_id, chain, tx_hash, type, amount, to_address, token_mint, contract_address, method_signature, spender_address, approved_amount, parent_id, batch_index, status, tier, queued_at, executed_at, created_at, reserved_amount, error, metadata, network)
  SELECT id, wallet_id, session_id, chain, tx_hash, type, amount, to_address, token_mint, contract_address, method_signature, spender_address, approved_amount, parent_id, batch_index, status, tier, queued_at, executed_at, created_at, reserved_amount, error, metadata, network FROM transactions`);
      sqlite.exec('DROP TABLE transactions');
      sqlite.exec('ALTER TABLE transactions_new RENAME TO transactions');
      sqlite.exec('CREATE INDEX idx_transactions_wallet_status ON transactions(wallet_id, status)');
      sqlite.exec('CREATE INDEX idx_transactions_session_id ON transactions(session_id)');
      sqlite.exec('CREATE UNIQUE INDEX idx_transactions_tx_hash ON transactions(tx_hash)');
      sqlite.exec('CREATE INDEX idx_transactions_queued_at ON transactions(queued_at)');
      sqlite.exec('CREATE INDEX idx_transactions_created_at ON transactions(created_at)');
      sqlite.exec('CREATE INDEX idx_transactions_type ON transactions(type)');
      sqlite.exec('CREATE INDEX idx_transactions_contract_address ON transactions(contract_address)');
      sqlite.exec('CREATE INDEX idx_transactions_parent_id ON transactions(parent_id)');

      // Step 9: Recreate policies (FK reconnection, no schema change)
      sqlite.exec(`CREATE TABLE policies_new (
  id TEXT PRIMARY KEY,
  wallet_id TEXT REFERENCES wallets(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (${inList(POLICY_TYPES)})),
  rules TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`);
      sqlite.exec(`INSERT INTO policies_new (id, wallet_id, type, rules, priority, enabled, created_at, updated_at)
  SELECT id, wallet_id, type, rules, priority, enabled, created_at, updated_at FROM policies`);
      sqlite.exec('DROP TABLE policies');
      sqlite.exec('ALTER TABLE policies_new RENAME TO policies');
      sqlite.exec('CREATE INDEX idx_policies_wallet_enabled ON policies(wallet_id, enabled)');
      sqlite.exec('CREATE INDEX idx_policies_type ON policies(type)');

      // Step 10: Recreate audit_log (consistency with v3 pattern)
      sqlite.exec(`CREATE TABLE audit_log_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL,
  wallet_id TEXT,
  session_id TEXT,
  tx_id TEXT,
  details TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  ip_address TEXT
)`);
      sqlite.exec(`INSERT INTO audit_log_new (id, timestamp, event_type, actor, wallet_id, session_id, tx_id, details, severity, ip_address)
  SELECT id, timestamp, event_type, actor, wallet_id, session_id, tx_id, details, severity, ip_address FROM audit_log`);
      sqlite.exec('DROP TABLE audit_log');
      sqlite.exec('ALTER TABLE audit_log_new RENAME TO audit_log');
      sqlite.exec('CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp)');
      sqlite.exec('CREATE INDEX idx_audit_log_event_type ON audit_log(event_type)');
      sqlite.exec('CREATE INDEX idx_audit_log_wallet_id ON audit_log(wallet_id)');
      sqlite.exec('CREATE INDEX idx_audit_log_severity ON audit_log(severity)');
      sqlite.exec('CREATE INDEX idx_audit_log_wallet_timestamp ON audit_log(wallet_id, timestamp)');

      // Step 11: Commit transaction
      sqlite.exec('COMMIT');
    } catch (err) {
      sqlite.exec('ROLLBACK');
      throw err;
    }

    // Step 12: Re-enable foreign keys and verify integrity
    sqlite.pragma('foreign_keys = ON');
    const fkErrors = sqlite.pragma('foreign_key_check') as unknown[];
    if (fkErrors.length > 0) {
      throw new Error(`FK integrity violation after v6b: ${JSON.stringify(fkErrors)}`);
    }
  },
});
```

---

## 4. pushSchema DDL 동기화 계획

v6a+v6b 마이그레이션 완료 후, 새 DB(`pushSchema()`)가 마이그레이션된 DB와 동일한 스키마를 생성하도록 DDL을 업데이트한다.

### 4.1 getCreateTableStatements() 변경

**wallets 테이블 DDL 업데이트:**

```typescript
// 현재 (v5):
`CREATE TABLE IF NOT EXISTS wallets (
  ...
  network TEXT NOT NULL CHECK (network IN (${inList(NETWORK_TYPES)})),
  ...
)`

// 변경 (v7):
`CREATE TABLE IF NOT EXISTS wallets (
  ...
  environment TEXT NOT NULL CHECK (environment IN (${inList(ENVIRONMENT_TYPES)})),
  default_network TEXT CHECK (default_network IS NULL OR default_network IN (${inList(NETWORK_TYPES)})),
  ...
)`
```

변경 사항:
- `network TEXT NOT NULL CHECK (network IN (...))` 제거
- `environment TEXT NOT NULL CHECK (environment IN (${inList(ENVIRONMENT_TYPES)}))` 추가
- `default_network TEXT CHECK (default_network IS NULL OR default_network IN (${inList(NETWORK_TYPES)}))` 추가

**transactions 테이블 DDL 업데이트:**

```typescript
// 현재 (v5):
`CREATE TABLE IF NOT EXISTS transactions (
  ...
  metadata TEXT
)`

// 변경 (v7):
`CREATE TABLE IF NOT EXISTS transactions (
  ...
  metadata TEXT,
  network TEXT CHECK (network IS NULL OR network IN (${inList(NETWORK_TYPES)}))
)`
```

변경 사항:
- `network TEXT CHECK (network IS NULL OR network IN (...))` 컬럼 추가

### 4.2 getCreateIndexStatements() 변경

```typescript
// 현재 (v5):
'CREATE INDEX IF NOT EXISTS idx_wallets_chain_network ON wallets(chain, network)',

// 변경 (v7):
'CREATE INDEX IF NOT EXISTS idx_wallets_chain_environment ON wallets(chain, environment)',
```

### 4.3 LATEST_SCHEMA_VERSION 변경

```typescript
// 현재:
export const LATEST_SCHEMA_VERSION = 5;

// 변경:
export const LATEST_SCHEMA_VERSION = 7;
```

v7로 업데이트하면 `pushSchema()`가 새 DB에서 version 1~7을 모두 기록하여, v6a/v6b 마이그레이션이 스킵된다.

### 4.4 pushSchema() 동작 확인

`pushSchema()`는 기존 패턴 그대로 동작한다:

1. 새 DB: DDL(v7 최신) 실행 -> version 1~7 기록 -> runMigrations() 호출 시 모두 스킵
2. 기존 DB (v5): DDL(IF NOT EXISTS -- 이미 존재) -> version 1 이미 기록 -> runMigrations() 호출 -> v6a, v6b 실행

코드 변경은 `getCreateTableStatements()`, `getCreateIndexStatements()`, `LATEST_SCHEMA_VERSION`만 해당. `pushSchema()` 함수 자체는 변경 불필요.

---

## 5. Drizzle ORM 스키마 변경 계획

`packages/daemon/src/infrastructure/database/schema.ts`에 적용할 변경.

### 5.1 wallets 테이블

```typescript
// 현재 (v5):
import { CHAIN_TYPES, NETWORK_TYPES, WALLET_STATUSES } from '@waiaas/core';

export const wallets = sqliteTable('wallets', {
  // ...
  network: text('network').notNull(),
  // ...
}, (table) => [
  index('idx_wallets_chain_network').on(table.chain, table.network),
  check('check_network', buildCheckSql('network', NETWORK_TYPES)),
]);

// 변경 (v7):
import { CHAIN_TYPES, NETWORK_TYPES, ENVIRONMENT_TYPES, WALLET_STATUSES } from '@waiaas/core';

export const wallets = sqliteTable('wallets', {
  // ...
  environment: text('environment').notNull(),     // NEW: 'testnet' | 'mainnet'
  defaultNetwork: text('default_network'),         // NEW: nullable
  // network 제거
  // ...
}, (table) => [
  index('idx_wallets_chain_environment').on(table.chain, table.environment),  // 인덱스 변경
  check('check_environment', buildCheckSql('environment', ENVIRONMENT_TYPES)), // CHECK 변경
  check(
    'check_default_network',
    sql.raw(
      `default_network IS NULL OR default_network IN (${NETWORK_TYPES.map((v) => `'${v}'`).join(', ')})`,
    ),
  ), // NEW: nullable CHECK
]);
```

### 5.2 transactions 테이블

```typescript
// 현재 (v5):
export const transactions = sqliteTable('transactions', {
  // ... 기존 컬럼들
  metadata: text('metadata'),
});

// 변경 (v7):
export const transactions = sqliteTable('transactions', {
  // ... 기존 컬럼들
  metadata: text('metadata'),
  network: text('network'),  // NEW: nullable
}, (table) => [
  // ... 기존 인덱스/CHECK들
  check(
    'check_tx_network',
    sql.raw(
      `network IS NULL OR network IN (${NETWORK_TYPES.map((v) => `'${v}'`).join(', ')})`,
    ),
  ), // NEW: nullable CHECK
]);
```

### 5.3 변경 요약

| 파일 | 변경 내용 |
|------|---------|
| `schema.ts` import | `ENVIRONMENT_TYPES` 추가 |
| `wallets.network` | 제거 |
| `wallets.environment` | 추가 (`text('environment').notNull()`) |
| `wallets.defaultNetwork` | 추가 (`text('default_network')`) |
| `wallets` index | `idx_wallets_chain_network` -> `idx_wallets_chain_environment` |
| `wallets` check | `check_network` -> `check_environment` + `check_default_network` 추가 |
| `transactions.network` | 추가 (`text('network')`) |
| `transactions` check | `check_tx_network` 추가 |

---

## 6. 테스트 전략

### 6.1 테스트 파일 위치

기존 마이그레이션 테스트 패턴을 따른다:
- `packages/daemon/src/__tests__/migration-runner.test.ts` -- 기존 v2/v3/v4/v5 마이그레이션 테스트

### 6.2 테스트 케이스 (6개)

**케이스 1: v6a -- transactions.network 역참조 성공**

```typescript
// v5 DB 생성 -> 월렛 생성 (network='devnet') -> 트랜잭션 생성
// v6a 마이그레이션 적용
// 검증: transactions.network = 'devnet' (wallets.network에서 역참조)
```

**케이스 2: v6b -- Solana mainnet 월렛 변환**

```typescript
// v6a 적용 후 DB
// v6b 마이그레이션 적용
// 검증: environment='mainnet', default_network='mainnet'
```

**케이스 3: v6b -- EVM testnet 월렛 변환**

```typescript
// v6a 적용 후 DB (월렛: network='ethereum-sepolia')
// v6b 마이그레이션 적용
// 검증: environment='testnet', default_network='ethereum-sepolia'
```

**케이스 4: v6b -- FK 무결성 (sessions/transactions/policies)**

```typescript
// v6a 적용 후 DB (월렛 + 세션 + 트랜잭션 + 정책)
// v6b 마이그레이션 적용
// 검증: PRAGMA foreign_key_check = empty, 모든 FK 관계 유지
```

**케이스 5: v6b -- idx_wallets_chain_environment 인덱스 존재**

```typescript
// v6b 마이그레이션 적용 후
// 검증: sqlite_master에서 idx_wallets_chain_environment 존재
// 검증: sqlite_master에서 idx_wallets_chain_network 미존재
```

**케이스 6: pushSchema vs 마이그레이션 스키마 동일성**

```typescript
// DB A: pushSchema()로 새 DB 생성
// DB B: v1 DB 생성 -> v2 -> v3 -> v4 -> v5 -> v6a -> v6b 마이그레이션 순차 적용
// 검증: DB A와 DB B의 PRAGMA table_info() 결과 동일
// 검증: DB A와 DB B의 sqlite_master (indexes) 동일
```

### 6.3 테스트 패턴

기존 `migration-runner.test.ts`의 패턴을 따른다:

1. 인메모리 SQLite DB 생성 (`:memory:`)
2. v5 스키마의 DB를 수동으로 구성 (pushSchema 대신 직접 DDL 실행)
3. 테스트 데이터 삽입 (월렛, 세션, 트랜잭션, 정책)
4. 마이그레이션 함수 호출 (`runMigrations()`)
5. 결과 검증 (PRAGMA table_info, SELECT 쿼리, PRAGMA foreign_key_check)

---

## 7. 위험 요소 + 완화 전략

### 7.1 CASE 분기 누락

| 항목 | 내용 |
|------|------|
| **위험** | 13개 NETWORK_TYPES 중 일부 CASE WHEN 분기를 누락하여 일부 월렛의 environment가 잘못 설정됨 |
| **발생 확률** | 낮음 (이 설계 문서에서 전수 매핑 검증 완료) |
| **완화 전략** | (1) 13개 전수 CASE WHEN 분기 + ELSE fallback (2) 마이그레이션 후 검증 쿼리: `SELECT COUNT(*) FROM wallets WHERE environment NOT IN ('testnet', 'mainnet')` = 0 (3) 구현 시 SSoT 배열에서 동적 CASE 생성 검토 |

### 7.2 FK 깨짐

| 항목 | 내용 |
|------|------|
| **위험** | wallets 테이블 DROP+RENAME 후 sessions/transactions/policies의 FK 참조가 깨짐 |
| **발생 확률** | 낮음 (v2/v3에서 동일 패턴 검증 완료) |
| **완화 전략** | (1) `managesOwnTransaction: true` -- runMigrations가 `PRAGMA foreign_keys = OFF` 설정 (2) FK dependent 테이블(sessions, transactions, policies, audit_log) 함께 재생성 (3) Step 12에서 `PRAGMA foreign_key_check` 실행 -- 오류 시 즉시 예외 |

### 7.3 pushSchema/마이그레이션 불일치

| 항목 | 내용 |
|------|------|
| **위험** | 새 DB(pushSchema)와 마이그레이션된 DB의 스키마가 불일치하여, 새 DB에서 environment 컬럼이 없거나 network 컬럼이 남아있음 |
| **발생 확률** | 중간 (DDL 업데이트 누락 시 발생) |
| **완화 전략** | (1) LATEST_SCHEMA_VERSION = 7로 동기화 (2) getCreateTableStatements()의 wallets/transactions DDL 업데이트 (3) getCreateIndexStatements()의 인덱스 변경 (4) 테스트 케이스 6에서 pushSchema DB와 마이그레이션 DB의 스키마 동일성 검증 |

### 7.4 v6a/v6b 순서 역전

| 항목 | 내용 |
|------|------|
| **위험** | v6b가 v6a보다 먼저 실행되어, transactions.network이 채워지지 않은 상태에서 wallets.network이 제거됨 |
| **발생 확률** | 극히 낮음 (version 번호로 순서 강제) |
| **완화 전략** | (1) MIGRATIONS 배열에 v6a(version 6) < v6b(version 7) 순서로 등록 (2) `runMigrations()`가 version 오름차순 정렬 후 실행 (3) 설계 문서에 순서 의존성 다이어그램으로 시각화 (섹션 1.3) (4) 마이그레이션 description에 의존성 기록 |
