# 마일스톤 m30: 운영 기능 확장 설계

- **Status:** SHIPPED
- **Milestone:** v30.0
- **Completed:** 2026-03-03

## 목표

v29.10 릴리스 이후 운영 환경에서 필요한 6가지 기능 — Transaction Dry-Run, Audit Log Query API, Encrypted Backup, Webhook Outbound, Admin Stats API, AutoStop Plugin Architecture — 을 **설계 수준에서** 정의한다. 각 기능의 인터페이스, 데이터 모델, 기존 설계 문서와의 통합 지점, 테스트 시나리오를 확정하여 구현 마일스톤의 입력을 생산한다.

## 배경

v0.1~v0.9에서 핵심 아키텍처(인증, 정책, 파이프라인, 체인 어댑터, 클라이언트)를 설계 완료하고, v1.x~v29.x에서 구현·확장하여 릴리스하였다. 그러나 운영 환경에서 다음 격차가 존재한다:

| 영역 | 현재 상태 | 격차 |
|------|----------|------|
| TX 사전 검증 | Stage 5b `simulateTransaction()` 내부 전용, `SIMULATION_FAILED` 에러 코드 존재 | 외부 API로 정책 평가 + 수수료 예측 불가 |
| 감사 로그 | audit_log 테이블 + 5개 인덱스 존재, **기록 이벤트 2개뿐** (UNLISTED_TOKEN_TRANSFER, AUTO_STOP_TRIGGERED) | 외부 조회 API 없음 + 감사 이벤트 커버리지 부족 |
| 백업/복구 | `BackupService` 존재 (파일 복사, 보존 정책 5개, 프루닝), `waiaas update --rollback` 내부에서만 사용 | 암호화 없음, 독립 CLI 커맨드 없음, 외부 백업 불가 |
| 이벤트 구독 | Telegram/Discord/Slack/ntfy 푸시 전용 (사람 대상 알림) | 프로그래밍 가능한 webhook 없음 (시스템 간 연동) |
| 운영 통계 | `/health` 상태 + `GET /admin/rpc-status` RPC 풀 상태만 존재 | 통합 운영 통계 조회 경로 없음 |
| AutoStop 확장성 | 3개 구체 클래스 (ConsecutiveFailures, UnusualActivity, IdleTimeout) + 1 수동, 런타임 임계값 조정 가능 | 공통 인터페이스 없음, 새 규칙 추가 시 하드코딩 필요 |

### Self-Hosted 원칙 준수

6가지 기능 모두 Self-Hosted 단일 머신 전제를 유지한다:
- Admin Stats: 외부 모니터링 SaaS 불필요, 단일 JSON 엔드포인트로 충분
- Webhook: 데몬이 직접 HTTP POST (외부 메시지 큐 불필요)
- Backup: 로컬 파일 시스템 암호화 아카이브 (클라우드 스토리지 미의존)

### 조정 사유 (원안 7개 → 6개)

코드베이스 현황 분석 결과 다음 3개 항목을 조정하였다:

| 원안 | 조정 | 사유 |
|------|------|------|
| Metrics Export (Prometheus `/metrics`) | **축소** → Admin Stats API | Self-Hosted 단일 데몬에서 Prometheus+Grafana 별도 운영은 과도. 간단한 JSON 통계 엔드포인트가 실용적 |
| Rule-Based Anomaly Detection (5개 통계 규칙) | **축소** → AutoStop Plugin Architecture | AI 에이전트 1~2개 사용하는 개인 데몬에서 이동 평균/시간대 학습은 오탐만 증가. 기존 3규칙이 핵심 커버. 플러그인 구조 추출만으로 충분 |
| IP/Network Access Control (ipAcl 미들웨어) | **제거** | 기본 `127.0.0.1` 바인딩 + Host Guard 미들웨어로 보호됨. Docker 배포는 `docker-compose.yml` 네트워크 설정으로 제어. IP ACL은 리버스 프록시(nginx/caddy) 영역 |

---

## 설계 대상

### 1. Transaction Dry-Run API

AI 에이전트가 트랜잭션 실행 전 비용과 정책 평가 결과를 사전 확인할 수 있는 시뮬레이션 엔드포인트를 설계한다.

#### 1.1 개요

