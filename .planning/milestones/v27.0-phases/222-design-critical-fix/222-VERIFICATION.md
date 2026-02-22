---
phase: 222-design-critical-fix
verified: 2026-02-21T11:30:00Z
status: passed
score: 5/5 must-haves verified
re_verification: false
gaps: []
human_verification: []
---

# Phase 222: Design Critical Fix Verification Report

**Phase Goal:** 감사에서 발견된 Critical/High 설계 불일치 4건을 수정하여 구현 전 설계 완결성 확보
**Verified:** 2026-02-21T11:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | IChainSubscriber에 connect()/waitForDisconnect() 메서드가 추가됨 | VERIFIED | §1.4 L122-133: 두 메서드 시그니처 존재, reconnectLoop(§5.2) L1199/1202에서 호출 일치 |
| 2 | incoming-tx-poll-evm, incoming-tx-poll-solana BackgroundWorker가 §8.9 DaemonLifecycle Step 6에 등록됨 | VERIFIED | §8.9 Step 6 목록에 6개 워커 (기존 4 + 신규 2). 등록 코드에 connectionState !== 'POLLING' 조건 체크 포함 |
| 3 | Summary SQL의 incoming_tx_suspicious 테이블 참조가 is_suspicious 컬럼으로 대체됨 | VERIFIED | §7.6 SQL: `COUNT(CASE WHEN is_suspicious = 1 THEN 1 END)`. incoming_tx_suspicious 문서 전체에서 0건 검색됨 |
| 4 | eventBus.emit('transaction:incoming') 이벤트 타입이 IncomingTxEvent와 일치하게 통일됨 | VERIFIED | §2.6 emit 페이로드 8개 필드가 §6.1 IncomingTxEvent 8개 필드와 1:1 일치. `satisfies IncomingTxEvent` 타입 가드 적용 |
| 5 | FLOW-2 E2E 흐름이 완성됨 | VERIFIED | §5.2에 5단계 흐름 명시 (WS 실패 → 폴링 전환 → 워커 활성화 → TX 감지/DB 기록 → WS 복구). §5.1에 폴링 워커 연동 메커니즘 명시 |

**Score:** 5/5 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `internal/design/76-incoming-transaction-monitoring.md` | GAP-1, GAP-2, GAP-3, GAP-4, FLOW-2 수정된 설계 문서 | VERIFIED | 파일 존재. 4개 커밋(439396f, 09addb2, cc26304, 23137e1)이 이 파일만 수정. ~2,300줄 실질적 내용. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| §1.4 IChainSubscriber | §5.2 reconnectLoop | connect()/waitForDisconnect() 메서드 호출 | WIRED | reconnectLoop L1199: `await subscriber.connect()`, L1202: `await subscriber.waitForDisconnect()`. IChainSubscriber 인터페이스에 두 메서드 정의됨 |
| §2.6 flush 이벤트 | §6.1 WaiaasEventMap | eventBus.emit('transaction:incoming', IncomingTxEvent) | WIRED | §2.6 emit 페이로드 8필드 === §6.1 IncomingTxEvent 8필드. `satisfies IncomingTxEvent` 타입 검증 |
| §5.1 상태 머신 POLLING | §8.9 incoming-tx-poll-* 워커 | connectionState === 'POLLING' 조건부 활성화 | WIRED | §5.1 "폴링 워커 연동" 섹션에 명시. §8.9 워커 handler: `if (multiplexer.connectionState !== 'POLLING') return` |
| §2.1 DDL is_suspicious | §7.6 Summary SQL | is_suspicious 컬럼 참조 | WIRED | §2.1 DDL: `is_suspicious INTEGER NOT NULL DEFAULT 0`. §2.7 마이그레이션 동일. §2.6 INSERT: `is_suspicious` 포함. §7.6: `COUNT(CASE WHEN is_suspicious = 1 THEN 1 END)` |
| §8.9 폴링 워커 | §3.7/§4.7 pollAll() | subscriber.pollAll() 호출 | WIRED | §8.9: `await solanaSubscriber.pollAll()` / `await evmSubscriber.pollAll()`. §3.7 SolanaIncomingSubscriber에 pollAll() 메서드 구현됨 |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| GAP-1 | 222-01 | reconnectLoop IChainSubscriber connect()/waitForDisconnect() 미정의 (high) | SATISFIED | §1.4에 6번째/5번째 메서드로 추가. §3.7 Solana 구현, §4.7 EVM no-op 구현. REQUIREMENTS.md: Done |
| GAP-4 | 222-01 | eventBus.emit 타입 충돌 (high) | SATISFIED | §2.6 emit을 개별 TX IncomingTxEvent로 변경. 집계 이벤트는 'incoming:flush:complete'로 분리. REQUIREMENTS.md: Done |
| GAP-2 | 222-02 | 폴링 BackgroundWorker 미등록 (critical) | SATISFIED | §8.9 Step 6에 incoming-tx-poll-solana, incoming-tx-poll-evm 등록. connectionState 조건부 실행. REQUIREMENTS.md: Done |
| GAP-3 | 222-02 | Summary SQL incoming_tx_suspicious 미정의 테이블 참조 (critical) | SATISFIED | §2.1/§2.7 DDL에 is_suspicious 컬럼 추가. §2.6 INSERT에 포함. §7.6 SQL 수정. incoming_tx_suspicious 참조 0건. REQUIREMENTS.md: Done |
| FLOW-2 | 222-02 | WebSocket→폴링 폴백 흐름 중단 (critical) | SATISFIED | §5.2에 5단계 E2E 흐름 완성. §5.1 폴링 워커 활성화/비활성화 메커니즘 명시. REQUIREMENTS.md: Done |

