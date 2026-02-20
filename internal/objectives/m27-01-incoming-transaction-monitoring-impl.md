# 마일스톤 m27-01: 수신 트랜잭션 모니터링 구현

- **Status:** PLANNED
- **Milestone:** TBD

## 목표

m27에서 설계한 수신 트랜잭션 모니터링 — IncomingTransactionMonitor, 수신 TX 저장, 조회 API, 이벤트/알림 연동 — 을 구현하여, 에이전트 지갑으로 들어오는 입금을 실시간 감지하고 DB에 기록하며 Owner에게 알림을 발송할 수 있는 상태.

---

## 배경

m27에서 5개 설계 산출물(ITM-01~ITM-05)이 정의되었다. m27-01은 이 설계를 코드로 구현한다.

---

## 구현 대상 설계 문서

| 설계 ID | 기능 | 구현 범위 |
|---------|------|----------|
| ITM-01 | IncomingTransactionMonitor | IChainSubscriber 인터페이스, SolanaSubscriber(accountSubscribe), EvmSubscriber(eth_subscribe), WebSocket→폴링 폴백, 연결 관리, 에이전트별 동적 구독 |
| ITM-02 | 수신 트랜잭션 저장 | incoming_transactions 테이블, Zod 스키마, tx_hash UNIQUE 중복 방지, 보존 정책(retention_days 자동 삭제) |
| ITM-03 | 수신 이력 조회 API | GET /v1/wallet/incoming (cursor pagination, 필터), GET /v1/wallet/incoming/summary, SDK/MCP 확장 |
| ITM-04 | 수신 이벤트 + 알림 연동 | INCOMING_TX_DETECTED, INCOMING_TX_SUSPICIOUS 이벤트, 의심 입금 감지 규칙, MCP 리소스, i18n 메시지 |
| ITM-05 | 설정 구조 | config.toml [incoming] 섹션, 에이전트별 monitor_incoming opt-in, 환경변수 매핑 |

---

## 산출물

### REST API 추가

| 메서드 | 경로 | 인증 | 기능 |
|--------|------|------|------|
| GET | /v1/wallet/incoming | sessionAuth | 수신 트랜잭션 이력 조회 |
| GET | /v1/wallet/incoming/summary | sessionAuth | 기간별 수신 합계 |

### DB 마이그레이션

| 테이블 | 변경 |
|--------|------|
| incoming_transactions | 신규 (id, tx_hash, wallet_id, from_address, amount, token_address, chain, confirmed_at) |
| wallets | monitor_incoming 컬럼 추가 (BOOLEAN DEFAULT 0) |

### 알림 이벤트 추가

| 이벤트 | 설명 |
|--------|------|
| INCOMING_TX_DETECTED | 수신 트랜잭션 감지 시 발송 |
| INCOMING_TX_SUSPICIOUS | 의심스러운 입금 (dust attack, 미등록 토큰) 감지 시 발송 |

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

| # | 리스크 | 영향 | 대응 방안 |
|---|--------|------|----------|
| 1 | WebSocket RPC 연결 불안정 | 입금 감지 누락 | 자동 폴링 폴백 + 지수 백오프 재연결 |
| 2 | 대량 입금 스팸 | DB 쓰기 병목 | 배치 INSERT + 보존 정책 자동 삭제 |
| 3 | RPC 비용 증가 | 운영 비용 상승 | opt-in 기본 비활성 + WebSocket 연결 공유 |

---

## 예상 규모

| 항목 | 예상 |
|------|------|
| 페이즈 | 3-4개 (구독 인프라 / 저장+API / 이벤트+알림 / 설정+Admin) |
| 신규 파일 | 12-18개 |
| 수정 파일 | 8-12개 |
| 테스트 | 21-25개 (T-01~T-17 + S-01~S-04) |
| DB 마이그레이션 | 1개 테이블 추가 + 1개 컬럼 추가 |

---

*생성일: 2026-02-15*
*선행: m27 (수신 트랜잭션 모니터링 설계)*
