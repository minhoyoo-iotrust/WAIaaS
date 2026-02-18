# 031: pushSchema 인덱스 생성이 마이그레이션보다 먼저 실행 — 기존 DB 시작 실패

## 심각도

**HIGH** — 기존 DB(v1.4.5 이하)가 있는 환경에서 v1.4.6 코드로 데몬 시작이 불가능하다.

## 증상

```
WAIAAS_MASTER_PASSWORD=test1234 node packages/cli/dist/index.js start
Step 1: Config loaded, daemon lock acquired
Failed to start daemon: no such column: environment
```

v1.4.5 이하 DB를 가진 환경에서 v1.4.6 코드로 데몬을 시작하면 즉시 실패한다.

## 원인

`pushSchema()` 실행 순서가 잘못되어 있다:

```
현재 순서 (버그):
1. CREATE TABLE IF NOT EXISTS wallets (... environment ...) → 기존 테이블 있으면 스킵
2. CREATE INDEX IF NOT EXISTS idx_wallets_chain_environment ON wallets(chain, environment)
   → ❌ 실패: wallets 테이블에 environment 컬럼이 없음 (아직 network 컬럼 사용 중)
3. runMigrations() → v7 마이그레이션(network → environment 변환)
   → 실행 기회 없음 (2번에서 이미 실패)
```

`getCreateIndexStatements()`가 최신 스키마 기준으로 `wallets(chain, environment)` 인덱스를 생성하려 하지만, 기존 DB의 wallets 테이블에는 아직 `network` 컬럼만 존재한다. `CREATE TABLE IF NOT EXISTS`는 기존 테이블이 있으면 스킵하므로 `environment` 컬럼이 추가되지 않는다.

## 수정안

### 1. pushSchema 실행 순서 변경

```
올바른 순서:
Step 1: CREATE TABLE IF NOT EXISTS (테이블만, 인덱스 없음)
Step 2: schema_version 기록 (fresh DB면 전체 버전 기록)
Step 3: runMigrations() → 기존 DB 스키마 업그레이드
Step 4: CREATE INDEX IF NOT EXISTS (마이그레이션 완료 후 안전하게 실행)
```

```typescript
export function pushSchema(sqlite: Database): void {
  const tables = getCreateTableStatements();
  const indexes = getCreateIndexStatements();

  // Step 1+2: 테이블 생성 + 버전 기록 (인덱스 없음)
  sqlite.exec('BEGIN');
  try {
    for (const stmt of tables) sqlite.exec(stmt);
    // ... schema_version 기록 로직 (기존과 동일) ...
    sqlite.exec('COMMIT');
  } catch (err) {
    sqlite.exec('ROLLBACK');
    throw err;
  }

  // Step 3: 마이그레이션 (columns 추가/변환)
  runMigrations(sqlite);

  // Step 4: 인덱스 생성 (모든 컬럼 확보 후)
  sqlite.exec('BEGIN');
  try {
    for (const stmt of indexes) sqlite.exec(stmt);
    sqlite.exec('COMMIT');
  } catch (err) {
    sqlite.exec('ROLLBACK');
    throw err;
  }
}
```

### 2. 마이그레이션 체인 테스트 추가

향후 같은 문제를 방지하기 위해 **각 과거 스키마 버전에서 최신 버전까지 마이그레이션을 실행하는 테스트**를 추가한다.

#### 테스트 전략

각 historical 스키마 버전의 DDL 스냅샷을 유지하고, 해당 스냅샷에서 `pushSchema()`를 실행하여 성공하는지 검증한다.

```typescript
// 각 과거 버전의 스키마 스냅샷 (테스트 픽스처)
const SCHEMA_SNAPSHOTS: Record<number, string[]> = {
  // v1: 초기 스키마 (agents, network)
  1: ['CREATE TABLE agents (id TEXT PRIMARY KEY, name TEXT, chain TEXT, network TEXT, ...)'],
  // v5: token_registry + settings 추가, agents → wallets 완료
  5: ['CREATE TABLE wallets (id TEXT PRIMARY KEY, name TEXT, chain TEXT, network TEXT, ...)'],
};
```

#### 스키마 동등성 검증

마이그레이션 후 최종 스키마가 fresh DB와 동일한지 비교:

```typescript
function getTableSchema(sqlite: Database, tableName: string): string {
  const row = sqlite.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name=?"
  ).get(tableName) as { sql: string };
  return row.sql;
}

// fresh DB의 스키마
const freshDb = new Database(':memory:');
pushSchema(freshDb);
const freshSchema = getTableSchema(freshDb, 'wallets');

// 마이그레이션된 DB의 스키마
const migratedDb = new Database(':memory:');
createOldSchema(migratedDb, 5); // v5 스키마로 생성
pushSchema(migratedDb);
const migratedSchema = getTableSchema(migratedDb, 'wallets');

expect(migratedSchema).toBe(freshSchema); // 동일해야 함
```

