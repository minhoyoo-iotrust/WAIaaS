# Phase 297: Perp 프레임워크 - Research

**Researched:** 2026-03-02
**Domain:** DeFi Perp 프레임워크 (IPerpProvider, PerpPositionTracker, MarginMonitor, PerpPolicyEvaluator)
**Confidence:** HIGH

## Summary

Phase 297은 WAIaaS DeFi 스택에 Perp(무기한 선물) 프레임워크를 추가한다. 기존 Lending 프레임워크(ILendingProvider, HealthFactorMonitor, LENDING_LTV_LIMIT)와 Yield 프레임워크(IYieldProvider, MaturityMonitor)의 패턴을 정확히 따라, IPerpProvider 인터페이스, MarginMonitor, PerpPolicyEvaluator를 구현한다.

핵심 발견: 기존 인프라가 이미 PERP 카테고리를 지원하고 있다. `POSITION_CATEGORIES = ['LENDING', 'YIELD', 'PERP', 'STAKING']` 배열에 PERP가 포함되어 있고, `defi_positions` 테이블의 CHECK 제약에도 반영되어 있으며, `PositionTracker`의 `DEFAULT_INTERVALS`에 `PERP: 60_000`(1분)이 이미 설정되어 있다. 알림 이벤트 `MARGIN_WARNING`, `LIQUIDATION_IMMINENT`도 이미 정의되어 있고 i18n 메시지 템플릿도 준비되어 있다. **DB 마이그레이션이 불필요하다.**

**Primary recommendation:** ILendingProvider/IYieldProvider 패턴을 1:1로 따라 IPerpProvider 인터페이스를 `@waiaas/core`에 정의하고, HealthFactorMonitor/MaturityMonitor 패턴을 따라 MarginMonitor를 구현하며, LENDING_ASSET_WHITELIST/LENDING_LTV_LIMIT 패턴을 따라 Perp 전용 정책 타입 3개(PERP_MAX_LEVERAGE, PERP_MAX_POSITION_USD, PERP_ALLOWED_MARKETS)를 추가한다.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PERP-01 | IPerpProvider interface | ILendingProvider/IYieldProvider 패턴 확인. `@waiaas/core/interfaces/` 디렉토리에 `perp-provider.types.ts` 신규 생성. 5개 표준 액션 + 3개 조회 메서드. Zod SSoT 스키마 포함 |
| PERP-02 | PerpPositionTracker | PositionTracker가 이미 PERP 카테고리 1분 간격 폴링 지원. `IPositionProvider` 구현으로 자동 통합. metadata JSON에 Perp 전용 필드 저장 |
| PERP-03 | MarginMonitor MARGIN_WARNING alerts | HealthFactorMonitor/MaturityMonitor 패턴 확인. IDeFiMonitor 구현 + DeFiMonitorService 등록. MARGIN_WARNING 알림 이벤트 이미 정의됨 |
| PERP-04 | MarginMonitor LIQUIDATION_IMMINENT + dynamic polling | HealthFactorMonitor의 adaptive polling(SAFE 5min -> WARNING 1min -> DANGER 15s -> CRITICAL 5s) 패턴 적용. LIQUIDATION_IMMINENT는 BROADCAST_EVENTS에 이미 등록됨 |
| PERP-05 | PerpPolicyEvaluator max_leverage | LENDING_LTV_LIMIT 패턴 확인. DatabasePolicyEngine에 Step 4i 추가. POLICY_TYPES 배열에 PERP_MAX_LEVERAGE 추가 필요 |
| PERP-06 | PerpPolicyEvaluator max_position_usd | LENDING_LTV_LIMIT의 usdAmount 활용 패턴. PERP_MAX_POSITION_USD 정책 타입 추가 |
| PERP-07 | PerpPolicyEvaluator allowed_markets | LENDING_ASSET_WHITELIST 패턴(default-deny). PERP_ALLOWED_MARKETS 정책 타입 추가 |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @waiaas/core | current | IPerpProvider 인터페이스 + Zod 스키마 정의 | 모든 DeFi 프레임워크 인터페이스가 여기 정의됨 |
| zod | 3.x | Perp 스키마 SSoT (PerpPositionSummary, MarginInfo, PerpMarket) | 프로젝트 Zod SSoT 규칙 |
| better-sqlite3 | current | MarginMonitor가 defi_positions 테이블에서 PERP 포지션 조회 | 기존 모니터 패턴 동일 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | current | 유닛 테스트 | 모든 신규 코드 테스트 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| 별도 perp_positions 테이블 | 기존 defi_positions(category='PERP') | 기존 테이블 재사용이 설계 결정. metadata JSON으로 Perp 전용 필드 저장. DB 마이그레이션 불필요 |