```
POST /v1/transactions/simulate
Authorization: Bearer wai_sess_...

Request Body: TransactionRequest (5-type: TRANSFER / TOKEN_TRANSFER / CONTRACT_CALL / APPROVE / BATCH)
Response: SimulationResult
```

#### 1.2 현재 코드베이스 현황

- `IChainAdapter.simulateTransaction()` — SolanaAdapter, EvmAdapter 모두 구현 완료
- Stage 5b에서 매 `send` 시 내부적으로 시뮬레이션 호출 (결과를 외부에 노출하지 않음)
- `SIMULATION_FAILED` 에러 코드 이미 존재 (`error-codes.ts`)

#### 1.3 설계 범위

| 항목 | 내용 |
|------|------|
| 엔드포인트 | `POST /v1/transactions/simulate` |
| 인증 | sessionAuth (기존 세션 토큰) |
| 입력 | 기존 TransactionRequest 스키마 재사용 (5-type: TRANSFER / TOKEN_TRANSFER / CONTRACT_CALL / APPROVE / BATCH) |
| 출력 | 정책 평가 결과 (tier), 예상 수수료, 예상 잔액 변화, 경고 목록 |
| 실행 범위 | Stage 1(Validation) → Stage 2(Enrichment) → Stage 3(Policy) → Stage 5b(Simulate) — Stage 4(Approval), Stage 5a(Sign), Stage 6(Broadcast) 미실행 |
| 부수 효과 | 없음 (DB 상태 변경, 체인 전송, reserved_amount 없음) |

#### 1.4 설계 산출물

- SimulationResultSchema (Zod)
- PipelineContext `dryRun` 플래그 + Stage 분기 설계
- SDK/MCP 메서드 확장 (client.simulate(), waiaas_simulate_transaction tool)

#### 1.5 영향받는 설계 문서

| 문서 | 변경 |
|------|------|
| 32 (pipeline) | dry-run 모드 분기 추가 |
| 33 (time-lock) | 읽기 전용 정책 평가 경로 |
| 37 (rest-api) | 엔드포인트 추가 |
| 38 (sdk-mcp) | simulate 메서드/tool 추가 |

---

### 2. Audit Log Query API

audit_log 테이블의 데이터를 외부에서 조회할 수 있는 REST API를 설계한다. **감사 이벤트 커버리지 확대**를 포함한다.

#### 2.1 개요

```
GET /v1/audit-logs?wallet_id=&event_type=&from=&to=&cursor=&limit=
Authorization: X-Master-Password (masterAuth)
```

#### 2.2 현재 코드베이스 현황

- `audit_log` 테이블 완비: id(AUTOINCREMENT), timestamp, event_type, actor, walletId, sessionId, txId, details, severity, ipAddress
- 복합 인덱스 5개: timestamp, event_type, wallet_id, severity, (wallet_id + timestamp)
- **기록 이벤트가 2개뿐**: UNLISTED_TOKEN_TRANSFER (pipeline stages.ts), AUTO_STOP_TRIGGERED (autostop-service.ts)
- 외부 조회 API 없음

#### 2.3 설계 범위

| 항목 | 내용 |
|------|------|
| 엔드포인트 | `GET /v1/audit-logs` |
| 인증 | masterAuth (감사 로그는 관리자 전용) |
| 필터 | wallet_id, event_type, from/to (timestamp), tx_id, severity |
| 페이지네이션 | cursor 기반 (id AUTOINCREMENT 순서 활용) |
| 정렬 | id DESC (최신 우선) |
| 제한 | limit 기본 50, 최대 200 |
| **이벤트 확대** | 기존 2개 → 12개 감사 이벤트 (추가 10개, 아래 참조). 설계 시 추가 이벤트 식별 가능 |

#### 2.4 감사 이벤트 확대 (설계 대상)

현재 2개 이벤트만 기록되어 감사 로그의 실효성이 낮다. 다음 이벤트를 추가 설계한다:

