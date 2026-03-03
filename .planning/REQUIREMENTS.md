# Requirements: WAIaaS v30.2 운영 기능 확장 구현

**Defined:** 2026-03-03
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Objective:** m30-02 (운영 기능 확장 구현)
**Design Specs:** OPS-01~06 (Phase 304~308 DESIGN-SPEC.md)

## v1 Requirements

Requirements for v30.2. Each maps to roadmap phases.

### Transaction Dry-Run (SIM)

- [x] **SIM-01**: POST /v1/transactions/simulate returns DryRunSimulationResult (policy/fee/balanceChanges/warnings/simulation/meta) with zero side effects — no DB writes, no signing, no notifications, no event emissions
- [x] **SIM-02**: Dry-run policy denial returns HTTP 200 with success=false, policy.allowed=false (business result separated from HTTP status)
- [x] **SIM-03**: SDK simulate() method mirrors sendToken() request shape with withRetry() wrapping
- [x] **SIM-04**: MCP simulate_transaction tool available for AI agents with same parameter structure as send_token
- [x] **SIM-05**: DryRunSimulationResultSchema Zod SSoT in @waiaas/core with 12 warning codes (INSUFFICIENT_BALANCE, ORACLE_PRICE_UNAVAILABLE, etc.)

### Audit Log Query (AUDIT)

- [x] **AUDIT-01**: GET /v1/audit-logs supports cursor pagination (id AUTOINCREMENT, default 50, max 200) with 6 filters (wallet_id, event_type, severity, from/to, tx_id) and optional include_total
- [x] **AUDIT-02**: 11 new audit event types added (total 20: WALLET_CREATED, WALLET_SUSPENDED, SESSION_CREATED, SESSION_REVOKED, TX_SUBMITTED, TX_CONFIRMED, TX_FAILED, POLICY_DENIED, KILL_SWITCH_RECOVERED, MASTER_AUTH_FAILED, OWNER_REGISTERED) with insertAuditLog helper and per-event severity/details mapping
- [x] **AUDIT-03**: DB migration v36 adds idx_audit_log_tx_id index (무중단 DDL)

### Encrypted Backup (BKUP)

- [x] **BKUP-01**: POST /v1/admin/backup creates AES-256-GCM encrypted archive (Argon2id KDF, VACUUM INTO DB snapshot, masterAuth)
- [x] **BKUP-02**: GET /v1/admin/backups lists available backups with metadata (masterAuth)
- [x] **BKUP-03**: CLI waiaas backup / backup list / backup inspect commands (backup via daemon API, list/inspect offline)
- [x] **BKUP-04**: CLI waiaas restore --from restores from encrypted backup (daemon stopped required, existing data preserved as .bak, auto-rollback on failure, PRAGMA integrity_check)
- [x] **BKUP-05**: Backup archive binary format — 60B fixed header (magic WAIAAS\x00\x01 + format version + salt + nonce + auth tag) + plaintext metadata JSON + encrypted payload (DB + config.toml + keystore files)
- [x] **BKUP-06**: config.toml [backup] section (dir/interval/retention_count) + BackupWorker auto-scheduler integrated with BackgroundWorkers lifecycle

### Webhook Outbound (HOOK)

- [ ] **HOOK-01**: POST /v1/webhooks registers webhook, returns 64-char hex secret once (SHA-256 hash for lookup + AES-256-GCM encrypted for HMAC signing, masterAuth, 201)
- [ ] **HOOK-02**: GET /v1/webhooks lists webhooks (secret not exposed), DELETE /v1/webhooks/:id returns 204 with CASCADE logs deletion (masterAuth, WEBHOOK_NOT_FOUND 404)
- [ ] **HOOK-03**: GET /v1/webhooks/:id/logs returns delivery history with status/event_type/limit filters (default 20, max 100, masterAuth)
- [ ] **HOOK-04**: Webhook payloads signed with HMAC-SHA256 — X-WAIaaS-Signature (sha256={hex}), X-WAIaaS-Event, X-WAIaaS-Delivery (UUID), X-WAIaaS-Timestamp headers
- [ ] **HOOK-05**: WebhookDeliveryQueue — max 4 attempts, exponential backoff (0/1s/2s/4s), 10s fetch timeout, 4xx immediate stop, per-attempt webhook_logs recording
- [ ] **HOOK-06**: DB migration v35 creates webhooks (8 columns, 1 index, 1 CHECK) + webhook_logs (9 columns, 4 indexes, 1 CHECK) tables — total 19→21 tables
- [ ] **HOOK-07**: WebhookService listens to EventBus events + direct invocations, filters via webhooks.events JSON array (empty = wildcard all 20 event types), independent from INotificationChannel

### Admin Stats (STAT)

