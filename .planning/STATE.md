---
gsd_state_version: 1.0
milestone: v0.1
milestone_name: milestone
status: planning
stopped_at: Completed Phase 391 Plan 02 (2 plans, 4 tasks, 808 admin tests passing)
last_updated: "2026-03-12T06:04:00.000Z"
last_activity: 2026-03-12 — Phase 391 complete (2 plans, 4 tasks, Admin UI credentials + external actions + policy forms)
progress:
  total_phases: 7
  completed_phases: 6
  total_plans: 13
  completed_plans: 13
  percent: 86
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-12)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인이 자금 통제권을 유지하면서.
**Current focus:** Phase 392 — MCP + SDK + Skill Files

## Current Position

Phase: 392 of 392 (MCP + SDK + Skill Files)
Plan: 1 of TBD
Status: Ready to plan Phase 392
Last activity: 2026-03-12 — Phase 391 complete (2 plans, 4 tasks, Admin UI credentials + external actions + policy forms)

Progress: [████████░░] 86% (6/7 phases)

## Performance Metrics

**Velocity:**
- Total plans completed: 13
- Average duration: ~8min/plan
- Total execution time: ~100min

## Accumulated Context

### Decisions

- doc-81 설계를 4-Wave 순서로 구현: Wave 1(타입+서명+DB) -> Wave 2(Vault+추적+정책) -> Wave 3(파이프라인+조회) -> Wave 4(Admin+MCP+SDK+스킬)
- Phase 388/389는 386 완료 후 독립 병렬 가능, Phase 391/392는 390 완료 후 독립 병렬 가능
- [Phase 386]: ResolvedAction 3-kind discriminatedUnion (contractCall/signedData/signedHttp) with normalize utility for backward compat
- [Phase 386]: DB v55 wallet_credentials (blob mode AES-256-GCM) + v56 transactions action_kind/venue/operation columns with idempotent migration
- [Phase 386]: IActionProvider.resolve() 6-type return union + riskLevel 4-grade (critical added) -- zero-change backward compat
- [Phase 387]: ISignerCapability 7-scheme registry with resolve() auto-select by signingScheme, Ed25519 via node:crypto, backward compat verified
- [Phase 388]: HKDF domain separation (credential-vault salt vs settings-crypto salt) ensures different keys from same master password
- [Phase 388]: AAD format {id}:{walletId|global}:{type} prevents cross-credential substitution attacks
- [Phase 388]: Pre-INSERT duplicate check for global credentials (SQLite NULL != NULL in unique indexes)
- [Phase 388]: masterAuth on all credential CRUD, single LocalCredentialVault instance shared by per-wallet + global routes
- [Phase 389]: AsyncTrackingResult 9-state (5 new external action states), isTerminalState()/isContinuePolling() utilities, DB v57 composite index
- [Phase 389]: AsyncPollingService extended with PARTIALLY_FILLED polling + 4 terminal state processing + 6 notification events
- [Phase 389]: VENUE_WHITELIST default-deny with venue_whitelist_enabled Admin Setting toggle (default false)
- [Phase 389]: ACTION_CATEGORY_LIMIT per-action/daily/monthly USD limits via json_extract cumulative queries on transaction metadata
- [Phase 390]: signedData/signedHttp pipeline functions with credential->policy->DB->sign->track->audit flow
- [Phase 390]: Kind-based routing in actions.ts: signedData/signedHttp to new pipeline, contractCall to existing 6-stage
- [Phase 390]: GET /v1/wallets/:id/actions query API with venue/status filter + pagination
- [Phase 390]: external_actions capability in connect-info gated on signerRegistry scheme count
- [Phase 391]: Credential CRUD uses name-based ref for delete/rotate (matching daemon API)
- [Phase 391]: ExternalActionsTab inline in wallets.tsx (same pattern as StakingTab/NftTab)
- [Phase 391]: venue_whitelist_enabled added to PolicyDefaultsTab (fixes settings-completeness test)
- [Phase 391]: PolicyFormRouter now supports 16 types (added VENUE_WHITELIST + ACTION_CATEGORY_LIMIT)

### Pending Todos

None.

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-03-12T06:04:00.000Z
Stopped at: Completed Phase 391 Plan 02 (2 plans, 4 tasks, 808 admin tests passing)
Resume file: None
