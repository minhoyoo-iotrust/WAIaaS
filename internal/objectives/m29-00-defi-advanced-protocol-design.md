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
