# off-chain Action 비동기 추적 확장 설계

> Phase 384, Plan 02 -- AsyncTrackingResult state 확장 + AsyncPollingService 쿼리 확장 + 상태 저장 위치 결정

---

## 1. AsyncTrackingResult.state 확장 설계 (TRCK-01)

### 1.1 기존 4종 state

```typescript
export interface AsyncTrackingResult {
  state: 'PENDING' | 'COMPLETED' | 'FAILED' | 'TIMEOUT';
  details?: Record<string, unknown>;
  nextIntervalOverride?: number;
}
```

기존 state는 on-chain 브릿지/스테이킹 추적에 최적화되어 있다. off-chain 주문(CLOB, CEX order)의 부분 체결, 취소, 정산, 만료 등 세분화된 상태를 표현할 수 없다.

### 1.2 신규 5종 state 추가

| state | 설명 | 용도 | 폴링 계속 여부 |
|-------|------|------|--------------|
| `PARTIALLY_FILLED` | 부분 체결 | CLOB order, 대량 주문 분할 체결 | 계속 |
| `FILLED` | 완전 체결 | off-chain 주문 완전 체결. COMPLETED와 구분 | 종료 |
| `CANCELED` | 사용자/시스템 취소 | 주문 취소, API 키 폐기 등 | 종료 |
| `SETTLED` | 정산 완료 | 자금 이동 확인됨 (브릿지 정산, 결제 완료) | 종료 |
| `EXPIRED` | 비즈니스 만료 | 주문 TTL 초과. TIMEOUT과 구분 | 종료 |

### 1.3 확장된 AsyncTrackingResult

```typescript
export interface AsyncTrackingResult {
  state:
    | 'PENDING'            // 기존: 대기 중
    | 'COMPLETED'          // 기존: on-chain 완료
    | 'FAILED'             // 기존: 실패
    | 'TIMEOUT'            // 기존: 폴링 초과
    | 'PARTIALLY_FILLED'   // 신규: 부분 체결
    | 'FILLED'             // 신규: 완전 체결
    | 'CANCELED'           // 신규: 취소
    | 'SETTLED'            // 신규: 정산 완료
    | 'EXPIRED';           // 신규: 비즈니스 만료
  details?: Record<string, unknown>;
  nextIntervalOverride?: number;
}
```

### 1.4 Zod 스키마 초안

```typescript
export const AsyncTrackingStateEnum = z.enum([
  'PENDING', 'COMPLETED', 'FAILED', 'TIMEOUT',
  'PARTIALLY_FILLED', 'FILLED', 'CANCELED', 'SETTLED', 'EXPIRED',
]);
export type AsyncTrackingState = z.infer<typeof AsyncTrackingStateEnum>;

export const AsyncTrackingResultSchema = z.object({
  state: AsyncTrackingStateEnum,
  details: z.record(z.unknown()).optional(),
  nextIntervalOverride: z.number().int().positive().optional(),
});
```

### 1.5 state 카테고리 분류

**폴링 계속 (in-progress):**
- `PENDING` -- 초기 상태, 아직 결과 없음
- `PARTIALLY_FILLED` -- 부분 결과 있으나 미완료
- (기존 `BRIDGE_MONITORING` -- 브릿지 전용, bridge_status에만 존재)

**정상 종료 (success):**
- `COMPLETED` -- on-chain 완료 (기존 브릿지/스테이킹)
- `FILLED` -- off-chain 주문 완전 체결
- `SETTLED` -- 정산 완료 (자금 이동 확인)
- (기존 `REFUNDED` -- 브릿지 전용, bridge_status에만 존재)

**실패 종료 (failure):**
- `FAILED` -- 일반 실패
- `CANCELED` -- 의도적 취소 (정상적 종료이나 "미완료")
- `EXPIRED` -- 비즈니스 만료 (주문 TTL 초과)
- `TIMEOUT` -- 폴링 초과 (시스템 제한)