## Architecture Patterns

### Recommended Project Structure
```
packages/core/src/interfaces/
  perp-provider.types.ts          # IPerpProvider + Zod 스키마 (신규)

packages/core/src/interfaces/index.ts  # re-export 추가

packages/core/src/events/event-types.ts  # MarginWarningEvent, PerpLiquidationImminentEvent 이벤트 타입 추가 + WaiaasEventMap 확장

packages/core/src/enums/policy.ts  # PERP_MAX_LEVERAGE, PERP_MAX_POSITION_USD, PERP_ALLOWED_MARKETS 추가

packages/daemon/src/services/monitoring/
  margin-monitor.ts               # MarginMonitor (신규)

packages/daemon/src/pipeline/
  database-policy-engine.ts       # Step 4i (PERP 정책 평가) 추가

packages/daemon/src/infrastructure/settings/
  setting-keys.ts                 # drift_* 설정 키 추가

packages/daemon/src/lifecycle/
  daemon.ts                       # MarginMonitor 등록 (Step 4c-11 확장)
```

### Pattern 1: IPerpProvider Interface (ILendingProvider/IYieldProvider 패턴)
**What:** IActionProvider를 확장하는 도메인 전용 인터페이스
**When to use:** 새로운 DeFi 카테고리 프레임워크 추가 시
**Example:**
```typescript
// Source: packages/core/src/interfaces/lending-provider.types.ts (패턴 참조)
// packages/core/src/interfaces/perp-provider.types.ts (신규)

import { z } from 'zod';
import type { IActionProvider, ActionContext } from './action-provider.types.js';

// Zod SSoT: PerpPositionSummary
export const PerpPositionSummarySchema = z.object({
  market: z.string(),
  direction: z.enum(['LONG', 'SHORT']),
  size: z.string(),
  entryPrice: z.number().nullable(),
  leverage: z.number(),
  unrealizedPnl: z.number().nullable(),
  margin: z.number().nullable(),
  liquidationPrice: z.number().nullable(),
});
export type PerpPositionSummary = z.infer<typeof PerpPositionSummarySchema>;

// Zod SSoT: MarginInfo
export const MarginInfoSchema = z.object({
  totalMargin: z.number(),
  freeMargin: z.number(),
  maintenanceMarginRatio: z.number(),
  marginRatio: z.number(),
  status: z.enum(['safe', 'warning', 'danger', 'critical']),
});
export type MarginInfo = z.infer<typeof MarginInfoSchema>;

// Zod SSoT: PerpMarketInfo
export const PerpMarketInfoSchema = z.object({
  market: z.string(),           // e.g., "SOL-PERP"
  baseAsset: z.string(),
  maxLeverage: z.number(),
  fundingRate: z.number().nullable(),
  openInterest: z.number().nullable(),
  oraclePrice: z.number().nullable(),
});
export type PerpMarketInfo = z.infer<typeof PerpMarketInfoSchema>;

// IPerpProvider interface
export interface IPerpProvider extends IActionProvider {
  getPosition(walletId: string, context: ActionContext): Promise<PerpPositionSummary[]>;
  getMarginInfo(walletId: string, context: ActionContext): Promise<MarginInfo>;
  getMarkets(chain: string, network?: string): Promise<PerpMarketInfo[]>;
}
```

### Pattern 2: MarginMonitor (HealthFactorMonitor/MaturityMonitor 패턴)
**What:** IDeFiMonitor 구현체로 DeFiMonitorService에 등록
**When to use:** defi_positions 테이블의 PERP 포지션에 대한 주기적 마진 모니터링
**Example:**
```typescript
// Source: packages/daemon/src/services/monitoring/health-factor-monitor.ts (패턴 참조)

export class MarginMonitor implements IDeFiMonitor {
  readonly name = 'margin';

  // HealthFactorMonitor와 동일한 구조:
  // - recursive setTimeout (not setInterval) for dynamic interval
  // - 4-level severity: SAFE(5min) -> WARNING(1min) -> DANGER(15s) -> CRITICAL(5s)
  // - cooldown: WARNING/DANGER 4-hour cooldown, no cooldown for CRITICAL
  // - on-demand PositionTracker.syncCategory('PERP') for DANGER/CRITICAL

  // 핵심 차이점:
  // - category = 'PERP' (not 'LENDING')
  // - metadata.marginRatio로 severity 분류 (healthFactor 대신)
  // - MARGIN_WARNING / LIQUIDATION_IMMINENT 알림 (LIQUIDATION_WARNING 대신)
  // - marginRatio 임계값: safe=0.30, warning=0.15, danger=0.10 (margin ratio가 낮을수록 위험)
}
```

