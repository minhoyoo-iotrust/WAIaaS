# Project Research Summary

**Project:** WAIaaS 인커밍 트랜잭션 모니터링 설계 (m27)
**Domain:** Crypto Wallet Incoming Transaction Monitoring — Self-Hosted AI Agent Wallet Service
**Researched:** 2026-02-21
**Confidence:** HIGH (Solana/EVM 공식 문서 + viem 소스코드 + WAIaaS 코드베이스 직접 분석)

## Executive Summary

WAIaaS는 아웃고잉 TX만 추적하는 현재 구조에 인커밍 TX 모니터링 레이어를 추가하는 설계 마일스톤이다. 신규 npm 패키지는 전혀 필요 없다. `@solana/kit ^6.0.1`의 `logsNotifications()` WebSocket 구독과 `viem ^2.21.0`의 `watchEvent`/`watchBlocks`가 필요한 모든 API를 이미 포함한다. Solana는 `logsSubscribe({ mentions: [walletAddress] })` 단일 구독으로 SOL + 모든 SPL 토큰을 감지할 수 있으며, EVM은 `eth_subscribe("logs")` + Transfer 토픽 필터로 ERC-20을, `eth_subscribe("newHeads")` + TX 스캔으로 네이티브 ETH를 감지한다.

가장 중요한 아키텍처 결정은 **IChainSubscriber를 IChainAdapter와 분리된 별도 인터페이스**로 설계하는 것이다. 기존 22메서드 stateless 어댑터에 WebSocket 상태를 혼입하면 AdapterPool 캐싱, 계약 테스트, 외부 플러그인 호환성이 모두 깨진다. 신규 `IncomingTxMonitorService`가 구독 생명주기를 오케스트레이션하고, `incoming_transactions` 별도 테이블(v21 마이그레이션)에 수신 이력을 저장하며, 기존 EventBus에 `transaction:incoming` 이벤트를 추가하는 구조가 WAIaaS 코드베이스에 가장 적합하다.

핵심 위험은 세 가지다. 첫째, WebSocket 재연결 구간에서 발생한 TX가 영구 유실되는 "블라인드 구간" 문제로, 커서 기반 갭 보상 폴링이 필수 컴포넌트다. 둘째, better-sqlite3 단일 라이터에 WebSocket 고빈도 이벤트가 충돌하는 SQLITE_BUSY 문제로, 메모리 큐 + BackgroundWorkers flush 패턴으로 해결해야 한다. 셋째, Solana에서 `confirmed` 레벨 수신 TX 롤백 가능성으로, AI 에이전트 로직 트리거는 `finalized` 상태에서만 허용해야 한다.

---

## Key Findings

### Recommended Stack

신규 npm 패키지 추가 없이 기존 스택만으로 완전한 인커밍 TX 모니터링이 구현 가능하다. viem의 WebSocket transport는 `reconnect: { attempts: 10 }` + `keepAlive: { interval: 30_000 }` 내장 지원으로 EVM 재연결을 자동 처리하며, Solana의 `@solana/kit`은 자동 재연결을 제공하지 않아 어플리케이션 레벨 재연결 루프(지수 백오프, max 30s)를 직접 구현해야 한다. 폴링 폴백은 Solana의 `getSignaturesForAddress({ until: lastKnownSig })` + EVM의 `getLogs({ fromBlock, toBlock })` 조합으로 기존 HTTP 클라이언트를 재사용한다.

**Core technologies:**
- `@solana/kit ^6.0.1`: Solana WebSocket 구독(`logsNotifications`) + TX 상세 파싱(`getTransaction jsonParsed`) + 폴링 폴백(`getSignaturesForAddress`) — 이미 설치됨
- `viem ^2.21.0`: EVM WebSocket 구독(`watchEvent poll:false`, `watchBlocks`) + 이벤트 로그 파싱(`parseEventLogs`) + 폴링 폴백(`getLogs`) — 이미 설치됨
- Node.js 22 / better-sqlite3: 단일 라이터 SQLite — 메모리 큐 + BackgroundWorkers flush 패턴 필수