### 3. 데이터 변환 정확성 테스트 추가

스키마 구조뿐 아니라 **마이그레이션 중 데이터 변환이 올바른지** 검증하는 테스트를 추가한다. 각 마이그레이션에 대해 샘플 데이터를 삽입한 후 마이그레이션을 실행하고, 변환된 데이터 값이 기대와 일치하는지 확인한다.

#### 검증 대상 마이그레이션별 데이터 변환

| 마이그레이션 | 데이터 변환 | 검증 포인트 |
|------------|-----------|------------|
| v2 | agents.network CHECK 확장 | 기존 solana 네트워크 데이터 보존 |
| v3 | agents → wallets 이름 변경, agent_id → wallet_id | FK 관계 유지, AGENT_* → WALLET_* 이벤트 변환 |
| v6 | transactions.network 백필 from wallets.network | 기존 트랜잭션에 올바른 network 값 할당 |
| v7 | wallets.network → environment + default_network | `devnet → testnet`, `ethereum-sepolia → testnet`, network → default_network 보존 |
| v8 | policies에 network 컬럼 추가 | 기존 정책의 network = NULL, 데이터 무손실 |
| v9 | transactions.type에 SIGNED/SIGN 추가 | 기존 트랜잭션 타입 보존 |

#### 테스트 예시

```typescript
describe('v7 data transformation', () => {
  it('converts devnet to testnet environment', () => {
    const db = createV5SchemaWithData([
      { id: 'w1', chain: 'solana', network: 'devnet', name: 'sol-wallet' },
    ]);
    pushSchema(db);

    const wallet = db.prepare('SELECT * FROM wallets WHERE id = ?').get('w1');
    expect(wallet.environment).toBe('testnet');
    expect(wallet.default_network).toBe('devnet');
  });

  it('converts ethereum-sepolia to testnet environment', () => {
    const db = createV5SchemaWithData([
      { id: 'w2', chain: 'ethereum', network: 'ethereum-sepolia', name: 'eth-wallet' },
    ]);
    pushSchema(db);

    const wallet = db.prepare('SELECT * FROM wallets WHERE id = ?').get('w2');
    expect(wallet.environment).toBe('testnet');
    expect(wallet.default_network).toBe('ethereum-sepolia');
  });

  it('converts ethereum-mainnet to mainnet environment', () => {
    const db = createV5SchemaWithData([
      { id: 'w3', chain: 'ethereum', network: 'ethereum-mainnet', name: 'eth-main' },
    ]);
    pushSchema(db);

    const wallet = db.prepare('SELECT * FROM wallets WHERE id = ?').get('w3');
    expect(wallet.environment).toBe('mainnet');
    expect(wallet.default_network).toBe('ethereum-mainnet');
  });

  it('preserves all FK relationships after wallets recreation', () => {
    const db = createV5SchemaWithData(
      [{ id: 'w1', chain: 'solana', network: 'devnet', name: 'sol' }],
      { sessions: [{ id: 's1', wallet_id: 'w1' }] },
      { transactions: [{ id: 't1', wallet_id: 'w1', chain: 'solana' }] },
    );
    pushSchema(db);

    const session = db.prepare('SELECT wallet_id FROM sessions WHERE id = ?').get('s1');
    expect(session.wallet_id).toBe('w1');
    const tx = db.prepare('SELECT wallet_id FROM transactions WHERE id = ?').get('t1');
    expect(tx.wallet_id).toBe('w1');
  });
});

describe('v6 data transformation', () => {
  it('backfills transaction network from wallets.network', () => {
    const db = createV5SchemaWithData(
      [{ id: 'w1', chain: 'solana', network: 'devnet', name: 'sol' }],
      { transactions: [{ id: 't1', wallet_id: 'w1', chain: 'solana' }] },
    );
    pushSchema(db);

    const tx = db.prepare('SELECT network FROM transactions WHERE id = ?').get('t1');
    expect(tx.network).toBe('devnet');
  });
});

describe('v3 data transformation', () => {
  it('renames AGENT_CREATED to WALLET_CREATED in audit_log', () => {
    const db = createV1SchemaWithData(
      [{ id: 'a1', chain: 'solana', network: 'devnet', name: 'agent1' }],
      { audit_log: [{ event_type: 'AGENT_CREATED', actor: 'master', agent_id: 'a1' }] },
    );
    pushSchema(db);

    const log = db.prepare('SELECT event_type FROM audit_log').get();
    expect(log.event_type).toBe('WALLET_CREATED');
  });
});
```

