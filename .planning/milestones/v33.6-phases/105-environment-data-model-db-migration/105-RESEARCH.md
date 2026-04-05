# Phase 105: Environment 데이터 모델 + DB 마이그레이션 설계 - Research

**Researched:** 2026-02-14
**Domain:** SQLite DB 마이그레이션 + Zod SSoT 파생 체인 + 키스토어 영향 분석
**Confidence:** HIGH

## Summary

Phase 105는 "1 월렛 = 1 체인 + 1 네트워크" 모델을 "1 월렛 = 1 체인 + 1 환경(testnet/mainnet)" 모델로 전환하기 위한 데이터 기반을 설계하는 단계이다. 모든 산출물은 설계 문서이며 코드 구현은 v1.4.6에서 수행한다.

핵심 기술 발견 세 가지. 첫째, EnvironmentType enum은 Zod SSoT 파생 체인(Zod -> TypeScript 타입 -> DB CHECK -> Drizzle 스키마)을 그대로 따르면 되고, 이미 CHAIN_TYPES/NETWORK_TYPES에서 동일 패턴이 검증되어 있다. 환경-네트워크 매핑은 `packages/core/src/enums/chain.ts`에 순수 함수로 추가하며, NETWORK_TYPES 배열은 유지된다.

둘째, DB 마이그레이션은 wallets 테이블의 CHECK 제약 변경이 필수이므로 12-step 테이블 재생성이 필요하다. v2(CHECK 확장)와 v3(테이블 리네임) 마이그레이션에서 이 패턴이 실전 검증 완료되어 있다. 현재 LATEST_SCHEMA_VERSION은 5이므로 v6이 다음 마이그레이션이다. 로드맵에서 언급한 "v6a(ADD COLUMN) + v6b(12-step 재생성)" 2단계 분리 전략의 구체적 순서와 데이터 변환 SQL을 설계해야 한다.

셋째, 키스토어 파일은 경로가 `{keystoreDir}/{walletId}.json`으로 walletId만으로 결정되며, 파일 내부의 `network` 필드는 메타데이터일 뿐 키 로드/복호화에 사용되지 않는다. 따라서 키스토어 구조 변경은 불필요하다.

**Primary recommendation:** v1.4.5 리서치 문서에서 확인된 패턴들을 기반으로, 두 설계 문서(105-01: enum + 매핑 + 키스토어, 105-02: DB 마이그레이션 v6 전략)를 작성한다. 새로운 라이브러리나 외부 도구 도입 없이, 기존 코드베이스의 검증된 패턴을 확장한다.

## Standard Stack

### Core (변경 없음 -- 기존 스택 활용)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | 3.25.76 | EnvironmentType enum SSoT 정의 | 프로젝트의 단일 진실 원천. 기존 ChainTypeEnum, NetworkTypeEnum과 동일 패턴 |
| drizzle-orm | 0.45.1 | wallets/transactions 테이블 스키마 정의 | 기존 10개 테이블 스키마가 이미 Drizzle로 관리됨 |
| better-sqlite3 | 12.6.2 | DB 마이그레이션 실행 (SQLite 3.51.2 번들) | 기존 5개 마이그레이션 (v1~v5)이 이 런타임으로 검증됨 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| viem | 2.45.3 | EVM 주소 파생 (변경 없음) | 키스토어 영향 분석에서 확인 -- 변경 불필요 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| 자체 Migration[] 배열 | drizzle-kit migrate | drizzle-kit은 SQL 파일 기반이라 12-step 재생성 같은 프로그래매틱 마이그레이션에 부적합. 현재 자체 프레임워크가 이미 검증됨 |
| 2개 마이그레이션 (v6a+v6b) | 단일 v6 마이그레이션 | 2단계 분리가 실패 범위를 줄이고 디버깅이 쉬움. 로드맵에서 이미 결정됨 |

### Installation

```bash
# 새 패키지 설치 없음. 기존 의존성 그대로 사용.
```

## Architecture Patterns

### Recommended Design Document Structure

