# 마일스톤 m27: 수신 트랜잭션 모니터링 설계

## 목표

에이전트 지갑으로 들어오는 수신 트랜잭션을 실시간 감지하여 DB에 기록하고, 에이전트가 입금 이벤트에 자율적으로 반응할 수 있는 인프라를 **설계 수준에서** 정의한다.

## 배경

### 현재 상태

WAIaaS는 에이전트가 **보내는 트랜잭션만** 관리한다:

```
에이전트 요청 → 파이프라인 6-stage → 온체인 전송 → transactions 테이블 기록
```

외부에서 에이전트 지갑으로 들어오는 입금은 WAIaaS를 거치지 않으므로 DB에 기록되지 않는다. 잔액 조회(`getBalance()`)는 체인 RPC 실시간 호출이라 입금이 반영되지만, **언제 누가 얼마를 보냈는지**는 추적할 수 없다.

### 격차

| 영역 | 현재 상태 | 격차 |
|------|----------|------|
| 입금 감지 | `getBalance()` 폴링으로 간접 확인만 가능 | 실시간 이벤트 기반 입금 감지 없음 |
| 수신 이력 | DB에 미저장 | 외부 탐색기(Solscan/Etherscan)에 의존 |
| 자금 흐름 | 송신만 기록 (절반의 이력) | 수입/지출 전체 파악 불가 |
| 에이전트 반응 | 입금에 반응하려면 잔액 반복 조회 필요 | 이벤트 기반 자율 행동 불가 |
| 보안 | 송신 패턴만 감시 | 의심스러운 입금(dust attack 등) 미감지 |

### 설계 원칙

1. **Opt-in** — 기본 비활성. 에이전트별로 활성화하며, 비활성 에이전트는 RPC 비용 0
2. **WebSocket 우선** — 폴링 대비 RPC 호출 수를 최소화하여 비용 절감
3. **Self-Hosted** — 외부 인덱서 서비스(Helius Webhook 등) 불필요, RPC 노드만으로 동작
4. **기존 구조 재사용** — `transactions` 테이블 확장, `INotificationChannel` 알림 연동, AutoStop 규칙 연동

---

## 설계 대상

### 1. IncomingTransactionMonitor

에이전트 지갑 주소의 수신 트랜잭션을 실시간 감지하는 핵심 서비스를 설계한다.

#### 1.1 개요

```
IncomingTransactionMonitor
  ├── ChainSubscriber (체인별 WebSocket/폴링 추상화)
  │   ├── SolanaSubscriber (accountSubscribe via WebSocket)
  │   └── EvmSubscriber (eth_subscribe newPendingTransactions / logs)
  ├── TransactionParser (수신 TX 파싱 + 정규화)
  └── EventEmitter (INCOMING_TX_DETECTED 이벤트 발생)
```

#### 1.2 설계 범위

| 항목 | 내용 |
|------|------|
| 감지 방식 | WebSocket 구독 우선, WebSocket 미지원 RPC 시 폴링 폴백 |
| 활성화 | 에이전트별 opt-in (`monitor_incoming` 설정) |
| 감지 대상 | 네이티브 토큰 입금 (SOL, ETH), SPL/ERC-20 토큰 입금 |
| 저장 | `incoming_transactions` 테이블 (기존 `transactions`와 별도) |
| 이벤트 | `INCOMING_TX_DETECTED` 이벤트 발생 → 알림 + 에이전트 반응 가능 |
| 라이프사이클 | 데몬 시작 시 활성 에이전트의 구독 등록, 에이전트 추가/삭제 시 동적 구독 관리 |

#### 1.3 체인별 구독 전략

**Solana:**

| 방식 | RPC 메서드 | 장점 | 단점 |
|------|-----------|------|------|
| WebSocket (우선) | `accountSubscribe(address)` | 실시간, 호출 수 최소 | WebSocket 연결 유지 필요 |
| 폴링 (폴백) | `getSignaturesForAddress(address, { until: lastSeen })` | WebSocket 불필요 | 주기적 RPC 호출, 지연 |

- `accountSubscribe`: 잔액 변화 감지 → `getSignaturesForAddress`로 상세 TX 조회
- commitment: `confirmed` (finality 대기 없이 빠른 감지, 극히 드문 되돌림 허용)

**EVM:**

