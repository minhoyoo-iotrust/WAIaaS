# 마일스톤 m30: 운영 기능 확장 설계

- **Status:** PLANNED
- **Milestone:** TBD

## 목표

m20 릴리스 이후 운영 환경에서 필요한 7가지 기능 — Transaction Dry-Run, Audit Log Query API, Encrypted Backup, Webhook Outbound, Metrics Export, Anomaly Detection, IP ACL — 을 **설계 수준에서** 정의한다. 각 기능의 인터페이스, 데이터 모델, 기존 설계 문서와의 통합 지점, 테스트 시나리오를 확정하여 구현 마일스톤의 입력을 생산한다.

## 배경

v0.1~v0.9에서 핵심 아키텍처(인증, 정책, 파이프라인, 체인 어댑터, 클라이언트)를 설계 완료하고, v1.x에서 구현하여 m20에서 릴리스한다. 그러나 운영 환경에서 다음 격차가 존재한다:

| 영역 | 현재 상태 | 격차 |
|------|----------|------|
| TX 사전 검증 | Stage 5에 simulate 있으나 내부 전용 | 외부 API로 정책 평가 + 수수료 예측 불가 |
| 감사 로그 | audit_logs 테이블 존재 | 외부 조회 API 없음 |
| 백업/복구 | Kill Switch만 존재 (긴급 정지용) | DB + 키스토어 백업/복원 경로 없음 |
| 이벤트 구독 | Telegram/Discord/ntfy 푸시 전용 | 프로그래밍 가능한 webhook 없음 |
| 메트릭 | 없음 | 시계열 데이터 수집/노출 경로 없음 |
| 이상 탐지 | AutoStop 5규칙 (임계값 기반) | 행동 패턴 기반 탐지 없음 |
| 네트워크 접근 | localhost 전제 | Docker/원격 배포 시 IP 제어 없음 |

### Self-Hosted 원칙 준수

7가지 기능 모두 Self-Hosted 단일 머신 전제를 유지한다:
- Metrics: 외부 SaaS가 아닌 `/metrics` 엔드포인트 노출 (Prometheus scrape)
- Webhook: 데몬이 직접 HTTP POST (외부 메시지 큐 불필요)
- Backup: 로컬 파일 시스템 암호화 아카이브 (클라우드 스토리지 미의존)
- Anomaly Detection: 단순 통계 규칙 (ML 프레임워크 불필요)

---

## 설계 대상

### 1. Transaction Dry-Run API

AI 에이전트가 트랜잭션 실행 전 비용과 정책 평가 결과를 사전 확인할 수 있는 시뮬레이션 엔드포인트를 설계한다.

#### 1.1 개요

```
POST /v1/transactions/simulate
Authorization: Bearer wai_sess_...

Request Body: TransactionRequest (기존 5-type discriminatedUnion 동일)
Response: SimulationResult
```

#### 1.2 설계 범위

| 항목 | 내용 |
|------|------|
| 엔드포인트 | `POST /v1/transactions/simulate` |
| 인증 | sessionAuth (기존 세션 토큰) |
| 입력 | 기존 TransactionRequest 스키마 재사용 (5-type) |
| 출력 | 정책 평가 결과 (tier), 예상 수수료, 예상 잔액 변화, 경고 목록 |
| 실행 범위 | Stage 1(Validation) + Stage 2(Enrichment) + Stage 3(Policy) — Stage 4~6 미실행 |
| 부수 효과 | 없음 (DB 상태 변경, 체인 전송, reserved_amount 없음) |

#### 1.3 설계 산출물

- SimulationResultSchema (Zod)
- Stage 1~3 dry-run 모드 분기 설계
- 에러 코드 추가 (SIMULATION_FAILED 등)
- SDK/MCP 메서드 확장 (client.simulate(), waiaas_simulate_transaction tool)

#### 1.4 영향받는 설계 문서

| 문서 | 변경 |
|------|------|
| 32 (pipeline) | dry-run 모드 분기 추가 |
| 33 (policy) | 읽기 전용 정책 평가 경로 |
| 37 (rest-api) | 39번째 엔드포인트 추가 |
| 38 (sdk-mcp) | simulate 메서드/tool 추가 |

---

### 2. Audit Log Query API

audit_logs 테이블의 데이터를 외부에서 조회할 수 있는 REST API를 설계한다.