#### 엣지 케이스 검증

| 케이스 | 설명 | 기대 동작 |
|--------|------|----------|
| NULL owner_address | owner 미등록 월렛 마이그레이션 | NULL 보존 |
| 다수 트랜잭션 백필 | 월렛 1개에 트랜잭션 100건 | 모든 트랜잭션에 올바른 network 할당 |
| 혼합 체인 월렛 | solana + ethereum 월렛 혼재 | 각 체인별 올바른 environment 매핑 |
| 빈 테이블 | 데이터 없는 DB 마이그레이션 | 에러 없이 스키마만 변경 |
| suspended 월렛 | suspended_at, suspension_reason 보존 | 값 무손실 |

## 재발 방지 테스트

### T-1: v5 DB에서 pushSchema 성공

v5 스키마(wallets.network 존재, wallets.environment 미존재)의 DB에서 `pushSchema()` 호출 시 에러 없이 완료되는지 검증.

### T-2: v5 → v9 마이그레이션 후 스키마 동등성

v5 스키마에서 마이그레이션 후 wallets 테이블의 DDL이 fresh DB와 동일한지 검증. `environment`, `default_network` 컬럼 존재, `network` 컬럼 부재 확인.

### T-3: v1 DB(pre-wallets)에서 pushSchema 성공

v1 스키마(agents 테이블)에서 `pushSchema()` 호출 시 전체 마이그레이션 체인(v2→v3→v4→v5→v6→v7→v8→v9)이 정상 실행되는지 검증.

### T-4: fresh DB에서 pushSchema 성공 (기존 동작 유지)

빈 DB에서 `pushSchema()` 호출 시 모든 테이블, 인덱스가 생성되고 schema_version에 모든 버전이 기록되는지 검증.

### T-5: 인덱스 완전성 검증

마이그레이션 완료 후 `getCreateIndexStatements()`의 모든 인덱스가 실제로 존재하는지 `sqlite_master` 쿼리로 검증.

### T-6: 마이그레이션 체인 자동 검증 (회귀 방지)

새 마이그레이션 추가 시 모든 과거 시작 버전에서 최신 버전까지의 체인이 성공하는지 자동 검증. 스키마 스냅샷 픽스처를 테스트 디렉토리에 유지.

### T-7: v7 데이터 변환 — network → environment 매핑 정확성

v5 스키마에 Solana(devnet), EVM(ethereum-sepolia, ethereum-mainnet) 월렛 샘플 데이터를 삽입 후 마이그레이션 실행. `devnet → testnet`, `ethereum-sepolia → testnet`, `ethereum-mainnet → mainnet` 변환과 `default_network` 보존을 검증.

### T-8: v6 데이터 변환 — transactions.network 백필 정확성

v5 스키마에 월렛 + 트랜잭션 샘플 데이터를 삽입 후 마이그레이션 실행. 트랜잭션의 `network` 값이 소속 월렛의 `network`에서 올바르게 백필되었는지 검증.

### T-9: v3 데이터 변환 — agents → wallets 이름 + 이벤트 변환

v1 스키마에 agents + sessions + audit_log 샘플 데이터를 삽입 후 마이그레이션 실행. `agent_id → wallet_id` FK 보존, `AGENT_CREATED → WALLET_CREATED` 이벤트 변환을 검증.

### T-10: FK 관계 보존 — 테이블 재생성 후 참조 무결성

v5 스키마에 월렛 + 세션 + 트랜잭션 + 정책 FK 체인 샘플 데이터를 삽입 후 마이그레이션 실행. 모든 FK 관계가 보존되고 `PRAGMA foreign_key_check`가 빈 결과를 반환하는지 검증.

### T-11: 엣지 케이스 — NULL, 빈 테이블, suspended 월렛

NULL owner_address, 빈 테이블, suspended 월렛(suspended_at + suspension_reason) 등 엣지 케이스 데이터 마이그레이션 시 값 무손실 검증.

## 영향 범위

| 항목 | 내용 |
|------|------|
| 수정 파일 | `packages/daemon/src/infrastructure/database/migrate.ts` (pushSchema 순서 변경) |
| 신규 파일 | 마이그레이션 체인 테스트 + 스키마 스냅샷 픽스처 + 데이터 변환 테스트 |
| 테스트 | 11건 추가 (스키마 6건 + 데이터 변환 5건) |
| 하위호환 | fresh DB 동작 변경 없음, 기존 DB 마이그레이션 정상화 |

---

*발견일: 2026-02-14*
*마일스톤: v1.4.8*
*상태: OPEN*
*유형: BUG*
*관련: DB 마이그레이션 (`packages/daemon/src/infrastructure/database/migrate.ts`), v6b 마이그레이션 (environment model)*
