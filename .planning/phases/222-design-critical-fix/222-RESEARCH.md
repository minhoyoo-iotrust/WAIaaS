# Phase 222: 설계 문서 Critical/High 불일치 수정 - Research

**Researched:** 2026-02-21
**Domain:** 설계 문서 내부 일관성 수정 (doc 76 — incoming transaction monitoring)
**Confidence:** HIGH

## Summary

Phase 222는 v27.0 마일스톤 감사에서 발견된 Critical 2건(GAP-2, GAP-3) + High 2건(GAP-1, GAP-4) + FLOW-2(Critical E2E 중단) 총 5건의 설계 불일치를 수정하는 작업이다. 모든 불일치는 단일 설계 문서 `docs/design/76-incoming-transaction-monitoring.md`(2,161줄) 내부의 섹션 간 참조 불일치로, 코드 구현이 아닌 설계 문서 텍스트 수정으로 해결된다.

핵심 문제는 네 가지로 귀결된다: (1) §5.2 reconnectLoop이 IChainSubscriber 인터페이스(§1.4)에 없는 `connect()`/`waitForDisconnect()` 메서드를 호출 (GAP-1), (2) EVM/Solana 폴링 BackgroundWorker가 §8.9 DaemonLifecycle Step 6에 미등록되어 폴링 모드 진입 시 실제 폴링이 수행되지 않음 (GAP-2, FLOW-2), (3) §7.6 summary SQL이 존재하지 않는 `incoming_tx_suspicious` 테이블을 참조 (GAP-3), (4) §2.6 eventBus.emit이 §6.1에 정의된 IncomingTxEvent 타입과 불일치 (GAP-4).

**Primary recommendation:** 5건의 불일치를 2개 Plan으로 분리하여 수정한다. Plan 222-01은 인터페이스/타입 계층(GAP-1, GAP-4)을 수정하고, Plan 222-02는 런타임 연결(GAP-2, GAP-3, FLOW-2)을 수정한다.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| GAP-1 | reconnectLoop이 IChainSubscriber에 없는 connect()/waitForDisconnect() 호출 (high) | §1.4 인터페이스에 2개 메서드 추가 또는 reconnectLoop 시그니처 변경. 아래 "Architecture Patterns > GAP-1 해결 전략" 참조 |
| GAP-2 | EVM/Solana 폴링 BackgroundWorker 미등록 (critical) | §8.9 Step 6에 incoming-tx-poll-evm, incoming-tx-poll-solana 2개 워커 등록. 아래 "Architecture Patterns > GAP-2 해결 전략" 참조 |
| GAP-3 | Summary SQL incoming_tx_suspicious 미정의 테이블 참조 (critical) | §7.6 SQL의 서브쿼리를 is_suspicious 컬럼으로 대체, §2.1/§2.7에 컬럼 추가. 아래 "Architecture Patterns > GAP-3 해결 전략" 참조 |
| GAP-4 | eventBus.emit('transaction:incoming') 타입 충돌 (high) | §2.6 emit 페이로드를 §6.1 IncomingTxEvent와 일치시키거나 이벤트명 분리. 아래 "Architecture Patterns > GAP-4 해결 전략" 참조 |
| FLOW-2 | WebSocket 실패 -> 폴링 폴백 E2E 흐름 중단 (critical) | GAP-2 해결로 자동 완성. 추가로 §5.1 상태 머신에서 POLLING 상태 진입 시 폴링 워커 활성화 트리거 명세 필요 |
</phase_requirements>

## Standard Stack

이 Phase는 코드 구현이 아닌 설계 문서(Markdown) 수정이므로, 라이브러리/패키지 설치는 불필요하다.

### Core
| 도구 | 용도 | 비고 |
|------|------|------|
| 텍스트 편집기 | doc 76 Markdown 수정 | 2,161줄 단일 파일 |

### 참조 대상 코드베이스 패턴
| 패턴 | 위치 | 참조 이유 |
|------|------|----------|
| IChainAdapter 인터페이스 | `packages/core/src/interfaces/IChainAdapter.ts` | IChainSubscriber 인터페이스 확장 시 기존 패턴 참조 |
| WaiaasEventMap | `packages/core/src/events/event-types.ts` | eventBus 이벤트 타입 정의 패턴 참조 |
| BackgroundWorkers 등록 | `packages/daemon/src/lifecycle/daemon.ts` L910-990 | Step 6 워커 등록 패턴 참조 |
| NotificationEventType | `packages/core/src/enums/notification.ts` | 28개 이벤트 (INCOMING 2개 추가 시 30개) |

