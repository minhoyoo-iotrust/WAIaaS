# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-13)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** v1.4.4 Phase 104 complete (2/2 plans done)

## Current Position

Phase: 104 of 104 (API Skill Files)
Plan: 2 of 2 in current phase
Status: Phase Complete
Last activity: 2026-02-14 -- Completed 104-02 Policies & Admin Skill Files

Progress: [██████████] 100%

## Performance Metrics

**Cumulative:** 23 milestones, 101 phases, 222 plans, 603 reqs, 1,467 tests, 62,296 LOC

| Phase | Plan | Duration | Tasks | Files |
| ----- | ---- | -------- | ----- | ----- |
| 100-01 | settings-infra | 4min | 2 | 6 |
| 100-02 | settings-service | 5min | 2 | 5 |
| 101-01 | settings-api | 5min | 2 | 5 |
| 101-02 | hot-reload | 5min | 2 | 6 |
| 102-01 | settings-page | 4min | 2 | 3 |
| 102-02 | settings-tests | 3min | 2 | 1 |
| 103-01 | mcp-5type-tools | 3min | 2 | 6 |
| 103-02 | mcp-5type-tests | 3min | 2 | 3 |
| 104-02 | policies-admin-skills | 5min | 2 | 3 |

*Updated after each plan completion*

## Accumulated Context

### Decisions

Full log in PROJECT.md.
v1.4.3 decisions archived -- see .planning/milestones/v1.4.3-ROADMAP.md

- 100-01: HKDF(SHA-256) with fixed salt for settings encryption (lightweight vs Argon2id for frequent reads)
- 100-01: Encrypted value format base64(JSON({iv,ct,tag})) with hex fields for TEXT column storage
- 100-01: CREDENTIAL_KEYS set defines which settings keys require encryption at rest
- 100-02: DaemonConfig object used for config.toml fallback (already includes env overrides + Zod defaults)
- 100-02: importFromConfig skips default values and empty strings to avoid unnecessary DB entries
- 100-02: getAllMasked returns boolean for credentials for safe Admin UI display
- 101-01: GET settings returns 5 explicit category keys for typed OpenAPI response
- 101-01: PUT settings validates all keys before writes (fail-fast on unknown keys)
- 101-01: test-rpc returns 200 with success boolean (RPC failure is not HTTP error)
- 101-01: onSettingsChanged callback placeholder for hot-reload (wired in Plan 02)
- 101-02: HotReloadOrchestrator categorizes keys by prefix/set into 3 subsystems (notifications/rpc/security)
- 101-02: Security params need no reload action (DB-first read picks up new values on next request)
- 101-02: Notification reload dynamically imports channel constructors (same as daemon.ts Step 4d)
- 101-02: RPC reload evicts specific chain:network adapters (lazy re-creation on next resolve)
- 102-01: Credential fields show "(configured)" placeholder via boolean masking from GET
- 102-01: Single dirty tracking map across all 5 categories for unified save/discard bar
- 102-01: RPC test chain type inferred from setting key prefix (solana_ vs evm_)
- 102-02: Path-based apiGet mock instead of sequential mockResolvedValueOnce for parallel fetch reliability
- 102-02: Non-null assertion (!) for array index access to satisfy TypeScript strict mode
- 103-01: z.record(z.unknown()) for batch instructions instead of full union schema (daemon Stage 1 validates)
- 103-01: Each transaction type gets its own MCP tool (not merged into send_token) for clear Claude Desktop UX
- 103-02: MCPSDK-04 formally revoked -- MCP/SDK/API share identical attack surface, policy engine provides real security
- 103-02: Feature Parity principle established -- MCP/SDK/API must support same transaction types
- 104-02: SPENDING_LIMIT skill docs use actual field names (instant_max/notify_max/delay_max) from route handler validation
- 104-02: Settings skill docs use exact DB key format (category.field) from SETTING_DEFINITIONS SSoT
- 104-02: Old skill file deprecation is local-only (how-to-test/ is gitignored)

### Blockers/Concerns

- Pre-existing flaky lifecycle.test.ts -- not blocking
- Pre-existing e2e-errors.test.ts failure -- OpenAPIHono side effect
- Pre-existing 3 CLI E2E failures (E-07, E-08, E-09) -- daemon-harness adapter: param

## Session Continuity

Last session: 2026-02-14
Stopped at: Completed 104-02-PLAN.md (Policies & Admin Skill Files, completing 5-file skill set)
Resume file: None