| 방식 | RPC 메서드 | 장점 | 단점 |
|------|-----------|------|------|
| WebSocket (우선) | `eth_subscribe("logs", { address })` | 실시간, ERC-20 Transfer 이벤트 직접 감지 | WebSocket 연결 유지 필요 |
| 폴링 (폴백) | `eth_getBlockByNumber` + TX 필터링 | WebSocket 불필요 | 블록당 전체 TX 스캔, 비용 높음 |

- 네이티브 ETH 입금: `eth_subscribe("newHeads")` + 블록 내 `to` 필터링
- ERC-20 입금: `Transfer(from, to, value)` 이벤트 로그 필터링

#### 1.4 RPC 비용 관리

| 전략 | 설명 |
|------|------|
| 기본 비활성 | `monitor_incoming = false` — 활성화하지 않으면 추가 RPC 호출 0 |
| WebSocket 우선 | 연결 유지 비용만 발생, 변화 없으면 추가 호출 없음 |
| 폴링 간격 조절 | `incoming_poll_interval` 설정 (기본 30초, 최소 10초, 최대 300초) |
| 연결 공유 | 같은 체인의 여러 에이전트가 하나의 WebSocket 연결 공유 |
| 배치 조회 | 폴링 모드에서 여러 에이전트 주소를 한 번에 조회 |

#### 1.5 설계 산출물

- IChainSubscriber 인터페이스 (subscribe/unsubscribe/onTransaction)
- SolanaSubscriber 구현 설계 (accountSubscribe + getSignaturesForAddress)
- EvmSubscriber 구현 설계 (eth_subscribe logs + newHeads)
- 폴링 폴백 전략 (WebSocket 연결 실패 시 자동 전환)
- 연결 관리 (재연결 지수 백오프, 연결 상태 모니터링)
- 에이전트 동적 구독 관리 (추가/삭제/활성화/비활성화)

---

### 2. 수신 트랜잭션 저장

수신 트랜잭션을 DB에 기록하는 스키마와 저장 로직을 설계한다.

#### 2.1 테이블 설계 방향

기존 `transactions` 테이블은 파이프라인 상태(PENDING → QUEUED → EXECUTING 등)를 추적하는 구조이므로, 수신 트랜잭션은 별도 테이블로 분리한다.

| 항목 | 내용 |
|------|------|
| 테이블 | `incoming_transactions` (신규) |
| 식별자 | `id` (UUID v7), `tx_hash` (온체인 해시, UNIQUE) |
| 연결 | `agent_id` (수신 에이전트) |
| 정보 | `from_address`, `amount`, `token_address`, `chain`, `confirmed_at` |
| 중복 방지 | `tx_hash` UNIQUE 제약으로 동일 TX 중복 삽입 방지 |
| 보존 정책 | config.toml `incoming_retention_days` (기본 90일, 초과 자동 삭제) |

#### 2.2 기존 `transactions` 테이블과의 관계

```
transactions (송신)              incoming_transactions (수신)
─────────────────               ──────────────────────────────
파이프라인 9-state 추적          단순 기록 (DETECTED → CONFIRMED)
에이전트가 발생시킨 TX           외부에서 들어온 TX
정책 평가, 승인 흐름 포함        정책 평가 없음
agent_id = 송신자               agent_id = 수신자
```

#### 2.3 설계 산출물

- `incoming_transactions` 테이블 스키마 (Drizzle ORM + SQL DDL)
- IncomingTransactionSchema (Zod)
- 중복 감지 로직 (tx_hash UNIQUE + ON CONFLICT IGNORE)
- 보존 정책 구현 (주기적 old record 삭제 스케줄러)
- 인덱스 설계 (agent_id, chain, confirmed_at, from_address)

---

### 3. 수신 이력 조회 API

저장된 수신 트랜잭션을 조회하는 REST API를 설계한다.

#### 3.1 개요

```
GET /v1/wallet/incoming?from=&token=&since=&until=&cursor=&limit=
Authorization: Bearer wai_sess_...
```

#### 3.2 설계 범위

| 항목 | 내용 |
|------|------|
| 엔드포인트 | `GET /v1/wallet/incoming` |
| 인증 | sessionAuth (에이전트 자신의 수신 이력만 조회) |
| 필터 | `from_address`, `token_address`, `since`/`until` (timestamp), `chain` |
| 페이지네이션 | cursor 기반 (UUID v7 순서) |
| 정렬 | `confirmed_at` DESC (최신 우선) |
| 제한 | limit 기본 50, 최대 200 |
| 집계 | `GET /v1/wallet/incoming/summary` — 기간별 수신 합계 (선택적) |

#### 3.3 설계 산출물

