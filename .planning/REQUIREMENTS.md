# Requirements: WAIaaS v30.0 운영 기능 확장 설계

**Defined:** 2026-03-03
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v1 Requirements

Requirements for milestone v30.0. Each maps to roadmap phases.

### Simulation (Transaction Dry-Run)

- [x] **SIM-01**: SimulationResult Zod 스키마를 정의하여 정책 tier, 예상 수수료, 잔액 변화, 경고 목록을 표현한다
- [x] **SIM-02**: PipelineContext dryRun 플래그와 Stage 분기 설계를 정의하여 Stage 1→2→3→5b만 실행하고 부수 효과 없음을 보장한다
- [x] **SIM-03**: `POST /v1/transactions/simulate` 엔드포인트 스펙을 정의한다 (입력: 기존 TransactionRequest 5-type 재사용)
- [x] **SIM-04**: SDK simulate() 메서드와 MCP waiaas_simulate_transaction tool 확장 스펙을 정의한다

### Audit Log (감사 로그 조회 + 이벤트 확대)

- [x] **AUDIT-01**: AuditLogQuerySchema와 AuditLogResponseSchema를 Zod로 정의한다 (필터: wallet_id, event_type, from/to, tx_id, severity)
- [x] **AUDIT-02**: cursor pagination 설계를 정의한다 (id AUTOINCREMENT 순서, 기본 50건, 최대 200건)
- [x] **AUDIT-03**: AuditEventType enum을 2개→12개+로 확대하고 각 이벤트의 발생 지점(서비스/스테이지)을 매핑한다
- [x] **AUDIT-04**: `GET /v1/audit-logs` 엔드포인트 스펙을 masterAuth 인증으로 정의한다

### Backup (암호화 백업/복원)

- [x] **BKUP-01**: 백업 아카이브 바이너리 포맷 사양을 정의한다 (헤더 + 메타데이터 + AES-256-GCM 암호화 페이로드)
- [x] **BKUP-02**: BackupService 암호화 확장 설계를 정의한다 (기존 인터페이스 유지, Argon2id KDF 키 유도, VACUUM INTO 원자적 스냅샷)
- [x] **BKUP-03**: `waiaas backup` / `waiaas restore` CLI 인터페이스와 안전 장치를 설계한다
- [x] **BKUP-04**: config.toml `[backup]` 섹션 키를 정의한다 (backup_dir, backup_interval, backup_retention_count)

### Webhook (웹훅 아웃바운드)

- [ ] **HOOK-01**: webhooks, webhook_logs 테이블 스키마를 정의한다 (Drizzle + Zod SSoT)
- [ ] **HOOK-02**: HMAC-SHA256 서명 생성/검증 프로토콜을 정의한다 (X-WAIaaS-Signature 헤더)
- [ ] **HOOK-03**: 비동기 재시도 큐 설계를 정의한다 (최대 3회, 지수 백오프 1s→2s→4s)
- [ ] **HOOK-04**: REST API 4 엔드포인트 스펙을 정의한다 (POST/GET/DELETE webhooks, GET logs)
- [ ] **HOOK-05**: EventBus 연동 및 이벤트 필터링 메커니즘을 설계한다

### Stats (운영 통계 API)

- [ ] **STAT-01**: AdminStatsResponseSchema를 Zod로 정의한다 (transactions/sessions/wallets/rpc/autostop/system 7 카테고리)
- [ ] **STAT-02**: 인메모리 카운터 인터페이스를 설계한다 (RPC 호출, 세션 카운트, TX 카운터)
- [ ] **STAT-03**: DB 집계 쿼리와 1분 TTL 캐시 설계를 정의한다
- [ ] **STAT-04**: `GET /v1/admin/stats` 엔드포인트 스펙과 Admin UI 대시보드 연동을 설계한다

### AutoStop Plugin

- [ ] **PLUG-01**: IAutoStopRule 인터페이스와 RuleResult 타입을 정의한다 (`evaluate(context): RuleResult`)
- [ ] **PLUG-02**: RuleRegistry 설계를 정의한다 (런타임 등록/해제/조회)
- [ ] **PLUG-03**: 기존 3개 규칙 클래스의 IAutoStopRule 구현체 리팩토링 설계를 정의한다
- [ ] **PLUG-04**: 규칙별 enable/disable Admin Settings 토글과 `GET /v1/admin/autostop/rules` 응답 스키마를 정의한다

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Operations

- **ADVOPS-01**: Prometheus text format `/metrics` 엔드포인트 (JSON→text format 변환 레이어)
- **ADVOPS-02**: ML 기반 이상 탐지 통계 규칙 (AutoStop IAutoStopRule 플러그인으로 추가)
- **ADVOPS-03**: Webhook 배치 전송 (여러 이벤트를 묶어 한 번에 POST)
- **ADVOPS-04**: 감사 로그 자동 아카이빙 (오래된 로그 파일 내보내기)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| 코드 구현 | 설계 마일스톤 -- 구현은 별도 마일스톤 |
| IP/Network ACL | 127.0.0.1 바인딩 + Host Guard + Docker 네트워크로 충분; 리버스 프록시 영역 |
| Wallet Budget / Allowance | 별도 마일스톤 검토 |
| Key Rotation | sweepAll 기반 -- 별도 설계 필요 |
| Hot/Cold Wallet 분리 | 대규모 운용 시나리오 |
| Transaction Templates | DX 개선 -- 별도 마일스톤 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SIM-01 | Phase 304 | Complete |
| SIM-02 | Phase 304 | Complete |
| SIM-03 | Phase 304 | Complete |
| SIM-04 | Phase 304 | Complete |
| AUDIT-01 | Phase 305 | Complete |
| AUDIT-02 | Phase 305 | Complete |
| AUDIT-03 | Phase 305 | Complete |
| AUDIT-04 | Phase 305 | Complete |
| BKUP-01 | Phase 306 | Complete |
| BKUP-02 | Phase 306 | Complete |
| BKUP-03 | Phase 306 | Complete |
| BKUP-04 | Phase 306 | Complete |
| HOOK-01 | Phase 307 | Pending |
| HOOK-02 | Phase 307 | Pending |
| HOOK-03 | Phase 307 | Pending |
| HOOK-04 | Phase 307 | Pending |
| HOOK-05 | Phase 307 | Pending |
| STAT-01 | Phase 308 | Pending |
| STAT-02 | Phase 308 | Pending |
| STAT-03 | Phase 308 | Pending |
| STAT-04 | Phase 308 | Pending |
| PLUG-01 | Phase 308 | Pending |
| PLUG-02 | Phase 308 | Pending |
| PLUG-03 | Phase 308 | Pending |
| PLUG-04 | Phase 308 | Pending |

**Coverage:**
- v1 requirements: 25 total
- Mapped to phases: 25
- Unmapped: 0

---
*Requirements defined: 2026-03-03*
*Last updated: 2026-03-03 after Phase 305 completion (AUDIT-01~04 complete)*
