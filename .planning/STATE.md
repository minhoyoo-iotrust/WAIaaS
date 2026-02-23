# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-23)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** v28.2 0x EVM DEX Swap -- Phase 250

## Current Position

Milestone: v28.2 0x EVM DEX Swap
Phase: 250 of 250
Plan: 0 of 0 in current phase
Status: Executing
Last activity: 2026-02-23 -- Completed 249-02-PLAN.md (ZeroExSwapActionProvider + tests)

Progress: [████████░░] 80%

## Performance Metrics

**Cumulative:** 58 milestones, 247 phases, 532 plans, 1,463 reqs, 4,975 tests, ~187,250 LOC TS

## Accumulated Context

### Decisions

- v28.2: 0x Swap API v2 (AllowanceHolder, not Permit2)
- v28.2: 단일 URL api.0x.org + chainId 쿼리 파라미터
- v28.2: Provider-trust -- actionProvider 태그 시 CONTRACT_WHITELIST skip
- v28.2: resolve() -> ContractCallRequest[] 배열 (순차 파이프라인)
- v28.2: config.toml [actions] 폐지 -> Admin Settings 단일 관리
- v28.2: ACTION_API_KEY_REQUIRED 알림 이벤트 추가
- 248-01: SettingsReader interface -- minimal contract between @waiaas/actions and daemon SettingsService
- 248-01: Notify-before-throw pattern -- fire notification before error throw for actionable admin guidance
- 248-01: ACTION_API_KEY_REQUIRED categorized as 'system' (operational guidance, not security alert)
- 248-02: executeResolve() always returns ContractCallRequest[] -- callers always iterate
- 248-02: actionProvider field auto-tagged by registry after Zod validation -- providers cannot spoof
- 248-02: Provider-trust checks SettingsService at policy evaluation time (not registration)
- 248-02: Multi-element response uses { id, status, pipeline: [{id, status}...] } for backward compat
- 248-03: Static BUILTIN_PROVIDERS client-side array for provider cards independent of daemon registration
- 248-03: Three-state status: Active (enabled+registered), Requires API Key (enabled+missing), Inactive (disabled)
- 248-03: Toggle saves immediately via apiPut single-setting update
- 249-01: AllowanceHolder address identical across all 20 chains -- single constant with Map lookup
- 249-01: CHAIN_ID_MAP only maps 5 mainnet EVM networks in NETWORK_TYPES
- 249-01: PriceResponseSchema .passthrough() for API drift tolerance
- 249-02: encodeApproveCalldata uses manual ABI encoding to avoid viem dependency in @waiaas/actions
- 249-02: Same-token detection case-insensitive (toLowerCase) for EVM address flexibility
- 249-02: chainId resolved from explicit input > CHAIN_ID_MAP > default 1 (ActionContext lacks network)

### Blockers/Concerns

- STO-03: Confirmation Worker RPC 콜백 미주입 (v27.1 known gap)

## Session Continuity

Last session: 2026-02-23
Stopped at: Completed 249-02-PLAN.md
Resume file: None