| # | 이벤트 | 발생 지점 | severity |
|---|--------|----------|----------|
| 기존 | UNLISTED_TOKEN_TRANSFER | Pipeline Stage 2 | WARN |
| 기존 | AUTO_STOP_TRIGGERED | AutoStopService | CRITICAL |
| 추가 | SESSION_CREATED | Session 생성 시 | INFO |
| 추가 | SESSION_REVOKED | Session 폐기 시 | WARN |
| 추가 | TX_SUBMITTED | Pipeline Stage 6 완료 시 | INFO |
| 추가 | TX_FAILED | Pipeline 실패 시 | WARN |
| 추가 | POLICY_DENIED | Pipeline Stage 3 거부 시 | WARN |
| 추가 | KILL_SWITCH_ACTIVATED | KillSwitch 발동 시 | CRITICAL |
| 추가 | OWNER_CONNECTED | Owner 연결 시 | INFO |
| 추가 | OWNER_DISCONNECTED | Owner 연결 해제 시 | INFO |
| 추가 | WALLET_CREATED | 월렛 생성 시 | INFO |
| 추가 | MASTER_AUTH_FAILED | masterAuth 인증 실패 시 | CRITICAL |

#### 2.5 설계 산출물

- AuditLogQuerySchema, AuditLogResponseSchema (Zod)
- AuditEventType enum 확대 (2개 → 12개+, 설계 시 추가 식별 가능)
- cursor pagination 설계 (v0.7 DD MEDIUM-3 해소)
- 에러 코드 추가 (INVALID_CURSOR 등)
- 감사 이벤트 삽입 지점 매핑 (각 서비스/파이프라인 스테이지)

#### 2.6 영향받는 설계 문서

| 문서 | 변경 |
|------|------|
| 25 (sqlite) | audit_log 이벤트 타입 확대, 인덱스 최적화 |
| 37 (rest-api) | 엔드포인트 추가 |
| 29 (api-framework) | cursor pagination 유틸리티 |
| 32 (pipeline) | 감사 이벤트 삽입 훅 |

---

### 3. Encrypted Backup & Restore

기존 `BackupService`의 비암호화 백업을 AES-256-GCM 암호화로 강화하고, 독립 CLI 커맨드를 설계한다.

#### 3.1 개요

```bash
waiaas backup [--output ~/.waiaas/backups/] [--schedule daily]
waiaas restore --from backup-2026-03-01.enc
```

#### 3.2 현재 코드베이스 현황

- `BackupService` 구현 완료: `createBackup(version)`, `restoreLatest()`, `restore(backupDir)`, `listBackups()`, `pruneBackups(keep=5)`
- 백업 경로: `{dataDir}/backups/pre-upgrade-{version}-{timestamp}/`
- `waiaas update --rollback` 내부에서만 사용 (독립 CLI 커맨드 없음)
- **암호화 없음** — 평문 파일 복사
- 테스트 존재: `backup-service.test.ts`

#### 3.3 설계 범위

| 항목 | 내용 |
|------|------|
| 기존 유지 | BackupService의 파일 수집/복원/프루닝 로직 재사용 |
| **신규: 암호화** | AES-256-GCM (마스터 비밀번호 기반 Argon2id 키 유도 — 기존 KDF 재사용) |
| **신규: 포맷** | 단일 아카이브 파일 (.waiaas-backup) — 헤더 + 메타데이터 + 암호화 페이로드 |
| **신규: CLI** | `waiaas backup`, `waiaas restore` 독립 커맨드 |
| 원자성 | SQLite VACUUM INTO로 일관된 스냅샷 (기존 파일 복사 → 개선) |
| 복원 | 데몬 정지 상태에서만 가능, 기존 데이터 백업 후 교체 |
| 자동 백업 | config.toml `backup_interval` 키 (선택적, 기본 비활성) |
| 보존 정책 | `backup_retention_count` (기본 7개, 초과 시 가장 오래된 파일 삭제) |

#### 3.4 설계 산출물

- 백업 아카이브 바이너리 포맷 사양 (헤더 + 메타데이터 + 암호화 페이로드)
- BackupService 확장 설계 (기존 인터페이스 유지, 암호화 레이어 추가)
- `waiaas backup` / `waiaas restore` CLI 인터페이스 + 안전 장치 (확인 프롬프트, 기존 데이터 보존)
- config.toml 키 추가: `[backup]` 섹션 (backup_dir, backup_interval, backup_retention_count)

#### 3.5 영향받는 설계 문서

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

#### 4.2 현재 코드베이스 현황

- Discord/Slack 알림 채널이 외부 webhook URL로 POST 전송 (INotificationChannel 구현)
- EventBus 인프라 존재 (이벤트 발행/구독)
- **webhooks 테이블 없음**, **webhook 관리 API 없음**
- 기존 알림은 "사람 대상" — 프로그래밍 가능한 시스템 간 연동 없음