**중요 API 주의사항:**
- `@solana/kit`에서 `logsSubscribe`는 `logsNotifications()`로 노출됨 (메서드명 코드 레벨 재확인 필요 — MEDIUM 신뢰도)
- viem `webSocket()` transport와 `fallback()` transport를 함께 쓰면 auto-reconnect 버그 발생 — WebSocket 단독 사용 필수
- EVM native ETH 이체는 이벤트 로그를 생성하지 않으므로 `watchBlocks({ includeTransactions: true })` 블록 스캔 필수

### Expected Features

**Must have (table stakes — P1):**
- 네이티브 토큰 수신 감지 (SOL, ETH) — 모든 지갑 서비스의 기본 기대
- SPL / ERC-20 토큰 수신 감지 — AI 에이전트의 토큰 자금 흐름 추적 필수
- `incoming_transactions` 테이블 + 중복 제거 (`tx_hash` UNIQUE + ON CONFLICT IGNORE)
- 전역 게이트(`incoming_enabled`) + 지갑별 옵트인(`monitor_incoming` 컬럼) 2단계 활성화
- WebSocket 불가 시 폴링 폴백 (최대 30초 지연 허용, 설계 문서에 명시 필요)
- 수신 이력 REST API (`GET /v1/wallet/incoming`, 커서 페이지네이션)
- `TX_INCOMING` 알림 이벤트 (28→29개, 기존 `transaction` 카테고리 재사용)
- 수신 이력 보존 정책 (`incoming_retention_days`, 기본 90일)

**Should have (competitive — P2):**
- WebSocket 연결 체인당 공유 (지갑별 개별 연결 아닌 멀티플렉서) — 확장성 핵심
- 지수 백오프 재연결 (1s→2s→…→60s + jitter) — 재연결 폭풍 방지
- 의심 TX 감지 (`INCOMING_TX_SUSPICIOUS`): 먼지 공격 임계값 + 미등록 토큰 플래그
- MCP 도구 `list_incoming_transactions` — AI 에이전트 자율 DeFi 반응 활성화
- Solana ATA 동적 구독 관리 — 신규 토큰 최초 수신 시 ATA 자동 등록

**Defer (v2+):**
- MCP Resource `waiaas://wallet/incoming` — SSE 인프라 미설계
- 수신 집계 요약 엔드포인트 (`GET /v1/wallet/incoming/summary`)
- NFT 수신 감지 — 별도 마일스톤으로 명시적 분리

**Anti-features (채택 금지):**
- 외부 인덱서 (Helius, Alchemy Notify) — self-hosted 철학 위반
- 활성화 시 과거 이력 백필 — archive RPC 필요, 거짓 완전성 보장
- 기본 전체 감시 (모든 지갑 자동 구독) — RPC 비용 폭발

### Architecture Approach

기존 WAIaaS 아키텍처 패턴을 최대한 재사용한다. `IChainSubscriber` 신규 인터페이스를 `packages/core/src/interfaces/`에 추가하고, 체인별 구현체(`SolanaIncomingSubscriber`, `EvmIncomingSubscriber`)를 각 어댑터 패키지에 배치한다. `IncomingTxMonitorService`가 오케스트레이터 역할로 DaemonLifecycle Step 4c-9(fail-soft)에 통합된다. 데이터는 `incoming_transactions` 별도 테이블에 저장하고(v21 마이그레이션), 이벤트는 기존 EventBus에 `transaction:incoming` 추가로 전파한다.