- IncomingTransactionQuerySchema, IncomingTransactionResponseSchema (Zod)
- cursor pagination (m26 Audit Log와 동일 패턴)
- SDK 메서드: `client.listIncomingTransactions(filters)`
- MCP 도구: `list_incoming_transactions` (7번째 도구)
- summary 엔드포인트 스키마 (일별/주별/월별 수신 합계)

---

### 4. 수신 이벤트 + 알림 연동

입금 감지 시 기존 알림 인프라와 연동하여 Owner에게 통보하고, 에이전트가 이벤트에 반응할 수 있는 구조를 설계한다.

#### 4.1 새 이벤트 타입

| 이벤트 | 설명 | 전송 방식 |
|--------|------|----------|
| `INCOMING_TX_DETECTED` | 수신 트랜잭션 감지 | notify() |
| `INCOMING_TX_SUSPICIOUS` | 의심스러운 입금 (dust attack, 알 수 없는 토큰) | broadcast() |

기존 17개 NotificationEventType에 2개 추가 → 19개.

#### 4.2 에이전트 반응 구조

```
입금 감지 → INCOMING_TX_DETECTED 이벤트
  ├── NotificationService → Owner 알림 (Telegram/Discord/ntfy)
  ├── Webhook → 외부 시스템 통보 (m26 Webhook 활용)
  └── MCP Resource 갱신 → AI 에이전트가 다음 행동 결정
```

에이전트(AI)가 입금에 반응하려면:
- MCP 리소스 `waiaas://wallet/incoming` (최근 수신 TX 목록) 추가
- 또는 에이전트 프레임워크가 webhook 수신 → MCP tool 호출

#### 4.3 의심스러운 입금 감지 (기본 규칙)

| 규칙 | 설명 | 대응 |
|------|------|------|
| Dust attack | 극소량 (< $0.01 USD) 토큰 입금 | INCOMING_TX_SUSPICIOUS 알림 |
| 미등록 토큰 | `ALLOWED_TOKENS`에 없는 토큰 입금 | INCOMING_TX_SUSPICIOUS 알림 |
| 대량 입금 | 일일 평균 수신액 대비 N배 초과 | INCOMING_TX_SUSPICIOUS 알림 + Owner 확인 |

#### 4.4 다국어 메시지 (i18n)

`@waiaas/core/i18n` 메시지 템플릿에 수신 관련 키 추가:

| 이벤트 | 영문 (en) | 한글 (ko) |
|--------|----------|----------|
| INCOMING_TX_DETECTED | `📥 *Incoming Transaction Detected*` | `📥 *수신 트랜잭션 감지*` |
| INCOMING_TX_SUSPICIOUS | `⚠️ *Suspicious Incoming Transaction*` | `⚠️ *의심스러운 수신 트랜잭션*` |

#### 4.5 설계 산출물

- INCOMING_TX_DETECTED, INCOMING_TX_SUSPICIOUS 이벤트 스키마
- 의심 입금 감지 규칙 인터페이스 (IIncomingSafetyRule)
- MCP 리소스 `waiaas://wallet/incoming` 설계
- 알림 메시지 템플릿 (en/ko)
- m26 Webhook 연동 지점

---

### 5. 설정 구조

기존 config.toml 평탄화 원칙(중첩 금지)을 유지하며 수신 모니터링 설정을 추가한다.

#### 5.1 config.toml 키

```toml
[incoming]
incoming_enabled = false                  # 전역 활성화 (기본 비활성)
incoming_mode = "websocket"               # "websocket" | "polling"
incoming_poll_interval = 30               # 폴링 모드 간격 (초)
incoming_retention_days = 90              # 수신 이력 보존 기간 (일)
incoming_suspicious_dust_usd = 0.01       # dust attack 임계값 (USD)
incoming_suspicious_amount_multiplier = 10 # 대량 입금 감지 배수
```

#### 5.2 에이전트별 활성화

```
POST /v1/agents
{
  "name": "trader-bot",
  "chain": "solana",
  "monitor_incoming": true    // 이 에이전트만 수신 모니터링 활성화
}
```

전역 `incoming_enabled = true` + 에이전트별 `monitor_incoming = true` 두 조건 모두 충족해야 해당 에이전트의 수신을 모니터링한다.

#### 5.3 설계 산출물

- config.toml `[incoming]` 섹션 키 정의 (6개)
- 에이전트 생성/수정 API 필드 확장 (`monitor_incoming`)
- `agents` 테이블 컬럼 추가 (`monitor_incoming` BOOLEAN DEFAULT 0)
- 환경변수 매핑: `WAIAAS_INCOMING_ENABLED`, `WAIAAS_INCOMING_MODE` 등

