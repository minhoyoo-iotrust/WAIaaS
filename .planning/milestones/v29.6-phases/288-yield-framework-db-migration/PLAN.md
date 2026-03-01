# Phase 288: Yield Framework + DB Migration

## Goal
AI 에이전트가 Yield 포지션을 추적하고, 만기(MATURED) 상태를 구분할 수 있으며, 기존 포지션 API에서 Yield 포지션이 함께 조회되는 상태

## Plans

### Plan 288-01: IYieldProvider 인터페이스 + YieldPositionTracker

**파일 작업:**

1. **`packages/core/src/enums/defi.ts`** — MATURED 상태 추가
   - `POSITION_STATUSES`에 `'MATURED'` 추가: `['ACTIVE', 'CLOSED', 'LIQUIDATED', 'MATURED']`
   - Zod enum과 TypeScript type이 자동 파생됨 (Zod SSoT)

2. **`packages/core/src/interfaces/yield-provider.types.ts`** — 신규 생성
   - IYieldProvider 인터페이스 (extends IActionProvider)
   - YieldMarketInfoSchema (Zod SSoT): asset, symbol, impliedApy, underlyingApy, maturity, tvl, marketAddress, chain
   - YieldPositionSummarySchema (Zod SSoT): asset, tokenType (PT/YT/LP), amount, amountUsd, apy, maturity, marketId
   - YieldForecastSchema (Zod SSoT): marketId, impliedApy, underlyingApy, ptPrice, ytPrice, maturityDate
   - 표준 5개 액션 정의: buy_pt, buy_yt, redeem_pt, add_liquidity, remove_liquidity
   - ILendingProvider 패턴 참조 (lending-provider.types.ts)

   ```typescript
   export interface IYieldProvider extends IActionProvider {
     getMarkets(chain: string, network?: string): Promise<YieldMarketInfo[]>;
     getPosition(walletId: string, context: ActionContext): Promise<YieldPositionSummary[]>;
     getYieldForecast(marketId: string, context: ActionContext): Promise<YieldForecast>;
   }
   ```

3. **`packages/core/src/interfaces/index.ts`** — 내보내기 추가
   - yield-provider.types.ts의 type/schema 내보내기 추가
   - IYieldProvider, YieldMarketInfo, YieldPositionSummary, YieldForecast 타입
   - YieldMarketInfoSchema, YieldPositionSummarySchema, YieldForecastSchema 스키마

4. **`packages/core/src/__tests__/yield-provider.test.ts`** — 신규 생성
   - Zod 스키마 유효성 테스트 (parse/safeParse)
   - YieldMarketInfoSchema, YieldPositionSummarySchema, YieldForecastSchema 테스트
   - lending-provider.test.ts 패턴 참조

**의존성:** 없음 (첫 번째 plan)
**검증:** `pnpm turbo run typecheck --filter=@waiaas/core` + 테스트 통과

---

### Plan 288-02: DB Migration (MATURED 상태) + getCreateTableStatements 업데이트

**파일 작업:**

1. **`packages/daemon/src/infrastructure/database/migrate.ts`** — Migration v30 추가
   - 12-step table recreation 패턴 사용 (v26/v29 참조)
   - defi_positions 테이블의 status CHECK 제약 조건에 'MATURED' 추가
   - `managesOwnTransaction: true`
   - foreign_key_check 검증 포함
   - LATEST_SCHEMA_VERSION을 29 → 30으로 업데이트

2. **`packages/daemon/src/infrastructure/database/migrate.ts`** — getCreateTableStatements() 업데이트
   - defi_positions CREATE TABLE에서 status CHECK이 `inList(POSITION_STATUSES)` 동적 참조하므로, POSITION_STATUSES 변경 시 자동 반영됨
   - 별도 수정 불필요 (SSoT 이점)

3. **`packages/daemon/src/__tests__/migration-v30.test.ts`** — 신규 생성
   - Migration v30 테스트: v29 스키마 → v30 마이그레이션 적용 → MATURED status 허용 확인
   - MATURED status INSERT 성공 확인
   - 기존 ACTIVE/CLOSED/LIQUIDATED 데이터 보존 확인
   - 이전 migration 테스트 패턴 참조

**의존성:** Plan 288-01 (POSITION_STATUSES enum 변경 필요)
**검증:** `pnpm turbo run typecheck --filter=@waiaas/daemon` + migration 테스트 통과 + 기존 테스트 전체 통과

---

## 검증 기준

1. ✅ IYieldProvider 인터페이스가 존재하며 IActionProvider를 확장하고, getMarkets/getPosition/getYieldForecast 메서드와 5개 표준 액션 정의
2. ✅ POSITION_STATUSES에 'MATURED' 포함, Zod enum + TypeScript type 동시 업데이트
3. ✅ DB migration v30 적용 후 defi_positions에 status='MATURED' INSERT 가능
4. ✅ 기존 Lending/Staking 포지션 데이터 및 테스트 회귀 없음
5. ✅ typecheck + lint 통과

## 실행 순서

288-01 → 288-02 (순차)