**Orphaned requirements:** None — REQUIREMENTS.md의 Phase 222 항목 5건이 모두 두 Plan에 할당됨.

---

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| (none) | — | — | — |

Anti-pattern scan: TODO/FIXME/XXX/HACK/PLACEHOLDER — 0건. "구현 시 결정" — 0건. §7.6 끝의 미결 코멘트 삭제 확인됨.

---

### Human Verification Required

None — 이 Phase는 설계 문서 텍스트 수정 작업으로, 모든 성공 기준이 텍스트/패턴 검색으로 검증 가능하다.

---

## Detailed Findings

### GAP-1: IChainSubscriber 인터페이스 확장 (VERIFIED)

`internal/design/76-incoming-transaction-monitoring.md` §1.4 (L91-141):

```typescript
export interface IChainSubscriber {
  readonly chain: ChainType;
  subscribe(...): Promise<void>;
  unsubscribe(walletId: string): Promise<void>;
  subscribedWallets(): string[];
  connect(): Promise<void>;         // 신규 추가
  waitForDisconnect(): Promise<void>; // 신규 추가
  destroy(): Promise<void>;
}
```

**메서드 수:** 정확히 6개 (plan이 요구한 upper bound 준수).

구현체 확인:
- §3.7 SolanaIncomingSubscriber (L722-734): WebSocket connect/waitForDisconnect 실제 구현
- §4.7 EvmIncomingSubscriber (L1063-1073): no-op connect + never-resolving waitForDisconnect

§5.2 reconnectLoop (L1199/1202)가 `subscriber.connect()` / `subscriber.waitForDisconnect()`를 호출하며, 두 메서드가 IChainSubscriber 인터페이스에 정의되어 있으므로 타입 계층 일관성 확보.

### GAP-2: 폴링 BackgroundWorker 등록 (VERIFIED)

§8.9 DaemonLifecycle Step 6 (L2268-2297):

```
Step 6: BackgroundWorkers
  ├── incoming-tx-flush (5초, 메모리 큐 → DB)
  ├── incoming-tx-retention (1시간, 보존 정책)
  ├── incoming-tx-confirm-solana (30초, DETECTED → CONFIRMED)
  ├── incoming-tx-confirm-evm (30초, DETECTED → CONFIRMED)
  ├── incoming-tx-poll-solana (incoming_poll_interval, POLLING 상태에서만 활성)
  └── incoming-tx-poll-evm (incoming_poll_interval, POLLING 상태에서만 활성)
```

등록 코드에 `if (multiplexer.connectionState !== 'POLLING') return` 조건 체크가 양쪽 워커 모두에 포함됨. §3.7 SolanaIncomingSubscriber에 pollAll() 메서드 (L741-767) 추가됨. §4.7 EvmIncomingSubscriber의 pollAll()은 기존부터 존재.

### GAP-3: is_suspicious 컬럼 일관 적용 (VERIFIED)

