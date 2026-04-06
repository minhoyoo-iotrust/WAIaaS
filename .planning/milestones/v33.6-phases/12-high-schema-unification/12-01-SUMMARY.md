---
phase: 12-high-schema-unification
plan: 01
outcome: success
subsystem: enum-schema-consistency
tags: [enum, sqlite, zod, drizzle, agent-status, policy-type, transaction-status, kill-switch]

requires:
  - phase-11 (CRITICAL 의사결정 확정 -- TransactionStatus SSoT, AgentStatus DB 기준)

provides:
  - ENUM-01 해결: AgentStatus DB CHECK 5개 = REST API Zod 5개
  - ENUM-02 해결: PolicyType DB CHECK 4개 = LOCK-MECH 4개 (WHITELIST, RATE_LIMIT 반영)
  - ENUM-03 해결: TransactionStatus 8개 명시적 대응표 기록
  - ENUM-04 해결: 9개 Enum 통합 대응표 산출물 (45-enum-unified-mapping.md)

affects:
  - phase-12 plans 02/03 (config.toml, API 스펙 통일 -- Enum 대응표 참조)
  - phase-13 (MEDIUM 구현 노트 -- Enum 대응표가 구현 기준)

tech-stack:
  patterns:
    - Enum SSoT 대응표 (DB CHECK / Drizzle ORM / Zod / TypeScript 1:1 매핑)
    - 클라이언트 표시 상태 패턴 (DB status + reason 조합)
    - 복합 인덱스 (idx_policies_agent_enabled)

key-files:
  created:
    - .planning/deliverables/45-enum-unified-mapping.md
  modified:
    - .planning/deliverables/25-sqlite-schema.md
    - .planning/deliverables/37-rest-api-complete-spec.md

decisions:
  - ENUM-01: AgentStatus는 DB CHECK 5개 값이 SSoT, KILL_SWITCH는 클라이언트 표시 상태 (status=SUSPENDED + suspension_reason=kill_switch)
  - ENUM-02: PolicyType는 Phase 8 (LOCK-MECH) 4개 값이 SSoT (SPENDING_LIMIT, WHITELIST, TIME_RESTRICTION, RATE_LIMIT)
  - AutoStopRuleType: PLAN에서 명시한 값(ANOMALY_HOURS, THRESHOLD_PROXIMITY, VELOCITY)과 실제 SSoT 문서(36-killswitch)의 값이 다름. SSoT 문서 기준으로 기록 (CONSECUTIVE_FAILURES, TIME_RESTRICTION, DAILY_LIMIT_THRESHOLD, HOURLY_RATE, ANOMALY_PATTERN)
  - AuditLogSeverity: lowercase 3개 값 (info, warning, critical) 유지, notification_log.level의 UPPERCASE와 의도된 차이

metrics:
  duration: ~5min
  completed: 2026-02-06
---

# Phase 12 Plan 01: Enum 통합 대응표 + SQLite/REST API 불일치 수정 Summary

9개 Enum에 대한 DB CHECK/Drizzle ORM/Zod/TypeScript 1:1 대응표를 SSoT로 작성하고, CORE-02 policies.type CHECK를 Phase 8 기준으로 수정(WHITELIST, RATE_LIMIT), REST API AgentStatus Zod를 DB CHECK 5개 값으로 통일.

---

## Task Commits

| # | Task | Commit | Key Changes |
|---|------|--------|-------------|
| 1 | Enum 통합 대응표 + SQLite/REST API 불일치 수정 | `341371e` | 45-enum-unified-mapping.md 신규 (9개 Enum SSoT), 25-sqlite 정책 CHECK/인덱스 수정, 37-rest-api AgentStatus Zod 5개+클라이언트 표시 가이드 |

---

## Decisions Made

### ENUM-01: AgentStatus DB-REST API 통일

- **결정**: DB CHECK 5개 값(CREATING, ACTIVE, SUSPENDED, TERMINATING, TERMINATED)이 SSoT. REST API Zod를 이에 맞춤.
- **근거**: KILL_SWITCH는 SUSPENDED의 특수 케이스(suspension_reason=kill_switch)이지 별도 상태가 아님.
- **수정**: 37-rest-api의 AgentSummarySchema, DashboardResponse에서 z.enum 4개 -> 5개 변경. suspensionReason 필드 추가.
- **영향**: SDK, MCP, Tauri, Telegram Bot 모두 이 5개 값 기준.