### Pattern 3: PerpPolicyEvaluator (LENDING_ASSET_WHITELIST/LENDING_LTV_LIMIT 패턴)
**What:** DatabasePolicyEngine에 Step 4i로 Perp 전용 정책 평가 추가
**When to use:** 레버리지, 포지션 크기, 허용 시장 기반 정책 평가
**Example:**
```typescript
// Source: packages/daemon/src/pipeline/database-policy-engine.ts 내 evaluateLendingLtvLimit() 패턴

// Step 4i: Evaluate PERP_ALLOWED_MARKETS (default-deny, LENDING_ASSET_WHITELIST 패턴)
// Step 4i-b: Evaluate PERP_MAX_LEVERAGE (deny if leverage exceeds max)
// Step 4i-c: Evaluate PERP_MAX_POSITION_USD (deny if position USD exceeds max)

// Perp 액션 식별: actionName이 'open_position', 'modify_position' 등인 경우
const PERP_ACTIONS = new Set([
  'open_position', 'close_position', 'modify_position',
  'add_margin', 'withdraw_margin',
]);
```

### Pattern 4: IPositionProvider 통합 (PositionTracker 자동 연동)
**What:** IPerpProvider 구현체가 IPositionProvider도 구현하여 PositionTracker에 자동 등록
**When to use:** Perp 포지션을 defi_positions DB에 자동 동기화
**Example:**
```typescript
// Source: packages/actions/src/providers/aave-v3/index.ts (패턴 참조)
// DriftPerpProvider implements IPerpProvider, IPositionProvider

// IPositionProvider.getPositions() -> PositionUpdate[] with:
//   category: 'PERP',
//   metadata: { market, direction, size, entryPrice, leverage, unrealizedPnl, margin, liquidationPrice }

// PositionTracker Step 4f-5에서 duck-typing으로 자동 등록:
// if ('getPositions' in provider && 'getSupportedCategories' in provider) { ... }
```

### Pattern 5: EventBus 이벤트 추가 (WaiaasEventMap 확장)
**What:** MarginMonitor가 EventBus를 통해 마진 경고 이벤트 발행
**When to use:** MarginMonitor가 WARNING/DANGER/CRITICAL 감지 시
**Example:**
```typescript
// Source: packages/core/src/events/event-types.ts (MaturityMonitor의 YieldMaturityWarningEvent 패턴)

export interface MarginWarningEvent {
  walletId: string;
  positionId: string;
  provider: string;
  market: string;
  marginRatio: number;
  threshold: number;
  severity: 'WARNING' | 'DANGER' | 'CRITICAL';
  timestamp: number;
}

// WaiaasEventMap에 추가:
'perp:margin-warning': MarginWarningEvent;
```

### Anti-Patterns to Avoid
- **별도 테이블 생성:** defi_positions 테이블에 category='PERP'가 이미 지원됨. 별도 perp_positions 테이블 만들지 말 것
- **setInterval 사용:** HealthFactorMonitor처럼 recursive setTimeout 사용 (동적 간격 변경 지원)
- **직접 NotificationService 호출만:** EventBus.emit() + NotificationService.notify() 둘 다 사용 (MaturityMonitor 패턴)
- **정책 타입 하드코딩:** POLICY_TYPES SSoT 배열에 추가하고, DatabasePolicyEngine에서 동적 참조

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 포지션 DB 저장 | 직접 INSERT 쿼리 | PositionWriteQueue + PositionTracker | 배치 upsert, dedup, 오버랩 방지 이미 구현됨 |
| 모니터 라이프사이클 | 직접 타이머 관리 | DeFiMonitorService.register() | 통합 start/stop/updateConfig 관리 |
| 알림 전송 | 직접 ntfy/Telegram 호출 | NotificationService.notify(eventType, walletId, vars) | 우선순위 기반 배달, 폴백, 레이트 리밋 |
| 설정 관리 | config.toml 직접 읽기 | SettingsService.get('actions.drift_*') | DB 오버라이드, hot-reload 지원 |
| 정책 평가 | 별도 평가 함수 | DatabasePolicyEngine 내 private 메서드 | 기존 evaluate/evaluateAndReserve 파이프라인과 통합 |

