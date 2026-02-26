# 마일스톤 m29: 고급 DeFi 프로토콜 설계 (Lending/Yield/Perp 프레임워크)

- **Status:** PLANNED
- **Milestone:** TBD

## 목표

상태를 가진 DeFi 포지션(담보/차입, 수익률 거래, 레버리지 트레이딩)을 관리하기 위한 3개 프레임워크(ILendingProvider, IYieldProvider, IPerpProvider)와 공통 인프라(PositionTracker, HealthFactorMonitor, MarginMonitor)를 설계 수준에서 정의한다. 7개 프로토콜(Aave, Kamino, Pendle, Drift, Morpho, Marinade, CoW)의 공통 설계를 확정하여 m29-02~m29-14 구현 마일스톤의 입력을 생산한다.

---

## 배경

m28-xx에서 구현되는 Action Provider(Swap/Bridge/Staking)는 모두 **단발성 트랜잭션**(요청 → 실행 → 완료)이다. m29-xx의 프로토콜은 **상태를 가진 포지션**(예치 → 이자 누적 → 상환/청산)으로, 지속적인 모니터링과 리스크 관리가 필요하다.

### m28-xx vs m29-xx 패턴 비교

```
m28-xx (단발성):  resolve() → ContractCallRequest → 실행 → 완료
m29-xx (포지션):  resolve() → ContractCallRequest → 실행 → 포지션 생성 → 모니터링 → 상환/청산
```

### 3개 프레임워크 개요

| 프레임워크 | 대상 프로토콜 | 핵심 개념 |
|-----------|-------------|----------|
| ILendingProvider | Aave V3, Kamino, Morpho | 담보/차입, 헬스 팩터, LTV |
| IYieldProvider | Pendle | PT/YT 토큰화, 만기, 고정 수익률 |
| IPerpProvider | Drift | 레버리지, 마진, PnL, 청산 가격 |

### 추가 프로바이더 (프레임워크 불필요)

| 마일스톤 | 프로토콜 | 패턴 |
|---------|----------|------|
| m29-12 | Marinade | m28-04 Staking 패턴 재사용 |
| m29-14 | CoW Protocol | Intent/EIP-712 서명 신규 패턴 |

---

## 설계 대상

### 1. ILendingProvider 프레임워크

#### 1.1 인터페이스 설계

```
ILendingProvider extends IActionProvider
  표준 액션: supply, borrow, repay, withdraw
  추가 메서드: getPosition(walletId), getHealthFactor(walletId), getMarkets()
```

#### 1.2 설계 범위

| 항목 | 내용 |
|------|------|
| 인터페이스 | ILendingProvider — IActionProvider 확장, 4개 표준 액션 + 3개 조회 메서드 |
| 포지션 모델 | type: SUPPLY / BORROW, provider, asset, amount, apy, updated_at |
| 헬스 팩터 | 담보 가치 / 차입 가치 비율. 1.0 미만 시 청산. 기본 경고 임계값 1.2 |
| 정책 확장 | LendingPolicyEvaluator — 최대 LTV 제한, 허용 담보/차입 자산 화이트리스트 |
| 대상 구현체 | Aave V3 (m29-02), Kamino (m29-04), Morpho (m29-10) |

#### 1.3 설계 산출물

- ILendingProvider 인터페이스 정의 (TypeScript)
- LendingPosition, HealthFactor 타입 정의 (Zod)
- LendingPolicyEvaluator 정책 평가 규칙
- REST API 추가: GET /v1/wallets/:id/positions, GET /v1/wallets/:id/health-factor

---

### 2. IYieldProvider 프레임워크

#### 2.1 인터페이스 설계

```
IYieldProvider extends IActionProvider
  표준 액션: buyPT, buyYT, redeemPT, addLiquidity, removeLiquidity
  추가 메서드: getMarkets(chain), getPosition(walletId), getYieldForecast(marketId)
```

#### 2.2 설계 범위

| 항목 | 내용 |
|------|------|
| 인터페이스 | IYieldProvider — IActionProvider 확장, 5개 표준 액션 + 3개 조회 메서드 |
| 포지션 모델 | token_type: PT / YT / LP, market_id, amount, entry_price, maturity, apy |
| 만기 관리 | MaturityMonitor — 만기 7일 전/1일 전 알림, 만기 후 미상환 경고 |
| 대상 구현체 | Pendle (m29-06) |

#### 2.3 설계 산출물

- IYieldProvider 인터페이스 정의
- YieldPosition, MaturityInfo 타입 정의 (Zod)
- MaturityMonitor 폴링 설계 (1일 1회)
- yield_positions 테이블 스키마 (또는 positions 확장)

---

### 3. IPerpProvider 프레임워크

#### 3.1 인터페이스 설계

```
IPerpProvider extends IActionProvider
  표준 액션: openPosition, closePosition, modifyPosition, addMargin, withdrawMargin
  추가 메서드: getPosition(walletId, market), getMarginInfo(walletId), getMarkets()
```

#### 3.2 설계 범위

| 항목 | 내용 |
|------|------|
| 인터페이스 | IPerpProvider — IActionProvider 확장, 5개 표준 액션 + 3개 조회 메서드 |
| 포지션 모델 | direction: LONG / SHORT, market, size, entry_price, leverage, unrealized_pnl, margin, liquidation_price |
| 마진 모니터링 | MarginMonitor — 유지 마진 임계값 접근 시 MARGIN_WARNING, 청산 가격 접근 시 LIQUIDATION_IMMINENT |
| 정책 확장 | PerpPolicyEvaluator — 최대 레버리지 제한, 최대 포지션 크기(USD), 허용 시장 화이트리스트 |
| 대상 구현체 | Drift (m29-08) |

#### 3.3 설계 산출물

- IPerpProvider 인터페이스 정의
- PerpPosition, MarginInfo 타입 정의 (Zod)
- MarginMonitor 폴링 설계 (1분 간격)
- PerpPolicyEvaluator 정책 평가 규칙
- perp_positions 테이블 스키마 (또는 positions 확장)

---

### 4. 공통 인프라: PositionTracker

3개 프레임워크의 포지션을 통합 관리하는 서비스를 설계한다.

#### 4.1 설계 범위

| 항목 | 내용 |
|------|------|
| 역할 | 월렛별 DeFi 포지션 통합 조회 + DB 캐시 + 주기적 동기화 |
| 저장소 | positions 테이블 (wallet_id, provider, category[LENDING/YIELD/PERP/STAKING], ...) |
| 동기화 주기 | Lending 5분, Perp 1분, Yield 1시간 (config.toml 오버라이드) |
| 조회 방식 | 정책 평가 = 온체인 실시간, Admin UI = DB 캐시 |
| REST API | GET /v1/wallets/:id/positions — Lending + Yield + Perp + Staking 통합 반환 |
| Admin UI | 포트폴리오 섹션 — 프로토콜별 포지션, USD 환산, APY, 헬스 팩터 표시 |

#### 4.2 설계 산출물

- positions 테이블 통합 스키마 (카테고리별 discriminatedUnion)
- PositionTracker 동기화 스케줄러 설계
- GET /v1/wallets/:id/positions 응답 스키마 (Zod)
- Admin 포트폴리오 뷰 와이어프레임

---

### 5. 모니터링 통합: HealthFactor + Maturity + Margin

3개 모니터의 공통 패턴과 알림 연동을 설계한다.

#### 5.1 설계 범위

| 모니터 | 대상 | 폴링 주기 | 알림 이벤트 |
|--------|------|----------|-----------|
| HealthFactorMonitor | Lending (Aave/Kamino/Morpho) | 5분 | LIQUIDATION_WARNING |
| MaturityMonitor | Yield (Pendle) | 1일 | MATURITY_WARNING |
| MarginMonitor | Perp (Drift) | 1분 | MARGIN_WARNING, LIQUIDATION_IMMINENT |

#### 5.2 설계 산출물

- IDeFiMonitor 공통 인터페이스
- 알림 이벤트 추가: LIQUIDATION_WARNING, MATURITY_WARNING, MARGIN_WARNING, LIQUIDATION_IMMINENT
- 모니터 라이프사이클 (데몬 시작/정지 시 등록/해제)
- config.toml [monitoring] 섹션 (임계값, 폴링 주기)

---

### 6. Intent/서명 패턴 설계 (CoW Protocol)

기존 ContractCallRequest 패턴과 다른 Intent/EIP-712 서명 패턴을 설계한다.

#### 6.1 설계 범위

| 항목 | 내용 |
|------|------|
| 패턴 | resolve() → SignableOrder → EIP-712 서명 → 릴레이어 제출 → 솔버 실행 |
| ActionProviderRegistry 확장 | 'intent' 타입 지원 추가 |
| 서명 | viem signTypedData() — 트랜잭션이 아닌 메시지 서명 |
| 상태 추적 | 주문 OPEN → FULFILLED / EXPIRED 폴링 |
| Gasless | 솔버가 가스비 부담 — ETH 잔고 없는 월렛에서도 ERC-20 스왑 가능 |

#### 6.2 설계 산출물

- SignableOrder 타입 정의 (Zod)
- ActionProviderRegistry intent 타입 확장 설계
- 서명 → API 제출 → 상태 추적 파이프라인
- 기존 ContractCallRequest 파이프라인과의 분기점

---

## 5. 공통 인프라: positions 테이블

### 5.1 defi_positions 테이블 DDL

테이블명을 `defi_positions`로 확정한다. 단순 `positions`는 월렛 컨텍스트에서 계정 포지션, 토큰 잔액 등과 혼동될 수 있으므로, `defi_` 접두어로 DeFi 포지션임을 명확히 구분한다.

```sql
CREATE TABLE IF NOT EXISTS defi_positions (
  id TEXT PRIMARY KEY,                          -- UUID v7 (ms-precision time ordering)
  wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  category TEXT NOT NULL,                       -- LENDING | YIELD | PERP | STAKING
  provider TEXT NOT NULL,                       -- 'aave_v3' | 'kamino' | 'lido' | 'jito' | 'pendle' | 'drift' | 'morpho' | 'marinade'
  chain TEXT NOT NULL,                          -- ChainType SSoT (CHAIN_TYPES)
  network TEXT,                                 -- NetworkType SSoT (NETWORK_TYPES, nullable)
  asset_id TEXT,                                -- CAIP-19 asset identifier (nullable)
  amount TEXT NOT NULL,                         -- Position size as decimal string (bigint-safe)
  amount_usd REAL,                              -- USD equivalent from IPriceOracle (nullable)
  metadata TEXT,                                -- Category-specific JSON (nullable, see 5.3)
  status TEXT NOT NULL DEFAULT 'ACTIVE',        -- ACTIVE | CLOSED | LIQUIDATED
  opened_at INTEGER NOT NULL,                   -- Unix epoch seconds
  closed_at INTEGER,                            -- Unix epoch seconds (nullable)
  last_synced_at INTEGER NOT NULL,              -- Unix epoch seconds (last PositionTracker update)
  created_at INTEGER NOT NULL,                  -- Unix epoch seconds
  updated_at INTEGER NOT NULL                   -- Unix epoch seconds
);
```

**14개 칼럼 설계 근거:**

| 칼럼 | 타입 | 필수 | 근거 |
|------|------|------|------|
| id | TEXT PK | O | UUID v7, generateId() 사용. ms 기반 정렬 |
| wallet_id | TEXT FK | O | wallets(id) CASCADE 삭제. 월렛 삭제 시 포지션 자동 정리 |
| category | TEXT CHECK | O | LENDING/YIELD/PERP/STAKING discriminant. SSoT 배열 POSITION_CATEGORIES에서 생성 |
| provider | TEXT | O | 프로토콜 식별자. ActionProvider name 규칙(소문자+언더스코어) 준수 |
| chain | TEXT CHECK | O | CHAIN_TYPES SSoT. 멀티체인 월렛 환경 지원 |
| network | TEXT CHECK | - | NETWORK_TYPES SSoT. 테스트넷 포지션 구분용. nullable |
| asset_id | TEXT | - | CAIP-19 자산 식별자. Perp 포지션은 시장(market) 기반이므로 nullable |
| amount | TEXT | O | 소수점 문자열. bigint 연산 안전. IPriceOracle 환산 전 원시 금액 |
| amount_usd | REAL | - | IPriceOracle.getPrice() 환산. 오라클 장애 시 null |
| metadata | TEXT | - | 카테고리별 JSON. 읽기 경로(API)에서만 Zod 검증 |
| status | TEXT CHECK | O | ACTIVE(진행중)/CLOSED(정상종료)/LIQUIDATED(강제청산) |
| opened_at | INTEGER | O | 포지션 최초 개설 시점. epoch seconds |
| closed_at | INTEGER | - | 포지션 종료 시점. ACTIVE일 때 null |
| last_synced_at | INTEGER | O | PositionTracker 마지막 동기화 시점. 데이터 신선도 판단 |
| created_at / updated_at | INTEGER | O | 레코드 생성/수정 시점. 표준 감사 칼럼 |

**CHECK 제약 조건 (4개):**

```sql
CHECK(category IN ('LENDING', 'YIELD', 'PERP', 'STAKING'))   -- POSITION_CATEGORIES SSoT
CHECK(status IN ('ACTIVE', 'CLOSED', 'LIQUIDATED'))           -- POSITION_STATUSES SSoT
CHECK(chain IN ('solana', 'evm'))                              -- CHAIN_TYPES SSoT
CHECK(network IS NULL OR network IN ('mainnet-beta', ...))    -- NETWORK_TYPES SSoT (nullable 허용)
```

CHECK 제약은 `buildCheckSql()` 패턴으로 SSoT 배열에서 동적 생성한다.

**인덱스 전략 (4개):**

```sql
-- 1. wallet + category: 카테고리별 필터링 조회 (Admin UI 탭 필터)
CREATE INDEX idx_defi_positions_wallet_category ON defi_positions(wallet_id, category);

-- 2. wallet + provider: 프로바이더별 필터링 (API 쿼리 파라미터)
CREATE INDEX idx_defi_positions_wallet_provider ON defi_positions(wallet_id, provider);

-- 3. status: 활성 포지션 필터 (대부분의 조회가 ACTIVE)
CREATE INDEX idx_defi_positions_status ON defi_positions(status);

-- 4. UNIQUE: upsert 키 (PositionWriteQueue ON CONFLICT 대상)
CREATE UNIQUE INDEX idx_defi_positions_unique ON defi_positions(wallet_id, provider, asset_id, category);
```

**UNIQUE 키 구성 근거:** `(wallet_id, provider, asset_id, category)` 4-tuple은 하나의 포지션을 고유하게 식별한다.
- 동일 월렛이 동일 프로바이더에서 동일 자산에 대해 동일 카테고리의 포지션은 하나만 존재한다.
- asset_id가 CAIP-19 형식이므로 체인/네트워크 정보를 이미 포함하여 별도 chain/network 칼럼을 UNIQUE에 포함할 필요가 없다.
- Perp 포지션에서 asset_id가 null일 수 있으므로 SQLite의 NULL 처리 특성(NULL != NULL)에 의해 동일 시장의 복수 포지션이 가능. 이는 Drift의 sub-account 모델과 호환된다.

### 5.2 Drizzle ORM 정의

```typescript
// packages/daemon/src/infrastructure/database/schema.ts
import {
  POSITION_CATEGORIES,
  POSITION_STATUSES,
  CHAIN_TYPES,
  NETWORK_TYPES,
} from '@waiaas/core';

export const defiPositions = sqliteTable(
  'defi_positions',
  {
    id: text('id').primaryKey(),
    walletId: text('wallet_id')
      .notNull()
      .references(() => wallets.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    provider: text('provider').notNull(),
    chain: text('chain').notNull(),
    network: text('network'),
    assetId: text('asset_id'),
    amount: text('amount').notNull(),
    amountUsd: real('amount_usd'),
    metadata: text('metadata'),           // JSON string, parsed at API layer
    status: text('status').notNull().default('ACTIVE'),
    openedAt: integer('opened_at', { mode: 'timestamp' }).notNull(),
    closedAt: integer('closed_at', { mode: 'timestamp' }),
    lastSyncedAt: integer('last_synced_at', { mode: 'timestamp' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    index('idx_defi_positions_wallet_category').on(table.walletId, table.category),
    index('idx_defi_positions_wallet_provider').on(table.walletId, table.provider),
    index('idx_defi_positions_status').on(table.status),
    uniqueIndex('idx_defi_positions_unique').on(
      table.walletId, table.provider, table.assetId, table.category,
    ),
    check('check_position_category', buildCheckSql('category', POSITION_CATEGORIES)),
    check('check_position_status', buildCheckSql('status', POSITION_STATUSES)),
    check('check_position_chain', buildCheckSql('chain', CHAIN_TYPES)),
  ],
);
```

**SSoT 배열 추가 위치 (`@waiaas/core`):**

```typescript
// packages/core/src/enums/position.ts (신규 파일)
export const POSITION_CATEGORIES = ['LENDING', 'YIELD', 'PERP', 'STAKING'] as const;
export type PositionCategory = (typeof POSITION_CATEGORIES)[number];

export const POSITION_STATUSES = ['ACTIVE', 'CLOSED', 'LIQUIDATED'] as const;
export type PositionStatus = (typeof POSITION_STATUSES)[number];
```