**Major components:**
1. `IChainSubscriber` (core/interfaces) — `subscribe()`, `unsubscribe()`, `subscribedAddresses()`, `destroy()` 4메서드 인터페이스
2. `SolanaIncomingSubscriber` (adapters/solana) — `logsNotifications({ mentions })` 구독, `getTransaction(jsonParsed)` 파싱, `getSignaturesForAddress` 폴링 폴백
3. `EvmIncomingSubscriber` (adapters/evm) — `getLogs` 폴링 구현, `parseEventLogs` 파싱, BackgroundWorkers 등록
4. `IncomingTxMonitorService` (daemon/services/monitoring) — 구독 생명주기 오케스트레이션, DB 직접 쿼리(`monitor_incoming=1` 지갑), `syncSubscriptions()` hot-reload 연동
5. `incoming_transactions` 테이블 (DB v21) — `tx_hash` UNIQUE, `wallet_id` FK CASCADE, 2-state(`DETECTED`/`CONFIRMED`), 보존 정책

**데이터 흐름:**
```
블록체인 → IChainSubscriber → IncomingTxMonitorService
  → 메모리 큐 → BackgroundWorkers flush
  → INSERT incoming_transactions (ON CONFLICT IGNORE)
  → eventBus.emit('transaction:incoming')
    → NotificationService.notify('TX_INCOMING')
```

**빌드 순서:** core 인터페이스 → DB 스키마 → 어댑터 구현 → 서비스 레이어 → API 레이어

### Critical Pitfalls

1. **블라인드 구간 TX 유실 (C-01, CRITICAL)** — WebSocket 재연결 중 발생한 TX 영구 누락. 마지막 처리 서명/블록 커서를 DB에 저장하고, 재연결 직후 커서 이후 갭 보상 폴링 필수. idempotent INSERT(ON CONFLICT IGNORE)로 WebSocket + 폴링 중복 처리 안전 보장.

2. **SQLite 단일 라이터 충돌 (C-02, CRITICAL)** — WebSocket 고빈도 이벤트가 better-sqlite3 동기 쓰기와 충돌 → SQLITE_BUSY 에러. WebSocket 핸들러에서 직접 DB 쓰기 금지. 메모리 큐 → BackgroundWorkers flush 단일 라이터 패턴 적용. `PRAGMA busy_timeout = 5000` 설정.

3. **Solana confirmed 롤백 위험 (C-03, CRITICAL)** — `confirmed` 레벨 수신 후 롤백 시 에이전트가 없는 자금 기준으로 행동. 알림은 `confirmed`에 발송 가능하나, 에이전트 로직 트리거는 `finalized`만 허용. DB 상태를 `DETECTED`/`CONFIRMED` 2단계로 설계.

4. **Solana ATA 감지 누락 (H-01, HIGH)** — SPL 토큰은 지갑 주소가 아닌 ATA(Associated Token Account)에서 잔액이 변경됨. `logsSubscribe({ mentions })` 방식은 이를 포함해 감지하나, `getTransaction(jsonParsed)` 파싱 시 `preTokenBalances` 항목이 없는 경우(최초 수신)를 0n으로 처리해야 함. Token-2022 Program ID도 양쪽 모두 지원 필요.

5. **WebSocket 메모리 누수 (H-02, HIGH)** — 재연결 시 이전 구독 핸들러 미정리 → 동일 TX 중복 처리 + 메모리 단조 증가. `Map<walletId, { unsubscribe: () => void }>` 구독 레지스트리 필수. 재연결 전 전체 정리 실행.

---

## Implications for Roadmap

이 마일스톤은 **설계 전용**이다. 구현은 별도 마일스톤에서 진행된다. 설계 문서가 구체적인 API 명세, 스키마 DDL, 상태 모델, 인터페이스 계약을 모두 포함해야 구현 마일스톤에서 재연구 없이 바로 착수 가능하다.

### Phase 1: 핵심 인터페이스 + DB 스키마 설계
**Rationale:** 하위 모든 phase가 IChainSubscriber 인터페이스 계약과 DB 스키마에 의존한다. 의존성 최상위에 위치.
**Delivers:** `IChainSubscriber.ts` 인터페이스 명세 (4메서드 + `IncomingTransaction` 타입), `incoming_transactions` DDL (인덱스 + CHECK constraints 포함), `wallets.monitor_incoming` 컬럼 명세, v21 마이그레이션 전략, 2단계 상태 모델(`DETECTED`/`CONFIRMED`), 커서 저장 전략
**Addresses:** 테이블 스테이크 기능 전체의 데이터 기반
**Avoids:** C-01(커서 컬럼 포함 여부 결정), C-02(메모리 큐 flush 전략 결정), M-03(마이그레이션 번호 및 전략 명시)