**Key insight:** Perp 프레임워크의 모든 인프라(DB, 모니터링, 정책, 알림, 설정)가 이미 구축되어 있고 확장 가능하게 설계되어 있다. 새로운 인프라를 만들 필요 없이 기존 패턴의 인터페이스와 구현체만 추가하면 된다.

## Common Pitfalls

### Pitfall 1: 마진 비율 방향 혼동
**What goes wrong:** HealthFactor는 높을수록 안전(2.0=safe, 1.0=liquidation)하지만, marginRatio는 반대로 해석될 수 있음
**Why it happens:** Lending의 healthFactor와 Perp의 marginRatio는 의미가 다름
**How to avoid:** MarginMonitor에서 marginRatio를 "유지 마진 대비 현재 마진 비율"로 정의. marginRatio가 낮을수록 위험 (0.15=warning, 0.10=danger). MarginInfo.marginRatio 필드 주석에 방향 명시
**Warning signs:** SAFE 포지션에 알림이 발송되거나, CRITICAL 포지션에 알림이 없는 경우

### Pitfall 2: PERP 정책 액션 이름 매칭
**What goes wrong:** LENDING_LTV_LIMIT는 `actionName.endsWith('borrow')`로 prefix 매칭(aave_borrow, kamino_borrow). Perp도 동일 패턴 필요
**Why it happens:** 프로바이더마다 액션 이름에 prefix를 붙임 (drift_open_position)
**How to avoid:** `actionName.endsWith('open_position')` 등 suffix 매칭 사용. PERP_ACTIONS Set은 suffix만 포함
**Warning signs:** drift_open_position이 정책 평가를 건너뛰는 경우

### Pitfall 3: metadata JSON 구조 불일치
**What goes wrong:** MarginMonitor가 defi_positions.metadata에서 필드를 읽을 때 필드 이름 불일치
**Why it happens:** PositionUpdate.metadata (camelCase)와 design doc의 PerpMetadataSchema 필드명 차이
**How to avoid:** PerpMetadataSchema의 Zod 스키마를 SSoT로 정의하고, IPositionProvider.getPositions()에서 동일한 필드명 사용. MarginMonitor도 동일 스키마로 파싱
**Warning signs:** MarginMonitor가 모든 포지션의 marginRatio를 null로 읽는 경우

### Pitfall 4: POLICY_TYPES 배열 업데이트 누락
**What goes wrong:** 새 정책 타입을 DatabasePolicyEngine에서 사용하지만 POLICY_TYPES enum에 추가하지 않으면 DB CHECK 제약 위반
**Why it happens:** policy.ts의 POLICY_TYPES SSoT와 DatabasePolicyEngine 로직이 별도 파일
**How to avoid:** 1) POLICY_TYPES 배열에 3개 타입 추가 2) DatabasePolicyEngine에 평가 로직 추가 3) 테스트에서 insertPolicy()로 검증
**Warning signs:** "CHECK constraint failed" 에러

### Pitfall 5: EventBus 이벤트 타입 등록 누락
**What goes wrong:** `eventBus.emit('perp:margin-warning', ...)` 호출 시 타입 에러
**Why it happens:** WaiaasEventMap에 새 이벤트 키를 추가하지 않음
**How to avoid:** event-types.ts에 MarginWarningEvent 인터페이스 정의 + WaiaasEventMap에 매핑 추가
**Warning signs:** TypeScript 컴파일 에러

### Pitfall 6: Non-spending 분류 누락
**What goes wrong:** close_position, add_margin이 SPENDING_LIMIT 정책에 의해 불필요하게 차단됨
**Why it happens:** Lending의 supply/repay/withdraw가 non-spending으로 분류되는 것처럼, Perp의 특정 액션도 non-spending 처리 필요
**How to avoid:** close_position, add_margin은 non-spending(사용자 자산 반환 또는 마진 추가). open_position은 spending(새 포지션 개설). modify_position, withdraw_margin도 spending 여부 판단 필요. DatabasePolicyEngine Step 5의 NON_SPENDING_ACTIONS Set에 추가
**Warning signs:** add_margin이 APPROVAL 티어로 분류되는 경우