### 1.6 COMPLETED vs FILLED vs SETTLED 구분

| state | 의미 | 자금 이동 확인 | 사용 시나리오 |
|-------|------|--------------|-------------|
| `COMPLETED` | on-chain TX 확인 | 블록 확인 수로 판단 | 브릿지, 스테이킹, 일반 TX |
| `FILLED` | off-chain 주문 체결 | 거래소/CLOB 응답 기준 | CEX order, CLOB order |
| `SETTLED` | 자금 이동/정산 완료 | 실제 잔고 변동 확인 | 결제, 출금 완료, T+n 정산 |

**FILLED -> SETTLED 추가 추적**: 일부 venue에서는 FILLED 후 실제 정산까지 추가 시간이 필요하다. tracker 구현체가 FILLED 반환 후에도 폴링을 계속하여 SETTLED를 확인할 수 있다. 이 경우 `nextIntervalOverride`로 폴링 주기를 조절한다.

### 1.7 TIMEOUT vs EXPIRED 구분

| state | 원인 | 결정 주체 |
|-------|------|----------|
| `TIMEOUT` | AsyncPollingService가 maxAttempts 초과 | 시스템 (폴링 제한) |
| `EXPIRED` | 외부 venue에서 주문 만료 응답 | 비즈니스 로직 (TTL) |

**TIMEOUT은 시스템 제한**, EXPIRED는 비즈니스 만료. tracker가 venue API로부터 "order expired" 응답을 받으면 EXPIRED를 반환한다. AsyncPollingService가 maxAttempts에 도달하면 TIMEOUT을 적용한다.

### 1.8 기존 코드 영향 분석

**AsyncPollingService.processResult():**

```typescript
// 기존 코드 (의사 코드)
switch (result.state) {
  case 'COMPLETED':
    await this.updateBridgeStatus(txId, 'COMPLETED');
    break;
  case 'FAILED':
    await this.updateBridgeStatus(txId, 'FAILED');
    break;
  case 'TIMEOUT':
    await this.updateBridgeStatus(txId, timeoutTransition);
    break;
  case 'PENDING':
    // 폴링 계속
    break;
}

// 확장 후
switch (result.state) {
  case 'COMPLETED':
  case 'FILLED':
  case 'SETTLED':
    await this.updateBridgeStatus(txId, result.state);
    await this.emitNotification(txId, result.state);
    break;
  case 'FAILED':
  case 'CANCELED':
  case 'EXPIRED':
    await this.updateBridgeStatus(txId, result.state);
    await this.emitNotification(txId, result.state);
    break;
  case 'TIMEOUT':
    await this.updateBridgeStatus(txId, timeoutTransition);
    break;
  case 'PENDING':
  case 'PARTIALLY_FILLED':
    // 폴링 계속
    if (result.state === 'PARTIALLY_FILLED') {
      await this.updateBridgeStatus(txId, 'PARTIALLY_FILLED');
      await this.emitNotification(txId, 'PARTIALLY_FILLED');
    }
    break;
}
```

**BRIDGE_STATUS_VALUES 확장:**

```typescript
// 기존
export const BRIDGE_STATUS_VALUES = [
  'PENDING', 'COMPLETED', 'FAILED', 'BRIDGE_MONITORING', 'TIMEOUT', 'REFUNDED',
] as const;

// 확장
export const BRIDGE_STATUS_VALUES = [
  'PENDING', 'COMPLETED', 'FAILED', 'BRIDGE_MONITORING', 'TIMEOUT', 'REFUNDED',
  'PARTIALLY_FILLED', 'FILLED', 'CANCELED', 'SETTLED', 'EXPIRED',
] as const;
```

### 1.9 하위 호환

기존 tracker(LI.FI, Across, Lido, Jito, gas-condition)는 기존 4종 state만 사용하며 변경 불필요:

| Tracker | 사용 state | 영향 |
|---------|-----------|------|
| LiFiBridgeStatusTracker | PENDING, COMPLETED, FAILED | 없음 |
| AcrossBridgeStatusTracker | PENDING, COMPLETED, FAILED | 없음 |
| LidoWithdrawalTracker | PENDING, COMPLETED | 없음 |
| JitoEpochTracker | PENDING, COMPLETED | 없음 |
| GasConditionTracker | PENDING, COMPLETED, FAILED | 없음 |

신규 tracker만 확장 state를 사용한다.

---

## 2. AsyncPollingService 쿼리 확장 설계 (TRCK-02)

### 2.1 기존 쿼리 조건

```sql
-- AsyncPollingService.getPendingTransactions()
SELECT * FROM transactions
WHERE bridge_status IN ('PENDING', 'BRIDGE_MONITORING')
   OR status = 'GAS_WAITING';
```

### 2.2 확장 쿼리 조건

```sql
-- 확장: PARTIALLY_FILLED도 폴링 대상에 포함
SELECT * FROM transactions
WHERE bridge_status IN ('PENDING', 'BRIDGE_MONITORING', 'PARTIALLY_FILLED')
   OR status = 'GAS_WAITING';
```

**PARTIALLY_FILLED 추가 근거**: 부분 체결된 주문은 나머지 체결을 기다려야 하므로 폴링을 계속해야 한다.

### 2.3 resolveTrackerName() 확장

```typescript
// 기존
function resolveTrackerName(tx: Transaction): string {
  if (tx.status === 'GAS_WAITING') return 'gas-condition';
  return tx.bridgeMetadata?.tracker || 'bridge';
}

// 확장
function resolveTrackerName(tx: Transaction): string {
  if (tx.status === 'GAS_WAITING') return 'gas-condition';

  // off-chain action: trackerName 우선 사용
  const metadata = tx.bridgeMetadata;
  if (metadata?.trackerName) return metadata.trackerName;

  // 기존 호환: tracker 필드 fallback
  return metadata?.tracker || 'bridge';
}
```

**Phase 380 SignedDataActionTracking.trackerName과 통합:**
- Phase 380에서 `tracking.trackerName`으로 정의
- DB bridge_metadata에 `trackerName` 필드로 저장
- resolveTrackerName()에서 `trackerName` 우선, `tracker` fallback

### 2.4 off-chain action 대상 식별

```sql
-- off-chain action 폴링 대상 (선택적 필터링)
SELECT * FROM transactions
WHERE action_kind IN ('signedData', 'signedHttp')
  AND bridge_status IN ('PENDING', 'PARTIALLY_FILLED')
  AND venue IS NOT NULL;
```

**BRIDGE_MONITORING 제외**: off-chain action에서는 `BRIDGE_MONITORING`을 사용하지 않는다. 이 상태는 on-chain 크로스체인 브릿지 전용이다.

### 2.5 쿼리 성능

- `action_kind` 인덱스: Phase 383 v56에서 `idx_transactions_action_kind` 생성
- `bridge_status` 기존 인덱스: `idx_transactions_bridge_status` (이미 존재)
- 복합 쿼리: 두 인덱스를 SQLite가 자동 선택 (ANALYZE 기반)
- 대량 off-chain action이 예상되면 복합 인덱스 `(action_kind, bridge_status)` 추가 가능 (향후)

### 2.6 off-chain action의 첫 bridge_status 설정 시점

**Phase 383 설계 수정 제안:**

Phase 383에서 off-chain action은 즉시 `status='CONFIRMED'`로 기록한다. 그러나 `tracking`이 있는 경우 비동기 추적이 필요하므로:

```typescript
// Phase 383 recordOffchainAction() 수정
async function recordOffchainAction(
  action: SignedDataAction | SignedHttpAction,
  signingResult: SigningResult,
  context: ActionContext,
): Promise<string> {
  const txId = generateUUIDv7();
  const hasTracking = !!action.tracking;

  await db.insert(transactions).values({
    id: txId,
    // ... 기존 필드 ...
    status: 'CONFIRMED',                          // 서명은 즉시 확정
    bridgeStatus: hasTracking ? 'PENDING' : null,  // tracking 있으면 PENDING
    bridgeMetadata: hasTracking ? JSON.stringify({
      trackerName: action.tracking!.trackerName,
      ...action.tracking!.metadata,
      venue: action.venue,
      operation: action.operation,
    }) : null,
  });

  return txId;
}
```