### Phase 2: Solana 감지 전략 설계
**Rationale:** Solana는 ATA 복잡성으로 EVM보다 설계 난이도가 높다. EVM 설계의 참조 기준이 되므로 먼저 확정.
**Delivers:** `SolanaIncomingSubscriber` 설계 — `logsNotifications({ mentions })` 구독 패턴, `getTransaction(jsonParsed)` 파싱 알고리즘(preBalances/postBalances, preTokenBalances/postTokenBalances), Token-2022 지원, `getSignaturesForAddress` 폴링 폴백 커서 관리, 재연결 루프 명세
**Uses:** `@solana/kit` `logsNotifications()` (MEDIUM 신뢰도 — 메서드명 코드 재확인 포함)
**Avoids:** H-01(ATA 감지 누락 해소), C-01(갭 보상 폴링 명세), C-03(finalized commitment 정책)

### Phase 3: EVM 감지 전략 설계
**Rationale:** Solana 설계와 동일한 패턴(IChainSubscriber 구현, 커서, 폴링 폴백)을 적용. EVM은 ATA 복잡성 없이 단일 `getLogs` 배치 쿼리로 모든 ERC-20 감지 가능.
**Delivers:** `EvmIncomingSubscriber` 설계 — `getLogs` 폴링 방식(안정성 우선), native ETH `watchBlocks({ includeTransactions: true })` + to-주소 필터, ERC-20 `parseEventLogs` 파싱, BackgroundWorkers 등록 명세(간격 12초), token_registry 화이트리스트 필터
**Uses:** `viem` `getLogs`, `watchBlocks`, `parseEventLogs`
**Avoids:** H-05(Transfer 이벤트 오탐 — token_registry 화이트리스트 명세), H-02(unwatch 레지스트리)

### Phase 4: WebSocket 연결 관리 + 재연결 설계
**Rationale:** WebSocket 재연결 로직은 Solana/EVM 양쪽에 공통 적용되는 횡단 관심사. 개별 어댑터 설계 완료 후 통합 명세 작성.
**Delivers:** 지수 백오프 재연결 상태 머신 (1s→2s→4s→…→60s + jitter), 구독 레지스트리 자료구조(`Map<walletId, unsubscribeFn>`), 재연결 후 갭 보상 흐름도, Solana 10분 inactivity 대응 heartbeat(60초 간격), viem WebSocket transport 설정(`reconnect`, `keepAlive`), 체인당 단일 WebSocket 공유 멀티플렉서 명세
**Avoids:** H-02(메모리 누수), H-03(RPC 구독 한도), M-01(inactivity timeout)

### Phase 5: IncomingTxMonitorService + 데이터 레이어 설계
**Rationale:** 어댑터 인터페이스와 DB 스키마 확정 후 오케스트레이터 레이어를 설계. BackgroundWorkers 통합 패턴이 BalanceMonitorService와 동일하므로 기존 패턴 명세 참조.
**Delivers:** `IncomingTxMonitorService` 명세 — fail-soft 초기화(Step 4c-9), `getMonitoredWallets()` DB 직접 쿼리, `syncSubscriptions()` hot-reload 연동, 메모리 큐 + flush 배치 INSERT 전략, KillSwitch 상태 확인 흐름, `PRAGMA busy_timeout = 5000` 명세
**Avoids:** C-02(SQLite 단일 라이터 충돌), M-06(BackgroundWorkers 데드락), M-05(KillSwitch 미통합)