---

## 설계 문서 영향 요약

기존 설계 문서 중 영향받는 문서와 변경 규모:

| 문서 | 영향 범위 | 변경 규모 |
|------|----------|----------|
| 25 (sqlite) | `incoming_transactions` 테이블 추가, `agents` 컬럼 추가 | 중 |
| 27 (chain-adapter) | IChainSubscriber 인터페이스 추가 (IChainAdapter 확장 아님, 별도 계층) | 중 |
| 28 (daemon) | IncomingTransactionMonitor 라이프사이클 통합 | 중 |
| 29 (api-framework) | `/v1/wallet/incoming` 라우트 추가 | 소 |
| 31 (solana) | SolanaSubscriber 구현 (accountSubscribe + getSignaturesForAddress) | 대 |
| 35 (notification) | INCOMING_TX_DETECTED, INCOMING_TX_SUSPICIOUS 이벤트 2개 추가 (17 → 19) | 소 |
| 37 (rest-api) | 엔드포인트 2개 추가 (incoming, incoming/summary) | 소 |
| 38 (sdk-mcp) | `listIncomingTransactions()` 메서드 + MCP 리소스 1개 추가 | 소 |

---

## 신규 산출물

| ID | 산출물 | 설명 |
|----|--------|------|
| ITM-01 | IncomingTransactionMonitor 설계 스펙 | IChainSubscriber, WebSocket/폴링 전략, 연결 관리, 에이전트별 구독 |
| ITM-02 | 수신 트랜잭션 저장 스키마 | `incoming_transactions` 테이블, Zod 스키마, 중복 방지, 보존 정책 |
| ITM-03 | 수신 이력 조회 API 설계 스펙 | REST 엔드포인트, 필터, cursor pagination, SDK/MCP 확장 |
| ITM-04 | 수신 이벤트 + 알림 연동 설계 | 2개 이벤트 타입, 의심 입금 감지 규칙, MCP 리소스, i18n 메시지 |
| ITM-05 | 설정 구조 설계 | config.toml `[incoming]` 섹션, 에이전트별 opt-in, 환경변수 매핑 |

---

## 테스트 전략 (설계 검증)

본 마일스톤은 설계 마일스톤이므로, 아래 시나리오는 설계 문서에 명시하여 구현 단계에서 테스트 계획의 기반이 된다.

### 핵심 검증 시나리오

| # | 기능 | 시나리오 | 검증 내용 | 레벨 |
|---|------|----------|----------|------|
| T-01 | 구독 | WebSocket 연결 + 네이티브 입금 감지 | SOL/ETH 입금 → INCOMING_TX_DETECTED 이벤트 발생 | Integration |
| T-02 | 구독 | WebSocket 연결 + 토큰 입금 감지 | SPL/ERC-20 입금 → 토큰 정보 파싱 + 이벤트 발생 | Integration |
| T-03 | 구독 | WebSocket 연결 실패 → 폴링 폴백 | WebSocket 거부 시 자동 폴링 전환 + 입금 감지 유지 | Integration |
| T-04 | 구독 | 재연결 지수 백오프 | 연결 끊김 → 1s/2s/4s 백오프 → 재연결 성공 | Unit |
| T-05 | 구독 | 에이전트 동적 추가/삭제 | 런타임 에이전트 생성 → 구독 추가, 삭제 → 구독 해제 | Integration |
| T-06 | 저장 | 수신 TX DB 기록 | 입금 감지 → incoming_transactions 레코드 생성 assert | Unit |
| T-07 | 저장 | 중복 TX 무시 | 동일 tx_hash 재감지 → INSERT 무시 (UNIQUE 제약) | Unit |
| T-08 | 저장 | 보존 정책 | retention_days=1 → 2일 전 레코드 자동 삭제 | Integration |
| T-09 | API | 수신 이력 조회 | GET /v1/wallet/incoming → 최근 수신 TX 목록 반환 | Integration |
| T-10 | API | 필터 조합 | from_address + token + 기간 필터 정확성 | Unit |
| T-11 | API | cursor pagination | 다음 페이지 정확성, 빈 결과 처리 | Unit |
| T-12 | 이벤트 | 입금 알림 발송 | INCOMING_TX_DETECTED → Telegram/Discord mock 수신 | Integration |
| T-13 | 이벤트 | 의심 입금 감지 (dust) | $0.001 입금 → INCOMING_TX_SUSPICIOUS broadcast | Unit |
| T-14 | 이벤트 | 미등록 토큰 감지 | ALLOWED_TOKENS 외 토큰 입금 → SUSPICIOUS 알림 | Unit |
| T-15 | 설정 | opt-in 비활성 | monitor_incoming=false → WebSocket 구독 없음, RPC 호출 0 | Unit |
| T-16 | 설정 | 에이전트별 활성화 | 2개 에이전트 중 1개만 활성 → 1개만 구독 등록 | Integration |
| T-17 | 비용 | 연결 공유 | 같은 체인 에이전트 3개 → WebSocket 연결 1개 | Unit |

