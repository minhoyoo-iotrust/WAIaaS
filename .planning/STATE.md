---
gsd_state_version: 1.0
milestone: v33.6
milestone_name: XRP 메인넷 지원
status: active
stopped_at: null
last_updated: "2026-04-03T00:00:00.000Z"
last_activity: 2026-04-03
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-03)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인이 자금 통제권을 유지하면서.
**Current focus:** Defining requirements for v33.6 XRP 메인넷 지원

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-04-03 — Milestone v33.6 started

## Accumulated Context

### Decisions

- [Phase 467]: Used partial unique index instead of table rebuild for signing primary uniqueness
- [Phase 467]: Used BEFORE INSERT/UPDATE triggers for signing_enabled CHECK constraint
- [Phase 467]: Removed preferred_wallet setting from PresetAutoSetupService, replaced with signing_enabled column
- [Phase 468]: Consolidated 3 name-based queries into 1 wallet_type + signing_enabled=1 query
- [Phase 468]: preferred_wallet setting deprecated but kept for backward compatibility
- [Phase 469]: Radio group per wallet_type for exclusive signing selection, replacing per-app checkboxes

### Pending Todos

None.

### Blockers/Concerns

None.
