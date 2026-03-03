---
gsd_state_version: 1.0
milestone: v30.0
milestone_name: 운영 기능 확장 설계
status: in_progress
last_updated: "2026-03-03"
progress:
  total_phases: 5
  completed_phases: 5
  total_plans: 11
  completed_plans: 11
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-03)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** v30.0 운영 기능 확장 설계 -- 모든 Phase (304-308) 완료

## Current Position

Phase: 308 (5 of 5) -- Admin Stats + AutoStop Plugin 설계
Plan: 308-03 완료
Status: v30.0 마일스톤 전체 완료 (5 phases, 11 plans, 25 requirements)
Last activity: 2026-03-03 -- Phase 308 Admin Stats + AutoStop Plugin 설계 완료

Progress: [##########] 100%

## Performance Metrics

**Cumulative:** 78 milestones (77 shipped, 1 in progress), 303 phases completed, ~684 plans, ~1,945 reqs, ~5,737+ tests, ~233,440 LOC TS

## Accumulated Context

### Decisions

- v30.0 roadmap: 6 design areas grouped into 5 phases (Stats + AutoStop Plugin combined into Phase 308)
- Phase 307 depends on Phase 305 (audit event taxonomy informs webhook event filtering)
- Phase 308 depends on Phase 304 + 305 (TX stats reference, event system)
- Design milestone: no code implementation, produces design specs for implementation milestone
- Phase 306: EncryptedBackupService as separate class from BackupService (different use cases: upgrade rollback vs encrypted backup)
- Phase 306: VACUUM INTO replaces file copy for atomic DB snapshots
- Phase 306: Backup via daemon REST API (VACUUM INTO needs DB connection), restore via CLI direct execution (daemon stopped)
- Phase 306: config.toml [backup] section with 3 flat keys (dir, interval=0, retention_count=7)
- Phase 304: Separate executeDryRun() method (not dryRun flag in existing stages) for code isolation and test safety
- Phase 304: Policy denial returns HTTP 200 with success=false (separate HTTP status from business result)
- Phase 304: Reuse TransactionRequestSchema for simulate input (copy-paste workflow for agents)
- Phase 304: 12 warning codes for simulation results (INSUFFICIENT_BALANCE, ORACLE_PRICE_UNAVAILABLE, etc.)
- Phase 305: 20 audit events (9 existing + 11 new) -- balanced coverage vs noise
- Phase 305: Integer cursor (not Base64) for audit_log.id AUTOINCREMENT pagination
- Phase 305: Default limit 50 / max 200 for admin-only audit log queries
- Phase 305: raw SQL insertAuditLog helper for consistency across services without Drizzle dependency
- Phase 305: Independent path /v1/audit-logs (not /admin/ subpath)
- Phase 305: total field optional via include_total param to avoid COUNT(*) performance cost
- Phase 305: INVALID_CURSOR error unnecessary -- Zod validation + empty result sufficient
- Phase 307: webhooks + webhook_logs 2 tables (19 -> 21 total), HMAC-SHA256 signing, 4-attempt retry queue, 4 REST endpoints
- Phase 307: WebhookService independent of INotificationChannel (different concerns: N URLs + HMAC + retry vs single channel + fallback)
- Phase 307: Secret dual-storage: SHA-256 hash (API exposure prevention) + AES-256-GCM encrypted (HMAC generation)
- Phase 307: In-memory queue with setTimeout (no external MQ for self-hosted single process)
- Phase 307: 4xx responses abort retry immediately (client errors not transient)
- Phase 307: Webhook events reuse Phase 305 AuditEventType 20-event taxonomy
- Phase 307: Empty events array = wildcard subscription (receive all events)
- Phase 307: Best-effort delivery -- in-flight jobs lost on daemon restart (acceptable trade-off)
- Phase 308: 7 stats categories (original 6 + notifications) -- notification delivery stats essential for operations
- Phase 308: IMetricsCounter interface for testability and future Prometheus adapter
- Phase 308: No new DB indexes -- all 10 aggregation queries covered by existing indexes
- Phase 308: evaluate(event) unified method replacing 3 rule-specific methods in AutoStop rules
- Phase 308: tick() optional for periodic checks (only IdleTimeoutRule uses it)
- Phase 308: RuleAction type separates what-to-do from execution
- Phase 308: RuleRegistry Map-based with insertion order guarantee
- Phase 308: Per-rule enable Setting keys (autostop.rule.{id}.enabled) separate from global autostop.enabled
- Phase 308: Single /admin/stats endpoint for all 7 categories, 1-min TTL cache
- Phase 308: RULE_NOT_FOUND error code for PUT /admin/autostop/rules/:id

### Blockers/Concerns

(None)

## Session Continuity

Last session: 2026-03-03
Stopped at: Completed Phase 308 (Admin Stats + AutoStop Plugin design) -- v30.0 milestone complete
Resume file: None
