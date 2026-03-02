---
gsd_state_version: 1.0
milestone: v29.10
milestone_name: ntfy 토픽 지갑별 설정 전환
status: active
last_updated: "2026-03-02"
progress:
  total_phases: 2
  completed_phases: 2
  total_plans: 4
  completed_plans: 4
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-02)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** v29.10 Phase 303 - Admin UI + Skill Files

## Current Position

Phase: 303 (2 of 2) — Admin UI + Skill Files
Plan: 2 of 2 in current phase
Status: Complete
Last activity: 2026-03-02 — Completed 303-01-PLAN.md (Admin UI per-wallet topic management)

Progress: [██████████] 100%

## Performance Metrics

**Cumulative:** 77 milestones (76 shipped + 1 active), 301 phases completed, ~684 plans, ~1,945 reqs, ~5,737+ tests, ~233,440 LOC TS

## Accumulated Context

### Decisions

- v29.10: wallet_apps 테이블에 sign_topic/notify_topic 컬럼 추가 (prefix 동적 조합 대신 명시적 DB 저장)
- v29.10: 글로벌 NtfyChannel(Path B) 제거 — Push Relay 미구독 토픽이므로 실질적 손실 없음
- v29.10: NULL 토픽은 prefix+appName 폴백으로 기존 동작 유지
- v29.10: DB 스키마 v33 — wallet_apps에 sign_topic/notify_topic 컬럼 추가 완료
- v29.10: 글로벌 ntfy_topic 설정 키 제거 → config.toml 폴백만 유지 (하위 호환)
- [Phase 302]: SignRequestBuilder/WalletNotificationChannel switched to wallet_apps DB topic routing with prefix fallback
- [Phase 303]: admin.skill.md synced with per-wallet topic API (sign_topic/notify_topic in GET/POST/PUT, ntfy_topic removed from settings)
- [Phase 303]: Admin UI ntfy_topic removed from Notifications, per-wallet topic display/edit added to Human Wallet Apps

### Blockers/Concerns

- 의존: #222 ntfy SSE gzip 파싱 버그 수정 (Push Relay 수신 전제 조건)

## Session Continuity

Last session: 2026-03-02
Stopped at: Completed 303-01-PLAN.md (Admin UI per-wallet topic management)
Resume file: None