### Phase 6: 알림 이벤트 + REST API + MCP 명세
**Rationale:** 서비스 레이어 확정 후 외부 인터페이스를 명세. SSoT 순서(Zod enum → TypeScript → DB CHECK) 준수.
**Delivers:** `TX_INCOMING` 알림 이벤트 추가 명세(28→29), 메시지 템플릿(ko/en), 먼지 공격 임계값 필터 설계, `GET /v1/wallet/incoming` REST API 명세(필터, 커서 페이지네이션, sessionAuth), wallet PATCH endpoint `monitor_incoming` 필드 추가, MCP `list_incoming_transactions` 도구 명세, skill 파일 업데이트 계획
**Avoids:** M-02(알림 폭탄), M-04(SSoT 이벤트 미등록)

### Phase 7: config.toml [incoming] 섹션 + 설계 통합 검증
**Rationale:** 모든 설계 결정을 설정 모델로 통합하고, 설계 문서 간 교차 검증 수행. 설계-only 마일스톤의 최종 deliverable.
**Delivers:** `[incoming]` 섹션 6개 flat 키 명세(`incoming_enabled`, `incoming_mode`, `incoming_poll_interval`, `incoming_retention_days`, `incoming_suspicious_dust_usd`, `incoming_suspicious_amount_multiplier`), SettingsService hot-reload 대상 구분(재시작 불필요 vs 필요), 설계 결정 SSoT 문서, 전체 설계 교차 검증 체크리스트
**Avoids:** 설계 일관성 결함, 구현 마일스톤에서의 재설계 비용

### Phase Ordering Rationale

- **인터페이스 → 어댑터 → 서비스 → API 순서**는 WAIaaS 표준 빌드 순서와 동일. 하위 계층이 상위 계층의 계약에 의존하는 단방향 의존성.
- **Solana 먼저**: EVM보다 ATA 복잡성이 높아 설계 위험이 크다. 먼저 확정하면 설계 결정이 EVM Phase에 패턴을 제공.
- **WebSocket 관리 별도 Phase**: Solana와 EVM 양쪽에 걸친 횡단 관심사를 개별 어댑터 설계와 분리하면 중복 없이 통합 명세 가능.
- **알림/API 마지막**: 서비스 레이어 데이터 모델이 확정된 후에야 API 응답 스키마와 알림 페이로드를 정확히 명세할 수 있음.

### Research Flags

설계 phase에서 추가 조사가 필요한 항목:
- **Phase 2 (`@solana/kit` API 메서드명):** `logsNotifications()` 메서드명을 코드베이스(`packages/adapters/solana/`)에서 직접 확인 필요. MEDIUM 신뢰도 항목 — QuickNode 가이드 기반이며 공식 문서 미확인. 임포트 경로 및 타입 시그니처 코드 레벨 검증 권장.
- **Phase 2 (logsSubscribe 주소 배열 지원 여부):** QuickNode 가이드에서 주소 1개 제한 언급. 멀티플렉서 설계에 영향을 미치므로 Phase 2에서 확인 후 Phase 4 설계에 반영.
- **Phase 4 (RPC 구독 한도):** Solana 공개 mainnet RPC의 WebSocket 동시 구독 수 한도가 문서화되지 않음. 운영 환경에서 지갑 수 증가 시 실제 한도 테스트 필요.

표준 패턴으로 추가 연구 불필요한 항목:
- **Phase 3 (EVM getLogs 폴링):** viem 공식 문서 고신뢰도 확인 완료. 구현 패턴 명확.
- **Phase 5 (BackgroundWorkers 통합):** BalanceMonitorService 기존 패턴 그대로 적용. 재연구 불필요.
- **Phase 6 (알림 SSoT):** NOTIFICATION_EVENT_TYPES 확장 패턴 확립됨. CLAUDE.md 규칙 명시.
- **Phase 7 (config.toml flat-section):** WAIaaS 기존 [balance_monitor] 섹션 패턴 그대로 적용.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Solana 공식 RPC 문서 + viem 소스코드 직접 확인. 단, `@solana/kit`의 `logsNotifications()` 메서드명은 MEDIUM |
| Features | HIGH | 경쟁사 분석(MetaMask/Phantom/Trust Wallet) + WAIaaS 코드베이스 직접 검증 + m27-00 설계 문서 교차 확인 |
| Architecture | HIGH | WAIaaS 코드베이스 직접 분석. BalanceMonitorService, BackgroundWorkers, EventBus 기존 패턴 확인 완료 |
| Pitfalls | MEDIUM-HIGH | Critical/High 함정은 공식 문서 + GitHub 이슈 검증. RPC 구독 수 한도 수치는 LOW (제공자별 미문서화) |