## Architecture Patterns

### GAP-1 해결 전략: IChainSubscriber connect()/waitForDisconnect() 미정의

**문제 위치:**
- §1.4 (L77-128): IChainSubscriber 인터페이스에 4개 메서드만 정의 (subscribe, unsubscribe, subscribedWallets, destroy)
- §5.2 (L1082-1106): reconnectLoop 함수에서 `subscriber.connect()`, `subscriber.waitForDisconnect()` 호출 -- IChainSubscriber에 없는 메서드

**해결 옵션 분석:**

| 옵션 | 변경 범위 | 장점 | 단점 |
|------|----------|------|------|
| A: IChainSubscriber에 connect()/waitForDisconnect() 추가 | §1.4 인터페이스 수정 | reconnectLoop 코드 유지 | 폴링 전용 구현체(EVM)에 불필요 메서드 강제 |
| B: reconnectLoop 시그니처를 인터페이스가 아닌 별도 타입으로 변경 | §5.2 reconnectLoop 수정 | IChainSubscriber 최소 유지 | 새 타입 도입 필요 |
| C: IChainSubscriber에 optional 메서드로 추가 | §1.4 수정 | 폴링 전용 구현체 영향 최소 | TypeScript에서 인터페이스 optional은 런타임 체크 필요 |

**추천: 옵션 A** -- connect()/waitForDisconnect()를 IChainSubscriber에 추가.
- 근거: SolanaIncomingSubscriber(§3.7)는 WebSocket 모드를 지원하므로 connect/waitForDisconnect가 필요
- EVM(§4.7)은 폴링 우선(D-06)이지만, 향후 WebSocket 모드 확장을 위해 no-op 구현으로 대응 가능
- destroy()에 더해 connect()/waitForDisconnect()를 추가하면 인터페이스가 6개 메서드로 확장: subscribe, unsubscribe, subscribedWallets, connect, waitForDisconnect, destroy
- 기존 코드에 IChainSubscriber 구현체가 없으므로 (설계 단계) 인터페이스 확장의 비용이 0

**변경 대상 섹션:**
1. §1.4 (L77-128): 인터페이스에 connect(), waitForDisconnect() 추가
2. §3.7 (L631-702): SolanaIncomingSubscriber에 connect()/waitForDisconnect() 구현 추가
3. §4.7 (L925-1013): EvmIncomingSubscriber에 no-op connect()/waitForDisconnect() 추가

### GAP-2 해결 전략: 폴링 BackgroundWorker 미등록

**문제 위치:**
- §4.7 (L982): EvmIncomingSubscriber.pollAll() 메서드가 정의되어 있으나 호출하는 BackgroundWorker가 §8.9에 미등록
- §3.5 (L561-597): pollSolanaTransactions() 함수가 독립 함수로 정의되어 있으나 SolanaIncomingSubscriber(§3.7)에 pollAll() 메서드가 없음
- §8.9 (L2118-2139): Step 6 BackgroundWorkers에 incoming-tx-flush, incoming-tx-retention, incoming-tx-confirm-solana, incoming-tx-confirm-evm 4개만 등록. `incoming-tx-poll-evm`, `incoming-tx-poll-solana` 미등록

**해결 방안:**
1. §3.7 SolanaIncomingSubscriber에 `pollAll()` 메서드 추가 (§3.5의 pollSolanaTransactions를 클래스 메서드로 이동)
2. §8.9 Step 6에 2개 폴링 워커 등록:
   ```
   Step 6: BackgroundWorkers
     ├── incoming-tx-flush (5초, 메모리 큐 → DB)
     ├── incoming-tx-retention (1시간, 보존 정책)
     ├── incoming-tx-confirm-solana (30초, DETECTED → CONFIRMED)
     ├── incoming-tx-confirm-evm (30초, DETECTED → CONFIRMED)
     ├── incoming-tx-poll-solana (incoming_poll_interval, 폴링 모드 시)  ← 신규
     └── incoming-tx-poll-evm (incoming_poll_interval, 폴링 모드 시)    ← 신규
   ```
3. 폴링 워커는 SubscriptionMultiplexer 상태가 POLLING일 때만 활성화 (WEBSOCKET 상태에서는 skip)

**변경 대상 섹션:**
1. §3.7 (L631-702): SolanaIncomingSubscriber에 pollAll() 추가
2. §8.9 (L2118-2139): Step 6에 incoming-tx-poll-solana, incoming-tx-poll-evm 등록

