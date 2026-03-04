---
gsd_state_version: 1.0
milestone: v30.8
milestone_name: ERC-8004 Trustless Agents 지원
status: in-progress
last_updated: "2026-03-04T09:18:00.000Z"
progress:
  total_phases: 183
  completed_phases: 178
  total_plans: 392
  completed_plans: 388
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-04)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** v30.8 Phase 320 -- Reputation Policy Engine + Cache

## Current Position

Phase: 320 (4 of 7) -- Reputation Policy Engine + Cache
Plan: 0 of 2 in current phase
Status: Phase 319 completed, ready for Phase 320
Last activity: 2026-03-04 -- Phase 319 Read-Only Routes + Registration File completed (2 plans, 4 tasks, 14 tests)

Progress: [####░░░░░░] 43%

## Performance Metrics

**Cumulative:** 81 milestones shipped, 317 phases completed, ~722 plans, ~2,053 reqs, ~6,486+ tests, ~281,265 LOC TS

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 317-01 | DB v39 Migration | 17min | 2 | 16 |
| 317-02 | Core Enum + Settings | 12min | 2 | 10 |
| 318-01 | Registry Client + ABI + Schemas | 10min | 2 | 9 |
| 318-02 | ActionProvider + registerBuiltIn | 12min | 2 | 4 |
| 319-01 | Read-Only API + Registration File | 15min | 2 | 7 |
| 319-02 | connect-info erc8004 Extension | 8min | 2 | 3 |

## Accumulated Context

### Decisions

- EIP-712 typehash: AgentWalletSet 4-field (owner 포함), type name 수정 확인 필요 (연구 결과)
- Validation Registry: 메인넷 미배포 -- feature gate 기본 비활성
- 커뮤니티 SDK 미사용: viem 네이티브로 전부 구현 (ethers.js 의존성 충돌 회피)
- Zero new dependencies: 기존 viem/Zod/Drizzle/Hono 스택으로 전체 구현
- v39 migration uses managesOwnTransaction for policies table recreation (same pattern as v27, v33)
- agent_identities uses UNIQUE INDEX on (registry_address, chain_agent_id) for cross-chain dedup
- reputation_cache uses composite PK (agent_id, registry_address, tag1, tag2) for tag-filtered caching
- approval_type defaults to SIWE with CHECK IN (SIWE, EIP712) for backward compatibility
- REPUTATION_THRESHOLD_TRIGGERED maps to 'policy' category; other 4 ERC-8004 events map to 'identity'
- ReputationThresholdRulesSchema uses PolicyTierEnum for tier fields with APPROVAL defaults
- ERC-8004 feature gate (erc8004_agent_enabled) defaults to false for safe opt-in
- viem added as direct dependency for @waiaas/actions (encodeFunctionData for ABI calldata)
- set_agent_wallet uses placeholder '0x' signature (Phase 321 completes EIP-712 flow)
- register_agent builds agentURI from registrationFileBaseUrl + walletId path
- request_validation generates requestHash via keccak256(toHex(requestURI JSON))
- ADAPTER_NOT_AVAILABLE (503) for unconfigured registries (SERVICE_UNAVAILABLE not in ErrorCode enum)
- 3 ABI constants re-exported from @waiaas/actions index for cross-package access
- Registration file response uses z.any() for free-form JSON per ERC-8004 spec
- PENDING identities excluded from connect-info erc8004 field (only REGISTERED/WALLET_LINKED/DEREGISTERED)

### Blockers/Concerns

- C1: EIP-712 typehash 온체인 검증 필요 (Phase 321 전에 Anvil fork 테스트)
- ~C3: policies 테이블 재생성 시 FK cascade 주의 (v26 패턴 준수)~ -- resolved in v39 migration

## Session Continuity

Last session: 2026-03-04
Stopped at: Completed 319-02-PLAN.md. Phase 319 Read-Only Routes + Registration File complete (2 plans, 4 tasks, 14 tests).
Resume file: None