### ENUM-02: PolicyType CORE-02 수정

- **결정**: Phase 8 (LOCK-MECH) 4개 값(SPENDING_LIMIT, WHITELIST, TIME_RESTRICTION, RATE_LIMIT)이 SSoT.
- **근거**: Phase 6의 ALLOWED_ADDRESSES/AUTO_STOP은 Phase 8에서 설계 변경됨. CORE-02 원본 업데이트 누락.
- **수정**: 25-sqlite의 policies CHECK, Drizzle ORM enum, rules JSON 예시, 인덱스(idx_policies_agent_enabled 복합 인덱스).
- **영향**: AutoStop은 별도 시스템(auto_stop_rules 테이블)으로 분리 완료 확인.

### AutoStopRuleType SSoT 확인

- **결정**: 36-killswitch 문서의 5개 값(CONSECUTIVE_FAILURES, TIME_RESTRICTION, DAILY_LIMIT_THRESHOLD, HOURLY_RATE, ANOMALY_PATTERN)이 SSoT.
- **근거**: PLAN에서 명시한 값(ANOMALY_HOURS, THRESHOLD_PROXIMITY, VELOCITY)은 실제 문서와 불일치. SSoT 문서 우선.

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] AutoStopRuleType 값 수정**

- **Found during:** Task 1 (대응표 작성)
- **Issue:** PLAN에서 AutoStopRuleType을 `CONSECUTIVE_FAILURES, TIME_WINDOW, ANOMALY_HOURS, THRESHOLD_PROXIMITY, VELOCITY` 5개로 명시했으나, 실제 SSoT 문서(36-killswitch-autostop-evm.md)에서는 `CONSECUTIVE_FAILURES, TIME_RESTRICTION, DAILY_LIMIT_THRESHOLD, HOURLY_RATE, ANOMALY_PATTERN` 5개.
- **Fix:** SSoT 문서(36-killswitch) 기준으로 대응표에 정확한 값 기록.
- **Files modified:** 45-enum-unified-mapping.md
- **Commit:** `341371e`

---

## Files Modified

| File | Changes |
|------|---------|
| `45-enum-unified-mapping.md` | 신규 작성. 9개 Enum SSoT 대응표 (DB CHECK, Drizzle, Zod, TypeScript). 클라이언트 표시 상태 가이드. API 경로 SSoT. 교차 참조 매트릭스. |
| `25-sqlite-schema.md` | policies.type CHECK: ALLOWED_ADDRESSES->WHITELIST, AUTO_STOP 제거+RATE_LIMIT 추가. 인덱스: idx_policies_agent_id/enabled/type -> idx_policies_agent_enabled(복합)+type. rules JSON 예시 업데이트. 전체 스키마 export 섹션 동일 수정. |
| `37-rest-api-complete-spec.md` | AgentSummarySchema status z.enum 4개->5개. suspensionReason 필드 추가. DashboardResponse agentStatuses 동일 수정. RecoverResponse description에서 KILL_SWITCH -> suspension_reason 표현. 클라이언트 에이전트 상태 표시 가이드 섹션 추가. |

---

## Verification Results

| Check | Result |
|-------|--------|
| 9개 Enum 대응표 포함 (count >= 9) | PASS (48 matches) |
| ALLOWED_ADDRESSES 제거 (count = 0) | PASS |
| WHITELIST 존재 (count >= 1) | PASS (5 matches) |
| CHECK에서 AUTO_STOP 제거 | PASS |
| CREATING in 37-rest-api (count >= 1) | PASS (3 matches) |
| z.enum에서 KILL_SWITCH 제거 | PASS |
| RATE_LIMIT in 25-sqlite (count >= 1) | PASS (6 matches) |

---

## Next Phase Readiness

- Plan 12-02 (config.toml 누락 설정) 진행 가능
- Plan 12-03 (REST API/API Framework 통일) 진행 가능 -- AgentStatus Zod 통일 완료로 기반 확보
- Enum 대응표가 구현 단계 기준 문서로 확립됨

## Self-Check: PASSED