### GAP-3 해결 전략: Summary SQL의 미정의 테이블 참조

**문제 위치:**
- §7.6 (L1903): SQL에서 `incoming_tx_suspicious` 테이블을 서브쿼리로 참조
  ```sql
  COUNT(CASE WHEN id IN (SELECT incoming_tx_id FROM incoming_tx_suspicious) THEN 1 END) AS suspicious_count
  ```
- 이 테이블은 어디에도 정의되지 않음 (§2.1, §2.7 마이그레이션에 없음)
- §7.6 끝부분(L1911)에 이미 대안이 코멘트로 언급: "`incoming_transactions`에 `is_suspicious INTEGER DEFAULT 0` 컬럼을 추가하는 것도 고려"

**해결 방안:**
1. §2.1 incoming_transactions DDL에 `is_suspicious INTEGER NOT NULL DEFAULT 0` 컬럼 추가
2. §2.7 v21 마이그레이션에 해당 컬럼 포함
3. §7.6 SQL 수정:
   ```sql
   COUNT(CASE WHEN is_suspicious = 1 THEN 1 END) AS suspicious_count
   ```
4. §6.5 IIncomingSafetyRule 처리 후 is_suspicious = 1로 UPDATE하는 흐름 추가
5. §7.6 끝의 "구현 시 결정" 코멘트 삭제 (결정 완료)

**변경 대상 섹션:**
1. §2.1 (L151-168): incoming_transactions DDL에 is_suspicious 컬럼 추가
2. §2.7 (L320-369): v21 마이그레이션 코드에 is_suspicious 포함
3. §7.6 (L1896-1911): SQL 수정 + 코멘트 삭제

### GAP-4 해결 전략: eventBus.emit 타입 충돌

**문제 위치:**
- §2.6 (L314): `eventBus.emit('transaction:incoming', { count: inserted })` -- 페이로드가 `{ count: number }`
- §6.1 (L1391-1404): `'transaction:incoming': IncomingTxEvent` -- 페이로드가 `{ walletId, txHash, fromAddress, amount, ... }` (개별 TX 정보)

의미론적 충돌: §2.6은 "배치 flush 완료" 이벤트(집계), §6.1은 "개별 TX 감지" 이벤트(상세)

**해결 방안:**
이벤트를 2개로 분리:
1. `'incoming:flush:complete'` (§2.6) -- 배치 flush 후 삽입 건수 알림 (내부 오케스트레이션용)
2. `'transaction:incoming'` (§6.1) -- 개별 TX 감지 이벤트 (IncomingTxEvent 페이로드, 알림 트리거용)

**구체적 수정:**
- §2.6 flush 후 이벤트: `eventBus.emit('incoming:flush:complete', { count: inserted })` 로 이벤트명 변경
- 또는 flush 후 개별 TX에 대해 `eventBus.emit('transaction:incoming', txEvent)` 를 loop으로 발행
- §6.1 IncomingTxEvent 페이로드는 유지

**추천:** §2.6에서 flush 후 삽입된 각 TX에 대해 개별 `'transaction:incoming'` 이벤트를 발행하고, `{ count }` 형태의 집계 이벤트를 별도 내부 이벤트(`'incoming:flush:complete'`)로 분리. flush 코드 블록에서 batch 결과를 순회하며 개별 이벤트 발행.

**변경 대상 섹션:**
1. §2.6 (L306-318): flush 후 이벤트 발행 코드 수정
2. §6.1 (L1386-1393): WaiaasEventMap에 `'incoming:flush:complete'` 추가

### FLOW-2 해결 전략: WebSocket -> 폴링 폴백 E2E 흐름 완성

**문제:** GAP-2(폴링 워커 미등록)로 인해 POLLING 상태 진입 후 실제 폴링이 수행되지 않아 E2E 흐름이 중단됨.

**해결:** GAP-2 수정(폴링 워커 등록)으로 자동 완성. 추가로:
1. §5.1 상태 머신에 POLLING 진입 시 폴링 워커 활성화 트리거를 명시
2. §5.2 reconnectLoop에서 `onStateChange('POLLING')` 호출 시 폴링 워커가 구독된 지갑의 pollAll()을 실행하기 시작함을 명시
3. 전체 E2E 흐름을 한 곳에 요약 추가:
   ```
   WS 연결 실패 → reconnectLoop 3회 실패 → onStateChange('POLLING')
   → incoming-tx-poll-{chain} 워커 활성화 → subscriber.pollAll() 주기 실행
   → TX 감지 → memoryQueue.push() → incoming-tx-flush 워커가 DB 기록
   → WS 재연결 성공 → onStateChange('WEBSOCKET') → 폴링 워커 비활성화
   ```

