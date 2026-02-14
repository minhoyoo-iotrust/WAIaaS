# 설계 문서 69: DB 마이그레이션 v6a+v6b 설계

> **Phase:** 105 (v1.4.5 -- 멀티체인 월렛 설계)
> **산출물:** v6a(transactions.network ADD COLUMN) + v6b(wallets 12-step 재생성) 마이그레이션 전략
> **참조 기반:** docs/68-environment-model-design.md, docs/65-migration-strategy.md, migrate.ts(v2/v3 선례)
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