#### 2.1 개요

```
GET /v1/audit-logs?agent_id=&event_type=&from=&to=&cursor=&limit=
Authorization: X-Master-Password (masterAuth)
```

#### 2.2 설계 범위

| 항목 | 내용 |
|------|------|
| 엔드포인트 | `GET /v1/audit-logs` |
| 인증 | masterAuth (감사 로그는 관리자 전용) |
| 필터 | agent_id, event_type, from/to (timestamp), tx_id |
| 페이지네이션 | cursor 기반 (UUID v7 순서 활용) |
| 정렬 | created_at DESC (최신 우선) |
| 제한 | limit 기본 50, 최대 200 |

#### 2.3 설계 산출물

- AuditLogQuerySchema, AuditLogResponseSchema (Zod)
- cursor pagination 설계 (v0.7 DD MEDIUM-3 해소)
- 에러 코드 추가 (INVALID_CURSOR 등)
- 통계 엔드포인트 검토: `GET /v1/audit-logs/stats` (기간별 이벤트 집계)

#### 2.4 영향받는 설계 문서

| 문서 | 변경 |
|------|------|
| 25 (sqlite) | audit_logs 인덱스 최적화 (복합 인덱스) |
| 37 (rest-api) | 40~41번째 엔드포인트 추가 |
| 29 (api-framework) | cursor pagination 유틸리티 |

---

### 3. Encrypted Backup & Restore

데몬의 DB와 키스토어를 암호화하여 백업하고, 마스터 비밀번호로 복원하는 CLI 커맨드를 설계한다.

#### 3.1 개요

```bash
waiaas backup [--output ~/.waiaas/backups/] [--schedule daily]
waiaas restore --from backup-2026-02-10.enc
```

#### 3.2 설계 범위

| 항목 | 내용 |
|------|------|
| 백업 대상 | SQLite DB 파일 + keystore 디렉토리 + config.toml |
| 암호화 | AES-256-GCM (마스터 비밀번호 기반 Argon2id 키 유도 — 기존 KDF 재사용) |
| 포맷 | 단일 아카이브 파일 (.waiaas-backup) |
| 원자성 | SQLite VACUUM INTO로 일관된 스냅샷 |
| 복원 | 데몬 정지 상태에서만 가능, 기존 데이터 백업 후 교체 |
| 자동 백업 | config.toml `backup_interval` 키 (선택적, 기본 비활성) |
| 보존 정책 | `backup_retention_count` (기본 7개, 초과 시 가장 오래된 파일 삭제) |

#### 3.3 설계 산출물

- 백업 아카이브 바이너리 포맷 사양 (헤더 + 메타데이터 + 암호화 페이로드)
- `waiaas backup` CLI 인터페이스 + 동작 플로우
- `waiaas restore` CLI 인터페이스 + 안전 장치 (확인 프롬프트, 기존 데이터 보존)
- 자동 백업 스케줄러 설계 (데몬 내장 vs cron 위임)
- config.toml 키 추가: `[backup]` 섹션 (backup_dir, backup_interval, backup_retention_count)

#### 3.4 영향받는 설계 문서

| 문서 | 변경 |
|------|------|
| 24 (monorepo) | ~/.waiaas/backups/ 디렉토리 사양 추가 |
| 26 (keystore) | 백업 시 키스토어 파일 포함 범위 정의 |
| 28 (daemon) | 자동 백업 스케줄러 라이프사이클 통합 |
| 54 (cli) | backup/restore 커맨드 추가 |

---

### 4. Webhook Outbound

외부 시스템이 WAIaaS 이벤트를 프로그래밍 방식으로 수신할 수 있는 webhook 구독 메커니즘을 설계한다.

#### 4.1 개요

```
POST   /v1/webhooks          — webhook 등록
GET    /v1/webhooks          — 목록 조회
DELETE /v1/webhooks/:id      — 삭제
GET    /v1/webhooks/:id/logs — 전송 이력 조회
```

#### 4.2 설계 범위

| 항목 | 내용 |
|------|------|
| 인증 | masterAuth (webhook 등록은 관리자 전용) |
| 구독 대상 | 기존 17개 NotificationEventType 중 선택 (필터링) |
| 전송 | HTTP POST, JSON body, HMAC-SHA256 서명 (X-WAIaaS-Signature 헤더) |
| 재시도 | 최대 3회, 지수 백오프 (1s → 2s → 4s) |
| 보안 | webhook secret per endpoint, HMAC 서명 검증 가이드 |
| 저장 | webhooks 테이블 (8번째 테이블), webhook_logs 테이블 (9번째 테이블) |
| 비동기 | 이벤트 발생 → 큐잉 → 비동기 전송 (메인 파이프라인 블로킹 없음) |