### 보안 시나리오

| # | 기능 | 시나리오 | 검증 내용 |
|---|------|----------|----------|
| S-01 | 구독 | WebSocket 인증 | RPC 프로바이더 인증 토큰 안전한 전달 (평문 로그 미노출) |
| S-02 | 저장 | 대량 입금 스팸 | 단시간 수천 건 수신 시 DB 쓰기 병목 방지 (배치 INSERT) |
| S-03 | 감지 | dust attack | 극소량 반복 입금 → SUSPICIOUS 알림 + 자동 무시 옵션 |
| S-04 | API | 타 에이전트 이력 조회 | sessionAuth 에이전트 A가 에이전트 B의 수신 이력 접근 불가 |

---

## 마일스톤 범위 외 (Out of Scope)

- 실제 코드 구현 (설계 마일스톤)
- 자체 인덱서/아카이브 노드 운영 (RPC 프로바이더 의존)
- NFT 입금 감지 (토큰만, NFT는 별도 검토)
- 수신 트랜잭션에 대한 정책 평가 (감지 + 기록만, 차단/거부 불가)
- Webhook 프로바이더 수신 (Helius/Alchemy webhook → 데몬 push) — Self-hosted 원칙으로 RPC 직접 구독만
- 과거 이력 백필 (모니터링 활성화 이전 TX는 미추적)

---

## 선행 마일스톤과의 관계

```
v0.2 (설계)                       m27 (수신 모니터링 설계)
──────────                        ──────────────────────────
IChainAdapter 20메서드 (27)   →   IChainSubscriber 별도 인터페이스
SolanaAdapter (31)            →   SolanaSubscriber (accountSubscribe)
transactions 테이블 (25)      →   incoming_transactions 테이블 (신규)
INotificationChannel (35)     →   INCOMING_TX_DETECTED/SUSPICIOUS 이벤트
config.toml 평탄화 (30)       →   [incoming] 섹션 6개 키 추가

m30 (운영 기능 설계)             m27 (이 문서)
──────────────────               ──────────────────
Webhook Outbound (OPS-04)    →   입금 이벤트 webhook 전송
Anomaly Detection (OPS-06)   →   의심 입금 규칙 연동 가능
Metrics Export (OPS-05)       →   waiaas_incoming_tx_total 메트릭 추가

v1.x (구현) → m20 (릴리스) → m27 (이 문서)
```

---

## 성공 기준

### 설계 완성도
1. IChainSubscriber 인터페이스가 Solana/EVM 양쪽 구현 가능한 수준으로 정의됨
2. WebSocket → 폴링 폴백 전략이 연결 실패/재연결 시나리오를 포함하여 명확히 정의됨
3. `incoming_transactions` 테이블 스키마가 중복 방지, 보존 정책, 인덱스를 포함하여 완성됨
4. 17개 검증 시나리오 + 4개 보안 시나리오가 설계 문서에 명시됨

### 비용 효율성
5. opt-in 비활성 시 추가 RPC 호출이 0임이 설계에서 보장됨
6. WebSocket 연결 공유 전략이 에이전트 수 증가에 따른 비용 선형 증가를 방지함

### 일관성
7. 기존 Zod SSoT 파이프라인, config.toml 평탄화 원칙, 에러 코드 체계와 충돌 없음
8. i18n 메시지 템플릿이 기존 `@waiaas/core/i18n` 구조에 일관 통합됨

### Self-Hosted 준수
9. 외부 인덱서/Webhook 서비스 없이 RPC 노드 직접 구독만으로 동작하도록 설계됨

---

*작성: 2026-02-09*
*전제: Self-Hosted 단일 머신 아키텍처, RPC 프로바이더 의존*
*범위: 설계 마일스톤 — 코드 구현은 범위 외*
*선행: m20 릴리스*