| tracking 유무 | bridge_status | 폴링 대상 여부 |
|--------------|--------------|---------------|
| tracking 없음 | NULL | 아님 (즉시 완료) |
| tracking 있음 | 'PENDING' | 대상 (AsyncPollingService 폴링) |

---

## 3. tracker 메타데이터 확장 설계 (TRCK-03)

### 3.1 기존 bridge_metadata JSON 구조

```typescript
interface BridgeMetadata {
  tracker: string;          // IAsyncStatusTracker 이름
  lastPolledAt: number;     // 마지막 폴링 시각 (epoch seconds)
  pollCount: number;        // 폴링 횟수
  // + tracker-specific 필드
}
```

### 3.2 off-chain action용 메타데이터 확장

```typescript
interface ExtendedBridgeMetadata {
  // -- 기존 필드 --
  tracker?: string;         // 기존 호환 (trackerName으로 대체)
  lastPolledAt?: number;
  pollCount?: number;

  // -- off-chain action 확장 --
  trackerName: string;
  // IAsyncStatusTracker 이름. 기존 `tracker`와 통합
  // resolveTrackerName()에서 trackerName 우선 사용

  venue?: string;
  // 외부 서비스 식별자 (검색/필터용)

  operation?: string;
  // 액션 이름

  externalId?: string;
  // 외부 서비스 반환 ID (주문 ID, 거래 ID 등)
  // tracker가 venue API 조회 시 사용

  notionalUsd?: number;
  // 추정 USD 가치 (정책 누적 계산용, Plan 01에서 설계)

  actionCategory?: string;
  // 카테고리 (trade, withdraw 등)

  fillPercentage?: number;
  // 체결률 (PARTIALLY_FILLED 시 0~100)
  // tracker가 부분 체결 정보를 받으면 업데이트

  trackerSpecific?: Record<string, unknown>;
  // tracker 구현체별 자유 필드
}
```

### 3.3 Zod 스키마 초안

```typescript
export const ExtendedBridgeMetadataSchema = z.object({
  // 기존 호환
  tracker: z.string().optional(),
  lastPolledAt: z.number().optional(),
  pollCount: z.number().int().nonnegative().optional(),

  // off-chain 확장
  trackerName: z.string().optional(),
  venue: z.string().optional(),
  operation: z.string().optional(),
  externalId: z.string().optional(),
  notionalUsd: z.number().nonnegative().optional(),
  actionCategory: z.string().optional(),
  fillPercentage: z.number().min(0).max(100).optional(),
  trackerSpecific: z.record(z.unknown()).optional(),
}).passthrough();  // 기존 tracker-specific 필드 허용
```

### 3.4 metadata 전달 경로

```
ActionProvider.resolve()
  -> SignedDataAction.tracking = { trackerName, metadata }
    -> recordOffchainAction()
      -> bridge_metadata JSON = {
           trackerName, venue, operation,
           ...tracking.metadata    // tracker-specific 포함
         }
        -> AsyncPollingService.pollAll()
          -> resolveTrackerName(tx) -> trackerName
          -> tracker.checkStatus(txId, bridge_metadata)
            -> tracker가 venue API 호출
            -> AsyncTrackingResult 반환
              -> bridge_metadata 업데이트 (fillPercentage, externalId 등)
```

### 3.5 기존 tracker와의 호환

기존 tracker는 `tracker` 필드를 사용하고 신규 필드를 무시한다:

```typescript
// 기존 LiFiBridgeStatusTracker
async checkStatus(txId: string, metadata: Record<string, unknown>) {
  const fromChainId = metadata.fromChainId;  // tracker-specific
  const toChainId = metadata.toChainId;      // tracker-specific
  // venue, operation, externalId 등은 무시 (사용하지 않음)
}
```