```
설계 문서 105-01:
├── EnvironmentType enum 정의 (Zod SSoT)
├── 환경-네트워크 매핑 함수 4개
├── WalletSchema 변경 설계
├── 키스토어 영향 분석 결과
└── Drizzle 스키마 변경 설계

설계 문서 105-02:
├── v6a 마이그레이션: transactions.network ADD COLUMN + UPDATE 역참조
├── v6b 마이그레이션: wallets 12-step 재생성
├── 데이터 변환 SQL (network -> environment CASE 분기)
├── 마이그레이션 순서 의존성 다이어그램
├── pushSchema DDL 동기화 계획
└── PRAGMA foreign_key_check 검증 쿼리
```

### Pattern 1: Zod SSoT 파생 체인 (EnvironmentType)

**What:** 새로운 enum을 Zod -> TypeScript -> DB CHECK -> Drizzle 순서로 파생
**When to use:** EnvironmentType('testnet' | 'mainnet') 정의 시
**Example:**

```typescript
// Source: packages/core/src/enums/chain.ts (기존 패턴 확인)
// 기존:
export const CHAIN_TYPES = ['solana', 'ethereum'] as const;
export type ChainType = (typeof CHAIN_TYPES)[number];
export const ChainTypeEnum = z.enum(CHAIN_TYPES);

// 동일 패턴으로 추가:
export const ENVIRONMENT_TYPES = ['testnet', 'mainnet'] as const;
export type EnvironmentType = (typeof ENVIRONMENT_TYPES)[number];
export const EnvironmentTypeEnum = z.enum(ENVIRONMENT_TYPES);
```

**파생 체인 전체:**
1. Zod SSoT: `ENVIRONMENT_TYPES` + `EnvironmentTypeEnum` (chain.ts)
2. TypeScript 타입: `EnvironmentType` (chain.ts)
3. DB CHECK: `CHECK (environment IN ('testnet', 'mainnet'))` (migrate.ts)
4. Drizzle: `check('check_environment', buildCheckSql('environment', ENVIRONMENT_TYPES))` (schema.ts)
5. OpenAPI: `EnvironmentTypeEnum`을 참조하는 API 스키마 (wallet.schema.ts)

### Pattern 2: 환경-네트워크 매핑 함수 (순수 함수 4개)

**What:** chain + environment 조합으로 허용 네트워크, 기본 네트워크, 환경 파생, 환경 검증을 제공
**When to use:** 모든 네트워크 해결/검증 시점

```typescript
// Source: v1.4.5-ARCHITECTURE.md + v1.4.5-STACK.md 리서치 결과

// 1. 환경 내 허용 네트워크 목록
export function getNetworksForEnvironment(
  chain: ChainType,
  env: EnvironmentType,
): readonly NetworkType[];

// 2. 환경의 기본 네트워크
export function getDefaultNetwork(
  chain: ChainType,
  env: EnvironmentType,
): NetworkType;

// 3. 네트워크에서 환경 역파생 (마이그레이션용)
export function deriveEnvironment(network: NetworkType): EnvironmentType;

// 4. 환경-네트워크 일치 검증
export function validateNetworkEnvironment(
  chain: ChainType,
  env: EnvironmentType,
  network: NetworkType,
): void; // throws Error on mismatch
```

**매핑 테이블 (설계 문서에 포함할 내용):**

| chain | environment | 사용 가능 네트워크 | 기본 네트워크 |
|-------|------------|------------------|-------------|
| solana | mainnet | mainnet | mainnet |
| solana | testnet | devnet, testnet | devnet |
| ethereum | mainnet | ethereum-mainnet, polygon-mainnet, arbitrum-mainnet, optimism-mainnet, base-mainnet | ethereum-mainnet |
| ethereum | testnet | ethereum-sepolia, polygon-amoy, arbitrum-sepolia, optimism-sepolia, base-sepolia | ethereum-sepolia |

### Pattern 3: 12-Step 테이블 재생성 (기존 v2/v3 검증 패턴)

**What:** SQLite CHECK 제약을 변경하기 위해 테이블을 재생성하는 표준 절차
**When to use:** wallets 테이블의 `network` CHECK -> `environment` CHECK 변경 시