`packages/core/src/enums/index.ts`에서 re-export하여 기존 SSoT 패턴과 일관성 유지.

### 5.3 Zod SSoT 스키마

```typescript
// packages/core/src/schemas/position.schema.ts (신규 파일)
import { z } from 'zod';
import { ChainTypeEnum, NetworkTypeEnum } from '../enums/chain.js';

// ---------------------------------------------------------------------------
// SSoT Enums
// ---------------------------------------------------------------------------

export const PositionCategorySchema = z.enum(['LENDING', 'YIELD', 'PERP', 'STAKING']);
export type PositionCategory = z.infer<typeof PositionCategorySchema>;

export const PositionStatusSchema = z.enum(['ACTIVE', 'CLOSED', 'LIQUIDATED']);
export type PositionStatus = z.infer<typeof PositionStatusSchema>;

// ---------------------------------------------------------------------------
// Base Position (공통 필드)
// ---------------------------------------------------------------------------

export const BasePositionSchema = z.object({
  id: z.string().uuid(),
  walletId: z.string().uuid(),
  provider: z.string(),
  chain: ChainTypeEnum,
  network: NetworkTypeEnum.nullable(),
  assetId: z.string().nullable(),           // CAIP-19
  amount: z.string(),                       // decimal string
  amountUsd: z.number().nullable(),
  status: PositionStatusSchema,
  openedAt: z.number().int(),               // epoch seconds
  closedAt: z.number().int().nullable(),
  lastSyncedAt: z.number().int(),
});

// ---------------------------------------------------------------------------
// Category-specific Metadata Schemas (4개)
// ---------------------------------------------------------------------------

/** Lending metadata: 담보/차입 포지션 */
export const LendingMetadataSchema = z.object({
  positionType: z.enum(['SUPPLY', 'BORROW']),
  apy: z.number().nullable(),               // 연간 수익/이자율 (decimal, e.g., 0.032 = 3.2%)
  healthFactor: z.number().nullable(),       // 담보/차입 비율 (1.0 미만 시 청산)
  collateralUsd: z.number().nullable(),      // 담보 USD 가치
  debtUsd: z.number().nullable(),            // 차입 USD 가치
});

/** Yield metadata: 수익률 토큰 포지션 */
export const YieldMetadataSchema = z.object({
  tokenType: z.enum(['PT', 'YT', 'LP']),   // Principal Token / Yield Token / LP
  marketId: z.string(),                      // Pendle market identifier
  maturity: z.number().int(),               // maturity epoch seconds
  apy: z.number().nullable(),               // 고정/변동 수익률
  entryPrice: z.number().nullable(),        // 진입 가격
});

/** Perp metadata: 레버리지 트레이딩 포지션 */
export const PerpMetadataSchema = z.object({
  direction: z.enum(['LONG', 'SHORT']),
  leverage: z.number(),                      // e.g., 5.0 = 5x
  unrealizedPnl: z.number().nullable(),     // 미실현 손익 (USD)
  liquidationPrice: z.number().nullable(),  // 청산 가격
  margin: z.number().nullable(),            // 증거금 (USD)
  entryPrice: z.number().nullable(),        // 진입 가격
  market: z.string(),                        // 시장 식별자 (e.g., 'SOL-PERP')
});

/** Staking metadata: 스테이킹 포지션 */
export const StakingMetadataSchema = z.object({
  apy: z.number().nullable(),               // 스테이킹 APY
  pendingUnstake: z.object({
    amount: z.string(),                      // 언스테이크 대기 금액
    unlockAt: z.number().int(),             // 언락 예정 시점 (epoch seconds)
  }).nullable(),
});

// ---------------------------------------------------------------------------
// Category Extensions (discriminatedUnion용)
// ---------------------------------------------------------------------------

export const LendingPositionSchema = BasePositionSchema.extend({
  category: z.literal('LENDING'),
  metadata: LendingMetadataSchema,
});

export const YieldPositionSchema = BasePositionSchema.extend({
  category: z.literal('YIELD'),
  metadata: YieldMetadataSchema,
});

export const PerpPositionSchema = BasePositionSchema.extend({
  category: z.literal('PERP'),
  metadata: PerpMetadataSchema,
});

export const StakingPositionSchema = BasePositionSchema.extend({
  category: z.literal('STAKING'),
  metadata: StakingMetadataSchema,
});

// ---------------------------------------------------------------------------
// Unified Position Schema (z.discriminatedUnion)
// ---------------------------------------------------------------------------

export const PositionSchema = z.discriminatedUnion('category', [
  LendingPositionSchema,
  YieldPositionSchema,
  PerpPositionSchema,
  StakingPositionSchema,
]);

export type Position = z.infer<typeof PositionSchema>;
```

**메타데이터 검증 전략:**
- **읽기 경로 (API response):** PositionSchema로 Zod 검증 후 반환. metadata JSON → 카테고리별 타입으로 파싱/검증.
- **쓰기 경로 (PositionTracker → DB):** 검증 생략. PositionTracker가 IPositionProvider에서 받은 데이터를 `JSON.stringify()`로 직접 저장. 쓰기 경로를 제어하는 주체가 PositionTracker 단일 서비스이므로 런타임 검증 비용이 무의미.

### 5.4 DB v25 마이그레이션 SQL

```typescript
// packages/daemon/src/infrastructure/database/migrate.ts
MIGRATIONS.push({
  version: 25,
  description: 'Add defi_positions table for DeFi position tracking',
  up: (sqlite) => {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS defi_positions (
        id TEXT PRIMARY KEY,
        wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
        category TEXT NOT NULL CHECK(category IN (${POSITION_CATEGORIES.map(v => `'${v}'`).join(', ')})),
        provider TEXT NOT NULL,
        chain TEXT NOT NULL CHECK(chain IN (${CHAIN_TYPES.map(v => `'${v}'`).join(', ')})),
        network TEXT CHECK(network IS NULL OR network IN (${NETWORK_TYPES.map(v => `'${v}'`).join(', ')})),
        asset_id TEXT,
        amount TEXT NOT NULL,
        amount_usd REAL,
        metadata TEXT,
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN (${POSITION_STATUSES.map(v => `'${v}'`).join(', ')})),
        opened_at INTEGER NOT NULL,
        closed_at INTEGER,
        last_synced_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      INSERT INTO schema_version (version, applied_at) VALUES (25, unixepoch());
    `);
  },
});
```

**주의사항:**
- CREATE TABLE만 포함, CREATE INDEX는 제외 (Pitfall 6 방지). 인덱스는 `pushSchema()`의 `getCreateIndexStatements()`에서 처리.
- `LATEST_SCHEMA_VERSION`을 24 → 25로 업데이트하는 지점: `getCreateTableStatements()` DDL에 defi_positions CREATE TABLE 추가 시 함께 변경.
- CHECK 제약은 SSoT 배열(`POSITION_CATEGORIES`, `POSITION_STATUSES`, `CHAIN_TYPES`, `NETWORK_TYPES`)에서 동적 생성하여 하드코딩 방지.

### 5.5 설계 결정

| 결정 | 선택 | 근거 |
|------|------|------|
| 테이블명 | `defi_positions` (not `positions`) | "positions"는 월렛 컨텍스트에서 모호함. `defi_` 접두어로 DeFi 포지션 테이블임을 명확히 구분. 향후 다른 종류의 "position" 테이블 추가 시 네이밍 충돌 방지. STATE.md의 미확정 이슈를 해소. |
| 카테고리별 필드 저장 | JSON metadata 칼럼 (not 카테고리별 nullable 칼럼) | 4개 카테고리 × 카테고리당 4-7개 고유 필드 = 20+ nullable 칼럼이 필요. JSON metadata는 (1) 테이블 스키마 안정성 (카테고리 추가 시 ALTER 불필요), (2) 쿼리 빈도가 낮은 카테고리별 필드를 SQL 칼럼으로 승격할 필요 없음, (3) 기존 transactions.bridgeMetadata 패턴과 일관. 단점: SQLite json_extract() 성능이 칼럼 접근보다 느리지만, 필터링은 공통 칼럼(category, status)에서 수행하므로 metadata JSON 쿼리가 발생하지 않음. |
| UNIQUE 키 구성 | `(wallet_id, provider, asset_id, category)` | asset_id(CAIP-19)가 체인/네트워크를 이미 포함하므로 chain/network를 UNIQUE에 중복 포함하지 않음. Perp의 asset_id null 케이스는 SQLite NULL 비교 특성(NULL != NULL)으로 동일 market의 복수 sub-account 포지션 허용. |
| metadata 검증 시점 | API 응답 시점만 (쓰기 시 검증 생략) | PositionTracker가 모든 쓰기를 제어하는 유일한 주체. 외부 입력이 없으므로 쓰기 경로 Zod 검증은 불필요한 오버헤드. API 응답 시 PositionSchema discriminatedUnion으로 타입 안전성 보장. |

---

## 6. 공통 인프라: PositionTracker 서비스

### 6.1 IPositionProvider 인터페이스

```typescript
// packages/core/src/interfaces/position-provider.types.ts (신규 파일)
import type { PositionCategory } from '../enums/position.js';

/**
 * Position update returned by providers for batch upsert.
 * Contains all fields needed to INSERT or UPDATE a defi_positions row.
 */
export interface PositionUpdate {
  walletId: string;
  category: PositionCategory;
  provider: string;          // e.g., 'aave_v3', 'drift'
  chain: string;             // ChainType
  network?: string | null;   // NetworkType (nullable)
  assetId?: string | null;   // CAIP-19 identifier (nullable)
  amount: string;            // decimal string
  amountUsd?: number | null; // USD equivalent (nullable)
  metadata: Record<string, unknown>; // category-specific fields
  status: 'ACTIVE' | 'CLOSED' | 'LIQUIDATED';
  openedAt: number;          // epoch seconds
  closedAt?: number | null;  // epoch seconds (nullable)
}

/**
 * IPositionProvider: read-only position data source for PositionTracker.
 *
 * IActionProvider와의 관계:
 * - IActionProvider: 트랜잭션 실행 (resolve() -> ContractCallRequest)
 * - IPositionProvider: 포지션 조회 (getPositions() -> PositionUpdate[])
 * - 동일 프로바이더 클래스가 두 인터페이스를 모두 구현 가능:
 *   class AaveV3Provider implements IActionProvider, IPositionProvider { ... }
 *
 * IActionProvider를 확장하지 않는 이유:
 * - IActionProvider는 resolve(), getMetadata(), getActions() 등 실행 전용 메서드를 포함
 * - IPositionProvider는 순수 조회. 실행 의존성이 없어야 PositionTracker가 독립 동작 가능
 * - 관심사 분리: 조회(Position)와 실행(Action)은 별개 라이프사이클
 */
export interface IPositionProvider {
  /**
   * Fetch current positions for a wallet from on-chain/API source.
   * Returns all positions (ACTIVE, CLOSED, LIQUIDATED) for the sync cycle.
   * PositionTracker calls this method at each polling interval.
   */
  getPositions(walletId: string): Promise<PositionUpdate[]>;

  /** Provider identifier (e.g., 'aave_v3'). Matches defi_positions.provider column. */
  getProviderName(): string;

  /** Categories this provider supports (e.g., ['LENDING'] for Aave). */
  getSupportedCategories(): PositionCategory[];
}
```

**인터페이스 위치:** `@waiaas/core` (인터페이스 정의). 구현체는 `@waiaas/actions` 또는 개별 프로바이더 패키지.

### 6.2 PositionTracker 스케줄러

```typescript
// packages/daemon/src/services/position/position-tracker.ts
class PositionTracker {
  private timers = new Map<PositionCategory, NodeJS.Timeout>();
  private providers = new Map<string, IPositionProvider>();
  private running = new Map<PositionCategory, boolean>();
  private writeQueue: PositionWriteQueue;

  // Category -> polling interval (ms)
  // 차등 폴링 근거:
  //   PERP (1분):  마진 청산 위험, 가격 변동에 민감
  //   LENDING (5분): 헬스 팩터 모니터링, 중간 빈도
  //   STAKING (15분): 느린 변동, 언스테이크 대기 상태만 변경
  //   YIELD (1시간): 만기 기반, PT/YT 가격은 천천히 변동
  private intervals: Record<PositionCategory, number> = {
    PERP: 60_000,       // 1 minute
    LENDING: 300_000,    // 5 minutes
    STAKING: 900_000,    // 15 minutes
    YIELD: 3_600_000,    // 1 hour
  };
```

**카테고리별 차등 폴링 주기:**

| 카테고리 | 폴링 주기 | 근거 |
|---------|----------|------|
| PERP | 60,000ms (1분) | 레버리지 포지션은 가격 변동에 민감. 마진 부족 시 청산 위험이 있어 빠른 감지 필요 |
| LENDING | 300,000ms (5분) | 헬스 팩터가 담보/차입 가격 변동에 따라 변화. 청산 임계값(1.0) 접근 감지 |
| STAKING | 900,000ms (15분) | 스테이킹 보상 누적과 언스테이크 대기 상태만 변경. 급격한 변동 없음 |
| YIELD | 3,600,000ms (1시간) | PT/YT 가격은 만기에 수렴하므로 천천히 변동. 만기 관리는 별도 MaturityMonitor |

**오버랩 방지 (Pitfall 4 대응):**

```typescript
  private async syncCategory(category: PositionCategory): Promise<void> {
    // Skip if previous handler still running (overlap prevention)
    if (this.running.get(category)) {
      return; // Next interval tick will retry
    }
    this.running.set(category, true);

    try {
      const providersForCategory = [...this.providers.values()]
        .filter(p => p.getSupportedCategories().includes(category));

      for (const provider of providersForCategory) {
        const walletIds = await this.getWalletsForProvider(provider);
        for (const walletId of walletIds) {
          try {
            const updates = await provider.getPositions(walletId);
            for (const update of updates) {
              this.writeQueue.enqueue(update);
            }
          } catch (err) {
            // Per-wallet error isolation (BalanceMonitorService 패턴)
            console.error(`PositionTracker: ${provider.getProviderName()} failed for ${walletId}`, err);
          }
        }
      }
      // Flush immediately after category sync (not on separate timer)
      this.writeQueue.flush(this.sqlite);
    } finally {
      this.running.set(category, false);
    }
  }
```

**start() / stop() 라이프사이클:**

```typescript
  start(): void {
    for (const [category, intervalMs] of Object.entries(this.intervals)) {
      const cat = category as PositionCategory;
      this.running.set(cat, false);
      const timer = setInterval(() => this.syncCategory(cat), intervalMs);
      timer.unref(); // 프로세스 종료 차단 방지
      this.timers.set(cat, timer);
    }
  }

  stop(): void {
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }
    this.timers.clear();
    // Flush remaining queue on shutdown (잔여 데이터 소진)
    this.writeQueue.flush(this.sqlite);
  }

  registerProvider(name: string, provider: IPositionProvider): void {
    this.providers.set(name, provider);
  }

  unregisterProvider(name: string): void {
    this.providers.delete(name);
  }
```

### 6.3 PositionWriteQueue (배치 쓰기 전략)

IncomingTxQueue 패턴을 적용하여 SQLite 쓰기 경합을 방지한다.

```typescript
// packages/daemon/src/services/position/position-write-queue.ts
class PositionWriteQueue {
  private queue = new Map<string, PositionUpsert>();
  private static MAX_BATCH = 100;  // IncomingTxQueue와 동일

  /**
   * Enqueue a position update for batch flush.
   * Map key로 자동 중복 제거: 동일 포지션의 다중 업데이트는 최신 값만 유지.
   */
  enqueue(update: PositionUpdate): void {
    const key = `${update.walletId}:${update.provider}:${update.assetId ?? 'null'}:${update.category}`;
    this.queue.set(key, this.toUpsert(update));
  }