#### 4.3 설계 산출물

- WebhookSchema, WebhookEventPayloadSchema (Zod)
- webhooks, webhook_logs 테이블 스키마
- HMAC-SHA256 서명 생성/검증 프로토콜
- 재시도 큐 설계 (인메모리 또는 SQLite 기반)
- INotificationChannel과의 관계 정의 (webhook은 독립 채널 vs 기존 채널 확장)

#### 4.4 영향받는 설계 문서

| 문서 | 변경 |
|------|------|
| 25 (sqlite) | webhooks, webhook_logs 테이블 추가 (7 → 9 테이블) |
| 35 (notification) | webhook 채널 통합 또는 독립 구조 결정 |
| 37 (rest-api) | 42~45번째 엔드포인트 추가 |

---

### 5. Metrics Export

데몬의 운영 메트릭을 Prometheus 형식으로 노출하는 `/metrics` 엔드포인트를 설계한다.

#### 5.1 개요

```
GET /metrics
Content-Type: text/plain; version=0.0.4; charset=utf-8
```

#### 5.2 설계 범위

| 항목 | 내용 |
|------|------|
| 엔드포인트 | `GET /metrics` (Prometheus text exposition format) |
| 인증 | 없음 (localhost 전제) 또는 config.toml `metrics_auth` 옵션 |
| 메트릭 유형 | Counter, Gauge, Histogram |
| 외부 의존성 | 없음 (직접 text format 생성, prom-client 미사용) |
| 수집 주기 | scrape 시점에 실시간 계산 (push 방식 아님) |

#### 5.3 핵심 메트릭 (설계 대상)

| 메트릭 | 유형 | 라벨 | 설명 |
|--------|------|------|------|
| `waiaas_transactions_total` | Counter | chain, type, tier, status | TX 처리 건수 |
| `waiaas_transaction_duration_seconds` | Histogram | chain, tier | TX 처리 시간 |
| `waiaas_policy_evaluations_total` | Counter | tier, result | 정책 평가 결과 |
| `waiaas_sessions_active` | Gauge | — | 활성 세션 수 |
| `waiaas_agents_active` | Gauge | — | 활성 에이전트 수 |
| `waiaas_rpc_requests_total` | Counter | chain, method, status | RPC 호출 성공/실패 |
| `waiaas_rpc_duration_seconds` | Histogram | chain, method | RPC 응답 시간 |
| `waiaas_killswitch_state` | Gauge | — | Kill Switch 상태 (0/1/2) |
| `waiaas_oracle_price_age_seconds` | Gauge | source, token | 오라클 가격 데이터 나이 |
| `waiaas_backup_last_success_timestamp` | Gauge | — | 마지막 백업 성공 시각 |

#### 5.4 설계 산출물

- 메트릭 레지스트리 인터페이스 (IMetricsRegistry)
- Prometheus text format 직렬화 구현 설계
- 메트릭 수집 지점 매핑 (파이프라인 각 Stage, 어댑터, 정책 엔진 등)
- config.toml 키 추가: `[metrics]` 섹션 (metrics_enabled, metrics_auth)

#### 5.5 영향받는 설계 문서

| 문서 | 변경 |
|------|------|
| 29 (api-framework) | /metrics 라우트 추가 (미들웨어 스택 외부) |
| 28 (daemon) | 메트릭 레지스트리 라이프사이클 |
| 32 (pipeline) | 각 Stage 메트릭 수집 훅 |
| 27 (chain-adapter) | RPC 호출 메트릭 수집 |

---

### 6. Rule-Based Anomaly Detection

AutoStop의 5개 규칙을 확장하여, 에이전트의 행동 패턴에 기반한 이상 탐지 규칙을 설계한다. ML 프레임워크 없이 단순 통계 규칙만으로 구현 가능한 범위로 제한한다.

#### 6.1 개요

```
기존 AutoStop (5규칙: 임계값 기반)
  ↓ 확장
AnomalyDetector (N규칙: 패턴 기반)
  - 이동 평균 대비 급변 감지
  - 시간대별 비정상 활동 감지
  - 수신자 집중도 감지
```