```typescript
// Source: packages/daemon/src/infrastructure/database/migrate.ts (v2 마이그레이션 실례)
MIGRATIONS.push({
  version: N,
  description: '...',
  managesOwnTransaction: true,
  up: (sqlite) => {
    sqlite.exec('BEGIN');
    try {
      // 1. CREATE TABLE wallets_new (... 새 스키마 ...)
      // 2. INSERT INTO wallets_new SELECT ... CASE ... FROM wallets
      // 3. DROP TABLE wallets
      // 4. ALTER TABLE wallets_new RENAME TO wallets
      // 5. Recreate all indexes
      // 6. Recreate dependent tables (sessions, transactions, policies 등) if FK 변경
      sqlite.exec('COMMIT');
    } catch (err) {
      sqlite.exec('ROLLBACK');
      throw err;
    }
    sqlite.pragma('foreign_keys = ON');
    const fkErrors = sqlite.pragma('foreign_key_check') as unknown[];
    if (fkErrors.length > 0) throw new Error(...);
  },
});
```

### Pattern 4: 2단계 마이그레이션 분리 (v6a + v6b)

**What:** 비파괴적 ADD COLUMN(v6a)과 파괴적 12-step 재생성(v6b)을 분리
**When to use:** wallets/transactions 테이블의 동시 변경 시

```
v6a (표준 마이그레이션, managesOwnTransaction: false):
  1. ALTER TABLE transactions ADD COLUMN network TEXT
  2. UPDATE transactions SET network = (SELECT w.network FROM wallets w WHERE w.id = transactions.wallet_id)
  → 효과: transactions에 network 컬럼 추가 + 기존 데이터 역참조

v6b (12-step 마이그레이션, managesOwnTransaction: true):
  1. CREATE TABLE wallets_new (environment, default_network, ...)
  2. INSERT INTO wallets_new SELECT ... CASE ... FROM wallets
  3. DROP TABLE wallets
  4. ALTER TABLE wallets_new RENAME TO wallets
  5. Recreate FK-dependent tables (sessions, transactions, policies, ...)
  6. Recreate all indexes
  → 효과: wallets.network -> wallets.environment + wallets.default_network
```

**순서가 중요한 이유:** v6a에서 `transactions.network = wallets.network`로 역참조하는데, v6b에서 wallets.network 컬럼이 사라진다. 따라서 v6a가 반드시 v6b보다 먼저 실행되어야 한다.

### Anti-Patterns to Avoid

- **단일 마이그레이션에 모든 변경 집중:** v6 하나에 wallets 재생성 + transactions ADD + policies 변경을 모두 넣으면 실패 시 롤백 범위가 과대. 논리 단위로 분리 필수
- **기존 network 값 삭제 without default_network:** 기존 1:1 모델의 하위호환이 깨짐. "ethereum-sepolia" 월렛은 default_network = "ethereum-sepolia"를 보존해야 함
- **CASE ELSE 없는 데이터 변환:** 예상치 못한 network 값이 CASE 분기에서 누락되면 environment가 잘못 설정됨. ELSE 분기에서 에러 처리 필수
- **transactions.network NOT NULL 강제:** 기존 레코드 중 삭제된 월렛(실제로는 ON DELETE RESTRICT로 보호됨)이나 예외 케이스에 대해 NULL 허용이 안전

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 환경-네트워크 매핑 | 런타임 DB 조회 | 순수 함수(정적 매핑) | 네트워크 목록은 코드에 고정. DB에 저장하면 복잡도만 증가하고 Zod SSoT 원칙 위반 |
| 12-step 재생성 프레임워크 | 범용 테이블 재생성 유틸 | 기존 Migration 인터페이스 직접 사용 | v2/v3에서 검증된 인라인 패턴이 가장 명확. 추상화하면 오히려 디버깅 어려움 |
| CHECK 제약 동적 업데이트 | ALTER CHECK SQL | 12-step 재생성 | SQLite는 ALTER CHECK를 지원하지 않음. 유일한 방법은 테이블 재생성 |
| 환경 enum 확장 시스템 | 런타임 환경 타입 추가 | 하드코딩 2값(testnet/mainnet) | 블록체인은 testnet/mainnet 이분법. 제3 환경은 불필요한 복잡도 (objectives에서 anti-feature로 명시) |

**Key insight:** 이 페이즈의 모든 변경은 기존 코드베이스의 검증된 패턴을 확장하는 것이다. 새로운 추상화나 프레임워크 도입이 오히려 위험.

## Common Pitfalls

### Pitfall 1: DB 마이그레이션 데이터 변환 순서 의존성

