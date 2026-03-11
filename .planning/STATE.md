---
gsd_state_version: 1.0
milestone: v31.11
milestone_name: — External Action 프레임워크 설계
status: executing
stopped_at: Completed 381-02-PLAN.md
last_updated: "2026-03-11T14:55:00.000Z"
last_activity: 2026-03-11 — Phase 381 complete (2 plans)
progress:
  total_phases: 6
  completed_phases: 2
  total_plans: 4
  completed_plans: 4
  percent: 33
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-11)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인이 자금 통제권을 유지하면서.
**Current focus:** Phase 382 — Signer Capabilities

## Current Position

Phase: 2 of 6 (Phase 381: CredentialVault 인프라) — COMPLETE
Plan: 2/2 complete
Status: Phase 381 complete, ready for Phase 382
Last activity: 2026-03-11 — Phase 381 complete (2 plans)

Progress: [###░░░░░░░] 33%

## Performance Metrics

**Velocity:**
- Total plans completed: 4
- Average duration: 8min
- Total execution time: 0.5 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 380 | 2 | 15min | 8min |
| 381 | 2 | 16min | 8min |

## Accumulated Context
| Phase 380 P01 | 8min | 1 tasks | 1 files |
| Phase 380 P02 | 7min | 1 tasks | 1 files |
| Phase 381 P01 | 8min | 1 tasks | 1 files |
| Phase 381 P02 | 8min | 1 tasks | 1 files |

### Decisions

- Design-only milestone: Zod 스키마 초안 + 설계 문서만, 구현 코드 없음
- Widening strategy: 기존 13개 ActionProvider/4개 파이프라인 경로 무변경, 새 kind 기반 라우팅 분기 추가
- kind normalization: registry에서만 수행, 기존 provider는 kind 없이 반환해도 contractCall로 정규화
- [Phase 380]: kind 필드를 optional로 추가하여 기존 13개 provider 코드 변경 0줄 보장
- [Phase 380]: ApiDirectResult는 ResolvedAction union 밖으로 분리 (의미론적 차이: 실행 완료 vs 서명 대기)
- [Phase 380]: SigningParams는 scheme별 discriminated union (타입 안전성 보장)
- [Phase 380]: credential 주입 시점: sign() 직전에 CredentialVault에서 주입 (노출 최소화)
- [Phase 381]: auth_tag을 별도 DB 컬럼으로 분리 (디버깅 용이성)
- [Phase 381]: node:crypto 사용 (sodium-native 아님) — credential 암호화에는 표준 AES-256-GCM으로 충분
- [Phase 381]: AAD에 credentialId 포함하여 cipher text 재배치 공격 방지
- [Phase 381]: credential 이력 보존은 v1에서 생략 (rotate 시 덮어쓰기)
- [Phase 381]: 만료 체크는 get() 시점에서 lazy evaluation
- [Phase 381]: Admin UI Credentials 탭은 per-wallet + 글로벌 두 진입점
- [Phase 381]: MCP/SDK에서도 복호화된 credential 값 비반환 원칙

### Pending Todos

None.

### Blockers/Concerns

- transactions 테이블 txHash NOT NULL 가정 전수 조사 필요 (Phase 383)

## Session Continuity

Last session: 2026-03-11T14:55:00.000Z
Stopped at: Completed 381-02-PLAN.md
Resume file: None