신규 tracker는 확장 필드를 활용한다:

```typescript
// 신규 ClobOrderTracker 예시
async checkStatus(txId: string, metadata: Record<string, unknown>) {
  const venue = metadata.venue as string;       // 'polymarket', 'cow-protocol'
  const externalId = metadata.externalId as string;  // 주문 ID
  const fillPct = metadata.fillPercentage as number | undefined;

  // venue API 조회
  const orderStatus = await this.queryOrderStatus(venue, externalId);

  if (orderStatus.filled === 100) {
    return { state: 'FILLED', details: { fillPercentage: 100 } };
  }
  if (orderStatus.filled > (fillPct ?? 0)) {
    return {
      state: 'PARTIALLY_FILLED',
      details: { fillPercentage: orderStatus.filled },
    };
  }
  if (orderStatus.canceled) {
    return { state: 'CANCELED', details: { reason: orderStatus.cancelReason } };
  }
  if (orderStatus.expired) {
    return { state: 'EXPIRED' };
  }

  return { state: 'PENDING' };
}
```

### 3.6 bridge_metadata 업데이트

AsyncPollingService가 tracker 결과를 받으면 bridge_metadata를 업데이트한다:

```typescript
// AsyncPollingService.processResult() 확장
async processResult(
  txId: string,
  result: AsyncTrackingResult,
  existingMetadata: Record<string, unknown>,
): Promise<void> {
  const updatedMetadata = {
    ...existingMetadata,
    lastPolledAt: Math.floor(Date.now() / 1000),
    pollCount: (existingMetadata.pollCount as number ?? 0) + 1,
    // tracker 결과에서 fillPercentage 등 업데이트
    ...(result.details?.fillPercentage != null
      ? { fillPercentage: result.details.fillPercentage }
      : {}),
    ...(result.details?.externalId != null
      ? { externalId: result.details.externalId }
      : {}),
  };

  await this.updateTransaction(txId, {
    bridgeStatus: result.state,
    bridgeMetadata: JSON.stringify(updatedMetadata),
  });
}
```

---

## 4. 상태 저장 위치 결정 (TRCK-04)

### 4.1 두 가지 선택지 분석

**Option A: transactions 테이블 bridge_status/bridge_metadata 재사용**

장점:
- 기존 AsyncPollingService 인프라(쿼리, 인덱스, 폴링 로직) 100% 재사용
- 추가 테이블 불필요
- DB 마이그레이션 최소화 (CHECK 제약 확장만)
- 기존 Admin UI 트랜잭션 목록에서 자동 표시

단점:
- `bridge_status` 컬럼명이 의미론적으로 부정확 (브릿지 + 주문 상태 혼용)
- bridge_metadata에 이질적인 데이터 혼재

**Option B: 별도 external_action_status 테이블**

장점:
- 의미론적 명확성 (off-chain action 전용)
- 깔끔한 스키마 분리

단점:
- 별도 쿼리/인덱스/마이그레이션 필요
- AsyncPollingService 이중 쿼리 (transactions + external_action_status)
- Admin UI에서 두 테이블 JOIN 필요
- 구현 복잡도 증가

### 4.2 결정: Option A (bridge_status/bridge_metadata 재사용)

**근거:**
1. AsyncPollingService의 기존 인프라를 그대로 활용할 수 있어 구현 복잡도가 크게 낮음
2. bridge_status는 이미 "비동기 추적 상태"라는 범용적 의미를 가짐 (LI.FI 브릿지 + Across 브릿지 + 가스 조건부 등 다양한 용도)
3. 컬럼명 혼란은 코드 주석과 타입 별칭으로 해소 가능
4. 단일 쿼리로 모든 비동기 추적 대상을 조회할 수 있어 운영 편의성 우수