**What goes wrong:** v6b(wallets 재생성)를 v6a(transactions.network ADD + UPDATE) 전에 실행하면, transactions에서 wallets.network를 참조하는 UPDATE가 실패한다 (wallets.network 컬럼이 이미 environment로 변환됨).

**Why it happens:** 마이그레이션 버전 번호만으로 순서를 관리할 때, 두 마이그레이션의 논리적 의존성을 놓침.

**How to avoid:** v6a(version: 6) -> v6b(version: 7) 순서를 설계 문서에 명시. 마이그레이션 description에 의존성을 기록. 실제 구현 시 MIGRATIONS 배열에 올바른 version 번호로 등록.

**Warning signs:** transactions.network이 전부 NULL인 상태에서 v6b가 실행되면, wallets.default_network도 NULL이 되어 전체 네트워크 해결 실패.

### Pitfall 2: CASE 분기 불완전 (network -> environment 변환)

**What goes wrong:** CASE WHEN 분기가 13개 NETWORK_TYPES 중 일부를 누락하여, 일부 월렛의 environment가 잘못 설정됨.

**Why it happens:** EVM 네트워크가 10개, Solana가 3개로 총 13개. 하나라도 빠지면 해당 월렛의 environment가 NULL 또는 잘못된 값.

**How to avoid:**
- 설계 문서에 13개 NETWORK_TYPES -> environment 매핑을 전수 나열
- CASE ELSE 분기에서 에러를 발생시키는 대신, "assertNeverReached" 패턴 사용
- 마이그레이션 후 검증: `SELECT COUNT(*) FROM wallets WHERE environment NOT IN ('testnet','mainnet')` = 0
- 마이그레이션 전 검증: `SELECT DISTINCT network FROM wallets` 결과가 CASE 분기와 일치

**Warning signs:** 마이그레이션 후 environment가 NULL인 월렛 존재.

### Pitfall 3: FK 무결성 깨짐 (12-step wallets 재생성)

**What goes wrong:** wallets 테이블을 DROP+RENAME할 때, sessions/transactions/policies의 FK 참조가 깨짐.

**Why it happens:** PRAGMA foreign_keys=OFF 없이 12-step 실행, 또는 재생성 후 FK check를 실행하지 않음.

**How to avoid:** v2/v3 마이그레이션의 검증된 패턴 엄격 준수:
1. `managesOwnTransaction: true` 사용
2. runMigrations가 `PRAGMA foreign_keys = OFF` 설정
3. 마이그레이션 내부에서 `BEGIN` -> 재생성 -> `COMMIT`
4. `PRAGMA foreign_keys = ON` -> `PRAGMA foreign_key_check`
5. FK check 결과가 비어있지 않으면 즉시 예외

**Warning signs:** `PRAGMA foreign_key_check` 결과에 레코드가 존재.

### Pitfall 4: pushSchema DDL과 마이그레이션 결과 불일치

**What goes wrong:** 새 DB는 pushSchema()의 DDL로 생성되는데, 마이그레이션 결과와 DDL 구조가 불일치하면 기존 DB와 새 DB의 스키마가 달라짐.

**Why it happens:** 마이그레이션만 작성하고 pushSchema()의 DDL과 LATEST_SCHEMA_VERSION을 업데이트하지 않음.

**How to avoid:** 설계 문서에 다음을 명시:
1. pushSchema()의 DDL을 v6b 결과와 동일하게 업데이트할 컬럼 목록
2. LATEST_SCHEMA_VERSION을 v6b의 version으로 업데이트
3. getCreateIndexStatements()에서 idx_wallets_chain_network -> idx_wallets_chain_environment 변경

**Warning signs:** 새 DB에서 `PRAGMA table_info('wallets')`가 마이그레이션된 DB와 다른 컬럼 목록.

### Pitfall 5: wallets 재생성 시 dependent 테이블 FK 재생성 누락

**What goes wrong:** wallets를 DROP+RENAME하면, sessions/transactions/policies의 `REFERENCES wallets(id)` FK가 새 wallets 테이블을 가리키지 않을 수 있음.

**Why it happens:** SQLite의 12-step 재생성에서 FK가 이름이 아닌 내부 참조로 연결됨. RENAME TO 후에도 FK가 올바르게 재연결되지만, 이를 PRAGMA foreign_key_check로 반드시 검증해야 함. v3 마이그레이션에서는 sessions/transactions/policies도 함께 재생성하여 FK를 새로 정의했음.