- [ ] **STAT-01**: GET /v1/admin/stats returns 7-category JSON (transactions/sessions/wallets/rpc/autostop/notifications/system) with masterAuth
- [ ] **STAT-02**: IMetricsCounter in-memory counters — increment/recordLatency/getCount/getAvgLatency/snapshot/reset, 6 counter hooks (rpc.calls, rpc.errors, rpc.latency, autostop.triggered, tx.submitted, tx.failed)
- [ ] **STAT-03**: AdminStatsService with 1-minute TTL cache, 10 DB aggregate queries leveraging existing indexes, invalidateCache() for testing
- [ ] **STAT-04**: Admin UI dashboard stats cards (RPC network table, AutoStop rules table, notification summary, system info) with 30s polling

### AutoStop Plugin (PLUG)

- [ ] **PLUG-01**: IAutoStopRule interface (evaluate/tick/getStatus/updateConfig/reset) + RuleResult/RuleAction types, existing 3 rules refactored into autostop/ directory structure without behavior change
- [ ] **PLUG-02**: RuleRegistry (Map-based) — register/unregister/getRules/getEnabledRules/getRulesForEvent/getTickableRules/setEnabled, builtin 3 rules auto-registered
- [ ] **PLUG-03**: GET /v1/admin/autostop/rules returns rules list + status/config, PUT /v1/admin/autostop/rules/:id updates enabled/config (masterAuth, RULE_NOT_FOUND 404)
- [ ] **PLUG-04**: Per-rule enable/disable via Admin Settings (autostop.rule.consecutive_failures.enabled, autostop.rule.unusual_activity.enabled, autostop.rule.idle_timeout.enabled) with global master switch

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Backup Extensions

- **BKUP-EXT-01**: Remote storage integration (S3, GCS) for backup upload
- **BKUP-EXT-02**: Incremental backup (only changed data since last backup)

### Webhook Extensions

- **HOOK-EXT-01**: Admin UI webhook management page (CRUD + log viewer)
- **HOOK-EXT-02**: Persistent webhook queue (survive daemon restart)

### Stats Extensions

- **STAT-EXT-01**: Prometheus /metrics endpoint for external monitoring
- **STAT-EXT-02**: Historical stats retention and trending

## Out of Scope

| Feature | Reason |
|---------|--------|
| Remote backup storage (S3/GCS) | Self-Hosted 환경 우선, 로컬 파일 시스템만 |
| Incremental backup | DB 크기 수~수십 MB로 전체 백업 충분 |
| Persistent webhook queue (Redis/DB) | Self-Hosted 단일 프로세스, 인메모리 best-effort 충분 |
| Prometheus metrics export | Admin Stats JSON 엔드포인트로 충분, 별도 Prometheus+Grafana 과도 |
| ML-based anomaly detection | AutoStop Plugin으로 규칙 기반 확장 가능, ML은 별도 마일스톤 |
| Streaming encryption | DB 크기 수~수십 MB로 메모리 충분 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SIM-01 | Phase 309 | Complete |
| SIM-02 | Phase 309 | Complete |
| SIM-03 | Phase 309 | Complete |
| SIM-04 | Phase 309 | Complete |
| SIM-05 | Phase 309 | Complete |
| AUDIT-01 | Phase 310 | Complete |
| AUDIT-02 | Phase 310 | Complete |
| AUDIT-03 | Phase 310 | Complete |
| BKUP-01 | Phase 311 | Complete |
| BKUP-02 | Phase 311 | Complete |
| BKUP-03 | Phase 311 | Complete |
| BKUP-04 | Phase 311 | Complete |
| BKUP-05 | Phase 311 | Complete |
| BKUP-06 | Phase 311 | Complete |
| HOOK-01 | Phase 312 | Pending |
| HOOK-02 | Phase 312 | Pending |
| HOOK-03 | Phase 312 | Pending |
| HOOK-04 | Phase 312 | Pending |
| HOOK-05 | Phase 312 | Pending |
| HOOK-06 | Phase 312 | Pending |
| HOOK-07 | Phase 312 | Pending |
| STAT-01 | Phase 313 | Pending |
| STAT-02 | Phase 313 | Pending |
| STAT-03 | Phase 313 | Pending |
| STAT-04 | Phase 313 | Pending |
| PLUG-01 | Phase 313 | Pending |
| PLUG-02 | Phase 313 | Pending |
| PLUG-03 | Phase 313 | Pending |
| PLUG-04 | Phase 313 | Pending |

**Coverage:**
- v1 requirements: 30 total
- Mapped to phases: 30/30
- Unmapped: 0

---
*Requirements defined: 2026-03-03*
*Last updated: 2026-03-03 -- BKUP-01~06 complete (Phase 311), 16/30 remaining*
