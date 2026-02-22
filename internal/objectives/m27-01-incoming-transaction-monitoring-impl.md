# 마일스톤 m27-01: 수신 트랜잭션 모니터링 구현

- **Status:** PLANNED
- **Milestone:** v27.1

## 목표

m27에서 설계한 수신 트랜잭션 모니터링 — IncomingTransactionMonitor, 수신 TX 저장, 조회 API, 이벤트/알림 연동 — 을 구현하여, 에이전트 지갑으로 들어오는 입금을 실시간 감지하고 DB에 기록하며 Owner에게 알림을 발송할 수 있는 상태.

---

## 배경

m27에서 5개 설계 산출물(ITM-01~ITM-05)이 정의되었다. m27-01은 이 설계를 코드로 구현한다.

---

## 구현 대상 설계 문서

| 설계 ID | 기능 | 구현 범위 |
|---------|------|----------|
| ITM-01 | IncomingTransactionMonitor | IChainSubscriber 인터페이스, SolanaSubscriber(logsSubscribe+getTransaction), EvmSubscriber(watchEvent+watchBlocks), WebSocket→폴링 폴백, 갭 보상 폴링, 연결 관리, 지갑별 동적 구독 |
| ITM-02 | 수신 트랜잭션 저장 | incoming_transactions 테이블, incoming_tx_cursors 커서 테이블, Zod 스키마, tx_hash UNIQUE 중복 방지, 메모리 큐+배치 flush, 보존 정책(retention_days 자동 삭제) |
| ITM-03 | 수신 이력 조회 API | GET /v1/wallet/incoming (cursor pagination, 필터), GET /v1/wallet/incoming/summary, SDK/MCP 확장 |
| ITM-04 | 수신 이벤트 + 알림 연동 | EventBus `transaction:incoming` 이벤트, TX_INCOMING/TX_INCOMING_SUSPICIOUS 알림 타입, KillSwitch 상태 연동, 의심 입금 감지 규칙, MCP 리소스, i18n 메시지 |
| ITM-05 | 설정 구조 | config.toml [incoming] 섹션 7키 (wss_url 포함), 지갑별 monitor_incoming opt-in, 환경변수 매핑, Admin Settings 런타임 변경 |

---

## 산출물

### REST API 추가

| 메서드 | 경로 | 인증 | 기능 |
|--------|------|------|------|
| GET | /v1/wallet/incoming | sessionAuth | 수신 트랜잭션 이력 조회 |
| GET | /v1/wallet/incoming/summary | sessionAuth | 기간별 수신 합계 |

### DB 마이그레이션 (v20 → v21)

| 테이블 | 변경 |
|--------|------|
| incoming_transactions | 신규 — 수신 TX 레코드 (id, tx_hash, wallet_id, from_address, amount, token_mint, chain, network, status, block_number, slot, detected_at, confirmed_at) |
| incoming_tx_cursors | 신규 — 지갑별 마지막 처리 위치 (wallet_id, last_signature, last_block_number) — 갭 보상 폴링용 |
| wallets | monitor_incoming 컬럼 추가 (INTEGER NOT NULL DEFAULT 0) |

### 이벤트 + 알림 추가

**EventBus 이벤트 (내부):**

| 이벤트 | 설명 |
|--------|------|
| `transaction:incoming` | WaiaasEventMap에 추가. 모든 수신 TX 감지 시 emit |

**NotificationEventType (알림 발송):**

| 타입 | 설명 | 발송 방식 |
|------|------|----------|
| TX_INCOMING | 수신 트랜잭션 감지 시 Owner 알림 | notify() |
| TX_INCOMING_SUSPICIOUS | 의심스러운 입금 (dust attack, 미등록 토큰) 감지 시 | broadcast() |

기존 28개 → 30개. KillSwitch SUSPENDED/LOCKED 시 알림 suppress (DB 기록은 유지).

---

## E2E 검증 시나리오

m27에서 정의한 17개 핵심 검증 시나리오(T-01~T-17)와 4개 보안 시나리오(S-01~S-04)를 구현하여 자동화 테스트로 검증한다.

**자동화 비율: 100%**

---

## 의존

| 의존 대상 | 이유 |
|----------|------|
| m27 (수신 TX 모니터링 설계) | 5개 설계 산출물 (ITM-01~ITM-05) 정의 |
| m20 (릴리스) | 코어 인프라 안정화 상태에서 모니터링 기능 추가 |

---

## 리스크

### CRITICAL (운영 중단 / TX 유실)

| # | 리스크 | 영향 | 대응 방안 |
|---|--------|------|----------|
| C-1 | WebSocket 재연결 중 블라인드 구간 TX 유실 | 수신 TX 영구 누락 | `incoming_tx_cursors` 테이블로 마지막 처리 위치 저장 + 재연결 직후 갭 보상 폴링 |
| C-2 | 고빈도 수신 이벤트 + SQLite 단일 라이터 충돌 (SQLITE_BUSY) | 데몬 전체 불안정 | 메모리 큐 수집 → BackgroundWorkers 배치 flush 패턴. WebSocket 핸들러에서 직접 DB 쓰기 금지 |
| C-3 | Solana `confirmed` 수신 후 롤백 | 없는 잔액 기준으로 에이전트 행동 | 2단계 상태 (DETECTED→CONFIRMED), `finalized`만 최종 상태로 처리 |

