# 마일스톤 m30-02: 운영 기능 확장 구현

- **Status:** PLANNED
- **Milestone:** TBD

## 목표

m30에서 설계한 6가지 운영 기능 — Transaction Dry-Run, Audit Log Query API, Encrypted Backup, Webhook Outbound, Admin Stats API, AutoStop Plugin Architecture — 을 구현하여, WAIaaS 데몬이 운영 환경에서 모니터링/감사/백업/보안 제어가 가능한 상태.

---

## 배경

m30에서 6가지 기능의 인터페이스, 데이터 모델, 테스트 시나리오가 설계 수준에서 정의되었다. 원안 7개에서 코드베이스 현황 분석을 거쳐 3개 항목이 조정되었다:

| 원안 | 조정 | 사유 |
|------|------|------|
| Metrics Export (Prometheus `/metrics`) | **축소** → Admin Stats API (JSON) | Self-Hosted 단일 데몬에서 Prometheus+Grafana 별도 운영은 과도 |
| Rule-Based Anomaly Detection (5개 통계 규칙) | **축소** → AutoStop Plugin Architecture | 개인 데몬에서 통계 규칙 오탐 우려. 기존 3규칙이 핵심 커버 |
| IP/Network Access Control | **제거** | 127.0.0.1 바인딩 + Host Guard + Docker 네트워크로 충분 |

m30-02은 조정된 6가지 설계를 코드로 구현한다.

---

## 구현 대상 설계 문서

| 설계 ID | 기능 | Phase | 구현 범위 |
|---------|------|-------|----------|
| OPS-01 (SIM) | Transaction Dry-Run | 304 | POST /v1/transactions/simulate, Stage 1~3+5b dry-run 분기, DryRunSimulationResult, SDK simulate()/MCP simulate_transaction |
| OPS-02 | Audit Log Query API | 305 | GET /v1/audit-logs, cursor pagination, 감사 이벤트 9→20개 확대, idx_audit_log_tx_id |
| OPS-03 | Encrypted Backup | 306 | POST /v1/admin/backup, GET /v1/admin/backups, waiaas backup/restore CLI, AES-256-GCM 아카이브, VACUUM INTO |
| OPS-04 | Webhook Outbound | 307 | webhook CRUD API (4 엔드포인트), HMAC-SHA256 서명, 재시도 큐, webhooks+webhook_logs 테이블 |
| OPS-05 | Admin Stats API | 308 | GET /v1/admin/stats (7 카테고리 JSON), IMetricsCounter, 1분 TTL 캐시 |
| OPS-06 | AutoStop Plugin Architecture | 308 | IAutoStopRule 인터페이스 추출, RuleRegistry, GET/PUT /v1/admin/autostop/rules, 규칙별 Admin Settings 토글 |

---

## 산출물

### REST API 추가

| 메서드 | 경로 | 인증 | 기능 |
|--------|------|------|------|
| POST | /v1/transactions/simulate | sessionAuth | Dry-Run 시뮬레이션 |
| GET | /v1/audit-logs | masterAuth | 감사 로그 조회 (cursor pagination) |
| POST | /v1/admin/backup | masterAuth | 암호화 백업 생성 |
| GET | /v1/admin/backups | masterAuth | 백업 목록 조회 |
| POST | /v1/webhooks | masterAuth | Webhook 등록 (secret 일회 반환) |
| GET | /v1/webhooks | masterAuth | Webhook 목록 |
| DELETE | /v1/webhooks/:id | masterAuth | Webhook 삭제 (CASCADE) |
| GET | /v1/webhooks/:id/logs | masterAuth | Webhook 전송 이력 |
| GET | /v1/admin/stats | masterAuth | 운영 통계 (7 카테고리 JSON) |
| GET | /v1/admin/autostop/rules | masterAuth | AutoStop 규칙 목록 + 상태 |
| PUT | /v1/admin/autostop/rules/:id | masterAuth | AutoStop 규칙 설정 변경 |

### CLI 커맨드 추가

| 커맨드 | 설명 |
|--------|------|
| waiaas backup | 암호화 백업 생성 |
| waiaas backup list | 백업 목록 조회 |
| waiaas backup inspect | 백업 메타데이터 조회 (복호화 불필요) |
| waiaas restore --from \<path\> | 백업에서 복원 (데몬 정지 상태 필수) |

### DB 마이그레이션

| 테이블/인덱스 | 변경 | 마이그레이션 |
|-------------|------|------------|
| audit_log | idx_audit_log_tx_id 인덱스 추가 | v34 |
| webhooks (20번째 테이블) | 신규 (id, url, secret_hash, secret_encrypted, events, description, enabled, created_at, updated_at) | v35 |
| webhook_logs (21번째 테이블) | 신규 (id, webhook_id FK→webhooks CASCADE, event_type, status, http_status, attempt, error, request_duration, created_at) | v35 |

### 에러 코드 추가