## Code Examples

### Example 1: IPerpProvider 인터페이스 파일 구조
```typescript
// packages/core/src/interfaces/perp-provider.types.ts
// Source: lending-provider.types.ts, yield-provider.types.ts 패턴

import { z } from 'zod';
import type { IActionProvider, ActionContext } from './action-provider.types.js';

// Zod SSoT schemas (3개)
export const PerpPositionSummarySchema = z.object({ ... });
export const MarginInfoSchema = z.object({ ... });
export const PerpMarketInfoSchema = z.object({ ... });

// Types
export type PerpPositionSummary = z.infer<typeof PerpPositionSummarySchema>;
export type MarginInfo = z.infer<typeof MarginInfoSchema>;
export type PerpMarketInfo = z.infer<typeof PerpMarketInfoSchema>;

// Interface
export interface IPerpProvider extends IActionProvider {
  getPosition(walletId: string, context: ActionContext): Promise<PerpPositionSummary[]>;
  getMarginInfo(walletId: string, context: ActionContext): Promise<MarginInfo>;
  getMarkets(chain: string, network?: string): Promise<PerpMarketInfo[]>;
}
```

### Example 2: MarginMonitor 구조
```typescript
// packages/daemon/src/services/monitoring/margin-monitor.ts
// Source: health-factor-monitor.ts, maturity-monitor.ts 패턴

import type { Database } from 'better-sqlite3';
import type { IDeFiMonitor, MonitorSeverity, MonitorEvaluation, EventBus } from '@waiaas/core';
import type { NotificationService } from '../../notifications/notification-service.js';
import type { PositionTracker } from '../defi/position-tracker.js';

export interface MarginMonitorConfig {
  safeThreshold: number;     // default 0.30 (30% margin ratio)
  warningThreshold: number;  // default 0.15 (15%)
  dangerThreshold: number;   // default 0.10 (10%)
  cooldownHours: number;     // default 4
}

export class MarginMonitor implements IDeFiMonitor {
  readonly name = 'margin';

  // ... (HealthFactorMonitor 구조와 동일)
  // 차이점:
  // 1. category = 'PERP' (not 'LENDING')
  // 2. metadata.marginRatio 기반 분류 (healthFactor 대신)
  // 3. marginRatio < threshold = 위험 (HF와 방향 동일: 낮을수록 위험)
  // 4. MARGIN_WARNING / LIQUIDATION_IMMINENT 알림
  // 5. EventBus.emit('perp:margin-warning', ...) 이벤트 발행
}
```

### Example 3: PERP 정책 평가 추가 위치
```typescript
// packages/daemon/src/pipeline/database-policy-engine.ts
// Source: evaluateLendingAssetWhitelist(), evaluateLendingLtvLimit() 패턴

// evaluate() 메서드 내:
// ... Step 4h (LENDING_ASSET_WHITELIST) ...
// ... Step 4h-b (LENDING_LTV_LIMIT) ...

// Step 4i: Evaluate PERP_ALLOWED_MARKETS (default-deny for perp markets)
const perpMarketResult = this.evaluatePerpAllowedMarkets(resolved, transaction);
if (perpMarketResult !== null) return perpMarketResult;

// Step 4i-b: Evaluate PERP_MAX_LEVERAGE (deny if leverage exceeds max)
const leverageResult = this.evaluatePerpMaxLeverage(resolved, transaction);
if (leverageResult !== null) return leverageResult;

// Step 4i-c: Evaluate PERP_MAX_POSITION_USD (deny if position USD exceeds max)
const positionUsdResult = this.evaluatePerpMaxPositionUsd(resolved, transaction, walletId, usdAmount);
if (positionUsdResult !== null) return positionUsdResult;

// Step 5 수정: NON_SPENDING_ACTIONS에 Perp 액션 추가
const NON_SPENDING_ACTIONS = new Set([
  'supply', 'repay', 'withdraw',          // lending (기존)
  'close_position', 'add_margin',          // perp (신규 -- 자산 반환/마진 추가)
]);
```