  /**
   * Batch flush to SQLite.
   * - BEGIN IMMEDIATE 트랜잭션으로 원자적 실행
   * - Prepared statement 재사용으로 파싱 오버헤드 최소화
   * - ON CONFLICT(wallet_id, provider, asset_id, category) DO UPDATE로 upsert
   */
  flush(sqlite: Database): number {
    if (this.queue.size === 0) return 0;

    const batch = [...this.queue.values()].slice(0, PositionWriteQueue.MAX_BATCH);

    const stmt = sqlite.prepare(`
      INSERT INTO defi_positions (
        id, wallet_id, category, provider, chain, network, asset_id,
        amount, amount_usd, metadata, status, opened_at, closed_at,
        last_synced_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(wallet_id, provider, asset_id, category) DO UPDATE SET
        amount = excluded.amount,
        amount_usd = excluded.amount_usd,
        metadata = excluded.metadata,
        status = excluded.status,
        last_synced_at = excluded.last_synced_at,
        updated_at = excluded.updated_at,
        closed_at = excluded.closed_at
    `);

    const runBatch = sqlite.transaction((items: PositionUpsert[]) => {
      let count = 0;
      for (const item of items) {
        stmt.run(
          item.id, item.walletId, item.category, item.provider,
          item.chain, item.network, item.assetId,
          item.amount, item.amountUsd, JSON.stringify(item.metadata),
          item.status, item.openedAt, item.closedAt,
          item.lastSyncedAt, item.createdAt, item.updatedAt,
        );
        count++;
      }
      return count;
    });

    const inserted = runBatch(batch);

    // Remove flushed items from queue
    let removed = 0;
    for (const [key, value] of this.queue.entries()) {
      if (removed >= inserted) break;
      this.queue.delete(key);
      removed++;
    }

    return inserted;
  }
}
```

**IncomingTxQueue 패턴과의 비교:**

| 속성 | IncomingTxQueue | PositionWriteQueue |
|------|----------------|-------------------|
| 키 | `txHash:walletId` | `walletId:provider:assetId:category` |
| 중복 정책 | 무시 (DO NOTHING) | 갱신 (DO UPDATE) |
| MAX_BATCH | 100 | 100 |
| MAX_QUEUE_SIZE | 10,000 | 불필요 (포지션 수 << 트랜잭션 수) |
| 플러시 트리거 | BackgroundWorkers 주기 | syncCategory() 완료 즉시 |

**플러시를 별도 타이머가 아닌 syncCategory() 완료 후 즉시 실행하는 이유:**
- 카테고리별 폴링 주기가 이미 시간 기반 스케줄링을 제공
- syncCategory()가 완료되면 해당 카테고리의 모든 업데이트가 큐에 존재
- 즉시 플러시하면 API 조회 시 최신 데이터를 반환
- 별도 플러시 타이머는 불필요한 지연을 추가하고 관리 복잡도만 증가

### 6.4 데몬 라이프사이클 연동

**DaemonLifecycle 연동 지점:**

```
Step 1: DB init + migration
Step 2: Services init (PositionTracker instance creation)
Step 3: Provider registration (ActionProviderRegistry + PositionTracker.registerProvider)
Step 4: Background services start → PositionTracker.start()
...
Shutdown: PositionTracker.stop() + PositionWriteQueue.flush() (잔여 큐 소진)
```

**config.toml 설정:**

```toml
[position_tracker]
enabled = true

[position_tracker.intervals]
perp = 60          # seconds (default: 60)
lending = 300      # seconds (default: 300)
staking = 900      # seconds (default: 900)
yield = 3600       # seconds (default: 3600)
```

**Admin Settings 런타임 오버라이드:**

SettingsService에 5개 키를 등록하여 데몬 재시작 없이 폴링 주기를 조정할 수 있다:

| 키 | 타입 | 기본값 | 설명 |
|----|------|--------|------|
| `position_tracker.enabled` | boolean | true | 전체 활성화/비활성화 |
| `position_tracker.intervals.perp` | number | 60 | Perp 폴링 주기 (초) |
| `position_tracker.intervals.lending` | number | 300 | Lending 폴링 주기 (초) |
| `position_tracker.intervals.staking` | number | 900 | Staking 폴링 주기 (초) |
| `position_tracker.intervals.yield` | number | 3600 | Yield 폴링 주기 (초) |

Admin UI의 Settings 페이지에서 편집 가능. 변경 시 PositionTracker가 기존 타이머를 해제하고 새 주기로 재등록.

**EventBus 연동:**

PositionTracker가 writeQueue.flush() 후 변경된 포지션에 대해 이벤트를 발행한다:

| 이벤트 | 발행 조건 | 데이터 |
|--------|----------|--------|
| `POSITION_UPDATED` | 기존 포지션의 amount/status/metadata 변경 | { walletId, provider, category, positionId } |
| `POSITION_OPENED` | 새 포지션 INSERT (기존에 없던 키) | { walletId, provider, category, positionId, assetId } |
| `POSITION_CLOSED` | status가 ACTIVE → CLOSED/LIQUIDATED로 전환 | { walletId, provider, category, positionId, reason } |

이벤트는 NotificationService에서 소비하여 월렛 소유자에게 포지션 변경 알림을 전달한다. 기존 30개 이벤트 → 6개 카테고리 매핑 패턴(EVENT_CATEGORY_MAP)에 3개 이벤트를 추가한다.

### 6.5 설계 결정

| 결정 | 선택 | 근거 |
|------|------|------|
| IPositionProvider vs IActionProvider 확장 | IPositionProvider 독립 인터페이스 | IActionProvider는 resolve(), getMetadata(), getActions() 등 실행 메서드를 포함. 포지션 조회는 실행 의존성이 없어야 PositionTracker가 독립 동작. 동일 클래스가 두 인터페이스를 모두 구현하는 것은 가능 (TypeScript duck typing). |
| PositionTracker 서비스 형태 | 독립 서비스 (not BackgroundWorkers 직접 등록) | BackgroundWorkers는 worker당 단일 interval. PositionTracker는 4개 카테고리 × 4개 다른 주기가 필요. BalanceMonitorService 패턴처럼 내부 setInterval 관리가 적합. |
| 플러시 타이밍 | syncCategory() 완료 후 즉시 | 별도 플러시 타이머는 불필요한 지연을 추가. syncCategory()가 모든 업데이트를 큐에 적재한 직후가 최적의 플러시 시점. API 조회 시 최신 데이터 보장. |

---

## 7. 공통 인프라: REST API 명세

### 7.1 GET /v1/wallets/:id/positions 엔드포인트

AI 에이전트가 하나의 엔드포인트로 4개 카테고리(LENDING/YIELD/PERP/STAKING)의 모든 DeFi 포지션을 조회할 수 있는 통합 API를 정의한다.

| 항목 | 값 |
|------|-----|
| HTTP 메서드 | GET |
| 경로 | `/v1/wallets/:walletId/positions` |
| 인증 | sessionAuth (기존 지갑 API와 동일) |
| 경로 파라미터 | `walletId` (UUID) |
| 태그 | Positions |

**쿼리 파라미터:**

| 파라미터 | 타입 | 기본값 | 설명 |
|---------|------|--------|------|
| `category` | string (optional) | - | LENDING / YIELD / PERP / STAKING 필터 |
| `provider` | string (optional) | - | 프로바이더 필터 (aave_v3, kamino, lido, jito, pendle, drift, morpho, marinade) |
| `status` | string (optional) | ACTIVE | ACTIVE / CLOSED / LIQUIDATED 필터 |

**성공 응답 (200):**

```json
{
  "walletId": "uuid-string",
  "positions": [
    {
      "id": "uuid-v7",
      "walletId": "uuid-string",
      "category": "LENDING",
      "provider": "aave_v3",
      "chain": "evm",
      "network": "ethereum",
      "assetId": "eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      "amount": "1000.00",
      "amountUsd": 1000.00,
      "status": "ACTIVE",
      "openedAt": 1740000000,
      "closedAt": null,
      "lastSyncedAt": 1740100000,
      "metadata": {
        "positionType": "SUPPLY",
        "apy": 0.032,
        "healthFactor": 1.85,
        "collateralUsd": 7500.00,
        "debtUsd": 4000.00
      }
    },
    {
      "id": "uuid-v7",
      "walletId": "uuid-string",
      "category": "STAKING",
      "provider": "lido",
      "chain": "evm",
      "network": "ethereum",
      "assetId": "eip155:1/erc20:0xae7ab96520de3a18e5e111b5eaab095312d7fe84",
      "amount": "2.5",
      "amountUsd": 7500.00,
      "status": "ACTIVE",
      "openedAt": 1739500000,
      "closedAt": null,
      "lastSyncedAt": 1740100000,
      "metadata": {
        "apy": 0.035,
        "pendingUnstake": null
      }
    }
  ],
  "totalValueUsd": 8500.00,
  "lastUpdatedAt": 1740100000
}
```

**에러 응답:**

| HTTP 코드 | 에러 코드 | 설명 |
|-----------|----------|------|
| 401 | UNAUTHORIZED | 인증 토큰 없음 또는 만료 |
| 404 | WALLET_NOT_FOUND | 지정된 walletId에 해당하는 월렛이 없음 |
| 500 | INTERNAL_ERROR | 서버 내부 오류 |

### 7.2 PositionsResponseSchema (Zod)

Plan 01에서 정의한 BasePositionSchema + 4개 카테고리 확장을 API 응답 스키마로 활용한다.

```typescript
// packages/daemon/src/api/routes/openapi-schemas.ts (추가)

// ---------------------------------------------------------------------------
// Positions API Response Schemas
// ---------------------------------------------------------------------------

/** Base position fields shared by all categories. */
const PositionBaseResponseSchema = z.object({
  id: z.string(),
  walletId: z.string(),
  provider: z.string(),
  chain: z.string(),
  network: z.string().nullable(),
  assetId: z.string().nullable(),
  amount: z.string(),
  amountUsd: z.number().nullable(),
  status: z.enum(['ACTIVE', 'CLOSED', 'LIQUIDATED']),
  openedAt: z.number().int(),
  closedAt: z.number().int().nullable(),
  lastSyncedAt: z.number().int(),
});

/** Lending position: supply/borrow with health factor. */
export const LendingPositionResponseSchema = PositionBaseResponseSchema.extend({
  category: z.literal('LENDING'),
  metadata: z.object({
    positionType: z.enum(['SUPPLY', 'BORROW']),
    apy: z.number().nullable(),
    healthFactor: z.number().nullable(),
    collateralUsd: z.number().nullable(),
    debtUsd: z.number().nullable(),
  }),
}).openapi('LendingPosition');

/** Yield position: PT/YT/LP tokens with maturity. */
export const YieldPositionResponseSchema = PositionBaseResponseSchema.extend({
  category: z.literal('YIELD'),
  metadata: z.object({
    tokenType: z.enum(['PT', 'YT', 'LP']),
    marketId: z.string(),
    maturity: z.number().int(),
    apy: z.number().nullable(),
    entryPrice: z.number().nullable(),
  }),
}).openapi('YieldPosition');

/** Perp position: leveraged trading with margin and PnL. */
export const PerpPositionResponseSchema = PositionBaseResponseSchema.extend({
  category: z.literal('PERP'),
  metadata: z.object({
    direction: z.enum(['LONG', 'SHORT']),
    leverage: z.number(),
    unrealizedPnl: z.number().nullable(),
    liquidationPrice: z.number().nullable(),
    margin: z.number().nullable(),
    entryPrice: z.number().nullable(),
    market: z.string(),
  }),
}).openapi('PerpPosition');

/** Staking position: staked assets with APY and pending unstake. */
export const StakingPositionResponseSchema2 = PositionBaseResponseSchema.extend({
  category: z.literal('STAKING'),
  metadata: z.object({
    apy: z.number().nullable(),
    pendingUnstake: z.object({
      amount: z.string(),
      unlockAt: z.number().int(),
    }).nullable(),
  }),
}).openapi('StakingPosition2');

/** Unified position response with portfolio aggregation. */
export const PositionsResponseSchema = z.object({
  walletId: z.string(),
  positions: z.array(z.discriminatedUnion('category', [
    LendingPositionResponseSchema,
    YieldPositionResponseSchema,
    PerpPositionResponseSchema,
    StakingPositionResponseSchema2,
  ])),
  totalValueUsd: z.number().nullable(),
  lastUpdatedAt: z.number().int(),
}).openapi('PositionsResponse');

/** Query parameter schema for position filtering. */
export const PositionQuerySchema = z.object({
  category: z.enum(['LENDING', 'YIELD', 'PERP', 'STAKING']).optional(),
  provider: z.string().optional(),
  status: z.enum(['ACTIVE', 'CLOSED', 'LIQUIDATED']).optional().default('ACTIVE'),
}).openapi('PositionQuery');
```

**참고:** 기존 `StakingPositionsResponseSchema`는 트랜잭션 기반 스테이킹 응답이므로, 새 포지션 기반 스키마는 `StakingPositionResponseSchema2`로 명명하여 충돌을 방지한다. 구현 시 기존 스키마가 deprecated된 후 이름을 통합.

### 7.3 기존 엔드포인트 호환성

**기존 GET /v1/wallet/staking deprecated 전환 계획:**

| 단계 | 시기 | 내용 |
|------|------|------|
| 1. 병존 | 구현 마일스톤 (m29-02) | 새 `/wallets/:id/positions?category=STAKING`이 추가됨. 기존 `/wallet/staking`도 동작 |
| 2. 내부 전환 | m29-02 이후 | `/wallet/staking`이 내부적으로 `defi_positions` 테이블에서 조회하도록 전환. 응답 형식은 유지 |
| 3. deprecated 헤더 | 전환 직후 | 기존 엔드포인트에 `Deprecation: true`, `Sunset: TBD` 헤더 추가 |
| 4. SDK/MCP 전환 | m29-02 이후 | SDK의 `getStakingPositions()`가 새 엔드포인트를 호출. MCP tool도 전환 |
| 5. 제거 | 향후 메이저 버전 | 기존 엔드포인트 제거 (BREAKING CHANGE) |

**매핑 관계:**

```
GET /v1/wallet/staking
  → GET /v1/wallets/:id/positions?category=STAKING

// 응답 형식 변환 (backward compatibility)
// 기존: { walletId, positions: StakingPosition[] }
// 신규: { walletId, positions: Position[], totalValueUsd, lastUpdatedAt }
```

### 7.4 OpenAPIHono 라우트 정의

```typescript
// packages/daemon/src/api/routes/positions.ts (신규 파일)
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import {
  PositionsResponseSchema,
  PositionQuerySchema,
  buildErrorResponses,
} from './openapi-schemas.js';

const getPositionsRoute = createRoute({
  method: 'get',
  path: '/wallets/{walletId}/positions',
  tags: ['Positions'],
  summary: 'Get DeFi positions for a wallet',
  description:
    'Returns all DeFi positions (Lending, Yield, Perp, Staking) for the specified wallet. ' +
    'Supports filtering by category, provider, and status. Includes total portfolio USD value.',
  request: {
    params: z.object({
      walletId: z.string().uuid(),
    }),
    query: PositionQuerySchema,
  },
  responses: {
    200: {
      description: 'DeFi positions for the wallet',
      content: { 'application/json': { schema: PositionsResponseSchema } },
    },
    ...buildErrorResponses(['UNAUTHORIZED', 'WALLET_NOT_FOUND', 'INTERNAL_ERROR']),
  },
});
```

**라우트 등록:** `packages/daemon/src/api/server.ts`의 기존 라우트 등록 패턴에 `positions` 라우트 파일 추가.

### 7.5 설계 결정

| 결정 | 선택 | 근거 |
|------|------|------|
| totalValueUsd 서버 계산 | 서버에서 SUM(amount_usd) 계산 후 응답에 포함 | AI 에이전트가 별도 집계 연산 없이 포트폴리오 총액을 한 번의 API 호출로 파악. 클라이언트 측 집계는 (1) 추가 로직 필요, (2) amount_usd null 처리를 에이전트가 해야 함 |
| 쿼리 파라미터 전달 방식 | URL query (not request body) | GET 요청에 적합. HTTP 캐시 가능. 브라우저에서 직접 테스트 가능. 필터 조합이 3개로 단순하여 URL 길이 문제 없음 |
| status 기본값 ACTIVE | 미지정 시 ACTIVE만 반환 | 대부분의 조회는 활성 포지션 대상. CLOSED/LIQUIDATED는 히스토리 목적으로 명시적 요청 필요. 에이전트의 기본 사용 패턴에 최적화 |

---

## 8. 공통 인프라: Admin 포트폴리오 와이어프레임

### 8.1 포지션 목록 레이아웃

Admin UI의 Wallet Detail 페이지 내 "Positions" 탭으로 배치한다. 기존 페이지 구조(Wallets → 월렛 선택 → Detail) 내에서 Transactions/Staking 탭과 나란히 위치한다.

**전체 레이아웃:**

```
┌─────────────────────────────────────────────────────────────────┐
│ Wallet: MyWallet (0x1234...abcd)        Chain: evm  Env: mainnet│
├─────────────────────────────────────────────────────────────────┤
│ [Overview] [Transactions] [Positions] [Staking*] [Policies]     │
│                            ^^^^^^^^^                            │
│                          (active tab)                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌───────────┐ │
│  │ Total USD  │  │ Lending    │  │ Yield      │  │ Perp PnL  │ │
│  │  $18,500   │  │  $11,500   │  │  $4,200    │  │  +$320    │ │
│  │            │  │  2 active  │  │  1 active  │  │  1 active │ │
│  └────────────┘  └────────────┘  └────────────┘  └───────────┘ │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ [All] [Lending] [Yield] [Perp] [Staking]  [Refresh ↻]     ││
│  ├─────────────────────────────────────────────────────────────┤│
│  │                                                             ││
│  │  Position Cards (카테고리별, 아래 8.2 참조)                  ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  * Staking 탭: deprecated 전환 완료 시 Positions 탭에 통합      │
└─────────────────────────────────────────────────────────────────┘
```

**상단 StatCard 4개:**

| StatCard | 데이터 소스 | 표시 |
|----------|-----------|------|
| Total Portfolio USD | `totalValueUsd` from API response | `$XX,XXX` (formatWithDisplay) |
| Lending TVL | SUM(amountUsd) where category=LENDING | `$X,XXX` + active count |
| Yield TVL | SUM(amountUsd) where category=YIELD | `$X,XXX` + active count |
| Perp Unrealized PnL | SUM(metadata.unrealizedPnl) where category=PERP | `+$XXX` / `-$XXX` (색상 코딩) |

**탭 필터:** `[All] [Lending] [Yield] [Perp] [Staking]` -- 클릭 시 포지션 카드를 해당 카테고리만 표시. `All`은 모든 카테고리 표시.

**새로고침 버튼:** 수동 데이터 갱신. PositionTracker가 서버 측에서 주기적 동기화를 수행하므로 실시간 WebSocket 갱신 없이 수동 새로고침 방식 채택.

### 8.2 카테고리별 카드 구성

테이블이 아닌 카드 레이아웃을 채택한다. 카테고리별 표시 필드가 달라 테이블 칼럼을 통일할 수 없기 때문이다.

**Lending 카드:**

```
┌────────────────────────────────────────────────┐
│ [Aave V3]              SUPPLY                  │
│ ──────────────────────────────────────────────  │
│ Asset: USDC                                    │
│ Amount: 1,000.00 USDC  ($1,000.00)            │
│                                                │
│ APY          Health Factor     Status          │
│ 3.20%        ██████░░ 1.85     ● ACTIVE       │
│              (green)                           │
│                                                │
│ Collateral: $7,500    Debt: $4,000             │
│ Last synced: 2 min ago                         │
└────────────────────────────────────────────────┘
```

**Yield 카드:**

```
┌────────────────────────────────────────────────┐
│ [Pendle]               PT                      │
│ ──────────────────────────────────────────────  │
│ Market: stETH 26-Jun-2026                      │
│ Amount: 10.5 PT-stETH  ($4,200.00)            │
│                                                │
│ APY          Maturity          Status          │
│ 5.80%        Jun 26, 2026      ● ACTIVE       │
│              (121 days left)                   │
│                                                │
│ Entry Price: $399.05                           │
│ Last synced: 45 min ago                        │
└────────────────────────────────────────────────┘
```

**Perp 카드:**

```
┌────────────────────────────────────────────────┐
│ [Drift]                LONG                    │
│ ──────────────────────────────────────────────  │
│ Market: SOL-PERP                               │
│ Size: 50.0 SOL  ($7,500.00)                   │
│                                                │
│ Leverage     Unrealized PnL    Status          │
│ 5.0x         +$320.50 (green)  ● ACTIVE       │
│                                                │
│ Entry: $140.00  Liq: $112.00                   │
│ Margin: $1,500  ██████████░░░ 67%              │
│ Last synced: 30 sec ago                        │
└────────────────────────────────────────────────┘
```

**Staking 카드:**

```
┌────────────────────────────────────────────────┐
│ [Lido]                 STAKING                 │
│ ──────────────────────────────────────────────  │
│ Asset: stETH                                   │
│ Amount: 2.500 stETH  ($7,500.00)              │
│                                                │
│ APY          Pending Unstake   Status          │
│ 3.50%        None              ● ACTIVE       │
│                                                │
│ Last synced: 12 min ago                        │
└────────────────────────────────────────────────┘
```

### 8.3 USD 환산 + APY + 헬스 팩터 표시

**USD 환산:**
- `fetchDisplayCurrency()` + `formatWithDisplay()` 기존 패턴 활용
- amountUsd가 null이면 `--` 표시 (오라클 미가용)
- 통화 형식: `$X,XXX.XX` (소수점 2자리)

**APY 표시:**
- 소수점 2자리 퍼센트: `(apy * 100).toFixed(2) + '%'` (예: 0.032 → `3.20%`)
- null이면 `--` 표시

**헬스 팩터 색상 코딩 (4단계):**

| 범위 | 색상 | CSS 클래스 | 의미 |
|------|------|-----------|------|
| > 2.0 | Green | `hf-safe` | 안전 (청산 위험 없음) |
| 1.5 ~ 2.0 | Yellow | `hf-caution` | 주의 (청산 위험 낮음) |
| 1.2 ~ 1.5 | Orange | `hf-warning` | 경고 (청산 위험 중간) |
| < 1.2 | Red | `hf-danger` | 위험 (청산 임박) |

헬스 팩터는 시각적 진행 바(progress bar)로 표현: `████████░░░░ 1.85`

**Perp PnL 색상 코딩:**
- 양수 (+): Green (`pnl-positive`)
- 음수 (-): Red (`pnl-negative`)
- 0: 기본 색상

**마진 비율 진행 바:**
- `margin / (amount * leverage)` 비율로 진행 바 표시
- 75%+ 여유: Green, 50-75%: Yellow, <50%: Orange, <25%: Red

### 8.4 상태 관리 패턴

Preact signals 기반 상태 관리:

```typescript
// packages/admin/src/pages/positions.tsx (신규 파일 — Wallet Detail 탭 내)
import { signal, computed } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { apiGet } from '../api/client';