| 코드 | 상태 | 기능 |
|------|------|------|
| WEBHOOK_NOT_FOUND | 404 | Webhook 관리 |
| RULE_NOT_FOUND | 404 | AutoStop 규칙 관리 |

---

## 기술 결정 사항

m30 설계 문서(Phase 304~308 DESIGN-SPEC)의 기술 결정을 그대로 따른다. 주요 결정:

| 기능 | 결정 | 사유 |
|------|------|------|
| Dry-Run | 별도 executeDryRun() 메서드, 기존 stage 함수 미수정 | 부수 효과 격리 |
| Dry-Run | 정책 거부는 HTTP 200 (policy.allowed=false) | 비즈니스 로직 분리 |
| Audit | cursor는 평문 integer (id AUTOINCREMENT) | id는 보안 민감 데이터 아님 |
| Audit | include_total 옵트인 | COUNT(*) 비용 방지 |
| Backup | 기존 BackupService와 별도 EncryptedBackupService | 레거시(업그레이드 롤백) 분리 |
| Backup | 백업=REST API(데몬 실행 중), 복원=CLI(데몬 정지) | VACUUM INTO는 DB 연결 필요, 파일 교체는 정지 필요 |
| Webhook | secret: SHA-256 해시(조회) + AES-256-GCM 암호화(HMAC 생성) | 이중 보안 |
| Webhook | 인메모리 큐 (setTimeout 기반, 재시작 시 미보존) | Self-Hosted best-effort |
| Webhook | NotificationChannel과 독립 | N URL + HMAC + 재시도 vs 단일 채널 |
| Stats | 7 카테고리 (transactions, sessions, wallets, rpc, autostop, notifications, system) | 포괄적 운영 가시성 |
| Stats | 1분 TTL 캐시 | 집계 쿼리 부하 방지 |
| AutoStop | evaluate() 통합 시그니처, tick() 옵셔널 | 3개 규칙 시그니처 통일 |
| AutoStop | RuleAction 선언형 (SUSPEND_WALLET/NOTIFY_IDLE/KILL_SWITCH_CASCADE) | 규칙은 액션 선언, 서비스가 실행 |

구현 시 추가 결정이 필요한 항목은 phase research에서 확정한다.

---

## E2E 검증 시나리오

m30 설계 스펙에서 정의한 Phase별 테스트 시나리오를 구현하여 자동화 테스트로 검증한다.

| Phase | 기능 | 테스트 ID | 수량 |
|-------|------|----------|------|
| 304 | Dry-Run | SIM-T01~T22 | 23개 |
| 305 | Audit Log | Unit 6 + Integration 7 + Security 3 | 16개 |
| 306 | Backup | T-01~T-13 + S-01~S-03 | 16개 |
| 307 | Webhook | Unit 12 + Integration 6 + Security 3 | 21개 |
| 308 | Stats + AutoStop | STAT-T01~T08 + PLUG-T01~T11 + API-T01~T10 | 29개 |
| **합계** | | | **105+ 개** |

**자동화 비율: 100%**

---

## 의존

| 의존 대상 | 이유 |
|----------|------|
| m30-00 (운영 기능 확장 설계, v30.0) | 6가지 기능의 인터페이스, 스키마, 테스트 시나리오 정의 (Phase 304~308 DESIGN-SPEC) |
| v2.0 (전 기능 완성 릴리스) | 코어 인프라 안정화 상태에서 운영 기능 추가 |

---

## 리스크

| # | 리스크 | 영향 | 대응 방안 |
|---|--------|------|----------|
| 1 | 6가지 기능 동시 구현 범위 과다 | 마일스톤 장기화 | 기능별 독립 페이즈로 분할. 우선순위: Dry-Run > Audit > Backup > Webhook > Stats+AutoStop |
| 2 | DB 마이그레이션 2개 테이블 + 1 인덱스 추가 | 기존 DB 호환성 | v1.4부터 적용된 증분 마이그레이션 전략(MIG-01~06) 준수 |
| 3 | Webhook 인메모리 큐 재시작 시 미전송 유실 | 이벤트 손실 | best-effort 설계 수용 (Self-Hosted 환경에서 충분). webhook_logs로 감사 추적 |

---

## 예상 규모

| 항목 | 예상 |
|------|------|
| 페이즈 | 5-7개 (기능별 1-2 페이즈) |
| 신규/수정 파일 | 40-60개 |
| 테스트 | 105+ 개 (설계 스펙 기반) |
| DB 마이그레이션 | v34 (인덱스) + v35 (2개 테이블) |

---

*생성일: 2026-02-15*
*갱신일: 2026-03-03 (m30.0 설계 산출물 기준으로 전면 정합성 수정 — 7→6개 조정 반영, OPS ID 매핑 수정, REST API/DB/테스트 시나리오 실제 설계 반영)*
*선행: m30-00 (운영 기능 확장 설계, v30.0)*
*관련: 설계 문서 OPS-01~OPS-06 (Phase 304~308 DESIGN-SPEC)*
