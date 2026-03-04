---
gsd_state_version: 1.0
milestone: v30.6
milestone_name: ERC-4337 Account Abstraction 지원
status: in_progress
last_updated: "2026-03-04"
progress:
  total_phases: 182
  completed_phases: 178
  total_plans: 395
  completed_plans: 392
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-04)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** v30.6 Phase 316 - CLI + SDK + MCP + Admin UI + Skills (next)

## Current Position

Phase: 315 of 316 complete (UserOperation Pipeline + Paymaster -- DONE)
Plan: 4 of 4 complete in Phase 315
Status: Phase 315 complete. Phase 316 ready for planning.
Last activity: 2026-03-04 -- Phase 315 executed (4 plans, 17 requirements, 4 waves, 59 new tests)

Progress: [██████████] 100% (Phase 315)

## Performance Metrics

**Phase 315 results:**
- Plans: 4/4 complete
- Tests: 59 new (12 unit + 47 integration), all passing
- Files: 13 created/modified
- Commits: 4
- Key implementations: stage5ExecuteSmartAccount (~365 lines), buildUserOpCalls (100 lines), smart-account-clients.ts (121 lines)

**Phase 314 results:**
- Plans: 3/3 complete
- Tests: 13 new (5 unit + 8 integration), all passing
- Files: 10 created/modified
- Commits: 7
- Duration: ~35 min

**Cumulative:** 80 milestones (80 shipped), 315 phases completed (178/182 total), ~717 plans, ~2,041 reqs, ~6,485+ tests, ~247,000 LOC TS

## Accumulated Context

### Decisions

- viem `account-abstraction` 모듈 활용 (toSoladySmartAccount, createBundlerClient, createPaymasterClient)
- EntryPoint v0.7 전용 (v0.6 레거시 미지원)
- 기존 5-type TransactionRequestSchema 유지, 내부 실행 경로만 accountType 분기
- Lazy deployment: CREATE2 예측 주소로 미배포 상태에서 주소 확정, 첫 트랜잭션 시 initCode 포함
- DB v38: wallets 테이블에 account_type, signer_key, deployed, entry_point 컬럼 추가
- Smart account validation order: chain -> feature gate -> bundler URL
- Used `any` for SmartAccountService.client type to avoid viem's complex generics
- On-demand settings pattern: no hot-reload subsystem, settings read per-request
- Inline ERC-20 ABI in stages.ts to avoid cross-package import from @waiaas/adapters-evm
- Paymaster rejection detection: error message pattern matching ('paymaster', 'PM_', 'Paymaster')
- Gas safety margin: (estimated * 120n) / 100n applied to all 3 gas fields (callGasLimit, verificationGasLimit, preVerificationGas)
- BundlerClient paymaster option: create PaymasterClient inline when paymaster_url configured, omit entirely when not
- SettingsService.get() throws on unknown keys, so URL resolution uses try/catch for chain-specific keys

### Blockers/Concerns

(None)

## Session Continuity

Last session: 2026-03-04
Stopped at: Phase 315 complete, Phase 316 ready for planning
Resume file: None