**How to avoid:** v6b 설계에서 sessions/transactions/policies를 함께 재생성할지, 아니면 wallets만 재생성하고 FK check로 검증할지 결정 필요. v3 선례를 따라 FK가 걸린 테이블도 함께 재생성하는 것이 가장 안전. 단, v6a에서 이미 transactions.network이 추가된 상태이므로 재생성 시 새 컬럼도 포함해야 함.

## Code Examples

### 현재 코드베이스 패턴 (설계 참조용)

#### 1. Zod SSoT enum 정의 패턴

```typescript
// Source: packages/core/src/enums/chain.ts
export const CHAIN_TYPES = ['solana', 'ethereum'] as const;
export type ChainType = (typeof CHAIN_TYPES)[number];
export const ChainTypeEnum = z.enum(CHAIN_TYPES);
```

#### 2. CHECK 제약 빌드 패턴

```typescript
// Source: packages/daemon/src/infrastructure/database/schema.ts
const buildCheckSql = (column: string, values: readonly string[]) =>
  sql.raw(`${column} IN (${values.map((v) => `'${v}'`).join(', ')})`);
```

```typescript
// Source: packages/daemon/src/infrastructure/database/migrate.ts
const inList = (values: readonly string[]) => values.map((v) => `'${v}'`).join(', ');
```

#### 3. 12-step 마이그레이션 패턴 (v2)

```typescript
// Source: packages/daemon/src/infrastructure/database/migrate.ts (v2)
MIGRATIONS.push({
  version: 2,
  description: 'Expand agents network CHECK to include EVM networks',
  managesOwnTransaction: true,
  up: (sqlite) => {
    sqlite.exec('BEGIN');
    try {
      sqlite.exec(`CREATE TABLE agents_new (...)`);
      sqlite.exec('INSERT INTO agents_new SELECT * FROM agents');
      sqlite.exec('DROP TABLE agents');
      sqlite.exec('ALTER TABLE agents_new RENAME TO agents');
      // Recreate indexes...
      sqlite.exec('COMMIT');
    } catch (err) {
      sqlite.exec('ROLLBACK');
      throw err;
    }
    sqlite.pragma('foreign_keys = ON');
    const fkErrors = sqlite.pragma('foreign_key_check') as unknown[];
    if (fkErrors.length > 0) throw new Error(...);
  },
});
```

#### 4. 키스토어 경로 결정 패턴

```typescript
// Source: packages/daemon/src/infrastructure/keystore/keystore.ts
private keystorePath(walletId: string): string {
  return join(this.keystoreDir, `${walletId}.json`);
}
```

키 파일 내부의 network 필드는 메타데이터:
```typescript
// Source: packages/daemon/src/infrastructure/keystore/keystore.ts
export interface KeystoreFileV1 {
  version: 1;
  chain: string;
  network: string;  // 메타데이터 -- 키 로드에 사용되지 않음
  curve: 'ed25519' | 'secp256k1';
  publicKey: string;
  crypto: { ... };
  metadata: { name: string; createdAt: string; lastUnlockedAt: string | null; };
}
```

#### 5. PipelineContext에서 wallet.network 사용 패턴

```typescript
// Source: packages/daemon/src/pipeline/stages.ts
export interface PipelineContext {
  wallet: { publicKey: string; chain: string; network: string };
  // ...
}
```

```typescript
// Source: packages/daemon/src/api/routes/transactions.ts (line 259-263)
const rpcUrl = resolveRpcUrl(
  deps.config.rpc as unknown as Record<string, string>,
  wallet.chain,
  wallet.network,  // 현재: 월렛의 network 직접 사용
);
const adapter = await deps.adapterPool.resolve(
  wallet.chain as ChainType,
  wallet.network as NetworkType,
  rpcUrl,
);
```

### 현재 wallets 테이블의 wallet.network 참조 지점 (설계 시 영향 범위)