#### 4.3 설계 범위

| 항목 | 내용 |
|------|------|
| 인증 | masterAuth (webhook 등록은 관리자 전용) |
| 구독 대상 | NotificationEventType 중 선택 (필터링) |
| 전송 | HTTP POST, JSON body, HMAC-SHA256 서명 (X-WAIaaS-Signature 헤더) |
| 재시도 | 최대 3회, 지수 백오프 (1s → 2s → 4s) |
| 보안 | webhook secret per endpoint, HMAC 서명 검증 가이드 |
| 저장 | webhooks 테이블 (19번째 테이블), webhook_logs 테이블 (20번째 테이블) |
| 비동기 | 이벤트 발생 → 큐잉 → 비동기 전송 (메인 파이프라인 블로킹 없음) |

#### 4.4 설계 산출물

- WebhookSchema, WebhookEventPayloadSchema (Zod)
- webhooks, webhook_logs 테이블 스키마
- HMAC-SHA256 서명 생성/검증 프로토콜
- 재시도 큐 설계 (인메모리 또는 SQLite 기반)
- INotificationChannel과의 관계 정의 (webhook은 독립 채널 vs 기존 채널 확장)

#### 4.5 영향받는 설계 문서

| 문서 | 변경 |
|------|------|
| 25 (sqlite) | webhooks, webhook_logs 테이블 추가 (18 → 20 테이블) |
| 35 (notification) | webhook 채널 통합 또는 독립 구조 결정 |
| 37 (rest-api) | 엔드포인트 4개 추가 |

---

### 5. Admin Stats API

데몬의 운영 통계를 단일 JSON 엔드포인트로 제공한다. 외부 모니터링 인프라(Prometheus, Grafana) 없이 Admin UI 또는 API 호출로 바로 확인할 수 있는 실용적 통계를 설계한다.

#### 5.1 개요

```
GET /v1/admin/stats
Authorization: X-Master-Password (masterAuth)

Response: { transactions, sessions, wallets, rpc, autostop, uptime }
```

#### 5.2 조정 사유 (원안: Prometheus Metrics Export)

| 원안 | 조정 후 | 사유 |
|------|---------|------|
| `GET /metrics` Prometheus text format | `GET /v1/admin/stats` JSON | Self-Hosted 단일 데몬에 Prometheus+Grafana 별도 운영은 과도 |
| IMetricsRegistry + Counter/Gauge/Histogram | 단순 집계 쿼리 | 외부 의존성 없이 DB + 인메모리 카운터로 충분 |
| prom-client 또는 직접 text format | 표준 JSON 응답 | Admin UI에서 바로 소비 가능 |

> Prometheus 형식이 향후 필요해지면 JSON → text format 변환 레이어만 추가하면 된다.

#### 5.3 설계 범위

| 항목 | 내용 |
|------|------|
| 엔드포인트 | `GET /v1/admin/stats` |
| 인증 | masterAuth |
| 데이터 소스 | transactions 테이블 집계 + 인메모리 카운터 (세션 수, RPC 호출 수) |
| 캐시 | 1분 TTL (scrape 때마다 집계 쿼리 실행 방지) |
| 외부 의존성 | 없음 |

#### 5.4 통계 항목 (설계 대상)

| 카테고리 | 항목 | 데이터 소스 | 설명 |
|----------|------|-----------|------|
| transactions | total, success, failed, pending | DB 집계 | TX 처리 건수 (전체/체인별/타입별) |
| transactions | last_24h_count, last_24h_volume_usd | DB 집계 | 최근 24시간 요약 |
| sessions | active_count | 인메모리 | 현재 활성 세션 수 |
| wallets | total, active, suspended | DB 집계 | 월렛 상태 분포 |
| rpc | requests_total, errors_total, avg_latency_ms | 인메모리 카운터 | RPC 호출 통계 (체인별) |
| autostop | triggered_count, rules_status | AutoStopService | AutoStop 발동 이력 |
| system | uptime_seconds, version, db_size_bytes | 런타임 | 데몬 기본 정보 |

#### 5.5 설계 산출물

- AdminStatsResponseSchema (Zod)
- 인메모리 카운터 인터페이스 (RPC 호출, 세션 카운트)
- DB 집계 쿼리 설계 (transactions, wallets 테이블)
- Admin UI Stats 대시보드 연동 설계