**변경 대상 섹션:**
1. §5.1 (L1019-1051): POLLING 진입/이탈 시 워커 활성화/비활성화 명시
2. §5.2 (L1082-1107): reconnectLoop에서 폴링 워커 연동 설명 추가

## Don't Hand-Roll

| 문제 | 하지 말 것 | 대신 할 것 | 이유 |
|------|-----------|-----------|------|
| 인터페이스 일관성 | 새로운 인터페이스 계층 도입 | IChainSubscriber에 메서드 추가 | 기존 D-01 결정(별도 인터페이스) 유지하면서 누락 메서드만 보완 |
| 폴링 워커 | 새로운 스케줄링 메커니즘 | 기존 BackgroundWorkers 패턴 | daemon.ts Step 6의 workers.register() 패턴 그대로 사용 |
| 의심 TX 카운트 | 별도 테이블(incoming_tx_suspicious) | is_suspicious 컬럼 | JOIN 없는 단순 쿼리, 마이그레이션 최소화 |

**Key insight:** 이 Phase는 새로운 아키텍처를 도입하지 않는다. 기존 설계의 "빈 구멍"을 채우는 작업이므로, 기존 패턴을 정확히 따르는 것이 핵심이다.

## Common Pitfalls

### Pitfall 1: IChainSubscriber 인터페이스 과도 확장
**What goes wrong:** connect/waitForDisconnect 외에 다른 메서드까지 추가하여 인터페이스가 비대해짐
**Why it happens:** "이왕 수정하는 김에" 마인드
**How to avoid:** GAP-1에서 요구하는 2개 메서드만 추가. Phase 222는 감사 갭 수정이지 기능 확장이 아님
**Warning signs:** 인터페이스 메서드가 6개를 초과하면 과도 확장

### Pitfall 2: 폴링 워커와 WebSocket 동시 실행
**What goes wrong:** WEBSOCKET 상태에서도 폴링 워커가 실행되어 RPC 비용 낭비
**Why it happens:** 워커 등록만 하고 상태 기반 활성화/비활성화 조건을 누락
**How to avoid:** 워커 handler에서 현재 연결 상태(§5.1)를 확인하고, POLLING 상태일 때만 pollAll() 호출
**Warning signs:** 워커 등록 코드에 상태 체크가 없음

### Pitfall 3: is_suspicious 컬럼 추가 시 기존 §2.6 flush 코드 미수정
**What goes wrong:** incoming_transactions에 is_suspicious 컬럼을 추가했지만, IncomingTxQueue.flush()의 INSERT 문에 컬럼이 누락됨
**Why it happens:** §2.1/§2.7만 수정하고 §2.6을 놓침
**How to avoid:** is_suspicious 관련 변경 시 §2.1, §2.6, §2.7, §7.6 네 곳을 모두 확인
**Warning signs:** INSERT 문의 컬럼 수와 DDL 컬럼 수 불일치

### Pitfall 4: eventBus 이벤트명 변경 시 §6.4 알림 연동 미반영
**What goes wrong:** §2.6 이벤트명을 변경했지만, 알림 서비스가 이전 이벤트명을 리스닝하는 코드가 남음
**Why it happens:** 이벤트 발행부만 수정하고 수신부 검토 누락
**How to avoid:** 이벤트명 변경 시 발행(emit)과 수신(on/subscribe) 양쪽 모두 검토
**Warning signs:** grep으로 이벤트명 검색 시 불일치 발견

### Pitfall 5: SolanaIncomingSubscriber pollAll() 추가 시 §3.5 standalone 함수 중복
**What goes wrong:** §3.7에 pollAll() 추가 후 §3.5의 standalone pollSolanaTransactions() 함수가 남아 중복 정의
**Why it happens:** 기존 코드 정리 누락
**How to avoid:** §3.7 pollAll()이 §3.5 로직을 통합하도록 참조 관계를 명시하거나, §3.5를 "내부 구현 참조"로 표시

## Code Examples

이 Phase는 설계 문서 수정이므로 코드 예시는 "수정 후 설계 문서에 포함될 코드"를 보여준다.