**대안 메모:**
- 향후 `bridge_status` -> `tracking_status`, `bridge_metadata` -> `tracking_metadata`로 리네이밍 마이그레이션 고려
- BREAKING 변경이므로 major version에서 수행
- 현재로서는 기존 이름 유지 (하위 호환 우선)

### 4.3 DB 마이그레이션 v57

Phase 383 v56 다음 순번. bridge_status CHECK 제약에 신규 5종 값을 추가한다.

```sql
-- DB migration v57: bridge_status CHECK 제약 확장 (off-chain action state)

-- SQLite는 CHECK 제약을 ALTER TABLE로 변경할 수 없으므로
-- 기존 bridge_status가 TEXT (CHECK 없음)인 경우:
--   -> 값 검증은 애플리케이션 레벨에서 수행 (Zod 스키마)
--
-- 기존 bridge_status에 CHECK가 있는 경우:
--   -> 테이블 재생성 필요 (SQLite 제약)
--   -> 그러나 기존 코드 확인 결과 bridge_status는 TEXT (CHECK 없음)
--   -> 따라서 마이그레이션은 인덱스 확인 + 버전 업데이트만

-- 1. bridge_status 기존 인덱스 확인 (이미 존재하면 SKIP)
CREATE INDEX IF NOT EXISTS idx_transactions_bridge_status
  ON transactions(bridge_status)
  WHERE bridge_status IS NOT NULL;

-- 2. 복합 인덱스 추가 (off-chain action 폴링 최적화)
CREATE INDEX IF NOT EXISTS idx_transactions_action_kind_bridge_status
  ON transactions(action_kind, bridge_status)
  WHERE bridge_status IS NOT NULL;

-- 3. schema_version 업데이트
UPDATE schema_version SET version = 57;
```

### 4.4 BridgeStatusEnum Zod 확장

```typescript
// 기존
export const BridgeStatusEnum = z.enum([
  'PENDING', 'COMPLETED', 'FAILED', 'BRIDGE_MONITORING', 'TIMEOUT', 'REFUNDED',
]);

// 확장
export const BridgeStatusEnum = z.enum([
  'PENDING', 'COMPLETED', 'FAILED', 'BRIDGE_MONITORING', 'TIMEOUT', 'REFUNDED',
  'PARTIALLY_FILLED', 'FILLED', 'CANCELED', 'SETTLED', 'EXPIRED',
]);
```

### 4.5 Drizzle 스키마 초안 (bridge_status 관련)

```typescript
// packages/daemon/src/infrastructure/database/schema.ts
// bridge_status 컬럼은 이미 text() 타입 (변경 없음)
// 애플리케이션 레벨에서 BridgeStatusEnum으로 검증

bridgeStatus: text('bridge_status'),
  // NULL = 추적 불필요
  // 'PENDING' = 폴링 대기
  // 'PARTIALLY_FILLED' = 부분 체결 (폴링 계속)
  // 'COMPLETED' / 'FILLED' / 'SETTLED' = 정상 종료
  // 'FAILED' / 'CANCELED' / 'EXPIRED' / 'TIMEOUT' = 실패 종료
  // 'BRIDGE_MONITORING' / 'REFUNDED' = 브릿지 전용
```

---

## 5. 기존 tracker 영향 분석

### 5.1 기존 5종 tracker

| Tracker | state 사용 | 신규 state 사용 | 변경 필요 |
|---------|-----------|----------------|----------|
| LiFiBridgeStatusTracker | PENDING, COMPLETED, FAILED | 없음 | 없음 |
| AcrossBridgeStatusTracker | PENDING, COMPLETED, FAILED | 없음 | 없음 |
| LidoWithdrawalTracker | PENDING, COMPLETED | 없음 | 없음 |
| JitoEpochTracker | PENDING, COMPLETED | 없음 | 없음 |
| GasConditionTracker | PENDING, COMPLETED, FAILED | 없음 | 없음 |

**결론: 기존 tracker 5종은 변경 불필요.** 신규 state는 신규 tracker에서만 사용한다.