// ---------------------------------------------------------------------------
// State signals
// ---------------------------------------------------------------------------

/** All positions fetched from API */
const positions = signal<Position[]>([]);

/** Currently selected category tab filter */
const selectedCategory = signal<PositionCategory | 'ALL'>('ALL');

/** Loading state */
const loading = signal<boolean>(true);

/** API error state */
const error = signal<string | null>(null);

/** Total portfolio USD value */
const totalValueUsd = signal<number | null>(null);

/** Last updated timestamp */
const lastUpdatedAt = signal<number | null>(null);

// ---------------------------------------------------------------------------
// Computed values
// ---------------------------------------------------------------------------

/** Filtered positions based on selected category tab */
const filteredPositions = computed(() => {
  if (selectedCategory.value === 'ALL') return positions.value;
  return positions.value.filter(p => p.category === selectedCategory.value);
});

/** Per-category aggregation for StatCards */
const categoryStats = computed(() => ({
  lending: {
    tvl: positions.value.filter(p => p.category === 'LENDING').reduce((sum, p) => sum + (p.amountUsd ?? 0), 0),
    count: positions.value.filter(p => p.category === 'LENDING').length,
  },
  yield: {
    tvl: positions.value.filter(p => p.category === 'YIELD').reduce((sum, p) => sum + (p.amountUsd ?? 0), 0),
    count: positions.value.filter(p => p.category === 'YIELD').length,
  },
  perp: {
    unrealizedPnl: positions.value.filter(p => p.category === 'PERP').reduce(
      (sum, p) => sum + ((p.metadata as PerpMetadata)?.unrealizedPnl ?? 0), 0,
    ),
    count: positions.value.filter(p => p.category === 'PERP').length,
  },
  staking: {
    tvl: positions.value.filter(p => p.category === 'STAKING').reduce((sum, p) => sum + (p.amountUsd ?? 0), 0),
    count: positions.value.filter(p => p.category === 'STAKING').length,
  },
}));

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

/** Fetch positions from API */
async function fetchPositions(walletId: string): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const resp = await apiGet(`/v1/wallets/${walletId}/positions`);
    positions.value = resp.positions;
    totalValueUsd.value = resp.totalValueUsd;
    lastUpdatedAt.value = resp.lastUpdatedAt;
  } catch (err) {
    error.value = getErrorMessage(err);
  } finally {
    loading.value = false;
  }
}
```

**실시간 갱신 없음 (의도적 설계):**
- PositionTracker가 서버 측에서 카테고리별 주기로 defi_positions 테이블을 업데이트
- Admin UI는 API 호출 시점의 스냅샷을 표시
- 수동 "Refresh" 버튼으로 최신 데이터 갱신
- WebSocket 실시간 갱신은 불필요한 복잡도 추가 (서버 측 동기화가 이미 주기적)

### 8.5 설계 결정

| 결정 | 선택 | 근거 |
|------|------|------|
| 페이지 위치 | Wallet Detail 내 "Positions" 탭 | 별도 페이지는 월렛 컨텍스트를 잃음. 탭은 (1) 같은 월렛의 Transactions/Policies와 나란히 탐색 가능, (2) URL은 `#positions` 해시로 직접 접근 가능 |
| 실시간 갱신 방식 | 수동 새로고침 (WebSocket 제외) | PositionTracker가 서버에서 1분~1시간 주기로 동기화. Admin UI가 WebSocket으로 실시간 갱신하면 (1) 서버 부하 증가, (2) 동기화 주기보다 더 빈번한 갱신은 무의미. 수동 새로고침으로 충분 |
| 카드 vs 테이블 레이아웃 | 카드 | 카테고리별 표시 필드가 다름 (Lending: healthFactor, Perp: leverage/PnL, Yield: maturity). 테이블은 칼럼 통일이 불가능하여 sparse 칼럼 또는 카테고리별 다른 테이블이 필요. 카드는 카테고리별 최적 레이아웃 가능 |

---

## 9. 모니터링 프레임워크 — IDeFiMonitor 인터페이스

### 9.1 IDeFiMonitor 인터페이스 정의

3개 전문 모니터(HealthFactorMonitor, MaturityMonitor, MarginMonitor)가 공통으로 구현하는 인터페이스를 정의한다. IChainSubscriber 6메서드 패턴을 참조하여 DeFiMonitorService가 모니터를 제네릭하게 관리할 수 있는 계약을 제공한다.

```typescript
// packages/core/src/interfaces/defi-monitor.types.ts (신규 파일)

/**
 * 4-level risk severity for DeFi position monitoring.
 * Used by all three monitors (HealthFactor, Maturity, Margin)
 * to classify position risk level.
 */
export type MonitorSeverity = 'SAFE' | 'WARNING' | 'DANGER' | 'CRITICAL';

/**
 * Result of evaluating a single DeFi position.
 * Returned by IDeFiMonitor.evaluate() when a position
 * requires attention (non-null) or is healthy (null).
 */
export interface MonitorEvaluation {
  walletId: string;         // Position owner wallet
  positionId: string;       // defi_positions.id
  severity: MonitorSeverity;
  value: number;            // Measured value (health factor, days to maturity, margin ratio)
  threshold: number;        // Threshold that was crossed
  message: string;          // Human-readable description for notifications
}

/**
 * IDeFiMonitor: common interface for DeFi position risk monitors.
 *
 * Design rationale:
 * - 6 members (1 property + 5 methods) providing lifecycle + evaluation contracts
 * - evaluate() returns null for positions not relevant to this monitor
 *   (e.g., HealthFactorMonitor returns null for YIELD category)
 * - getInterval() may return dynamic values (HealthFactorMonitor adaptive polling)
 *   or fixed values (MaturityMonitor 86,400,000ms, MarginMonitor 60,000ms)
 * - start()/stop() manage internal polling timers
 * - updateConfig() enables hot-reload from Admin Settings
 *
 * File location: packages/core/src/interfaces/defi-monitor.types.ts
 */
export interface IDeFiMonitor {
  /** Monitor type identifier (e.g., 'health-factor', 'maturity', 'margin') */
  readonly name: string;

  /**
   * Evaluate a single position and determine its risk severity.
   * Returns MonitorEvaluation if position is relevant and at risk,
   * or null if position is not relevant to this monitor
   * (e.g., wrong category or not ACTIVE).
   */
  evaluate(position: DefiPositionRow): MonitorEvaluation | null;

  /**
   * Get current polling interval in milliseconds.
   * HealthFactorMonitor: dynamic based on currentSeverity
   * MaturityMonitor: fixed 86,400,000ms (24h)
   * MarginMonitor: fixed 60,000ms (1min)
   */
  getInterval(): number;

  /** Start the monitoring polling loop */
  start(): void;

  /** Stop the monitoring polling loop and clean up timers */
  stop(): void;

  /**
   * Update configuration at runtime (hot-reload from Admin Settings).
   * Called by DeFiMonitorService.updateConfig() which propagates to all monitors.
   * Each monitor extracts its relevant keys from the config object.
   */
  updateConfig(config: Record<string, unknown>): void;
}
```

**인터페이스 위치:** `@waiaas/core` (인터페이스 + 타입 정의). 구현체는 `packages/daemon/src/services/monitoring/` 하위.

### 9.2 MonitorSeverity 타입 상세

4단계 severity는 폴링 간격, 알림 수준, Admin UI 표시 색상을 결정한다:

| Severity | 의미 | 폴링 간격 | 알림 | Admin UI 색상 |
|----------|------|----------|------|--------------|
| SAFE | 정상. 리스크 없음 | 최대 간격 (모니터별) | 없음 | Green (#22c55e) |
| WARNING | 경고. 리스크 감지 | 중간 간격 | WARNING 수준 알림 (쿨다운 적용) | Yellow (#eab308) |
| DANGER | 위험. 리스크 상승 | 짧은 간격 | WARNING 수준 알림 (쿨다운 적용) | Orange (#f97316) |
| CRITICAL | 임박한 위험. 즉시 조치 필요 | 최소 간격 | LIQUIDATION_IMMINENT 알림 (쿨다운 미적용) | Red (#ef4444) |

**Severity 전이 규칙:**
- **하강(악화):** severity가 SAFE → WARNING, WARNING → DANGER 등으로 나빠지면 즉시 폴링 간격 변경 (다음 tick에 적용)
- **상승(개선):** severity가 개선되면 즉시 간격 변경. 별도의 히스테리시스(hysteresis) 없음 — 단순성 우선
- **무포지션:** 해당 카테고리에 ACTIVE 포지션이 없으면 SAFE로 유지 (불필요한 폴링 방지)

### 9.3 DeFiMonitorService 오케스트레이터

```typescript
// packages/daemon/src/services/monitoring/defi-monitor-service.ts

/**
 * DeFiMonitorService: orchestrates 3 specialized DeFi monitors.
 *
 * Responsibilities:
 * - Register/start/stop all monitors as a unit
 * - Propagate config updates to all monitors (hot-reload)
 * - Provide single entry point for DaemonLifecycle
 *
 * Pattern: IncomingTxMonitorService (queue + multiplexer + workers → monitors array)
 * Dependencies: same as BalanceMonitorService { sqlite, notificationService, settingsService, config }
 */
class DeFiMonitorService {
  private monitors: IDeFiMonitor[] = [];

  constructor(deps: {
    sqlite: Database;
    notificationService: NotificationService;
    settingsService: SettingsService;
    config: MonitoringConfig;
  }) {
    // Instantiate and register 3 monitors
    this.register(new HealthFactorMonitor(deps));
    this.register(new MaturityMonitor(deps));
    this.register(new MarginMonitor(deps));
  }

  /**
   * Register a monitor. Must be called before start().
   */
  register(monitor: IDeFiMonitor): void {
    this.monitors.push(monitor);
  }

  /**
   * Start all registered monitors.
   * Fail-soft: if one monitor fails to start, others still start.
   * Matches BalanceMonitorService error isolation pattern.
   */
  start(): void {
    for (const monitor of this.monitors) {
      try {
        monitor.start();
        console.debug(`DeFiMonitorService: ${monitor.name} started`);
      } catch (err) {
        console.warn(`DeFiMonitorService: ${monitor.name} failed to start:`, err);
        // Continue starting other monitors
      }
    }
  }

  /**
   * Stop all registered monitors (reverse order).
   * Ensures cleanup even if individual stop() throws.
   */
  stop(): void {
    for (const monitor of [...this.monitors].reverse()) {
      try {
        monitor.stop();
      } catch (err) {
        console.warn(`DeFiMonitorService: ${monitor.name} failed to stop:`, err);
      }
    }
  }

  /**
   * Propagate config update to all monitors.
   * Called by HotReloadOrchestrator.reloadDeFiMonitors().
   */
  updateConfig(config: Record<string, unknown>): void {
    for (const monitor of this.monitors) {
      try {
        monitor.updateConfig(config);
      } catch (err) {
        console.warn(`DeFiMonitorService: ${monitor.name} config update failed:`, err);
      }
    }
  }
}
```

### 9.4 모니터 등록 패턴

- DeFiMonitorService 생성자에서 3개 모니터를 인스턴스화하여 register()
- 각 모니터는 자체 폴링 타이머를 관리:
  * HealthFactorMonitor: 재귀 `setTimeout` (적응형 간격)
  * MaturityMonitor: `setInterval` (고정 간격) + 시작 시 즉시 1회 실행
  * MarginMonitor: `setInterval` (고정 간격) + 시작 시 즉시 1회 실행
- 모니터 간 독립성: 한 모니터의 에러가 다른 모니터에 영향 없음 (per-monitor try/catch in start/stop/updateConfig)
- 타이머 unref(): `timer.unref()` 호출로 프로세스 종료 차단 방지 (BalanceMonitorService 패턴)

### 9.5 설계 결정

| ID | 결정 | 선택 | 근거 |
|----|------|------|------|
| DEC-MON-01 | IDeFiMonitor와 IActionProvider 관계 | IDeFiMonitor는 IActionProvider를 확장하지 않는다 | 모니터링과 액션은 독립적 관심사. IActionProvider는 resolve()/getMetadata()/getActions() 실행 메서드를 포함하며 모니터에 불필요. 관심사 분리 원칙 준수 |
| DEC-MON-02 | DeFiMonitorService와 BalanceMonitorService 관계 | 병렬 운영 (대체 아님) | BalanceMonitorService는 네이티브 토큰 잔액(LOW_BALANCE) 모니터링. DeFiMonitorService는 DeFi 포지션 리스크 모니터링. 모니터링 대상이 완전히 다름. 공유하는 것은 NotificationService뿐 |
| DEC-MON-03 | 모니터 데이터 소스 | defi_positions 테이블 읽기 (직접 RPC 호출 금지) | PositionTracker가 데이터 갱신 담당. 모니터가 독립적으로 RPC를 호출하면 (1) RPC rate limit 초과 위험, (2) PositionTracker와 데이터 불일치, (3) 모니터 타이밍과 데이터 신선도가 결합되어 복잡도 증가. 모니터는 캐시된 데이터를 평가만 수행 |
| DEC-MON-04 | HealthFactorMonitor DANGER/CRITICAL 시 데이터 신선도 | PositionTracker에 LENDING 카테고리 즉시 동기화 요청 (on-demand sync) | HealthFactorMonitor가 DANGER/CRITICAL 진입 시 defi_positions 데이터가 최대 5분 전 (LENDING 폴링 주기)일 수 있음. 5초 간격으로 체크하는데 5분 전 데이터는 의미 없음. `PositionTracker.syncCategory('LENDING')` 호출로 최신 데이터 확보. on-demand sync는 PositionTracker의 오버랩 방지 로직(running 플래그)이 이미 보호 |

---

## 10. 3개 모니터 상세 설계

### 10.1 HealthFactorMonitor (적응형 폴링)

**파일 위치:** `packages/daemon/src/services/monitoring/health-factor-monitor.ts`

**대상:** `defi_positions` 테이블의 `category='LENDING'`, `status='ACTIVE'` 포지션

**적응형 폴링 설계:**

재귀 `setTimeout` 사용 (`setInterval` 금지 — 폴링 간격이 동적으로 변경되므로):

```typescript
class HealthFactorMonitor implements IDeFiMonitor {
  readonly name = 'health-factor';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private currentSeverity: MonitorSeverity = 'SAFE';
  private cooldownMap = new Map<string, number>(); // key: walletId:positionId, value: last alert epoch ms
  private positionTracker: PositionTracker | null;

  // Severity → polling interval mapping (configurable)
  private intervals: Record<MonitorSeverity, number> = {
    SAFE: 300_000,       // 5 minutes
    WARNING: 60_000,     // 1 minute
    DANGER: 15_000,      // 15 seconds
    CRITICAL: 5_000,     // 5 seconds
  };

  // Health factor → severity threshold mapping (configurable)
  private thresholds = {
    safe: 2.0,           // > 2.0 = SAFE
    warning: 1.5,        // > 1.5 = WARNING
    danger: 1.2,         // > 1.2 = DANGER
                         // <= 1.2 = CRITICAL
  };

  getInterval(): number {
    return this.intervals[this.currentSeverity];
  }

  start(): void {
    this.scheduleNext();
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNext(): void {
    const interval = this.intervals[this.currentSeverity];
    this.timer = setTimeout(async () => {
      await this.checkAllPositions();
      this.scheduleNext(); // Re-schedule with potentially different interval
    }, interval);
    this.timer.unref(); // Don't block process exit
  }

  /**
   * Check all LENDING positions and determine worst severity.
   */
  private async checkAllPositions(): Promise<void> {
    const positions = this.sqlite
      .prepare("SELECT * FROM defi_positions WHERE category = 'LENDING' AND status = 'ACTIVE'")
      .all() as DefiPositionRow[];

    if (positions.length === 0) {
      this.currentSeverity = 'SAFE';
      return;
    }

    let worstSeverity: MonitorSeverity = 'SAFE';

    for (const position of positions) {
      try {
        const evaluation = this.evaluate(position);
        if (evaluation) {
          // Track worst severity across all positions
          if (severityRank(evaluation.severity) > severityRank(worstSeverity)) {
            worstSeverity = evaluation.severity;
          }
          // Emit alert (with cooldown check)
          this.emitAlert(evaluation);
        }
      } catch (err) {
        // Per-wallet error isolation (BalanceMonitorService pattern)
        console.error(`HealthFactorMonitor: error evaluating position ${position.id}:`, err);
      }
    }

    const previousSeverity = this.currentSeverity;
    this.currentSeverity = worstSeverity;

    // On-demand sync: DANGER/CRITICAL 진입 시 PositionTracker에 즉시 동기화 요청
    if (
      (worstSeverity === 'DANGER' || worstSeverity === 'CRITICAL') &&
      severityRank(worstSeverity) > severityRank(previousSeverity) &&
      this.positionTracker
    ) {
      void this.positionTracker.syncCategory('LENDING');
    }
  }
}
```

**severity 판정 기준:**

| Health Factor 범위 | Severity | 폴링 간격 |
|-------------------|----------|----------|
| > safe_threshold (2.0) | SAFE | 300,000ms (5분) |
| > warning_threshold (1.5) | WARNING | 60,000ms (1분) |
| > danger_threshold (1.2) | DANGER | 15,000ms (15초) |
| <= danger_threshold (1.2) | CRITICAL | 5,000ms (5초) |

**평가 로직 (`evaluate(position)`):**

```typescript
evaluate(position: DefiPositionRow): MonitorEvaluation | null {
  // Skip non-LENDING or non-ACTIVE positions
  if (position.category !== 'LENDING' || position.status !== 'ACTIVE') {
    return null;
  }

  // Extract health factor from metadata (Phase 268 LendingMetadata)
  const metadata = JSON.parse(position.metadata ?? '{}');
  const healthFactor = metadata.healthFactor;
  if (healthFactor == null) return null;

  // Determine severity
  let severity: MonitorSeverity;
  let threshold: number;
  if (healthFactor > this.thresholds.safe) {
    return null; // SAFE — no evaluation needed
  } else if (healthFactor > this.thresholds.warning) {
    severity = 'WARNING';
    threshold = this.thresholds.safe;
  } else if (healthFactor > this.thresholds.danger) {
    severity = 'DANGER';
    threshold = this.thresholds.warning;
  } else {
    severity = 'CRITICAL';
    threshold = this.thresholds.danger;
  }

  return {
    walletId: position.wallet_id,
    positionId: position.id,
    severity,
    value: healthFactor,
    threshold,
    message: `Health factor ${healthFactor.toFixed(2)} below ${threshold} threshold`,
  };
}
```

**알림 발생:**

| Severity | 알림 이벤트 | 배송 모드 | 쿨다운 |
|----------|-----------|----------|--------|
| WARNING | LIQUIDATION_WARNING | 일반 (defi_monitoring 카테고리) | cooldown_hours (4h) per walletId:positionId |
| DANGER | LIQUIDATION_WARNING | 일반 (defi_monitoring 카테고리) | cooldown_hours (4h) per walletId:positionId |
| CRITICAL | LIQUIDATION_IMMINENT | BROADCAST (security_alert 카테고리) | 쿨다운 없음 — 매 평가마다 발생 |

**쿨다운 맵:** `Map<string, number>` — key: `${walletId}:${positionId}`, value: last alert timestamp (ms)

```typescript
private emitAlert(evaluation: MonitorEvaluation): void {
  const cooldownKey = `${evaluation.walletId}:${evaluation.positionId}`;

  if (evaluation.severity === 'CRITICAL') {
    // CRITICAL: no cooldown — emit every evaluation
    this.notificationService.notify('LIQUIDATION_IMMINENT', evaluation.walletId, {
      healthFactor: evaluation.value.toFixed(2),
      threshold: evaluation.threshold.toFixed(2),
      provider: /* from position metadata */,
    });
  } else {
    // WARNING/DANGER: apply cooldown
    const lastAlert = this.cooldownMap.get(cooldownKey) ?? 0;
    const cooldownMs = this.cooldownHours * 3600 * 1000;
    if (Date.now() - lastAlert >= cooldownMs) {
      this.notificationService.notify('LIQUIDATION_WARNING', evaluation.walletId, {
        healthFactor: evaluation.value.toFixed(2),
        threshold: evaluation.threshold.toFixed(2),
        provider: /* from position metadata */,
      });
      this.cooldownMap.set(cooldownKey, Date.now());
    }
  }
}
```

**Recovery 감지:** severity가 SAFE로 복귀하면 해당 포지션의 쿨다운 키를 삭제 → 재악화 시 즉시 알림 가능.

### 10.2 MaturityMonitor (1일 고정 폴링)

**파일 위치:** `packages/daemon/src/services/monitoring/maturity-monitor.ts`

**대상:** `defi_positions` 테이블의 `category='YIELD'`, `status='ACTIVE'` 포지션

**고정 폴링:** `setInterval(86,400,000ms = 24시간)` + 시작 시 즉시 1회 실행

```typescript
class MaturityMonitor implements IDeFiMonitor {
  readonly name = 'maturity';
  private timer: ReturnType<typeof setInterval> | null = null;
  private cooldownMap = new Map<string, number>();

  // Configurable thresholds
  private config = {
    intervalMs: 86_400_000,        // 24 hours
    warningDaysFirst: 7,           // First alert at 7 days before maturity
    warningDaysFinal: 1,           // Final alert at 1 day before maturity
    unredeemedAlert: true,         // Alert for positions past maturity
  };

  getInterval(): number {
    return this.config.intervalMs; // Fixed value
  }

  start(): void {
    this.timer = setInterval(() => void this.checkAll(), this.config.intervalMs);
    this.timer.unref();
    void this.checkAll(); // Immediate first run
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
```

**평가 로직 (`evaluate(position)`):**

```typescript
evaluate(position: DefiPositionRow): MonitorEvaluation | null {
  // Skip non-YIELD or non-ACTIVE positions
  if (position.category !== 'YIELD' || position.status !== 'ACTIVE') {
    return null;
  }

  // Extract maturity from metadata (Phase 268 YieldMetadata)
  const metadata = JSON.parse(position.metadata ?? '{}');
  const maturityEpoch = metadata.maturity; // epoch seconds
  if (maturityEpoch == null) return null;

  const now = Date.now() / 1000; // current epoch seconds
  const MS_PER_DAY = 86_400;
  const daysRemaining = (maturityEpoch - now) / MS_PER_DAY;

  // Severity determination
  if (daysRemaining <= 0 && this.config.unredeemedAlert) {
    // Past maturity, not redeemed
    return {
      walletId: position.wallet_id,
      positionId: position.id,
      severity: 'CRITICAL',
      value: daysRemaining,
      threshold: 0,
      message: `Yield position past maturity by ${Math.abs(daysRemaining).toFixed(0)} days — unredeemed`,
    };
  } else if (daysRemaining <= this.config.warningDaysFinal) {
    // Final warning (1 day)
    return {
      walletId: position.wallet_id,
      positionId: position.id,
      severity: 'DANGER',
      value: daysRemaining,
      threshold: this.config.warningDaysFinal,
      message: `Yield position matures in ${daysRemaining.toFixed(1)} days`,
    };
  } else if (daysRemaining <= this.config.warningDaysFirst) {
    // First warning (7 days)
    return {
      walletId: position.wallet_id,
      positionId: position.id,
      severity: 'WARNING',
      value: daysRemaining,
      threshold: this.config.warningDaysFirst,
      message: `Yield position matures in ${daysRemaining.toFixed(0)} days`,
    };
  }

  return null; // SAFE — no alert needed
}
```

**알림 발생:**

| Severity | 알림 이벤트 | 설명 |
|----------|-----------|------|
| WARNING (7일 이내) | MATURITY_WARNING | 만기 접근 알림 |
| DANGER (1일 이내) | MATURITY_WARNING | 만기 최종 경고 |
| CRITICAL (만기 후 미상환) | MATURITY_WARNING | 미상환 경고 (LIQUIDATION_IMMINENT 아님 — 아래 DEC-MON-06 참조) |

**쿨다운:** 24h per-wallet:position. 1일 폴링이므로 자연적 쿨다운이 적용되지만, hot-reload로 폴링 간격이 줄어든 경우를 대비하여 명시적 쿨다운도 유지.

### 10.3 MarginMonitor (1분 고정 폴링)

**파일 위치:** `packages/daemon/src/services/monitoring/margin-monitor.ts`

**대상:** `defi_positions` 테이블의 `category='PERP'`, `status='ACTIVE'` 포지션

**고정 폴링:** `setInterval(60,000ms = 1분)` + 시작 시 즉시 1회 실행

```typescript
class MarginMonitor implements IDeFiMonitor {
  readonly name = 'margin';
  private timer: ReturnType<typeof setInterval> | null = null;
  private cooldownMap = new Map<string, number>();

  // Configurable thresholds
  private config = {
    intervalMs: 60_000,           // 1 minute
    warningRatio: 0.30,           // Warn when margin ratio < 30%
    criticalRatio: 0.15,          // CRITICAL when margin ratio < 15%
  };

  getInterval(): number {
    return this.config.intervalMs; // Fixed value
  }

  start(): void {
    this.timer = setInterval(() => void this.checkAll(), this.config.intervalMs);
    this.timer.unref();
    void this.checkAll(); // Immediate first run
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
```

**평가 로직 (`evaluate(position)`):**

```typescript
evaluate(position: DefiPositionRow): MonitorEvaluation | null {
  // Skip non-PERP or non-ACTIVE positions
  if (position.category !== 'PERP' || position.status !== 'ACTIVE') {
    return null;
  }

  // Extract margin data from metadata (Phase 268 PerpMetadata)
  const metadata = JSON.parse(position.metadata ?? '{}');
  const { margin, liquidationPrice, entryPrice } = metadata;
  if (margin == null) return null;

  // Calculate margin ratio (available margin / used margin)
  const usedMargin = metadata.margin ?? 0;
  const leverage = metadata.leverage ?? 1;
  const positionValue = parseFloat(position.amount) * (entryPrice ?? 0);
  const availableMargin = usedMargin - (positionValue / leverage);
  const marginRatio = usedMargin > 0 ? availableMargin / usedMargin : 1;

  // 1. Margin ratio severity
  let marginSeverity: MonitorSeverity = 'SAFE';
  if (marginRatio < this.config.criticalRatio) {
    marginSeverity = 'CRITICAL';
  } else if (marginRatio < this.config.warningRatio) {
    marginSeverity = 'WARNING';
  }

  // 2. Liquidation price proximity severity
  let liquidationSeverity: MonitorSeverity = 'SAFE';
  if (liquidationPrice != null && entryPrice != null) {
    // Estimate current price from latest position data
    const currentPrice = entryPrice; // PositionTracker updates with latest price
    const priceDistance = Math.abs(currentPrice - liquidationPrice) / currentPrice;
    if (priceDistance < 0.05) { // Within 5% of liquidation price
      liquidationSeverity = 'CRITICAL';
    }
  }

  // Final severity = max(margin ratio severity, liquidation price severity)
  const finalSeverity = severityRank(marginSeverity) >= severityRank(liquidationSeverity)
    ? marginSeverity : liquidationSeverity;

  if (finalSeverity === 'SAFE') return null;

  return {
    walletId: position.wallet_id,
    positionId: position.id,
    severity: finalSeverity,
    value: marginRatio,
    threshold: finalSeverity === 'CRITICAL' ? this.config.criticalRatio : this.config.warningRatio,
    message: `Margin ratio ${(marginRatio * 100).toFixed(1)}% ${
      finalSeverity === 'CRITICAL' ? 'at critical level' : 'below warning threshold'
    }`,
  };
}
```

**이중 판정 로직:**

| 판정 기준 | WARNING 조건 | CRITICAL 조건 |
|-----------|-------------|--------------|
| Margin Ratio | marginRatio < 0.30 (30%) | marginRatio < 0.15 (15%) |
| Liquidation Price | - | 현재 가격이 청산 가격의 5% 이내 |
| 최종 severity | max(margin severity, liquidation severity) | 둘 중 하나만 CRITICAL이면 CRITICAL |

**알림 발생:**

| Severity | 알림 이벤트 | 배송 모드 | 쿨다운 |
|----------|-----------|----------|--------|
| WARNING | MARGIN_WARNING | 일반 (defi_monitoring) | cooldown_hours (4h) per walletId:positionId |
| CRITICAL | LIQUIDATION_IMMINENT | BROADCAST (security_alert) | 쿨다운 없음 |

### 10.4 설계 결정

| ID | 결정 | 선택 | 근거 |
|----|------|------|------|
| DEC-MON-05 | 적응형 vs 고정 폴링 | HealthFactorMonitor만 적응형 폴링, MaturityMonitor/MarginMonitor는 고정 폴링 | 폴링 빈도가 상태에 따라 극적으로 변하는 것은 health factor뿐 (5분 → 5초, 60배 차이). MaturityMonitor는 1일 고정 (만기는 느리게 변화). MarginMonitor는 1분 고정 (시장 가격은 지속적으로 변동하므로 일정 간격 유지가 적절) |
| DEC-MON-06 | MaturityMonitor CRITICAL 알림 이벤트 | MATURITY_WARNING 사용 (LIQUIDATION_IMMINENT 아님) | 만기 미상환은 즉시 자금 손실이 아니라 기회 비용 손실. PT/YT 만기 후에도 상환 가능(다만 불리한 조건). LIQUIDATION_IMMINENT는 청산에 의한 즉시 자금 손실 위험에만 사용하여 의미적 일관성 유지 |
| DEC-MON-07 | MarginMonitor 판정 기준 | margin ratio + liquidation price 이중 판정 | margin ratio만으로는 마진이 충분해 보여도 가격이 청산 가격에 급접근한 경우를 놓침. liquidation price 근접도만으로는 마진 추가로 안전해진 경우를 과탐지. 둘 중 하나만 위험해도 경고하는 것이 보수적(안전) 전략 |
| DEC-MON-08 | CRITICAL 알림 쿨다운 | 쿨다운 미적용 — 매 평가마다 발생 | 임박한 위험(LIQUIDATION_IMMINENT)은 반복 알림이 사용자의 즉시 행동을 유도하는 것이 알림 피로보다 중요. BalanceMonitorService CRITICAL 패턴과 동일. BROADCAST_EVENTS 배송으로 모든 채널에 동시 전달 |

### 10.5 공통 유틸리티

**severityRank 함수:**

```typescript
// packages/core/src/interfaces/defi-monitor.types.ts (함께 정의)

/** Numeric rank for severity comparison (higher = worse) */
export function severityRank(severity: MonitorSeverity): number {
  const ranks: Record<MonitorSeverity, number> = {
    SAFE: 0,
    WARNING: 1,
    DANGER: 2,
    CRITICAL: 3,
  };
  return ranks[severity];
}
```

---

## 11. 알림 이벤트 통합

### 11.1 4개 신규 NotificationEventType

| 이벤트 | 발생 모니터 | 설명 |
|--------|-----------|------|
| `LIQUIDATION_WARNING` | HealthFactorMonitor | Lending health factor가 warning/danger 임계값 이하. severity WARNING/DANGER에서 발생 |
| `MATURITY_WARNING` | MaturityMonitor | Yield 포지션 만기 접근 (7일/1일 전) 또는 만기 후 미상환 |
| `MARGIN_WARNING` | MarginMonitor | Perp 마진 비율이 warning 임계값(30%) 이하 |
| `LIQUIDATION_IMMINENT` | HealthFactorMonitor / MarginMonitor | Lending health factor CRITICAL 또는 Perp 마진 비율 CRITICAL. 즉시 자금 손실 위험 |

**추가 위치:** `packages/core/src/enums/notification.ts` NOTIFICATION_EVENT_TYPES 배열 끝부분 (기존 44개 → 48개)

```typescript
export const NOTIFICATION_EVENT_TYPES = [
  // ... existing 44 events ...
  'LIQUIDATION_WARNING',      // DeFi: lending health factor below threshold
  'MATURITY_WARNING',         // DeFi: yield position approaching maturity
  'MARGIN_WARNING',           // DeFi: perp margin below maintenance level
  'LIQUIDATION_IMMINENT',     // DeFi: perp/lending at immediate liquidation risk
] as const;
```

이 배열이 Zod enum(`NotificationEventTypeEnum`), DB CHECK constraint, i18n 키의 SSoT이다. 배열에 추가하면 하위 의존 체인이 자동으로 48개 이벤트를 인식한다.

### 11.2 EVENT_CATEGORY_MAP 확장

**파일:** `packages/core/src/schemas/signing-protocol.ts`

**새로운 카테고리 `'defi_monitoring'` 추가:**

```typescript
export const NOTIFICATION_CATEGORIES = [
  'transaction',
  'policy',
  'security_alert',
  'session',
  'owner',
  'system',
  'defi_monitoring',   // NEW: DeFi position monitoring alerts
] as const;
```

기존 6개 → 7개 카테고리. `NotificationCategory` 타입이 자동으로 7개 값을 포함한다.

**EVENT_CATEGORY_MAP 확장 (4개 매핑 추가):**

```typescript
export const EVENT_CATEGORY_MAP: Record<NotificationEventType, NotificationCategory> = {
  // ... existing 44 mappings ...
  LIQUIDATION_WARNING: 'defi_monitoring',
  MATURITY_WARNING: 'defi_monitoring',
  MARGIN_WARNING: 'defi_monitoring',
  LIQUIDATION_IMMINENT: 'security_alert',     // 의도적: 아래 근거 참조
};
```

**`LIQUIDATION_IMMINENT`를 `security_alert`에 매핑하는 근거:**
- 임박한 자금 손실은 보안 사건과 동급의 긴급도
- `security_alert` 카테고리는 `BROADCAST_EVENTS`와 결합하여 모든 알림 채널(ntfy, Telegram, push relay, wallet app)에 동시 배송
- KILL_SWITCH_ACTIVATED, TX_INCOMING_SUSPICIOUS와 동일 수준의 전파 범위
- 다른 3개 DeFi 이벤트(WARNING 수준)는 `defi_monitoring` 카테고리로 일반 배송

### 11.3 EVENT_DESCRIPTIONS 확장

**파일:** `packages/core/src/schemas/signing-protocol.ts`

```typescript
export const EVENT_DESCRIPTIONS: Record<NotificationEventType, string> = {
  // ... existing 44 descriptions ...
  LIQUIDATION_WARNING: 'DeFi lending position health factor below warning threshold',
  MATURITY_WARNING: 'DeFi yield position approaching or past maturity',
  MARGIN_WARNING: 'DeFi perpetual position margin below warning threshold',
  LIQUIDATION_IMMINENT: 'DeFi position at immediate liquidation risk',
};
```

### 11.4 i18n 메시지 템플릿

**영문 (`packages/core/src/i18n/en.ts`):**

```typescript
LIQUIDATION_WARNING: {
  title: 'Liquidation Risk Warning',
  body: '{walletName} lending position on {provider} has health factor {healthFactor} (threshold: {threshold}). Consider adding collateral or repaying debt.',
},
MATURITY_WARNING: {
  title: 'Maturity Warning',
  body: '{walletName} yield position on {provider} matures in {daysRemaining} days (maturity: {maturityDate}). Redeem before maturity to avoid penalties.',
},
MARGIN_WARNING: {
  title: 'Margin Warning',
  body: '{walletName} perp position on {provider} margin ratio at {marginRatio}% (maintenance: {maintenanceMargin}%). Add margin to avoid liquidation.',
},
LIQUIDATION_IMMINENT: {
  title: 'LIQUIDATION IMMINENT',
  body: '{walletName} position on {provider} at immediate liquidation risk. Health factor: {healthFactor}, Liquidation price: {liquidationPrice}. Take action NOW.',
},
```

**한글 (`packages/core/src/i18n/ko.ts`):**

```typescript
LIQUIDATION_WARNING: {
  title: '청산 위험 경고',
  body: '{walletName} {provider} 대출 포지션 헬스 팩터 {healthFactor} (임계값: {threshold}). 담보 추가 또는 부채 상환을 고려하세요.',
},
MATURITY_WARNING: {
  title: '만기 경고',
  body: '{walletName} {provider} 수익률 포지션이 {daysRemaining}일 후 만기입니다 (만기일: {maturityDate}). 만기 전 상환하세요.',
},
MARGIN_WARNING: {
  title: '마진 경고',
  body: '{walletName} {provider} 무기한 선물 포지션 마진 비율 {marginRatio}% (유지 마진: {maintenanceMargin}%). 마진 추가로 청산을 방지하세요.',
},
LIQUIDATION_IMMINENT: {
  title: '청산 임박',
  body: '{walletName} {provider} 포지션 즉시 청산 위험. 헬스 팩터: {healthFactor}, 청산 가격: {liquidationPrice}. 즉시 조치하세요.',
},
```

### 11.5 BROADCAST_EVENTS 확장

**파일:** `packages/daemon/src/notifications/notification-service.ts`

```typescript
const BROADCAST_EVENTS: Set<string> = new Set([
  'KILL_SWITCH_ACTIVATED',
  'KILL_SWITCH_RECOVERED',
  'AUTO_STOP_TRIGGERED',
  'TX_INCOMING_SUSPICIOUS',
  'LIQUIDATION_IMMINENT',     // NEW: critical DeFi risk, broadcast to all channels
]);
```

기존 4개 → 5개 BROADCAST 이벤트. `LIQUIDATION_IMMINENT`는 KILL_SWITCH_ACTIVATED, TX_INCOMING_SUSPICIOUS와 동급의 긴급도로 모든 알림 채널(ntfy, Telegram, push relay, wallet app)에 동시 배송된다.

### 11.6 알림 쿨다운 전략

**쿨다운 키:** `${walletId}:${positionId}` 복합 키 (per-wallet:position)

BalanceMonitorService는 per-wallet 쿨다운이지만, DeFi 모니터는 같은 지갑에 여러 포지션이 있으므로 per-position 쿨다운 필요. 한 포지션의 쿨다운이 같은 지갑의 다른 위험 포지션 알림을 차단하면 안 된다.

| Severity | 쿨다운 | 근거 |
|----------|--------|------|
| WARNING | `cooldown_hours` (기본 4시간) 적용 | 알림 피로 방지. 상태가 안정적이므로 반복 불필요 |
| DANGER | `cooldown_hours` (기본 4시간) 적용 | WARNING과 동일. 위험하지만 즉시 청산은 아님 |
| CRITICAL | 쿨다운 미적용 (매 평가마다 발생) | 임박한 위험은 반복 알림이 사용자 행동 유도에 필수 |

**Recovery 감지:** severity가 SAFE로 복귀하면 쿨다운 맵에서 해당 키 삭제. 재악화 시 쿨다운 없이 즉시 알림 발생.

### 11.7 SSoT 체인 업데이트 체크리스트

구현 마일스톤에서 아래 5개 파일을 모두 업데이트해야 한다. 하나라도 누락되면 타입 에러 또는 테스트 실패 발생:

- [ ] `packages/core/src/enums/notification.ts` — NOTIFICATION_EVENT_TYPES 배열에 4개 추가 (44 → 48개)
- [ ] `packages/core/src/schemas/signing-protocol.ts` — NOTIFICATION_CATEGORIES에 `'defi_monitoring'` 추가 (6 → 7개), EVENT_CATEGORY_MAP에 4개 매핑 추가, EVENT_DESCRIPTIONS에 4개 추가
- [ ] `packages/core/src/i18n/en.ts` — 4개 영문 메시지 템플릿 (title + body)
- [ ] `packages/core/src/i18n/ko.ts` — 4개 한글 메시지 템플릿 (title + body)
- [ ] `packages/daemon/src/notifications/notification-service.ts` — BROADCAST_EVENTS에 `LIQUIDATION_IMMINENT` 추가 (4 → 5개)

**자동 검증:** 기존 테스트 `signing-protocol.test.ts`가 모든 이벤트에 카테고리 매핑이 있는지 검증. 48개 이벤트에 매핑이 완전하면 자동 통과.

### 11.8 설계 결정

| ID | 결정 | 선택 | 근거 |
|----|------|------|------|
| DEC-MON-09 | LIQUIDATION_IMMINENT 카테고리 | `security_alert` + BROADCAST_EVENTS | 즉시 자금 손실 가능성은 보안 사건(KILL_SWITCH, TX_INCOMING_SUSPICIOUS)과 동급. security_alert 카테고리 + BROADCAST 조합으로 모든 채널에 동시 배송. defi_monitoring에 넣으면 일반 배송으로 긴급도가 낮아짐 |
| DEC-MON-10 | 신규 카테고리 추가 | `defi_monitoring` 카테고리 신설 | DeFi 알림을 기존 6개 카테고리에 혼합하면 Admin UI에서 DeFi 알림만 필터링 불가. transaction에 넣으면 실제 트랜잭션 알림과 혼동. system에 넣으면 인프라 알림과 혼동. 독립 카테고리가 필터링/관리에 최적 |
| DEC-MON-11 | 쿨다운 키 구성 | `walletId:positionId` 복합 키 | BalanceMonitorService의 per-wallet 쿨다운은 지갑당 잔액이 하나이므로 적절. DeFi는 한 지갑에 복수 포지션 → per-wallet 쿨다운은 다른 포지션의 위험 알림을 차단함. per-position 쿨다운으로 각 포지션이 독립적으로 알림 |
| DEC-MON-12 | CRITICAL 쿨다운 정책 | 쿨다운 미적용 | 반복 알림이 사용자의 즉시 행동(담보 추가, 마진 추가, 포지션 종료)을 유도하는 것이 알림 피로보다 중요. 자산 손실 가능성 앞에서 알림 피로는 수용 가능한 트레이드오프. BROADCAST 배송으로 모든 채널에 도달 보장 |

---

## 12. 설정 구조 + 라이프사이클

### 12.1 config.toml [monitoring] 섹션

플랫 키 규칙 준수 (CLAUDE.md: "No nesting in config.toml (daemon)"). 17개 키를 `[monitoring]` 섹션에 플랫하게 배치한다.

```toml
[monitoring]
# Global toggle
enabled = true

# HealthFactorMonitor — adaptive polling thresholds
health_factor_safe_threshold = 2.0         # above this = SAFE (5min poll)
health_factor_warning_threshold = 1.5      # above this = WARNING (1min poll)
health_factor_danger_threshold = 1.2       # above this = DANGER (15s poll)
# below danger = CRITICAL (5s poll)

# HealthFactorMonitor — polling intervals (seconds)
health_factor_safe_interval = 300          # 5 minutes
health_factor_warning_interval = 60        # 1 minute
health_factor_danger_interval = 15         # 15 seconds
health_factor_critical_interval = 5        # 5 seconds

# MaturityMonitor — fixed polling
maturity_check_interval = 86400            # 24 hours (seconds)
maturity_warning_days_first = 7            # first alert at 7 days before maturity
maturity_warning_days_final = 1            # final alert at 1 day before maturity
maturity_unredeemed_alert = true           # alert if position not redeemed after maturity

# MarginMonitor — fixed polling
margin_check_interval = 60                 # 1 minute (seconds)
margin_warning_ratio = 0.3                 # warn when margin ratio < 30%
margin_critical_ratio = 0.15              # LIQUIDATION_IMMINENT when margin ratio < 15%

# Shared cooldown
cooldown_hours = 4                         # duplicate alert suppression window (hours)
```

**17개 키 전체 명세:**

| # | 키 | 타입 | 기본값 | 범위 | 용도 |
|---|-----|------|--------|------|------|
| 1 | `enabled` | boolean | true | - | 전체 모니터링 활성화/비활성화 |
| 2 | `health_factor_safe_threshold` | number | 2.0 | 1.0~10.0 | SAFE 임계값 (이상이면 안전) |
| 3 | `health_factor_warning_threshold` | number | 1.5 | 1.0~10.0 | WARNING 임계값 |
| 4 | `health_factor_danger_threshold` | number | 1.2 | 1.0~10.0 | DANGER 임계값 |
| 5 | `health_factor_safe_interval` | int (sec) | 300 | 10~3600 | SAFE 폴링 간격 |
| 6 | `health_factor_warning_interval` | int (sec) | 60 | 5~300 | WARNING 폴링 간격 |
| 7 | `health_factor_danger_interval` | int (sec) | 15 | 3~60 | DANGER 폴링 간격 |
| 8 | `health_factor_critical_interval` | int (sec) | 5 | 1~30 | CRITICAL 폴링 간격 |
| 9 | `maturity_check_interval` | int (sec) | 86400 | 3600~604800 | 만기 체크 주기 |
| 10 | `maturity_warning_days_first` | int | 7 | 1~30 | 첫 경고 기준일 |
| 11 | `maturity_warning_days_final` | int | 1 | 1~7 | 최종 경고 기준일 |
| 12 | `maturity_unredeemed_alert` | boolean | true | - | 만기 후 미상환 경고 |
| 13 | `margin_check_interval` | int (sec) | 60 | 10~3600 | 마진 체크 주기 |
| 14 | `margin_warning_ratio` | number | 0.3 | 0.05~0.5 | WARNING 마진 비율 임계값 |
| 15 | `margin_critical_ratio` | number | 0.15 | 0.01~0.3 | CRITICAL 마진 비율 임계값 |
| 16 | `cooldown_hours` | int | 4 | 1~48 | 쿨다운 시간 (시간 단위) |

**제약 조건 (런타임 검증):**
- `health_factor_safe_threshold > health_factor_warning_threshold > health_factor_danger_threshold` (threshold 순서 보장)
- `margin_warning_ratio > margin_critical_ratio` (WARNING이 CRITICAL보다 높아야 함)
- `maturity_warning_days_first >= maturity_warning_days_final` (첫 경고가 최종 경고 이전)

### 12.2 DaemonConfigSchema Zod 확장

**파일:** `packages/daemon/src/infrastructure/config/loader.ts`

```typescript
// DaemonConfigSchema 내 monitoring 섹션 추가
monitoring: z
  .object({
    enabled: z.boolean().default(true),
    health_factor_safe_threshold: z.number().min(1).max(10).default(2.0),
    health_factor_warning_threshold: z.number().min(1).max(10).default(1.5),
    health_factor_danger_threshold: z.number().min(1).max(10).default(1.2),
    health_factor_safe_interval: z.number().int().min(10).max(3600).default(300),
    health_factor_warning_interval: z.number().int().min(5).max(300).default(60),
    health_factor_danger_interval: z.number().int().min(3).max(60).default(15),
    health_factor_critical_interval: z.number().int().min(1).max(30).default(5),
    maturity_check_interval: z.number().int().min(3600).max(604800).default(86400),
    maturity_warning_days_first: z.number().int().min(1).max(30).default(7),
    maturity_warning_days_final: z.number().int().min(1).max(7).default(1),
    maturity_unredeemed_alert: z.boolean().default(true),
    margin_check_interval: z.number().int().min(10).max(3600).default(60),
    margin_warning_ratio: z.number().min(0.05).max(0.5).default(0.3),
    margin_critical_ratio: z.number().min(0.01).max(0.3).default(0.15),
    cooldown_hours: z.number().int().min(1).max(48).default(4),
  })
  .default({}),
```

모든 키에 `.default()` 적용. `[monitoring]` 섹션이 없어도 기본값으로 동작한다.

**KNOWN_SECTIONS 확장:**

```typescript
const KNOWN_SECTIONS = [
  // ... existing 12 sections ...
  'monitoring',
] as const;
```

기존 12개 → 13개. `detectNestedSections()` 검증이 `[monitoring]`을 허용하도록 한다.

**환경 변수 패턴:** `WAIAAS_MONITORING_{KEY}` 형식

| 환경 변수 | 설명 |
|-----------|------|
| `WAIAAS_MONITORING_ENABLED` | 모니터링 전체 토글 |
| `WAIAAS_MONITORING_HEALTH_FACTOR_SAFE_THRESHOLD` | SAFE 임계값 |
| `WAIAAS_MONITORING_COOLDOWN_HOURS` | 쿨다운 시간 |
| ... | (17개 키 각각에 대응) |

### 12.3 Admin Settings 키 등록

SettingsService에 등록하여 Admin UI에서 데몬 재시작 없이 실시간 변경 가능한 키 목록:

**핫 리로드 가능 키 (17개 전부):**

| 키 | 타입 | Admin UI 표시 |
|----|------|--------------|
| `monitoring.enabled` | boolean | DeFi Monitoring toggle |
| `monitoring.health_factor_safe_threshold` | number | Health Factor Safe Threshold |
| `monitoring.health_factor_warning_threshold` | number | Health Factor Warning Threshold |
| `monitoring.health_factor_danger_threshold` | number | Health Factor Danger Threshold |
| `monitoring.health_factor_safe_interval` | number | Safe Polling Interval (seconds) |
| `monitoring.health_factor_warning_interval` | number | Warning Polling Interval (seconds) |
| `monitoring.health_factor_danger_interval` | number | Danger Polling Interval (seconds) |
| `monitoring.health_factor_critical_interval` | number | Critical Polling Interval (seconds) |
| `monitoring.maturity_check_interval` | number | Maturity Check Interval (seconds) |
| `monitoring.maturity_warning_days_first` | number | First Maturity Warning (days) |
| `monitoring.maturity_warning_days_final` | number | Final Maturity Warning (days) |
| `monitoring.maturity_unredeemed_alert` | boolean | Unredeemed Position Alert |
| `monitoring.margin_check_interval` | number | Margin Check Interval (seconds) |
| `monitoring.margin_warning_ratio` | number | Margin Warning Ratio |
| `monitoring.margin_critical_ratio` | number | Margin Critical Ratio |
| `monitoring.cooldown_hours` | number | Alert Cooldown (hours) |

모든 17개 키를 핫 리로드 지원한다. `updateConfig()`가 호출되면 각 모니터가 자체 interval/threshold를 갱신하며, interval 변경은 다음 폴링 사이클부터 적용된다 (BalanceMonitorService `updateConfig` 패턴).

**폴링 간격 핫 리로드 메커니즘:**
- HealthFactorMonitor: 재귀 setTimeout이므로 다음 `scheduleNext()` 호출 시 새 간격 적용 (자연스러운 전환)
- MaturityMonitor/MarginMonitor: `updateConfig()` 내에서 clearInterval → setInterval(새 간격)으로 타이머 재생성

### 12.4 HotReloadOrchestrator 확장

**파일:** `packages/daemon/src/infrastructure/settings/hot-reload.ts`

```typescript
/**
 * Reload DeFi monitoring configuration from Admin Settings.
 * Follows reloadBalanceMonitor() pattern (duck-typed service deps).
 */
async reloadDeFiMonitors(): Promise<void> {
  if (!this.defiMonitorService) return;

  const settings = this.settingsService.getAll();
  const monitoringConfig: Record<string, unknown> = {};

  // Extract monitoring.* keys from settings
  for (const [key, value] of Object.entries(settings)) {
    if (key.startsWith('monitoring.')) {
      const configKey = key.replace('monitoring.', '');
      monitoringConfig[configKey] = value;
    }
  }

  if (Object.keys(monitoringConfig).length > 0) {
    this.defiMonitorService.updateConfig(monitoringConfig);
    console.debug('HotReloadOrchestrator: DeFi monitoring config reloaded');
  }
}
```

**변경 감지:** settings 변경 이벤트 시 `monitoring.*` 프리픽스 키가 포함되면 `reloadDeFiMonitors()` 트리거. 기존 `reloadBalanceMonitor()` 호출 지점에 병렬 추가.

### 12.5 DaemonLifecycle 연동

**시작: Step 4c-11** (PositionTracker 이후, fail-soft)

```typescript
// packages/daemon/src/lifecycle/daemon.ts

// Step 4c-11: DeFi Monitor Service (fail-soft)
// Placed after PositionTracker — monitors read defi_positions data
try {
  if (this.sqlite && this._settingsService) {
    const monitoringEnabled = this._settingsService.get('monitoring.enabled');
    if (monitoringEnabled !== 'false') {
      const { DeFiMonitorService } = await import(
        '../services/monitoring/defi-monitor-service.js'
      );
      this.defiMonitorService = new DeFiMonitorService({
        sqlite: this.sqlite,
        notificationService: this.notificationService!,
        settingsService: this._settingsService,
        config: this._config!.monitoring,
        positionTracker: this.positionTracker ?? undefined,
      });
      this.defiMonitorService.start();
      console.debug('Step 4c-11: DeFi monitor service started');
    }
  }
} catch (err) {
  console.warn('Step 4c-11 (fail-soft): DeFi monitor init warning:', err);
  this.defiMonitorService = null;
}
```

**정지: EventBus cleanup 이전**

```typescript
// Shutdown sequence (before EventBus cleanup)
if (this.defiMonitorService) {
  this.defiMonitorService.stop();
  this.defiMonitorService = null;
  console.debug('DeFiMonitorService stopped');
}
```

**조건:** `sqlite && settingsService && config.monitoring.enabled !== false`
- sqlite: DB에서 defi_positions 읽기 필요
- settingsService: Admin Settings 핫 리로드 연동
- monitoring.enabled: 전체 토글 (config.toml 또는 Admin Settings에서 false로 설정 시 스킵)

**PositionTracker 의존 관계:**
- 모니터가 defi_positions 테이블에서 데이터를 읽으므로 PositionTracker가 먼저 시작되어야 함
- Step 4c-10 (PositionTracker/AsyncPollingService) → Step 4c-11 (DeFiMonitorService) 순서
- PositionTracker가 실패해도 DeFiMonitorService는 시작 가능 (테이블에 데이터가 없을 뿐, 에러는 아님)

**fail-soft 패턴:**
- DeFiMonitorService 생성/시작 실패 시 console.warn + defiMonitorService = null
- 다른 서비스(API, 인증, 트랜잭션)에 영향 없음
- 기존 BalanceMonitorService (Step 4c-4), IncomingTxMonitorService (Step 4c-9)와 동일 패턴

### 12.6 설계 결정

| ID | 결정 | 선택 | 근거 |
|----|------|------|------|
| DEC-MON-13 | config.toml 구조 | `[monitoring]` 섹션 17개 플랫 키 | CLAUDE.md 규칙 "No nesting in config.toml (daemon)" 준수. `[monitoring.health_factor]` 등의 네스팅은 `detectNestedSections()` 검증에서 거부됨 |
| DEC-MON-14 | KNOWN_SECTIONS 등록 | `'monitoring'` 추가 필수 | 미등록 시 `Unknown config section '[monitoring]'` 에러로 데몬 시작 실패. 기존 12개 → 13개 |
| DEC-MON-15 | Admin Settings 핫 리로드 범위 | 임계값 + 폴링 간격 모두 지원 (17개 전부) | BalanceMonitorService의 `updateConfig()` 패턴으로 다음 폴링 사이클부터 적용. 폴링 간격 변경도 타이머 재생성(clearInterval → setInterval)으로 처리 가능. 데몬 재시작 불필요 |
| DEC-MON-16 | DaemonLifecycle 배치 | Step 4c-11 (PositionTracker 이후) | 모니터가 defi_positions 테이블에서 데이터를 읽으므로 PositionTracker가 데이터를 준비한 후 시작. fail-soft로 실패해도 다른 서비스 영향 없음 |

---

## 13. ILendingProvider 인터페이스

### 13.1 인터페이스 정의

ILendingProvider는 IActionProvider를 확장하여 lending-specific 쿼리 메서드 3개를 추가한다. 기존 IActionProvider의 `metadata`, `actions`, `resolve()` 를 상속하며, lending 포지션 조회/헬스 팩터/시장 정보를 위한 메서드를 정의한다.

**파일:** `packages/core/src/interfaces/lending-provider.types.ts`
**Re-export:** `packages/core/src/interfaces/index.ts`

```typescript
import type { IActionProvider, ActionContext } from './action-provider.types.js';

export interface ILendingProvider extends IActionProvider {
  /** 지갑의 현재 lending 포지션 조회 (API/AI 에이전트용 상세 타입) */
  getPosition(walletId: string, context: ActionContext): Promise<LendingPositionSummary[]>;

  /** 지갑의 health factor (담보/차입 비율) 조회 */
  getHealthFactor(walletId: string, context: ActionContext): Promise<HealthFactor>;

  /** 사용 가능한 lending 시장 목록 조회 */
  getMarkets(chain: string, network?: string): Promise<MarketInfo[]>;
}
```

**쿼리 메서드 3개:**

| 메서드 | 반환 타입 | 용도 |
|--------|-----------|------|
| `getPosition(walletId, context)` | `LendingPositionSummary[]` | 지갑의 현재 lending 포지션 (supply/borrow) 상세 정보 |
| `getHealthFactor(walletId, context)` | `HealthFactor` | 담보/차입 비율, LTV, 위험 상태 판단 |
| `getMarkets(chain, network?)` | `MarketInfo[]` | AI 에이전트가 사용 가능한 시장 탐색 |

### 13.2 ActionDefinition 4개

ILendingProvider는 4개의 표준 lending 액션을 정의한다. 각 액션의 입력 스키마와 위험 수준, 기본 승인 티어를 명세한다.

| 액션 | 입력 스키마 | risk | defaultTier | 설명 |
|------|-------------|------|-------------|------|
| `supply` | `{ asset: CAIP-19, amount: string, onBehalfOf?: address }` | medium | DELAY | 담보/공급 자산 예치 |
| `borrow` | `{ asset: CAIP-19, amount: string, interestRateMode?: 1\|2 (default 2=variable) }` | high | APPROVAL | 담보 대비 자산 차입 |
| `repay` | `{ asset: CAIP-19, amount: string, interestRateMode?: number }` | low | INSTANT | 차입 금액 상환 |
| `withdraw` | `{ asset: CAIP-19, amount: string, to?: address }` | medium | DELAY | 예치 자산 인출 |

**입력 스키마 상세:**

```typescript
// Zod SSoT: LendingActionInputSchemas
const SupplyInputSchema = z.object({
  asset: z.string().describe('CAIP-19 asset identifier'),
  amount: z.string().describe('Human-readable amount (e.g., "100.5")'),
  onBehalfOf: z.string().optional().describe('Supply on behalf of another address'),
});

const BorrowInputSchema = z.object({
  asset: z.string().describe('CAIP-19 asset identifier'),
  amount: z.string().describe('Human-readable amount'),
  interestRateMode: z.union([z.literal(1), z.literal(2)]).default(2)
    .describe('1=stable (deprecated), 2=variable (default)'),
});

const RepayInputSchema = z.object({
  asset: z.string().describe('CAIP-19 asset identifier'),
  amount: z.string().describe('Human-readable amount or "MAX" for full repay'),
  interestRateMode: z.number().optional(),
});

const WithdrawInputSchema = z.object({
  asset: z.string().describe('CAIP-19 asset identifier'),
  amount: z.string().describe('Human-readable amount or "MAX" for full withdraw'),
  to: z.string().optional().describe('Withdraw to different address'),
});
```

**resolve() 반환 타입:**
- `resolve()` → `ContractCallRequest | ContractCallRequest[]`
- 단일 트랜잭션: repay, withdraw, borrow
- 멀티 트랜잭션: supply (approve + supply), borrow (일부 프로토콜에서 approve 필요)
- LidoStaking의 approve + requestWithdrawals 패턴과 동일

**각 액션의 chain은 프로바이더별로 설정:**
- Aave V3 / Morpho Blue: `chain: 'evm'`
- Kamino: `chain: 'solana'`

### 13.3 IPositionProvider 동시 구현 패턴

각 lending 프로바이더 클래스는 `ILendingProvider`와 `IPositionProvider` (Phase 268)를 동시에 구현한다. 두 인터페이스는 동일한 RPC 호출을 공유하지만 반환 타입이 목적에 따라 다르다.

| 인터페이스 | 메서드 | 반환 타입 | 용도 |
|-----------|--------|-----------|------|
| `IPositionProvider` | `getPositions(walletId)` | `PositionUpdate[]` | PositionTracker 쓰기 큐 (defi_positions 테이블 갱신) |
| `ILendingProvider` | `getPosition(walletId, context)` | `LendingPositionSummary[]` | REST API / AI 에이전트 응답 (상세 정보) |

**구현 패턴 예시:**

```typescript
class AaveV3Provider implements ILendingProvider, IPositionProvider {
  // IActionProvider (ILendingProvider 경유 상속)
  readonly metadata: ActionProviderMetadata = { name: 'aave_v3', ... };
  readonly actions: readonly ActionDefinition[] = [
    { name: 'supply', inputSchema: SupplyInputSchema, risk: 'medium', defaultTier: 'DELAY' },
    { name: 'borrow', inputSchema: BorrowInputSchema, risk: 'high', defaultTier: 'APPROVAL' },
    { name: 'repay', inputSchema: RepayInputSchema, risk: 'low', defaultTier: 'INSTANT' },
    { name: 'withdraw', inputSchema: WithdrawInputSchema, risk: 'medium', defaultTier: 'DELAY' },
  ];
  async resolve(actionName, params, context): Promise<ContractCallRequest | ContractCallRequest[]> { ... }

  // ILendingProvider 쿼리 메서드
  async getPosition(walletId, context): Promise<LendingPositionSummary[]> { ... }
  async getHealthFactor(walletId, context): Promise<HealthFactor> { ... }
  async getMarkets(chain, network?): Promise<MarketInfo[]> { ... }

  // IPositionProvider (PositionTracker 연동)
  async getPositions(walletId): Promise<PositionUpdate[]> { ... }
  getProviderName(): string { return 'aave_v3'; }
  getSupportedCategories(): PositionCategory[] { return ['LENDING']; }
}
```

**동일 RPC 호출, 다른 반환 타입:**
- `getUserAccountData()` (Aave) → `PositionUpdate[]` (PositionTracker용) + `LendingPositionSummary[]` (API용)
- 내부적으로 공유 메서드(`_fetchRawPositions()`)가 RPC 결과를 캐시하고, 각 인터페이스 메서드가 필요한 형태로 변환

### 13.4 설계 결정

| ID | 결정 | 선택 | 근거 |
|----|------|------|------|
| DEC-LEND-01 | ILendingProvider 상속 구조 | IActionProvider를 extends (별도 인터페이스 아님) | resolve()를 같은 클래스에 유지하여 6-stage pipeline에 자연스럽게 통합. 별도 인터페이스면 resolve() 연결에 추가 배선 필요 |
| DEC-LEND-02 | 쿼리 메서드 배치 | ILendingProvider에 직접 3개 쿼리 메서드 추가 | 별도 서비스를 통한 간접 참조 회피. 프로바이더가 자체 데이터를 가장 잘 알고 있으므로 메서드를 직접 제공 |
| DEC-LEND-03 | borrow 기본 이자율 모드 | interestRateMode=2 (variable) 기본값 | Aave V3 stable rate가 대부분 시장에서 deprecated. variable이 안전한 기본값. stable(1) 옵션은 유지하되 명시적 선택 필요 |
| DEC-LEND-04 | resolve() 반환 타입 | `ContractCallRequest \| ContractCallRequest[]` | multi-step approve+supply 패턴 지원 (LidoStaking의 approve + requestWithdrawals와 동일). 단일 트랜잭션은 ContractCallRequest, 다단계는 배열 |

---

## 14. LendingPosition + HealthFactor 타입

### 14.1 LendingPosition Zod 스키마

Phase 268의 `LendingMetadataSchema` 개념을 확장하여 API 응답용 상세 포지션 타입을 정의한다. 이 스키마는 REST API 응답에 사용되며, `defi_positions` 테이블의 metadata JSON 컬럼은 Phase 268의 LendingMetadataSchema를 계속 사용한다.

**파일:** `packages/core/src/schemas/lending.schema.ts`

```typescript
// Zod SSoT: API 응답용 LendingPosition
export const LendingPositionSummarySchema = z.object({
  asset: z.string().describe('CAIP-19 asset identifier'),
  symbol: z.string().describe('Human-readable symbol (e.g., "USDC")'),
  positionType: z.enum(['SUPPLY', 'BORROW']),
  amount: z.string().describe('Raw units as string (bigint serialization)'),
  amountUsd: z.number().describe('USD value at current price'),
  apy: z.number().describe('APY as decimal (e.g., 0.032 = 3.2%)'),
  interestRateMode: z.enum(['STABLE', 'VARIABLE']).optional()
    .describe('Only applicable to borrow positions on protocols supporting multiple modes'),
  chain: ChainTypeEnum,
  network: z.string(),
  provider: z.string().describe('Provider name (e.g., "aave_v3", "kamino", "morpho_blue")'),
});

export type LendingPositionSummary = z.infer<typeof LendingPositionSummarySchema>;
```

**필드 명세:**

| 필드 | 타입 | 설명 |
|------|------|------|
| `asset` | string (CAIP-19) | Phase 232 CAIP-19 표준 자산 식별자 |
| `symbol` | string | Human-readable 심볼 |
| `positionType` | 'SUPPLY' \| 'BORROW' | 공급 또는 차입 |
| `amount` | string | raw units (bigint JSON 직렬화 → string) |
| `amountUsd` | number | 현재 가격 기준 USD 환산값 |
| `apy` | number | APY (decimal, 예: 0.032 = 3.2%) |
| `interestRateMode` | 'STABLE' \| 'VARIABLE' (optional) | 이자율 모드 (borrow 포지션, 지원 프로토콜만) |
| `chain` | ChainTypeEnum | 'evm' \| 'solana' |
| `network` | string | 네트워크 이름 |
| `provider` | string | 프로바이더 이름 |

### 14.2 HealthFactor 타입

담보/차입 비율을 기반으로 한 포트폴리오 위험도 타입. Phase 269의 HealthFactorMonitor severity 수준과 일관된 상태 분류를 사용한다.

```typescript
export const HealthFactorSchema = z.object({
  healthFactor: z.number().nullable()
    .describe('Collateral/debt ratio. > 1 = safe, < 1 = liquidatable. null if no debt.'),
  totalCollateralUsd: z.number(),
  totalDebtUsd: z.number(),
  availableBorrowUsd: z.number(),
  currentLtv: z.number().describe('Current LTV as decimal (e.g., 0.65 = 65%)'),
  maxLtv: z.number().describe('Max allowed LTV before liquidation'),
  status: z.enum(['SAFE', 'WARNING', 'DANGER', 'CRITICAL', 'NO_POSITIONS'])
    .describe('Maps to Phase 269 MonitorSeverity'),
  positions: z.array(LendingPositionSummarySchema)
    .describe('Per-asset breakdown'),
});

export type HealthFactor = z.infer<typeof HealthFactorSchema>;
```

**상태 임계값 매핑 (Phase 269 HealthFactorMonitor와 일치):**

| status | healthFactor 범위 | Phase 269 MonitorSeverity | 의미 |
|--------|-------------------|--------------------------|------|
| `SAFE` | hf >= 2.0 | LOW | 안전, 청산 위험 없음 |
| `WARNING` | 1.5 <= hf < 2.0 | MEDIUM | 주의 필요, 시장 변동 시 위험 |
| `DANGER` | 1.2 <= hf < 1.5 | HIGH | 위험, 담보 추가 또는 상환 권장 |
| `CRITICAL` | hf < 1.2 | CRITICAL | 긴급, 청산 임박 |
| `NO_POSITIONS` | - | - | lending 포지션 없음 |

### 14.3 MarketInfo 타입

AI 에이전트가 사용 가능한 lending 시장을 탐색할 때 사용하는 타입. 시장별 APY, LTV, 유동성 정보를 제공한다.

```typescript
export const MarketInfoSchema = z.object({
  marketId: z.string().describe('Protocol-specific market identifier'),
  asset: z.string().describe('CAIP-19 asset identifier'),
  symbol: z.string().describe('Human-readable symbol'),
  supplyApy: z.number().describe('Current supply APY (decimal)'),
  borrowApy: z.number().describe('Current borrow APY (decimal)'),
  totalSupply: z.string().describe('Total supply in asset units'),
  totalBorrow: z.string().describe('Total borrow in asset units'),
  ltv: z.number().describe('Max LTV for this market (decimal, e.g., 0.80 = 80%)'),
  liquidationThreshold: z.number().describe('Liquidation threshold (decimal, e.g., 0.825)'),
  isActive: z.boolean().describe('Whether the market accepts new positions'),
  chain: ChainTypeEnum,
  network: z.string(),
  provider: z.string().describe('Provider name'),
});

export type MarketInfo = z.infer<typeof MarketInfoSchema>;
```

### 14.4 설계 결정

| ID | 결정 | 선택 | 근거 |
|----|------|------|------|
| DEC-LEND-05 | HealthFactor status enum | Phase 269 MonitorSeverity와 1:1 매핑 | 일관된 경고 분류. 모니터링(Phase 269)과 API 응답이 동일한 분류 체계를 사용하여 AI 에이전트 혼란 방지 |
| DEC-LEND-06 | amount 필드 타입 | string (bigint 아님) | JSON 직렬화에서 bigint는 커스텀 핸들러 필요. string으로 통일하여 REST API 호환성 보장 |
| DEC-LEND-07 | 자산 식별자 | CAIP-19 사용 (raw address 아님) | Phase 232 CAIP-19 통합과 일관성 유지. 체인/네트워크 정보가 식별자에 포함되어 멀티체인 환경에서 모호성 제거 |

---

## 15. LendingPolicyEvaluator

### 15.1 LENDING_LTV_LIMIT 정책 타입

DatabasePolicyEngine의 정책 타입 레지스트리에 추가되는 새로운 정책 타입. borrow 액션에 대해 예상 LTV를 계산하여 최대 허용 LTV를 초과하는 차입을 방지한다.

**Rules JSON 스키마 (LendingLtvLimitRules):**

```typescript
const LendingLtvLimitRulesSchema = z.object({
  maxLtv: z.number().min(0).max(1)
    .describe('Maximum allowed LTV ratio (e.g., 0.75 = 75%)'),
  warningLtv: z.number().min(0).max(1)
    .describe('Warning threshold (e.g., 0.65 = 65%) — forces DELAY tier for human review'),
});

type LendingLtvLimitRules = z.infer<typeof LendingLtvLimitRulesSchema>;
```

**평가 로직:**

1. **적용 대상:** `borrow` 액션에만 적용 (supply/repay/withdraw는 LTV를 악화시키지 않음)
2. **예상 LTV 계산:**
   ```
   projectedLtv = (currentDebtUsd + newBorrowAmountUsd) / totalCollateralUsd
   ```
3. **판정:**
   - `projectedLtv > maxLtv` → **deny** (reason: "Borrow would exceed max LTV ({maxLtv})")
   - `warningLtv < projectedLtv <= maxLtv` → **allow** but upgrade tier to DELAY (인간 검토 강제)
   - `projectedLtv <= warningLtv` → **allow** (원래 티어 유지)
4. **현재 포지션 데이터:** `defi_positions` 테이블에서 읽기 (PositionTracker가 캐시한 데이터)
5. **통합 지점:** DatabasePolicyEngine.evaluate() step 4h (기존 APPROVE_TIER_OVERRIDE step 4g 이후)
6. **스코핑:** 기존 정책과 동일한 우선순위 해결 (wallet+network > wallet+null > global+network > global+null)

### 15.2 LENDING_ASSET_WHITELIST 정책 타입

CLAUDE.md의 default-deny 원칙을 lending에 적용하는 화이트리스트 정책. CONTRACT_WHITELIST 패턴을 따라 "Contracts default-deny (CONTRACT_WHITELIST opt-in)" 규칙을 lending 자산에도 확장한다.

**Rules JSON 스키마 (LendingAssetWhitelistRules):**

```typescript
const LendingAssetWhitelistRulesSchema = z.object({
  collateralAssets: z.array(z.object({
    assetId: z.string().describe('CAIP-19 asset identifier'),
    symbol: z.string().optional().describe('Human-readable symbol for Admin UI display'),
  })).describe('Allowed assets for supply/withdraw actions'),
  borrowAssets: z.array(z.object({
    assetId: z.string().describe('CAIP-19 asset identifier'),
    symbol: z.string().optional().describe('Human-readable symbol for Admin UI display'),
  })).describe('Allowed assets for borrow/repay actions'),
});

type LendingAssetWhitelistRules = z.infer<typeof LendingAssetWhitelistRulesSchema>;
```

**평가 로직:**

1. **Default-deny:** LENDING_ASSET_WHITELIST 정책이 존재하지 않으면 → 모든 lending 액션 deny ("No lending asset whitelist configured")
2. **supply/withdraw 액션:** `collateralAssets` 목록에서 asset 확인
3. **borrow/repay 액션:** `borrowAssets` 목록에서 asset 확인
4. **매칭:** CAIP-19 식별자 exact match
5. **통합 지점:** DatabasePolicyEngine.evaluate() step 4h (LENDING_LTV_LIMIT 이전, step 4h-a)
6. **순서:** asset whitelist 먼저 (4h-a), LTV limit 이후 (4h-b) → 유효하지 않은 자산을 먼저 거부하고, 유효한 자산에 대해서만 LTV 계산

### 15.3 PolicyEngine 통합 지점

**Zod SSoT 정책 타입 유니온 확장:**

```typescript
// 기존 9개 타입 + 새로운 2개 타입
const PolicyTypeEnum = z.enum([
  // 기존
  'WHITELIST', 'ALLOWED_NETWORKS', 'ALLOWED_TOKENS',
  'CONTRACT_WHITELIST', 'METHOD_WHITELIST', 'APPROVED_SPENDERS',
  'APPROVE_AMOUNT_LIMIT', 'APPROVE_TIER_OVERRIDE', 'SPENDING_LIMIT',
  // 신규 (lending)
  'LENDING_LTV_LIMIT', 'LENDING_ASSET_WHITELIST',
]);
```

**기존 policies 테이블 스키마 재사용:**
- `type` 컬럼: 새 정책 타입 추가 (CHECK 제약 갱신 필요)
- `rules` JSON 컬럼: LendingLtvLimitRules 또는 LendingAssetWhitelistRules 저장
- `wallet_id`, `priority`, `enabled`, `network` 컬럼: 기존과 동일하게 사용

**Lending 액션 식별 방법:**
- ContractCallRequest.metadata 필드에 `{ actionProvider: string, actionName: string }` 전달
- 예: `{ actionProvider: 'aave_v3', actionName: 'borrow' }`
- PolicyEvaluator가 `metadata.actionName`이 `['supply', 'borrow', 'repay', 'withdraw']` 중 하나인지 확인
- 이 방식으로 discriminatedUnion 5-type에 새 타입을 추가하지 않고 lending 액션을 식별

**정책 평가 순서 (전체):**

| 단계 | 정책 타입 | 비고 |
|------|-----------|------|
| 4a | WHITELIST | 기존 |
| 4b | ALLOWED_NETWORKS | 기존 |
| 4c | ALLOWED_TOKENS | 기존 |
| 4d | CONTRACT_WHITELIST | 기존 |
| 4e | METHOD_WHITELIST | 기존 |
| 4f | APPROVED_SPENDERS | 기존 |
| 4g | APPROVE_AMOUNT_LIMIT / APPROVE_TIER_OVERRIDE | 기존 |
| **4h-a** | **LENDING_ASSET_WHITELIST** | **신규 — lending 자산 화이트리스트** |
| **4h-b** | **LENDING_LTV_LIMIT** | **신규 — borrow LTV 제한** |
| 5 | SPENDING_LIMIT | 기존 |

**Admin UI 정책 페이지 확장:**
- 정책 타입 드롭다운에 `LENDING_LTV_LIMIT`, `LENDING_ASSET_WHITELIST` 추가
- Rules 에디터:
  - LENDING_LTV_LIMIT: maxLtv 슬라이더 (0~1 범위, 기본 0.75), warningLtv 슬라이더 (0~1 범위, 기본 0.65)
  - LENDING_ASSET_WHITELIST: 자산 피커 (CAIP-19 기반, collateralAssets/borrowAssets 분리)

### 15.4 HealthFactor 정책-모니터 임계값 관계

LendingPolicyEvaluator의 maxLtv와 Phase 269 HealthFactorMonitor의 임계값은 서로 다른 목적을 가지지만 수학적으로 연관된다.

**구분:**
- **LendingPolicyEvaluator.maxLtv:** 새로운 borrow가 이 LTV를 초과하는 것을 방지 (사전 예방)
- **HealthFactorMonitor 임계값:** 기존 포지션의 health factor 하락을 감지하여 경고 (사후 감시)

**변환 공식:**

```
healthFactor = liquidationThreshold / currentLtv
```

**예시:**
- maxLtv = 0.75, liquidationThreshold = 0.825인 시장에서
- 최대 차입 시 healthFactor = 0.825 / 0.75 = 1.10 (DANGER 범위)
- 이는 정책이 허용한 최대 borrow가 즉시 모니터링 DANGER 경고를 발생시킴을 의미

**권장 설정:**
- warningLtv를 설정하여 결과 health factor가 SAFE 범위(>= 2.0)에 머물도록 보장
- 예: liquidationThreshold = 0.825이면, warningLtv = 0.825 / 2.0 = 0.4125 이하로 설정
- 이렇게 하면 정책이 승인한 borrow가 즉시 모니터링 경고를 트리거하지 않음

### 15.5 설계 결정

| ID | 결정 | 선택 | 근거 |
|----|------|------|------|
| DEC-LEND-08 | LENDING_ASSET_WHITELIST default-deny | 정책 미설정 시 모든 lending 액션 deny | CLAUDE.md "Contracts default-deny (CONTRACT_WHITELIST opt-in)" 패턴 준수. 보안 기본값 |
| DEC-LEND-09 | Lending 액션 식별 방법 | ContractCallRequest.metadata (discriminatedUnion 타입 추가 아님) | 5-type pipeline 무결성 보존. metadata는 이미 존재하는 확장 포인트이며, 새 union member 추가 시 전체 파이프라인 변경 필요 |
| DEC-LEND-10 | LTV 계산 데이터 소스 | defi_positions 캐시 (라이브 RPC 아님) | RPC 지연이 파이프라인을 블로킹하는 것 방지. PositionTracker가 데이터 신선도 보장. 최악의 경우 약간 오래된 데이터로 판정하나, 모니터링이 사후 커버 |
| DEC-LEND-11 | warningLtv 초과 시 동작 | DELAY 티어로 업그레이드 (deny 아님) | 경계선 차입을 허용하되 인간 검토를 강제. deny하면 지나치게 제한적. LTV limit policy가 hard cap, warning은 soft cap |

---

## 신규 산출물

| ID | 산출물 | 설명 |
|----|--------|------|
| DEFI-10 | ILendingProvider 프레임워크 설계 | 인터페이스, 포지션 모델, 헬스 팩터, 정책 |
| DEFI-11 | IYieldProvider 프레임워크 설계 | 인터페이스, PT/YT 모델, 만기 관리 |
| DEFI-12 | IPerpProvider 프레임워크 설계 | 인터페이스, 레버리지 모델, 마진 관리, 정책 |
| DEFI-13 | PositionTracker 공통 인프라 설계 | 통합 포지션 테이블, 동기화, API, Admin UI |
| DEFI-14 | 모니터링 통합 설계 | IDeFiMonitor, 3개 모니터, 알림 이벤트 |
| DEFI-15 | Intent/서명 패턴 설계 | SignableOrder, Registry 확장, CoW 패턴 |

---

## 영향받는 설계 문서

| 문서 | 변경 |
|------|------|
| 62 (action-provider-architecture) | ILendingProvider/IYieldProvider/IPerpProvider 인터페이스, intent 타입 |
| 25 (sqlite) | positions 테이블 추가 |
| 33 (policy) | LendingPolicyEvaluator, PerpPolicyEvaluator |
| 35 (notification) | LIQUIDATION_WARNING, MATURITY_WARNING, MARGIN_WARNING 이벤트 |
| 37 (rest-api) | /positions, /health-factor 엔드포인트 추가 |
| 67 (admin-ui) | 포트폴리오 섹션 와이어프레임 |

---

## 구현 순서 가이드

```
m29-00 (설계) ─┬→ m29-02 (Lending 프레임워크 + Aave) ─┬→ m29-04 (Kamino)   [병렬 가능]
               │                                       ├→ m29-06 (Pendle)   [병렬 가능]
               │                                       ├→ m29-08 (Drift)    [병렬 가능]
               │                                       └→ m29-10 (Morpho)   [병렬 가능]
               └→ m29-14 (CoW Protocol)                                     [m29-02와 독립]

m28-04 (Staking) → m29-12 (Marinade)                                        [완전 독립]
```

- m29-02는 Lending 프레임워크(PositionTracker, positions 테이블)를 구축하므로 m29-04/06/08/10보다 반드시 선행
- m29-04/06/08/10은 m29-02 완료 후 병렬 실행 가능 (각자 category 확장만 수행, DB 마이그레이션 충돌 없음)
- m29-12(Marinade)는 m28-04 패턴 재사용으로 m29-xx와 완전 독립
- m29-14(CoW)는 m29-00 Intent 설계(DEFI-15)에만 의존, m29-02와 병렬 가능

---

## 성공 기준

1. 3개 프레임워크의 인터페이스가 확정되어 m29-02에서 바로 구현 가능
2. positions 테이블 스키마가 Lending/Yield/Perp/Staking을 통합 수용
3. 모니터링 패턴이 3개 모니터에 일관되게 적용 가능
4. Intent 패턴이 기존 ContractCallRequest 패턴과 공존하는 구조 확정
5. 7개 프로토콜 구현 시 프레임워크 수정 없이 Provider만 추가하면 되는 설계

---

*생성일: 2026-02-15*
*범위: 설계 마일스톤 — 코드 구현은 m29-02~m29-14에서 수행*
*선행: m28 (기본 DeFi 프로토콜 설계), v1.5 (Action Provider 프레임워크)*
*관련: 설계 문서 62 (action-provider-architecture)*