#### 5.6 영향받는 설계 문서

| 문서 | 변경 |
|------|------|
| 37 (rest-api) | 엔드포인트 추가 |
| 29 (api-framework) | 인메모리 카운터 미들웨어 (요청/응답 통계 수집) |
| 67 (admin-ui) | Stats 대시보드 페이지 추가 |

---

### 6. AutoStop Plugin Architecture

AutoStop의 3개 구체 규칙 클래스를 공통 인터페이스로 추출하고, 규칙 레지스트리 + 런타임 on/off 토글을 설계한다. 새 규칙 추가 시 하드코딩 없이 플러그인 등록만으로 확장 가능한 구조를 만든다.

#### 6.1 개요

```
현재 AutoStop (하드코딩된 3개 클래스)
  - ConsecutiveFailuresRule (AUTO-01)
  - UnusualActivityRule (AUTO-02)
  - IdleTimeoutRule (AUTO-03)
  - MANUAL_TRIGGER (AutoStopService 직접 처리)
  ↓ 리팩토링
AutoStop Plugin Architecture
  - IAutoStopRule 인터페이스 추출
  - RuleRegistry (런타임 등록/해제)
  - 규칙별 enable/disable + 임계값 Admin Settings 연동
  - 향후 규칙 추가 시 플러그인 등록만으로 확장
```

#### 6.2 조정 사유 (원안: Rule-Based Anomaly Detection 5개 통계 규칙)

| 원안 | 조정 후 | 사유 |
|------|---------|------|
| 5개 신규 통계 규칙 (이동 평균, 시간대 학습 등) | 인터페이스 추출 + 플러그인 구조만 | Self-Hosted 개인 데몬에서 트래픽 부족으로 통계 규칙 오탐 우려 |
| AnomalyDetector 신규 엔진 | 기존 AutoStopService 리팩토링 | 기존 3규칙이 핵심 시나리오를 이미 커버 |
| config.toml `[anomaly]` 신규 섹션 | 기존 `[security]` 섹션 내 규칙별 키 확장 | 별도 섹션 추가 불필요 |

> 향후 트래픽이 충분한 환경에서 통계 규칙이 필요해지면, IAutoStopRule 구현체를 추가하고 Registry에 등록하면 된다.

#### 6.3 현재 코드베이스 현황

- `AutoStopService`: 3개 규칙 클래스를 직접 인스턴스화, 각 규칙에 `evaluate()` 호출
- 규칙 클래스: `ConsecutiveFailuresRule`, `UnusualActivityRule`, `IdleTimeoutRule` (autostop-rules.ts)
- 런타임 임계값 변경: `updateConfig()` + Admin Settings 핫 리로드
- **공통 인터페이스 없음** — 3개 클래스가 각자 다른 시그니처

#### 6.4 설계 범위

| 항목 | 내용 |
|------|------|
| 위치 | AutoStopService 리팩토링 (기존 동작 유지) |
| IAutoStopRule | `evaluate(context): RuleResult` 공통 인터페이스 |
| RuleRegistry | 런타임 규칙 등록/해제, `getRules()`, `getRule(id)` |
| Admin API | `GET /v1/admin/autostop/rules` — 규칙 목록 + 상태 조회 |
| Admin Settings | 규칙별 enable/disable 토글, 임계값 변경 |
| 하위 호환 | 기존 3규칙 동작 변경 없음, 인터페이스 추출만 |

#### 6.5 설계 산출물

- IAutoStopRule 인터페이스 + RuleResult 타입
- RuleRegistry 설계 (등록/해제/조회)
- 기존 3개 규칙 클래스 → IAutoStopRule 구현체로 리팩토링 설계
- Admin Settings 규칙별 토글 스키마
- `GET /v1/admin/autostop/rules` 응답 스키마

#### 6.6 영향받는 설계 문서

| 문서 | 변경 |
|------|------|
| 36 (killswitch-autostop) | IAutoStopRule + RuleRegistry 구조 |
| 37 (rest-api) | 규칙 조회 엔드포인트 추가 |

---

## 설계 문서 영향 요약

기존 설계 문서(01~76) 중 영향받는 문서와 변경 규모:

| 문서 | 영향 기능 | 변경 규모 |
|------|----------|----------|
| 25 (sqlite) | Audit 이벤트 확대, Webhook 테이블 2개 추가 | 중 |
| 26 (keystore) | Backup 암호화 시 키스토어 포함 범위 | 소 |
| 28 (daemon) | Backup 스케줄러 라이프사이클 | 소 |
| 29 (api-framework) | cursor pagination 유틸리티, 인메모리 카운터 | 중 |
| 32 (pipeline) | Dry-Run 분기, 감사 이벤트 훅 | 소 |
| 33 (time-lock) | Dry-Run 읽기 전용 정책 평가 경로 | 소 |
| 35 (notification) | Webhook 채널 통합 또는 독립 구조 | 중 |
| 36 (killswitch-autostop) | IAutoStopRule + RuleRegistry 구조 | 중 |
| 37 (rest-api) | 엔드포인트 7개+ 추가, 에러 코드 추가 | 대 |
| 38 (sdk-mcp) | simulate 메서드/tool | 소 |
| 54 (cli) | backup/restore 커맨드 | 중 |
| 67 (admin-ui) | Stats 대시보드 페이지 | 소 |

---

## 신규 산출물

| ID | 산출물 | 설명 |
|----|--------|------|
| OPS-01 | Transaction Dry-Run 설계 스펙 | SimulationResult 스키마, PipelineContext dryRun 분기, SDK/MCP 확장 |
| OPS-02 | Audit Log Query API 설계 스펙 | 쿼리 스키마, cursor pagination, 감사 이벤트 14개+ 정의, 삽입 지점 매핑 |
| OPS-03 | Encrypted Backup 설계 스펙 | 아카이브 포맷, BackupService 암호화 확장, CLI 커맨드, 보존 정책 |
| OPS-04 | Webhook Outbound 설계 스펙 | 구독 모델, HMAC 서명, 재시도 큐, 테이블 스키마 |
| OPS-05 | Admin Stats API 설계 스펙 | 통계 항목 정의, 인메모리 카운터, DB 집계 쿼리, Admin UI 연동 |
| OPS-06 | AutoStop Plugin Architecture 설계 스펙 | IAutoStopRule 인터페이스, RuleRegistry, 기존 규칙 리팩토링, Admin 토글 |

---

## 테스트 전략 (설계 검증)

본 마일스톤은 설계 마일스톤이므로, 아래 시나리오는 설계 문서에 명시하여 구현 단계에서 테스트 계획의 기반이 된다.

### 핵심 검증 시나리오

| # | 기능 | 시나리오 | 검증 내용 | 레벨 |
|---|------|----------|----------|------|
| T-01 | Dry-Run | 정상 시뮬레이션 | 정책 tier + 수수료 + 잔액 변화 반환 | Unit |
| T-02 | Dry-Run | 잔액 부족 시뮬레이션 | INSUFFICIENT_BALANCE 경고 포함 | Unit |
| T-03 | Dry-Run | 부수 효과 없음 | DB reserved_amount 미변경, 체인 미전송 | Unit |
| T-04 | Audit | 필터 조합 조회 | wallet_id + event_type + 기간 필터 | Integration |
| T-05 | Audit | cursor pagination | 다음 페이지 정확성, 빈 결과 처리 | Unit |
| T-06 | Audit | 이벤트 커버리지 | 14개 이벤트 타입 각각 audit_log에 기록됨 | Integration |
| T-07 | Backup | 암호화 백업 생성 | 아카이브 파일 생성, AES-256-GCM 암호화 | Integration |
| T-08 | Backup | 복원 정확성 | 백업에서 복원 후 DB + 키스토어 일치 | Integration |
| T-09 | Backup | 잘못된 비밀번호 | 복호화 실패, 기존 데이터 보존 | Unit |
| T-10 | Webhook | 이벤트 전송 | TX 완료 → webhook POST + HMAC 서명 | Integration |
| T-11 | Webhook | 재시도 | 1차 실패 → 3회 재시도 후 실패 기록 | Unit |
| T-12 | Webhook | HMAC 검증 | 수신 측 서명 검증 성공/실패 | Unit |
| T-13 | Stats | JSON 응답 | /admin/stats 응답이 AdminStatsResponseSchema 준수 | Unit |
| T-14 | Stats | TX 카운터 | 전송 완료 후 transactions.total 증가 | Integration |
| T-15 | AutoStop | IAutoStopRule 호환 | 기존 3규칙이 인터페이스 구현 후 동일 동작 | Unit |
| T-16 | AutoStop | 규칙 레지스트리 | 등록/해제/조회 동작 | Unit |