### 5.2 신규 tracker 예시

**ClobOrderTracker** (Polymarket, CoW Protocol):

```typescript
class ClobOrderTracker implements IAsyncStatusTracker {
  readonly name = 'clob-order';
  readonly maxAttempts = 120;         // 최대 2시간 (60초 간격)
  readonly pollIntervalMs = 60_000;   // 60초
  readonly timeoutTransition = 'TIMEOUT' as const;

  async checkStatus(txId: string, metadata: Record<string, unknown>): Promise<AsyncTrackingResult> {
    const venue = metadata.venue as string;
    const orderId = metadata.externalId as string;

    // venue별 API 클라이언트로 주문 상태 조회
    const status = await this.queryOrder(venue, orderId);

    if (status.filledPercentage === 100) {
      return {
        state: 'FILLED',
        details: { fillPercentage: 100, avgPrice: status.avgPrice },
      };
    }
    if (status.filledPercentage > 0) {
      return {
        state: 'PARTIALLY_FILLED',
        details: { fillPercentage: status.filledPercentage },
      };
    }
    if (status.canceled) return { state: 'CANCELED' };
    if (status.expired) return { state: 'EXPIRED' };

    return { state: 'PENDING' };
  }
}
```

**CexOrderTracker** (Binance 등):

```typescript
class CexOrderTracker implements IAsyncStatusTracker {
  readonly name = 'cex-order';
  readonly maxAttempts = 60;          // 최대 30분 (30초 간격)
  readonly pollIntervalMs = 30_000;
  readonly timeoutTransition = 'TIMEOUT' as const;

  async checkStatus(txId: string, metadata: Record<string, unknown>): Promise<AsyncTrackingResult> {
    // CEX API 호출, credential 기반 인증
    // 주문 상태에 따라 FILLED/PARTIALLY_FILLED/CANCELED/EXPIRED 반환
  }
}
```

**CexWithdrawalTracker** (CEX 출금 추적):

```typescript
class CexWithdrawalTracker implements IAsyncStatusTracker {
  readonly name = 'cex-withdrawal';
  readonly maxAttempts = 360;         // 최대 6시간 (60초 간격)
  readonly pollIntervalMs = 60_000;
  readonly timeoutTransition = 'TIMEOUT' as const;

  // PENDING -> SETTLED (출금 완료) 또는 CANCELED/FAILED
}
```

---

## 6. 알림 연동 설계

### 6.1 기존 AsyncPollingService 알림 콜백

기존 AsyncPollingService는 bridge_status 변경 시 `emitNotification()`을 호출한다. 이 패턴을 off-chain action에도 재사용한다.

### 6.2 신규 이벤트 타입

| 이벤트 | bridge_status 변경 | 설명 |
|--------|-------------------|------|
| `external_action_partially_filled` | PENDING -> PARTIALLY_FILLED | 부분 체결 알림 |
| `external_action_filled` | PENDING/PARTIALLY_FILLED -> FILLED | 완전 체결 알림 |
| `external_action_settled` | FILLED -> SETTLED | 정산 완료 알림 |
| `external_action_canceled` | * -> CANCELED | 취소 알림 |
| `external_action_expired` | * -> EXPIRED | 만료 알림 |
| `external_action_failed` | * -> FAILED | 실패 알림 |

### 6.3 WalletNotificationChannel 이벤트 카테고리 매핑

| 이벤트 | 카테고리 | 우선도 |
|--------|---------|-------|
| `external_action_partially_filled` | `defi` | `normal` |
| `external_action_filled` | `defi` | `normal` |
| `external_action_settled` | `defi` | `normal` |
| `external_action_canceled` | `defi` | `high` |
| `external_action_expired` | `defi` | `normal` |
| `external_action_failed` | `defi` | `high` |

### 6.4 알림 페이로드 구조