네 섹션 모두 일관:
- §2.1 DDL (L179): `is_suspicious INTEGER NOT NULL DEFAULT 0`
- §2.6 INSERT (L297): `is_suspicious` 컬럼 목록 포함, `tx.isSuspicious ?? 0` 값
- §2.7 v21 마이그레이션 CREATE TABLE (L380): `is_suspicious INTEGER NOT NULL DEFAULT 0`
- §7.6 Summary SQL (L2040): `COUNT(CASE WHEN is_suspicious = 1 THEN 1 END) AS suspicious_count`

`incoming_tx_suspicious` 테이블 참조: 문서 전체 0건 (grep 확인).

§1.2 IncomingTransaction 타입에 is_suspicious 미포함 — plan 의도(DB 전용 필드) 준수.

### GAP-4: eventBus.emit 타입 통일 (VERIFIED)

§2.6 flush 후 이벤트 발행 (L327-344):
- 개별 TX마다 `eventBus.emit('transaction:incoming', { ...8개 필드... } satisfies IncomingTxEvent)` 발행
- 집계: `eventBus.emit('incoming:flush:complete', { count: inserted.length })`

§6.1 WaiaasEventMap (L1522-1530):
- `'transaction:incoming': IncomingTxEvent` — 8개 필드 타입
- `'incoming:flush:complete': { count: number }` — 신규 추가

페이로드 필드 1:1 일치 확인: `walletId, txHash, fromAddress, amount, tokenAddress, chain, network, detectedAt`.

`flush()` 반환 타입: `IncomingTransaction[]` (기존 `number`에서 변경).

### FLOW-2: E2E 흐름 완성 (VERIFIED)

§5.2 (L1215-1241)에 "WebSocket → 폴링 폴백 E2E 흐름 (FLOW-2)" 5단계 요약 존재:
1. WS 연결 실패 → reconnectLoop에서 subscriber.connect() throw
2. 3회 실패 시 onStateChange('POLLING')
3. 폴링 워커 활성화 → subscriber.pollAll() 실행
4. TX 감지 → DB 기록 → eventBus.emit('transaction:incoming', IncomingTxEvent)
5. WS 재연결 성공 → onStateChange('WEBSOCKET') → 폴링 워커 자동 비활성화

§5.1 (L1152-1156)에 폴링 워커 연동 메커니즘 명시 (POLLING 진입/이탈 조건).

### Commit Verification

4개 커밋 모두 유효하며 단일 파일(`internal/design/76-incoming-transaction-monitoring.md`)만 수정:
- `439396f`: GAP-1 — IChainSubscriber connect()/waitForDisconnect() 추가 (+40줄)
- `09addb2`: GAP-4 — eventBus.emit 타입 통일 + flush:complete 이벤트 (+36/-6줄)
- `cc26304`: GAP-3 — is_suspicious 컬럼 DDL/INSERT/마이그레이션/Summary SQL (+16/-5줄)
- `23137e1`: GAP-2+FLOW-2 — 폴링 워커/pollAll()/E2E 흐름 (+97/-1줄)

---

## Summary

Phase 222의 목표인 "구현 전 설계 완결성 확보"가 완전히 달성되었다.

설계 문서 `internal/design/76-incoming-transaction-monitoring.md`에서:
- GAP-1: IChainSubscriber 인터페이스가 6메서드로 확장되어 reconnectLoop과 일관됨
- GAP-2: 2개 폴링 BackgroundWorker가 Step 6에 등록되어 POLLING 상태에서 실제 감지 수행 가능
- GAP-3: is_suspicious 컬럼이 DDL/INSERT/마이그레이션/Summary SQL 4개 섹션에 일관 적용되고 미정의 테이블 참조가 완전 제거됨
- GAP-4: eventBus.emit 페이로드가 IncomingTxEvent 타입과 정확히 일치하며 집계 이벤트 분리됨
- FLOW-2: WebSocket 실패에서 폴링 폴백까지의 5단계 E2E 흐름이 한 곳에 요약되어 완성됨

REQUIREMENTS.md의 Phase 222 항목 5건(GAP-1~4, FLOW-2) 모두 Done 상태. 미결 코멘트 0건. Anti-pattern 0건.

---

*Verified: 2026-02-21T11:30:00Z*
*Verifier: Claude (gsd-verifier)*