### Example 4: DeFiMonitorService에 MarginMonitor 등록 (daemon.ts)
```typescript
// packages/daemon/src/lifecycle/daemon.ts Step 4c-11 확장
// Source: HealthFactorMonitor + MaturityMonitor 등록 패턴

// Register MarginMonitor
if (this.sqlite) {
  const { MarginMonitor } = await import('../services/monitoring/margin-monitor.js');
  const marginMonitor = new MarginMonitor({
    sqlite: this.sqlite,
    eventBus: this.eventBus,
    notificationService: this.notificationService ?? undefined,
    positionTracker: this.positionTracker ?? undefined,
  });
  if (this._settingsService) {
    marginMonitor.loadFromSettings(this._settingsService);
  }
  this.defiMonitorService.register(marginMonitor);
}
```

### Example 5: 정책 타입 및 설정 키 추가
```typescript
// packages/core/src/enums/policy.ts -- POLICY_TYPES 배열에 추가
export const POLICY_TYPES = [
  // ... existing ...
  'LENDING_LTV_LIMIT',
  'LENDING_ASSET_WHITELIST',
  'PERP_MAX_LEVERAGE',       // 신규
  'PERP_MAX_POSITION_USD',   // 신규
  'PERP_ALLOWED_MARKETS',    // 신규
] as const;

// packages/daemon/src/infrastructure/settings/setting-keys.ts -- drift 설정 추가
{ key: 'actions.drift_enabled', category: 'actions', configPath: 'actions.drift_enabled', defaultValue: 'false', isCredential: false },
{ key: 'actions.drift_max_leverage', category: 'actions', configPath: 'actions.drift_max_leverage', defaultValue: '5', isCredential: false },
{ key: 'actions.drift_max_position_usd', category: 'actions', configPath: 'actions.drift_max_position_usd', defaultValue: '10000', isCredential: false },
{ key: 'actions.drift_margin_warning_threshold_pct', category: 'actions', configPath: 'actions.drift_margin_warning_threshold_pct', defaultValue: '0.15', isCredential: false },
{ key: 'actions.drift_position_sync_interval_sec', category: 'actions', configPath: 'actions.drift_position_sync_interval_sec', defaultValue: '60', isCredential: false },
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 프레임워크별 별도 positions 테이블 | 통합 defi_positions (category discriminant) | v29.2 설계 확정 | DB 마이그레이션 불필요, PositionTracker 자동 통합 |
| 프레임워크별 별도 모니터 관리 | DeFiMonitorService 통합 라이프사이클 | v29.2 구현 | register() 한 줄로 새 모니터 추가 |
| 정책 로직 분산 | DatabasePolicyEngine 단일 진입점 | v1.2 이후 지속 확장 | Step 4i로 추가하면 evaluate/evaluateAndReserve 모두 적용 |

**이미 준비된 인프라:**
- `POSITION_CATEGORIES` 배열에 `'PERP'` 포함 (core/enums/defi.ts)
- `defi_positions` 테이블 CHECK 제약에 PERP 포함 (schema.ts)
- `PositionTracker.DEFAULT_INTERVALS.PERP = 60_000` (1분 간격)
- `NOTIFICATION_EVENT_TYPES`에 `MARGIN_WARNING`, `LIQUIDATION_IMMINENT` 포함
- i18n 메시지 템플릿에 MARGIN_WARNING, LIQUIDATION_IMMINENT 한/영 정의 완료
- `NotificationService.BROADCAST_EVENTS`에 `LIQUIDATION_IMMINENT` 포함

## Open Questions

1. **Perp 액션의 leverage/size 전달 방식**
   - What we know: LENDING_LTV_LIMIT는 `usdAmount` 파라미터를 evaluateAndReserve()에서 받음. Perp의 leverage와 size는 ContractCallRequest에 포함되지 않음
   - What's unclear: open_position의 leverage/size를 정책 엔진에 어떻게 전달할지
   - Recommendation: TransactionParam에 `perpLeverage?: number`, `perpSizeUsd?: number` 필드 추가 (actionName과 같은 패턴). ActionProviderRegistry.executeResolve()에서 입력 파라미터를 파싱하여 자동 태깅. 또는 ContractCallRequest에 옵셔널 메타데이터 필드 추가

2. **Non-spending 액션 분류 확정**
   - What we know: Lending에서 supply/repay/withdraw는 non-spending, borrow는 spending
   - What's unclear: Perp의 modify_position과 withdraw_margin의 spending 분류
   - Recommendation: open_position = spending (새 포지션 = 자금 투입), modify_position = spending (크기 증가 가능), close_position = non-spending (자금 회수), add_margin = non-spending (마진 추가 = 리스크 감소), withdraw_margin = spending (마진 인출 = 리스크 증가). 이 분류는 정책 평가의 보수성을 유지

## Sources

### Primary (HIGH confidence)
- `packages/core/src/interfaces/lending-provider.types.ts` -- ILendingProvider 패턴
- `packages/core/src/interfaces/yield-provider.types.ts` -- IYieldProvider 패턴
- `packages/core/src/interfaces/position-provider.types.ts` -- IPositionProvider 패턴
- `packages/core/src/interfaces/defi-monitor.types.ts` -- IDeFiMonitor 패턴
- `packages/core/src/interfaces/action-provider.types.ts` -- IActionProvider 기반
- `packages/core/src/enums/defi.ts` -- POSITION_CATEGORIES, POSITION_STATUSES
- `packages/core/src/enums/policy.ts` -- POLICY_TYPES
- `packages/core/src/events/event-types.ts` -- WaiaasEventMap, 이벤트 타입
- `packages/core/src/events/event-bus.ts` -- EventBus typed emit
- `packages/core/src/i18n/en.ts`, `ko.ts` -- MARGIN_WARNING, LIQUIDATION_IMMINENT 템플릿
- `packages/core/src/enums/notification.ts` -- NOTIFICATION_EVENT_TYPES (MARGIN_WARNING 포함)
- `packages/daemon/src/services/monitoring/health-factor-monitor.ts` -- HealthFactorMonitor 구현 패턴
- `packages/daemon/src/services/monitoring/maturity-monitor.ts` -- MaturityMonitor 구현 패턴
- `packages/daemon/src/services/monitoring/defi-monitor-service.ts` -- DeFiMonitorService 오케스트레이터
- `packages/daemon/src/services/defi/position-tracker.ts` -- PositionTracker (PERP 1분 간격)
- `packages/daemon/src/services/defi/position-write-queue.ts` -- PositionWriteQueue upsert
- `packages/daemon/src/pipeline/database-policy-engine.ts` -- LENDING_ASSET_WHITELIST, LENDING_LTV_LIMIT 패턴
- `packages/daemon/src/infrastructure/database/schema.ts` -- defi_positions 테이블 스키마
- `packages/daemon/src/infrastructure/action/action-provider-registry.ts` -- 프로바이더 등록/실행
- `packages/daemon/src/infrastructure/settings/setting-keys.ts` -- Admin Settings 키 정의
- `packages/daemon/src/infrastructure/settings/hot-reload.ts` -- 액션 프로바이더 hot-reload
- `packages/daemon/src/lifecycle/daemon.ts` -- 모니터/트래커 초기화/종료 순서
- `packages/daemon/src/notifications/notification-service.ts` -- BROADCAST_EVENTS
- `packages/daemon/src/__tests__/health-factor-monitor.test.ts` -- 모니터 테스트 패턴
- `packages/daemon/src/__tests__/lending-policy-evaluator.test.ts` -- 정책 평가 테스트 패턴
- `packages/actions/src/providers/aave-v3/index.ts` -- ILendingProvider + IPositionProvider 구현 참조
- `packages/actions/src/providers/pendle/index.ts` -- IYieldProvider + IPositionProvider 구현 참조
- `packages/actions/src/index.ts` -- registerBuiltInProviders 패턴

### Secondary (MEDIUM confidence)
- `internal/objectives/m29-08-drift-solana-perp.md` -- Drift 구현체 설계 (PLANNED 상태, 아직 미구현)
- `internal/objectives/archived/m29-00-defi-advanced-protocol-design.md` -- 3개 프레임워크 설계 문서 (SHIPPED)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- 기존 Lending/Yield 프레임워크 패턴이 명확하고 코드베이스에서 직접 확인
- Architecture: HIGH -- IPerpProvider, MarginMonitor, PerpPolicyEvaluator 모두 1:1 대응하는 기존 구현체 존재
- Pitfalls: HIGH -- LENDING_ASSET_WHITELIST, LENDING_LTV_LIMIT 구현 경험에서 도출된 실제 패턴

**Research date:** 2026-03-02
**Valid until:** 2026-04-02 (30일 -- 안정적 내부 아키텍처)