### 보안 시나리오

| # | 기능 | 시나리오 | 검증 내용 |
|---|------|----------|----------|
| S-01 | Dry-Run | 시뮬레이션으로 정책 우회 시도 | dry-run 결과가 실제 실행과 독립적 |
| S-02 | Backup | 백업 파일 탈취 | 마스터 비밀번호 없이 복호화 불가 |
| S-03 | Backup | 백업 파일 변조 | AEAD 인증 실패로 복원 거부 |
| S-04 | Webhook | secret 노출 | webhook secret 평문 저장 금지 (해시 또는 암호화) |
| S-05 | Audit | 권한 없는 로그 조회 | sessionAuth로 audit-logs 접근 시 403 |

---

## 마일스톤 범위 외 (Out of Scope)

- 실제 코드 구현 (설계 마일스톤)
- Prometheus Metrics Export (Admin Stats API로 축소됨; 향후 JSON → text format 변환 레이어 추가 가능)
- IP/Network ACL (127.0.0.1 바인딩 + Host Guard + Docker 네트워크로 충분; 리버스 프록시 영역)
- ML 기반 이상 탐지 / 통계 규칙 (AutoStop 플러그인 구조만; 규칙 추가는 향후 마일스톤)
- Wallet Budget / Allowance 시스템 (별도 마일스톤 검토)
- Wallet-to-Wallet Delegation (Multi-Wallet 고급 시나리오)
- Key Rotation (sweepAll 기반 — 별도 설계 필요)
- Hot/Cold Wallet 분리 (대규모 운용 시나리오)
- Transaction Templates (DX 개선 — 별도 마일스톤 검토)

---

## 선행 마일스톤과의 관계

```
v0.2~v0.9 (설계) + v1.x~v29.x (구현·확장)     m30 (운영 기능 확장 설계)
──────────────────────────────────────         ──────────────────────────
Stage 5b simulateTransaction() (32)        →   Dry-Run API (외부 노출)
audit_log 테이블 + 5 인덱스 (25)           →   Audit Log Query API + 이벤트 확대
BackupService 비암호화 (daemon)            →   Encrypted Backup (암호화 + CLI)
INotificationChannel + EventBus (35)       →   Webhook Outbound 채널
/health + /admin/rpc-status               →   Admin Stats API (통합 통계)
AutoStop 3규칙 구체 클래스 (36)            →   IAutoStopRule + RuleRegistry
config.toml 12섹션 ~108키                 →   [backup] 섹션 추가
DB 18테이블, 에러 코드 ~110개, ~100 엔드포인트  (현재 기준선)

v0.1~v29.10 (77 milestones) → m30 (이 문서)
```

---

## 성공 기준

### 설계 완성도
1. 6가지 기능 각각의 인터페이스, 스키마, 동작 플로우가 구현 가능한 수준으로 정의됨
2. 기존 설계 문서(01~76)와의 통합 지점이 명확히 식별되고 변경 사항이 반영됨
3. 16개 핵심 검증 시나리오와 5개 보안 시나리오가 설계 문서에 명시됨

### 일관성
4. 기존 Zod SSoT → TS → OpenAPI → Drizzle 파이프라인에 새 스키마가 일관되게 통합됨
5. 에러 코드 체계(~110개 → 확장)가 기존 매트릭스와 충돌 없이 정합함
6. config.toml 섹션별 평탄 키 원칙(섹션 내 중첩 금지)이 새 섹션에서도 유지됨

### Self-Hosted 준수
7. 모든 기능이 외부 클라우드 서비스 없이 단일 머신에서 동작하도록 설계됨

### 현실성
8. 기존 코드베이스 자산(BackupService, simulateTransaction, audit_log 테이블, EventBus)을 최대한 활용하여 구현 비용 최소화

---

*작성: 2026-02-09*
*갱신: 2026-03-03 (코드베이스 분석 기반 7개→6개 조정, 현재 구현 현황 반영)*
*전제: Self-Hosted 단일 머신 아키텍처*
*범위: 설계 마일스톤 — 코드 구현은 범위 외*
*선행: v29.10 릴리스 완료 (77 milestones, ~233,440 LOC TS, ~5,737 tests)*