#### 6.2 설계 범위

| 항목 | 내용 |
|------|------|
| 위치 | AutoStop Engine 확장 (기존 인터페이스 유지) |
| 규칙 유형 | 통계 규칙만 (ML 없음) |
| 데이터 소스 | audit_logs + transactions 테이블 (실시간 쿼리) |
| 트리거 | TX 완료 후 비동기 평가 (파이프라인 블로킹 없음) |
| 대응 | ANOMALY_DETECTED 이벤트 + 자동 tier 상향 (INSTANT → DELAY) |
| 설정 | config.toml `[anomaly]` 섹션 (활성화, 민감도, 규칙별 on/off) |

#### 6.3 후보 규칙 (설계 대상)

| # | 규칙 | 설명 | 트리거 예시 |
|---|------|------|-----------|
| A-01 | 지출 급증 | 최근 1시간 지출이 24시간 이동 평균의 N배 초과 | N=5 (기본값) |
| A-02 | 빈도 급증 | 최근 10분 TX 수가 1시간 이동 평균의 N배 초과 | N=3 (기본값) |
| A-03 | 비정상 시간대 | 에이전트의 과거 활동 시간대 외 TX 발생 | 학습 기간: 7일 |
| A-04 | 신규 수신자 집중 | 최근 1시간 TX의 80%+ 가 처음 보는 주소로 전송 | 임계값: 80% |
| A-05 | 잔액 급감 | 1시간 내 잔액 50%+ 감소 | 임계값: 50% |

#### 6.4 설계 산출물

- IAnomalyRule 인터페이스
- 규칙 레지스트리 + 설정 스키마 (Zod)
- 이동 평균 계산 쿼리 설계 (SQLite window function 활용 가능 여부)
- ANOMALY_DETECTED 이벤트 타입 + 자동 대응 로직 (tier 상향 프로토콜)
- AutoStop과의 통합 구조 (기존 AutoStop ⊂ AnomalyDetector 또는 병렬)
- config.toml `[anomaly]` 섹션 키 정의

#### 6.5 영향받는 설계 문서

| 문서 | 변경 |
|------|------|
| 36 (killswitch-autostop) | AnomalyDetector 확장 구조 |
| 35 (notification) | ANOMALY_DETECTED 이벤트 추가 (18번째) |
| 33 (policy) | 자동 tier 상향 메커니즘 |
| 25 (sqlite) | 이동 평균 쿼리 인덱스 |

---

### 7. IP/Network Access Control

Docker 및 원격 배포 환경에서 API 접근을 IP 기반으로 제어하는 ACL을 설계한다.

#### 7.1 개요

```toml
# config.toml
[acl]
master_auth_bind = "127.0.0.1"          # masterAuth는 항상 localhost
session_auth_allowed_ips = ["10.0.0.0/8", "172.16.0.0/12"]
metrics_allowed_ips = ["10.0.0.0/8"]
```

#### 7.2 설계 범위

| 항목 | 내용 |
|------|------|
| 적용 대상 | masterAuth 엔드포인트, sessionAuth 엔드포인트, /metrics |
| 기본값 | masterAuth = 127.0.0.1 고정 (변경 불가), sessionAuth = 0.0.0.0/0 (전체 허용) |
| 형식 | CIDR 표기법 (IPv4/IPv6) |
| 평가 시점 | Hono 미들웨어 (인증 전 단계) |
| 거부 응답 | 403 Forbidden + ACCESS_DENIED_IP 에러 코드 |
| Docker 대응 | Docker 네트워크 (172.x) CIDR 허용 가이드 |

#### 7.3 설계 산출물

- IP ACL 미들웨어 설계 (ipAcl middleware)
- CIDR 파싱/매칭 로직 (외부 라이브러리 vs 자체 구현 결정)
- config.toml `[acl]` 섹션 키 정의
- 엔드포인트별 ACL 매핑 테이블
- Docker Compose 네트워크 설정 가이드 업데이트
- X-Forwarded-For 처리 정책 (신뢰 여부)

#### 7.4 영향받는 설계 문서

