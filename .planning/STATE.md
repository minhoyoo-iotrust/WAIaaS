---
gsd_state_version: 1.0
milestone: v31.11
milestone_name: External Action 프레임워크 설계
status: active
last_updated: "2026-03-11T14:00:00.000Z"
last_activity: 2026-03-11 — Roadmap created (6 phases, 34 requirements)
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-11)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인이 자금 통제권을 유지하면서.
**Current focus:** Phase 380 — ResolvedAction 타입 시스템

## Current Position

Phase: 1 of 6 (Phase 380: ResolvedAction 타입 시스템)
Plan: —
Status: Ready to plan
Last activity: 2026-03-11 — Roadmap created

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: —
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

## Accumulated Context

### Decisions

- Design-only milestone: Zod 스키마 초안 + 설계 문서만, 구현 코드 없음
- Widening strategy: 기존 13개 ActionProvider/4개 파이프라인 경로 무변경, 새 kind 기반 라우팅 분기 추가
- kind normalization: registry에서만 수행, 기존 provider는 kind 없이 반환해도 contractCall로 정규화

### Pending Todos

None.

### Blockers/Concerns

- CredentialVault re-encrypt/backup 통합 경로 설계 시 기존 master password 변경 플로우 분석 필요
- transactions 테이블 txHash NOT NULL 가정 전수 조사 필요 (Phase 383)

## Session Continuity

Last session: 2026-03-11
Stopped at: Roadmap created, ready for Phase 380 planning
Resume file: None
