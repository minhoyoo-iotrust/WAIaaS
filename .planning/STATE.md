---
gsd_state_version: 1.0
milestone: v30.6
milestone_name: ERC-4337 Account Abstraction 지원
status: active
last_updated: "2026-03-04T12:30:00.000Z"
progress:
  total_phases: 3
  completed_phases: 0
  total_plans: 10
  completed_plans: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-04)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** v30.6 Phase 314 - SmartAccountService + DB Migration + Settings

## Current Position

Phase: 314 of 316 (SmartAccountService + DB Migration + Settings)
Plan: 0 of 3 in current phase
Status: Ready to plan
Last activity: 2026-03-04 -- Roadmap created (3 phases, 36 requirements, 10 plans)

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Cumulative:** 80 milestones (80 shipped), 313+ phases completed, ~710 plans, ~2,011 reqs, ~6,413+ tests, ~246,245 LOC TS

## Accumulated Context

### Decisions

- viem `account-abstraction` 모듈 활용 (toSoladySmartAccount, createBundlerClient, createPaymasterClient)
- EntryPoint v0.7 전용 (v0.6 레거시 미지원)
- 기존 5-type TransactionRequestSchema 유지, 내부 실행 경로만 accountType 분기
- Lazy deployment: CREATE2 예측 주소로 미배포 상태에서 주소 확정, 첫 트랜잭션 시 initCode 포함
- DB v38: wallets 테이블에 account_type, signer_key, deployed, entry_point 컬럼 추가

### Blockers/Concerns

(None)

## Session Continuity

Last session: 2026-03-04
Stopped at: Roadmap created, ready for phase planning
Resume file: None