| 문서 | 변경 |
|------|------|
| 29 (api-framework) | ipAcl 미들웨어 추가 (9번째 미들웨어) |
| 40 (telegram-docker) | Docker 네트워크 ACL 가이드 |
| 37 (rest-api) | ACCESS_DENIED_IP 에러 코드 추가 |
| 28 (daemon) | ACL 설정 로드 + 핫 리로드 검토 |

---

## 설계 문서 영향 요약

기존 30개 설계 문서 중 영향받는 문서와 변경 규모:

| 문서 | 영향 기능 | 변경 규모 |
|------|----------|----------|
| 25 (sqlite) | Audit Index, Webhook 테이블, Anomaly Index | 중 |
| 27 (chain-adapter) | Metrics RPC 수집 | 소 |
| 28 (daemon) | Backup 스케줄러, Metrics 라이프사이클, ACL 로드 | 중 |
| 29 (api-framework) | /metrics 라우트, cursor pagination, ipAcl 미들웨어 | 중 |
| 32 (pipeline) | Dry-Run 분기, Metrics 훅 | 소 |
| 33 (policy) | Dry-Run 읽기 전용, Anomaly tier 상향 | 소 |
| 35 (notification) | Webhook 채널, ANOMALY_DETECTED 이벤트 | 중 |
| 36 (killswitch-autostop) | AnomalyDetector 확장 | 중 |
| 37 (rest-api) | 엔드포인트 6개+ 추가, 에러 코드 추가 | 대 |
| 38 (sdk-mcp) | simulate 메서드/tool | 소 |
| 40 (telegram-docker) | Docker ACL 가이드 | 소 |
| 54 (cli) | backup/restore 커맨드 | 중 |

---

## 신규 산출물

| ID | 산출물 | 설명 |
|----|--------|------|
| OPS-01 | Transaction Dry-Run 설계 스펙 | SimulationResult 스키마, Stage 1~3 dry-run 분기, SDK/MCP 확장 |
| OPS-02 | Audit Log Query API 설계 스펙 | 쿼리 스키마, cursor pagination, 인덱스 최적화, 통계 엔드포인트 |
| OPS-03 | Encrypted Backup 설계 스펙 | 아카이브 포맷, CLI 커맨드, 자동 스케줄러, 보존 정책 |
| OPS-04 | Webhook Outbound 설계 스펙 | 구독 모델, HMAC 서명, 재시도 큐, 테이블 스키마 |
| OPS-05 | Metrics Export 설계 스펙 | 메트릭 레지스트리, Prometheus format, 수집 지점 매핑 |
| OPS-06 | Anomaly Detection 설계 스펙 | IAnomalyRule, 5개 후보 규칙, 이동 평균 쿼리, 자동 대응 |
| OPS-07 | IP ACL 설계 스펙 | CIDR 미들웨어, 엔드포인트별 매핑, Docker 가이드 |

---

## 테스트 전략 (설계 검증)

본 마일스톤은 설계 마일스톤이므로, 아래 시나리오는 설계 문서에 명시하여 구현 단계에서 테스트 계획의 기반이 된다.

### 핵심 검증 시나리오

| # | 기능 | 시나리오 | 검증 내용 | 레벨 |
|---|------|----------|----------|------|
| T-01 | Dry-Run | 정상 시뮬레이션 | 정책 tier + 수수료 + 잔액 변화 반환 | Unit |
| T-02 | Dry-Run | 잔액 부족 시뮬레이션 | INSUFFICIENT_BALANCE 경고 포함 | Unit |
| T-03 | Dry-Run | 부수 효과 없음 | DB reserved_amount 미변경, 체인 미전송 | Unit |
| T-04 | Audit | 필터 조합 조회 | agent_id + event_type + 기간 필터 | Integration |
| T-05 | Audit | cursor pagination | 다음 페이지 정확성, 빈 결과 처리 | Unit |
| T-06 | Backup | 암호화 백업 생성 | 아카이브 파일 생성, AES-256-GCM 암호화 | Integration |
| T-07 | Backup | 복원 정확성 | 백업에서 복원 후 DB + 키스토어 일치 | Integration |
| T-08 | Backup | 잘못된 비밀번호 | 복호화 실패, 기존 데이터 보존 | Unit |
| T-09 | Webhook | 이벤트 전송 | TX 완료 → webhook POST + HMAC 서명 | Integration |
| T-10 | Webhook | 재시도 | 1차 실패 → 3회 재시도 후 실패 기록 | Unit |
| T-11 | Webhook | HMAC 검증 | 수신 측 서명 검증 성공/실패 | Unit |
| T-12 | Metrics | Prometheus format | /metrics 응답이 text exposition format 준수 | Unit |
| T-13 | Metrics | TX 카운터 | 전송 완료 후 waiaas_transactions_total 증가 | Integration |
| T-14 | Anomaly | 지출 급증 감지 | 이동 평균 5배 초과 → ANOMALY_DETECTED | Unit |
| T-15 | Anomaly | 자동 tier 상향 | 감지 → INSTANT 에이전트의 다음 TX가 DELAY로 처리 | Integration |
| T-16 | ACL | 허용 IP 접근 | CIDR 범위 내 IP → 정상 처리 | Unit |
| T-17 | ACL | 거부 IP 접근 | CIDR 범위 외 IP → 403 ACCESS_DENIED_IP | Unit |
| T-18 | ACL | masterAuth localhost 고정 | 0.0.0.0 바인딩에서도 masterAuth는 127.0.0.1만 허용 | Unit |