```typescript
interface ExternalActionNotificationPayload {
  walletId: string;
  transactionId: string;
  venue: string;
  operation: string;
  state: AsyncTrackingState;
  details?: {
    fillPercentage?: number;
    externalId?: string;
    reason?: string;
  };
}
```

---

## 7. 설계 결정 요약 테이블

| # | 결정 | 근거 |
|---|------|------|
| D1 | bridge_status/bridge_metadata 재사용 (별도 테이블 아님) | AsyncPollingService 기존 인프라 100% 재사용. 구현 복잡도 최소화 |
| D2 | state 9종 확장 (기존 4 + 신규 5) | CLOB order, CEX order, 정산 등 off-chain 비즈니스 상태를 정확히 표현 |
| D3 | PARTIALLY_FILLED를 폴링 대상에 포함 | 부분 체결 주문은 나머지 체결을 기다려야 함. PENDING과 동일하게 폴링 계속 |
| D4 | trackerName을 tracker 필드의 후속으로 사용 | Phase 380 SignedDataActionTracking 설계와 일관. resolveTrackerName()에서 우선 참조 |
| D5 | tracking 없는 off-chain action은 bridge_status NULL | 동기 완료 액션(인증 서명 등)은 비동기 추적 불필요. bridge_status가 NULL이면 폴링 대상 제외 |
| D6 | DB 마이그레이션 v57 (인덱스 추가만) | bridge_status는 TEXT (CHECK 없음). 값 검증은 Zod 스키마에서 수행 |
| D7 | FILLED -> SETTLED 추가 추적 지원 | 일부 venue에서는 체결 후 정산까지 추가 시간 필요. tracker가 nextIntervalOverride로 제어 |
| D8 | 알림 이벤트 6종 추가 (external_action_* 네임스페이스) | 기존 bridge/staking 알림과 구분. defi 카테고리로 분류 |

---

## 8. Pitfall 방지 체크리스트

- [ ] **PARTIALLY_FILLED에서 bridge_metadata 업데이트 누락 방지**: processResult()에서 PARTIALLY_FILLED 시에도 bridge_metadata의 fillPercentage를 업데이트해야 한다. 누락하면 다음 폴링에서 이전 체결률을 알 수 없음
- [ ] **BRIDGE_STATUS_VALUES에 신규 값 추가 누락 방지**: AsyncTrackingResult.state와 BRIDGE_STATUS_VALUES가 동기화되어야 한다. state에만 추가하고 BRIDGE_STATUS_VALUES에 빠뜨리면 DB 저장 시 무의미한 문자열 저장
- [ ] **기존 tracker가 신규 state를 반환하지 않도록 보장**: 기존 5종 tracker의 반환 타입이 기존 4종 state만 포함하는지 타입 레벨에서 검증. 실수로 FILLED를 반환하면 on-chain 트랜잭션이 잘못된 상태로 기록됨
- [ ] **tracking 없는 off-chain action의 bridge_status가 NULL인지 확인**: recordOffchainAction()에서 tracking이 없으면 bridge_status를 설정하지 않아야 함. NULL이 아닌 빈 문자열을 넣으면 폴링 대상에서 제외되지 않을 수 있음
- [ ] **bridge_metadata JSON 파싱 실패 시 graceful 처리**: 기존 레코드의 bridge_metadata에 trackerName이 없을 수 있음. resolveTrackerName()에서 tracker -> trackerName 순서로 fallback 필수
- [ ] **TIMEOUT vs EXPIRED 혼동 방지**: tracker 구현체에서 venue API가 "expired" 응답을 주면 EXPIRED를 반환. AsyncPollingService의 maxAttempts 초과만 TIMEOUT. 두 상태를 혼동하면 사용자에게 잘못된 정보 전달
- [ ] **v57 마이그레이션에서 기존 인덱스 중복 생성 방지**: `CREATE INDEX IF NOT EXISTS` 사용. 이미 bridge_status 인덱스가 존재하면 건너뜀

---

*Phase: 384-policy-tracking, Plan: 02*
*작성일: 2026-03-12*