### GAP-1: IChainSubscriber 수정 후 (§1.4)
```typescript
// 기존 4메서드 + 신규 2메서드 = 6메서드
export interface IChainSubscriber {
  readonly chain: ChainType;

  subscribe(walletId: string, address: string, network: string,
    onTransaction: (tx: IncomingTransaction) => void): Promise<void>;
  unsubscribe(walletId: string): Promise<void>;
  subscribedWallets(): string[];

  /** WebSocket 연결 시작. 폴링 전용 구현체는 no-op 반환. */
  connect(): Promise<void>;

  /** WebSocket 연결 끊김 대기. 연결 중단 시 resolve. 폴링 전용 구현체는 never-resolving Promise. */
  waitForDisconnect(): Promise<void>;

  destroy(): Promise<void>;
}
```

### GAP-2: Step 6 폴링 워커 등록 (§8.9)
```typescript
// POLLING 상태일 때만 실행
workers.register('incoming-tx-poll-solana', {
  interval: config.incoming.incoming_poll_interval * 1000, // 기본 30초
  handler: async () => {
    if (connectionState !== 'POLLING') return; // WEBSOCKET 상태에서는 skip
    await solanaSubscriber.pollAll();
  },
});

workers.register('incoming-tx-poll-evm', {
  interval: config.incoming.incoming_poll_interval * 1000,
  handler: async () => {
    if (connectionState !== 'POLLING') return;
    await evmSubscriber.pollAll();
  },
});
```

### GAP-3: Summary SQL 수정 후 (§7.6)
```sql
SELECT
  date(detected_at, 'unixepoch') AS date,
  COUNT(*) AS total_count,
  SUM(CAST(amount AS INTEGER)) AS total_amount_native,
  COUNT(CASE WHEN is_suspicious = 1 THEN 1 END) AS suspicious_count
FROM incoming_transactions
WHERE wallet_id = ?
GROUP BY date(detected_at, 'unixepoch')
ORDER BY date DESC
LIMIT 30;
```

### GAP-4: flush 이벤트 수정 후 (§2.6)
```typescript
flush(sqlite: Database): IncomingTransaction[] {
  if (this.queue.length === 0) return [];
  const batch = this.queue.splice(0, this.MAX_BATCH);
  // ... INSERT 로직 ...
  return insertedTxs; // 삽입된 TX 목록 반환
}

// BackgroundWorkers 등록
workers.register('incoming-tx-flush', {
  interval: 5_000,
  handler: () => {
    const inserted = incomingTxQueue.flush(sqlite);
    // 개별 TX에 대해 이벤트 발행 (§6.1 IncomingTxEvent 타입 일치)
    for (const tx of inserted) {
      eventBus.emit('transaction:incoming', {
        walletId: tx.walletId,
        txHash: tx.txHash,
        fromAddress: tx.fromAddress,
        amount: tx.amount,
        tokenAddress: tx.tokenAddress,
        chain: tx.chain,
        network: tx.network,
        detectedAt: tx.detectedAt,
      });
    }
  },
});
```

## State of the Art

해당 없음 -- 이 Phase는 외부 기술이 아닌 내부 설계 문서 일관성 수정이다.

## 수정 대상 섹션 매트릭스

| 섹션 | 줄 범위 | GAP-1 | GAP-2 | GAP-3 | GAP-4 | FLOW-2 |
|------|---------|-------|-------|-------|-------|--------|
| §1.4 IChainSubscriber | L77-128 | **수정** | | | | |
| §2.1 DDL | L149-194 | | | **수정** | | |
| §2.6 flush 패턴 | L263-318 | | | **수정** | **수정** | |
| §2.7 v21 마이그레이션 | L320-369 | | | **수정** | | |
| §3.5 Solana 폴링 | L561-597 | | 참조 | | | |
| §3.7 Solana 전체 구조 | L631-702 | **수정** | **수정** | | | |
| §4.7 EVM 전체 구조 | L925-1013 | **수정** | 확인 | | | |
| §5.1 상태 머신 | L1019-1051 | | | | | **수정** |
| §5.2 재연결 루프 | L1052-1107 | 확인 | | | | **수정** |
| §6.1 이벤트 타입 | L1373-1411 | | | | **수정** | |
| §7.6 Summary SQL | L1861-1911 | | | **수정** | | |
| §8.9 DaemonLifecycle | L2118-2139 | | **수정** | | | **수정** |

**총 수정 섹션: 12개 중 10개 (2개는 확인만)**

## Plan 분리 전략