### 보안 시나리오

| # | 기능 | 시나리오 | 검증 내용 |
|---|------|----------|----------|
| S-01 | Dry-Run | 시뮬레이션으로 정책 우회 시도 | dry-run 결과가 실제 실행과 독립적 |
| S-02 | Backup | 백업 파일 탈취 | 마스터 비밀번호 없이 복호화 불가 |
| S-03 | Backup | 백업 파일 변조 | AEAD 인증 실패로 복원 거부 |
| S-04 | Webhook | secret 노출 | webhook secret 평문 저장 금지 (해시 또는 암호화) |
| S-05 | ACL | X-Forwarded-For 위조 | 프록시 미사용 시 헤더 무시 |
| S-06 | Audit | 권한 없는 로그 조회 | sessionAuth로 audit-logs 접근 시 403 |

---

## 마일스톤 범위 외 (Out of Scope)

- 실제 코드 구현 (설계 마일스톤)
- Agent Budget / Allowance 시스템 (별도 마일스톤 검토)
- Agent-to-Agent Delegation (Multi-Agent 고급 시나리오)
- Key Rotation (sweepAll 기반 — 별도 설계 필요)
- Hot/Cold Wallet 분리 (대규모 운용 시나리오)
- Transaction Templates (DX 개선 — 별도 마일스톤 검토)
- ML 기반 이상 탐지 (통계 규칙으로 제한)

---

## 선행 마일스톤과의 관계

```
v0.2~v0.9 (설계)              m30 (운영 기능 확장 설계)
──────────────               ──────────────────────────
audit_logs 테이블 (25)    →   Audit Log Query API
6-stage 파이프라인 (32)    →   Dry-Run Stage 1~3 분기
INotificationChannel (35) →   Webhook Outbound 채널
AutoStop 5규칙 (36)       →   Anomaly Detection 확장
Hono 미들웨어 8개 (29)    →   ipAcl 9번째 미들웨어
AES-256-GCM + Argon2id (26) → Backup 암호화 재사용
config.toml 17키 (30)     →   [backup], [metrics], [anomaly], [acl] 섹션 추가

v1.x (구현) → m20 (릴리스) → m30 (이 문서)
```

---

## 성공 기준

### 설계 완성도
1. 7가지 기능 각각의 인터페이스, 스키마, 동작 플로우가 구현 가능한 수준으로 정의됨
2. 기존 설계 문서(24~64)와의 통합 지점이 명확히 식별되고 변경 사항이 반영됨
3. 18개 핵심 검증 시나리오와 6개 보안 시나리오가 설계 문서에 명시됨

### 일관성
4. 기존 Zod SSoT → TS → OpenAPI → Drizzle 파이프라인에 새 스키마가 일관되게 통합됨
5. 에러 코드 체계(66개 → 확장)가 기존 매트릭스와 충돌 없이 정합함
6. config.toml 평탄화 원칙(중첩 금지)이 새 섹션에서도 유지됨

### Self-Hosted 준수
7. 모든 기능이 외부 클라우드 서비스 없이 단일 머신에서 동작하도록 설계됨

---

*작성: 2026-02-09*
*전제: Self-Hosted 단일 머신 아키텍처*
*범위: 설계 마일스톤 — 코드 구현은 범위 외*
*선행: m20 릴리스 완료*