```
daemon/src/api/routes/wallets.ts         (line 236, 350)     - 월렛 조회 응답
daemon/src/api/routes/wallet.ts          (line 125, 145, 149, 159, 186, 190, 201, 241) - 잔액/자산 조회
daemon/src/api/routes/transactions.ts    (line 259, 263, 278) - 어댑터 해결 + 파이프라인 컨텍스트
daemon/src/lifecycle/daemon.ts           (line 628, 632, 647) - 데몬 내부 어댑터 해결
daemon/src/pipeline/pipeline.ts          (line 73)            - PipelineContext 생성
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 1 wallet = 1 chain + 1 network | 1 wallet = 1 chain + 1 environment | v1.4.5 설계 | 동일 키로 여러 네트워크 사용 가능 |
| wallets.network (concrete) | wallets.environment (abstract) + default_network | v1.4.5 설계 | 트랜잭션 시점에 네트워크 선택 |
| transactions에 network 없음 | transactions.network 컬럼 추가 | v1.4.5 설계 | 감사/추적에 실행 네트워크 기록 |

**Deprecated/outdated:**
- `wallets.network` 컬럼: `wallets.environment` + `wallets.default_network`로 대체 예정
- `check_network` CHECK 제약: `check_environment` CHECK로 대체 예정
- `idx_wallets_chain_network` 인덱스: `idx_wallets_chain_environment`로 대체 예정

## Detailed Findings by Requirement

### DATA-01: EnvironmentType enum + 환경-네트워크 매핑

**Confidence: HIGH** (기존 코드베이스 패턴과 동일)

설계 대상:
1. `ENVIRONMENT_TYPES = ['testnet', 'mainnet'] as const` + Zod enum + TypeScript 타입
2. 환경-네트워크 매핑 함수 4개 (getNetworksForEnvironment, getDefaultNetwork, deriveEnvironment, validateNetworkEnvironment)
3. WalletSchema 변경: `network` -> `environment` + `defaultNetwork` 추가
4. CreateWalletRequestSchema 변경: `network` optional -> `environment` + `network`(initial default) optional
5. exports 추가: `packages/core/src/enums/index.ts` + `packages/core/src/index.ts`

**매핑 데이터 (하드코딩 -- 정적 매핑):**
- Solana mainnet -> 'mainnet'
- Solana testnet -> 'devnet', 'testnet' (기본: devnet)
- Ethereum mainnet -> 5개 mainnet 네트워크 (기본: ethereum-mainnet)
- Ethereum testnet -> 5개 testnet 네트워크 (기본: ethereum-sepolia)

### DATA-02: wallets 테이블 network -> environment 전환 마이그레이션

**Confidence: HIGH** (v2/v3 선례 직접 확인)

현재 상태:
- wallets 테이블: `network TEXT NOT NULL CHECK (network IN (...))` (13개 NETWORK_TYPES)
- LATEST_SCHEMA_VERSION: 5
- 다음 마이그레이션: version 6

설계 대상 (v6b -- 12-step 재생성):
1. wallets_new 테이블: `environment TEXT NOT NULL CHECK (environment IN ('testnet', 'mainnet'))` + `default_network TEXT`
2. 데이터 변환 SQL: `CASE WHEN network IN ('mainnet', 'ethereum-mainnet', ...) THEN 'mainnet' ELSE 'testnet' END`
3. `default_network = network` (기존 값 보존)
4. FK dependent 테이블(sessions, transactions, policies) 재생성 여부 결정
5. 인덱스 재생성: idx_wallets_chain_network -> idx_wallets_chain_environment
6. PRAGMA foreign_key_check 검증

**중요 설계 결정:**
- sessions 테이블은 FK만 걸려있고 컬럼 변경 없음 -> 재생성 여부 판단 필요
- transactions 테이블은 v6a에서 이미 network 컬럼이 추가된 상태 -> 재생성 시 새 컬럼 포함
- policies 테이블은 v107에서 network 컬럼 추가 예정 -> v6b에서 미리 추가하면 순서 의존성 해소

### DATA-03: transactions.network 컬럼 추가 + 역참조

**Confidence: HIGH** (표준 ADD COLUMN + UPDATE 패턴)

현재 상태:
- transactions 테이블: network 컬럼 없음
- transactions.chain만 존재

설계 대상 (v6a -- 표준 마이그레이션):
1. `ALTER TABLE transactions ADD COLUMN network TEXT`
2. `UPDATE transactions SET network = (SELECT w.network FROM wallets w WHERE w.id = transactions.wallet_id)`
3. NULL 허용 (기존 레코드 중 월렛이 없는 경우 -- ON DELETE RESTRICT로 보호되어 있으므로 실제 NULL은 발생 안 함)
4. 향후 CHECK 제약: `CHECK (network IS NULL OR network IN (...NETWORK_TYPES...))` -- v6b에서 transactions 재생성 시 함께 추가

**순서 의존성:**
- v6a는 wallets.network가 아직 존재하는 상태에서 실행
- v6b는 v6a 완료 후 wallets.network를 environment로 변환

### DATA-04: wallets.default_network 기본 네트워크 저장

**Confidence: HIGH**

설계 대상:
1. v6b wallets_new 테이블에 `default_network TEXT` 컬럼 추가
2. 기존 wallets.network 값을 default_network에 그대로 복사
3. NULL 의미: 환경 기본값 사용 (getDefaultNetwork() 런타임 해결)
4. NOT NULL 여부: 마이그레이션 시 기존 network 값이 항상 존재하므로 NOT NULL 가능. 하지만 향후 "환경 기본값 사용" 옵션을 위해 nullable 추천
5. CHECK 제약: `CHECK (default_network IS NULL OR default_network IN (...NETWORK_TYPES...))` -- nullable이므로 IS NULL 분기 필수

### DATA-05: 키스토어 영향 분석

**Confidence: HIGH** (코드 직접 확인)

분석 결과 -- **변경 불필요:**

1. **경로:** `keystorePath(walletId)` = `join(keystoreDir, \`${walletId}.json\`)` -- walletId만 사용, network/environment 무관
2. **ILocalKeyStore 인터페이스:** `generateKeyPair(walletId, chain, network, masterPassword)` -- network 파라미터는 키 파일 메타데이터에만 기록, 키 생성 알고리즘에 영향 없음
3. **KeystoreFileV1.network:** 메타데이터 필드. 키 로드(`decryptPrivateKey`)에서 사용되지 않음
4. **기존 키 파일:** 파일 내부의 `"network": "ethereum-sepolia"` 메타데이터는 그대로 유지해도 동작에 영향 없음
5. **향후 신규 키:** v1.4.6 구현 시 KeystoreFileV1에 `environment` 필드를 추가하고, 신규 생성 키에만 기록하는 것은 선택 사항

**결론:** 키스토어 파일 경로/구조/마이그레이션 모두 변경 불필요. 설계 문서에 "변경 없음 + 근거"를 명시.

## Open Questions

### 1. v6b에서 sessions/transactions/policies 재생성 범위

**What we know:**
- v3 마이그레이션에서는 agents -> wallets 리네임 시 sessions/transactions/policies/audit_log/notification_logs 5개 테이블을 모두 재생성함
- SQLite의 12-step 재생성 후 RENAME TO는 기존 FK 참조를 자동으로 업데이트한다고 문서화되어 있음
- 하지만 v3에서는 컬럼 이름 변경(agent_id -> wallet_id)이 필요했기 때문에 재생성이 불가피했음

**What's unclear:** v6b에서는 wallets의 컬럼만 변경되고 FK 참조 컬럼(wallet_id)은 변경 없음. sessions/transactions/policies를 재생성하지 않고 wallets만 재생성해도 FK가 올바르게 유지되는지.

**Recommendation:** 안전을 위해 v3 선례를 따라 FK dependent 테이블도 함께 재생성. 특히 transactions는 v6a에서 추가된 network 컬럼에 CHECK 제약을 추가하는 기회가 되고, policies는 Phase 107에서 필요한 network 컬럼을 미리 추가할 수 있다. 하지만 이는 Phase 107과의 스코프 겹침을 야기하므로, 설계 문서에서 "v6b에서 policies.network 추가 여부"를 결정 사항으로 명시.

### 2. default_network의 NOT NULL vs nullable

**What we know:**
- 마이그레이션 시 기존 wallets.network 값이 반드시 존재 (NOT NULL)
- 향후 "환경 기본값 사용" 옵션을 위해 nullable이 유리

**What's unclear:** NULL = "환경 기본값 사용"과 명시적 값 = "사용자 지정"의 구분이 필요한지, 아니면 모든 월렛에 항상 명시적 default_network를 저장할지.

**Recommendation:** nullable + NOT NULL default (마이그레이션 시에는 기존 값 복사로 전부 NOT NULL). 향후 API에서 `PUT /v1/wallets/:id/default-network { network: null }`로 환경 기본값으로 리셋 가능. 로드맵의 리서치 결과와 일치.

### 3. LATEST_SCHEMA_VERSION 업데이트 시점

**What we know:** 현재 LATEST_SCHEMA_VERSION = 5. v6a, v6b 두 마이그레이션이 추가되면 7로 업데이트해야 함.

**Recommendation:** v6a = version 6, v6b = version 7. LATEST_SCHEMA_VERSION = 7. pushSchema()의 DDL은 v7 결과와 동일하게 업데이트.

## Sources

### Primary (HIGH confidence -- 코드베이스 직접 확인)

- `packages/core/src/enums/chain.ts` -- 기존 CHAIN_TYPES, NETWORK_TYPES, SOLANA_NETWORK_TYPES, EVM_NETWORK_TYPES 정의 + validateChainNetwork() 패턴
- `packages/core/src/schemas/wallet.schema.ts` -- 현재 WalletSchema (network 필드)
- `packages/core/src/schemas/transaction.schema.ts` -- 현재 TransactionSchema + discriminatedUnion 5-type
- `packages/daemon/src/infrastructure/database/schema.ts` -- Drizzle ORM 10개 테이블 정의 (wallets.network, CHECK 제약)
- `packages/daemon/src/infrastructure/database/migrate.ts` -- MIGRATIONS[v2~v5] + runMigrations() + pushSchema() + LATEST_SCHEMA_VERSION=5
- `packages/daemon/src/infrastructure/keystore/keystore.ts` -- KeystoreFileV1 구조, keystorePath(walletId), 키 생성/복호화 흐름
- `packages/daemon/src/infrastructure/adapter-pool.ts` -- AdapterPool.resolve(chain, network, rpcUrl) 캐시 키 패턴
- `packages/daemon/src/pipeline/stages.ts` -- PipelineContext.wallet.network 참조
- `packages/daemon/src/api/routes/transactions.ts` -- wallet.network -> resolveRpcUrl -> adapterPool.resolve 흐름
- `packages/daemon/src/__tests__/migration-runner.test.ts` -- v2/v3 마이그레이션 테스트 패턴 (v1 DB 생성 -> 마이그레이션 적용 -> 검증)

### Secondary (HIGH confidence -- v1.4.5 리서치 문서)

- `.planning/research/v1.4.5-ARCHITECTURE.md` -- 환경 모델 아키텍처, Network Resolution Flow, DB Before/After, Anti-Patterns
- `.planning/research/v1.4.5-STACK.md` -- 기술 스택 분석 (새 의존성 0개), 마이그레이션 복잡도 평가
- `.planning/research/v1.4.5-FEATURES.md` -- Table Stakes / Differentiators 분류
- `.planning/research/v1.4.5-PITFALLS.md` -- 11개 도메인 위험 요소 (Critical 3 / Moderate 5 / Minor 3)
- `.planning/research/v1.4.5-SUMMARY.md` -- 리서치 요약 + 페이즈 구조 제안
- `objectives/v1.4.5-multichain-wallet-design.md` -- 마일스톤 목표, 환경-네트워크 매핑 테이블, 설계 변경 범위

### Tertiary (MEDIUM confidence -- 외부 참조)

- [SQLite ALTER TABLE 12-step documentation](https://www.sqlite.org/lang_altertable.html) -- 12-step 재생성 공식 절차
- [viem Discussion #986: PublicClient Map pattern](https://github.com/wevm/viem/discussions/986) -- 멀티체인 클라이언트 패턴

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- 새 의존성 0개. 기존 코드베이스 패턴 직접 확인
- Architecture: HIGH -- v2/v3 마이그레이션 선례, Zod SSoT 파생 체인 검증 완료. 키스토어 영향 코드 레벨 확인
- Pitfalls: HIGH -- v2/v3 마이그레이션에서 발생 가능 문제 확인. FK 관리 패턴 검증. 데이터 변환 순서 의존성 식별

**Research date:** 2026-02-14
**Valid until:** 2026-03-14 (기존 스택 활용이므로 30일 유효)