**Overall confidence:** HIGH

### Gaps to Address

- **`@solana/kit` `logsNotifications()` 메서드명**: 설계 Phase 2에서 코드베이스(`packages/adapters/solana/src/`)의 실제 임포트를 확인하여 메서드명과 타입 시그니처를 고정. 구현 시 혼선 방지.
- **Solana RPC `logsSubscribe` 구독당 주소 제한**: QuickNode 가이드에서 1개 주소만 허용한다고 언급. 공식 문서에서 배열 지원 여부 확인 후 멀티플렉서 설계(체인당 단일 WebSocket, 지갑당 별도 구독)에 반영.
- **EVM WebSocket vs 폴링 우선순위 결정**: ARCHITECTURE.md는 폴링 우선을 권고하나 STACK.md는 WebSocket 방식도 제시. `EvmIncomingSubscriber`가 WebSocket(`watchBlocks`) 우선인지 폴링(`getLogs`) 우선인지를 Phase 3 설계에서 명시적으로 결정.
- **KillSwitch 통합 동작 정책**: SUSPENDED 상태에서 인커밍 알림을 suppress할지 모니터링 전체를 중단할지 설계 결정이 필요. Phase 5에서 명시.

---

## Sources

### Primary (HIGH confidence)
- Solana 공식 RPC 문서 — `logsSubscribe`, `accountSubscribe`, `getSignaturesForAddress`, `getTransaction jsonParsed`
- Solana Exchange Integration Guide — ATA 모니터링 패턴, preBalances/postBalances 파싱
- viem 공식 문서 + GitHub 소스코드 — `watchEvent`, `watchBlocks`, `getLogs`, `parseEventLogs`, `webSocket transport`
- viem GitHub Issue #2325 (closed 2024-07-26) — WebSocket reconnect 버그 수정 확인
- viem GitHub Discussion #503 — eth_subscribe vs polling 동작 검증
- WAIaaS 코드베이스 직접 분석 — `schema.ts`(DB v20), `migrate.ts`(LATEST_SCHEMA_VERSION=20), `balance-monitor-service.ts`, `workers.ts`, `notification-service.ts`, `daemon.ts`, `IChainAdapter.ts`
- WAIaaS 내부 설계 문서 m27-00 — 인커밍 TX 모니터링 기본 설계

### Secondary (MEDIUM confidence)
- QuickNode — `@solana/kit` `createSolanaRpcSubscriptions` API 패턴, `logsNotifications()` 메서드명
- Helius 문서 — Solana commitment levels, 10분 inactivity timeout, heartbeat 권장
- Geth 공식 문서 — `eth_subscribe` 타입, 10k notification buffer 제한
- MetaMask / Phantom 제품 문서 — 경쟁사 알림 기능 분석
- ethers.js GitHub Issue #1121 — WebSocket 재연결 메모리 누수 패턴
- Trust Wallet 지원 문서 — 먼지 공격 특성 및 방어 임계값

### Tertiary (LOW confidence)
- EVM Transfer 이벤트 위장 시나리오 — 이론적 분석, 실제 사례 미확인
- WAL checkpoint + WebSocket 이벤트 데드락 — 아키텍처적 추론, 부하 테스트 미수행
- Solana 공개 RPC WebSocket 동시 구독 수 한도 — 제공자별 미문서화, 경험적 데이터 기반

---
*Research completed: 2026-02-21*
*Ready for roadmap: yes*