### HIGH (기능 결함 / 주요 재작업)

| # | 리스크 | 영향 | 대응 방안 |
|---|--------|------|----------|
| H-1 | Solana SPL/Token-2022 ATA 수신 감지 실패 | 토큰 입금 누락 | logsSubscribe({ mentions }) 사용 — ATA 포함 TX 자동 캡처 |
| H-2 | WebSocket 재연결 시 이전 구독 핸들러 정리 누락 → 메모리 누수 | 장기 운영 시 OOM | 구독 레지스트리(Map<walletId, unsubscribe>) + 재연결 전 전체 해제 |
| H-3 | 공개 RPC 구독 한도 초과 | 일부 지갑 모니터링 중단 (silent) | 구독 성공 여부 명시 확인 + max_monitored_wallets 설정 |

### MODERATE (기술 부채 / 운영 복잡성)

| # | 리스크 | 영향 | 대응 방안 |
|---|--------|------|----------|
| M-1 | KillSwitch 상태와 인커밍 이벤트 상호작용 미정의 | 시스템 불일치 | 이벤트 핸들러에서 killSwitchService.getState() 확인. SUSPENDED/LOCKED 시 알림 suppress |
| M-2 | Solana 10분 inactivity timeout | 활동 없는 지갑 구독 자동 종료 | Heartbeat ping 60초 간격 + jitter 재연결 |
| M-3 | 대량 입금 스팸 (dust attack) | 알림 피로, 채널 과부하 | 최소 임계값 필터 + 미등록 토큰 필터 + 알림 cooldown |

---

## 예상 규모

| 항목 | 예상 |
|------|------|
| 페이즈 | 3-4개 (구독 인프라 / 저장+API / 이벤트+알림 / 설정+Admin) |
| 신규 파일 | 12-18개 |
| 수정 파일 | 8-12개 |
| 테스트 | 21-25개 (T-01~T-17 + S-01~S-04) |
| DB 마이그레이션 | v20→v21: 2개 테이블 추가 (incoming_transactions, incoming_tx_cursors) + 1개 컬럼 추가 (wallets.monitor_incoming) |

---

## 리서치 반영 사항

m27-00 설계 이후 수행된 4개 리서치(ARCHITECTURE, FEATURES, PITFALLS, STACK)에서 확인된 설계 변경 사항:

| 항목 | m27-00 원안 | 리서치 결과 반영 |
|------|------------|----------------|
| Solana 구독 방식 | `accountSubscribe` | `logsSubscribe({ mentions })` — SOL+SPL 단일 구독으로 커버, ATA 별도 구독 불필요 |
| Solana TX 파싱 | accountSubscribe → getSignaturesForAddress | logsNotifications → `getTransaction(sig, { encoding: 'jsonParsed' })` — pre/postBalances 비교 |
| EVM ERC-20 감지 | `eth_subscribe("logs")` | viem `watchEvent({ poll: false })` — eth_subscribe를 내부적으로 사용 |
| EVM ETH 감지 | `eth_subscribe("newHeads")` + TX 필터 | viem `watchBlocks({ includeTransactions: true })` |
| EventBus 이벤트 | `INCOMING_TX_DETECTED` (명칭) | EventBus: `transaction:incoming`, 알림: `TX_INCOMING`/`TX_INCOMING_SUSPICIOUS` |
| 갭 보상 | 미정의 | `incoming_tx_cursors` 테이블 + 재연결 직후 갭 보상 폴링 (CRITICAL C-01 대응) |
| DB 쓰기 전략 | 즉시 INSERT 가정 | 메모리 큐 + BackgroundWorkers 배치 flush (CRITICAL C-02 대응) |
| KillSwitch | 미정의 | SUSPENDED/LOCKED 시 알림 suppress, DB 기록 유지 (MODERATE M-01 대응) |
| WSS URL | 미정의 | config.toml `incoming_wss_url` 키 + SettingsService `incoming.wss_url` hot-reload + Admin Settings UI에서 런타임 변경 가능. 빈 값 시 rpc_url에서 https→wss 자동 유도 |
| 신규 패키지 | 미확인 | **추가 없음** — @solana/kit ^6.0.1 + viem ^2.21.0으로 전부 커버 |

### 참고 이슈

| 이슈 | 관련 |
|------|------|
| [#127](issues/127-promote-release-numberless-rc.md) | RC 워크플로우 수정 (번호 없는 RC 태그) — v27.0 릴리스 전 수정 필요 |
| [#128](issues/128-policy-read-session-auth.md) | 에이전트 읽기 API 접근 확대 + 스킬 권한 구분 — v27.0 병행 구현 |

---

*생성일: 2026-02-15*
*갱신일: 2026-02-21 — 리서치 결과 반영 (구독 방식, 갭 보상, 배치 flush, KillSwitch, WSS URL, 이벤트 네이밍 통일) + WSS URL Admin Settings hot-reload 추가, Summary SQL bigint 수정, IncomingTransaction.isSuspicious 타입 필드 추가*
*선행: m27 (수신 트랜잭션 모니터링 설계)*