### 222-01: 인터페이스 + 타입 계층 수정 (GAP-1, GAP-4)
- §1.4 IChainSubscriber에 connect()/waitForDisconnect() 추가
- §3.7 SolanaIncomingSubscriber에 connect()/waitForDisconnect() 구현
- §4.7 EvmIncomingSubscriber에 no-op connect()/waitForDisconnect()
- §2.6 eventBus.emit 페이로드를 IncomingTxEvent로 통일
- §6.1 WaiaasEventMap에 'incoming:flush:complete' 내부 이벤트 추가

### 222-02: 런타임 연결 + 데이터 계층 수정 (GAP-2, GAP-3, FLOW-2)
- §2.1 DDL에 is_suspicious 컬럼 추가
- §2.6 INSERT 문에 is_suspicious 포함
- §2.7 v21 마이그레이션에 is_suspicious 반영
- §3.7 SolanaIncomingSubscriber에 pollAll() 추가
- §7.6 Summary SQL 수정
- §8.9 Step 6에 incoming-tx-poll-solana, incoming-tx-poll-evm 등록
- §5.1 POLLING 상태 진입/이탈 시 폴링 워커 연동 명시
- §5.2 reconnectLoop에 폴링 워커 활성화 설명 추가

## Open Questions

1. **pollAll()을 IChainSubscriber 인터페이스에 추가할 것인가?**
   - What we know: EvmIncomingSubscriber(§4.7)는 pollAll()을 public 메서드로 가지고 있고, SolanaIncomingSubscriber(§3.7)에도 추가 예정
   - What's unclear: pollAll()을 인터페이스 메서드로 승격할지, 구현체 전용으로 유지할지
   - Recommendation: **인터페이스에 추가하지 않음**. 폴링은 BackgroundWorker가 직접 호출하며, 체인별 구현체를 직접 참조. IChainSubscriber는 구독 관리에 집중하고, pollAll()은 구현 세부사항으로 유지. 단, 두 구현체 모두 pollAll() public 메서드를 갖도록 일관성은 확보.

2. **is_suspicious 컬럼을 IncomingTransaction 타입에도 추가할 것인가?**
   - What we know: §1.2의 IncomingTransaction 타입에는 is_suspicious가 없음
   - What's unclear: DB 전용 필드인지 도메인 모델에도 포함할지
   - Recommendation: IncomingTransaction 타입에는 추가하지 않음. is_suspicious는 DB 레이어(Drizzle 스키마)에서만 관리하고, 안전 규칙 검사 결과로 UPDATE 수행. API 응답에서는 별도 필드로 노출 가능.

## Sources

### Primary (HIGH confidence)
- `docs/design/76-incoming-transaction-monitoring.md` -- 전체 섹션 교차 분석 (2,161줄)
- `.planning/v27.0-MILESTONE-AUDIT.md` -- GAP-1~4, FLOW-2 정의
- `.planning/REQUIREMENTS.md` -- 29개 요구사항 + 9개 gap closure 항목
- `.planning/ROADMAP.md` -- Phase 222 목표/의존/성공 기준

### Secondary (HIGH confidence)
- `packages/core/src/interfaces/IChainAdapter.ts` -- 기존 인터페이스 패턴 (22 메서드)
- `packages/core/src/events/event-types.ts` -- WaiaasEventMap 5개 이벤트 패턴
- `packages/daemon/src/lifecycle/daemon.ts` L910-990 -- BackgroundWorkers Step 6 등록 패턴
- `packages/core/src/enums/notification.ts` -- 28개 NotificationEventType

### Phase Summaries (HIGH confidence)
- `.planning/phases/215-ichainsubscriber-db-schema/215-SUMMARY.md` -- D-01~D-06
- `.planning/phases/218-websocket-polling-fallback/218-SUMMARY.md` -- D-07~D-09
- `.planning/phases/220-rest-api-sdk-mcp/220-SUMMARY.md` -- API-01~05

## Metadata

**Confidence breakdown:**
- GAP-1 해결 전략: HIGH -- 문제와 해결이 명확 (인터페이스에 2개 메서드 추가)
- GAP-2 해결 전략: HIGH -- 문제와 해결이 명확 (Step 6에 2개 워커 등록)
- GAP-3 해결 전략: HIGH -- 설계 문서 자체에 대안이 이미 코멘트로 존재 (L1911)
- GAP-4 해결 전략: HIGH -- 이벤트 의미론 분리가 명확
- FLOW-2 해결: HIGH -- GAP-2 수정으로 자동 완성

**Research date:** 2026-02-21
**Valid until:** 해당 없음 (내부 설계 문서 수정이므로 시한 없음)
