# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-19)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** Phase 197 — Docker DX + Python SDK 정합성

## Current Position

Phase: 197 (docker-python-sdk-dx) — Docker DX + Python SDK 정합성
Plan: 2 of 2 in current phase (COMPLETE)
Status: Phase Complete
Last activity: 2026-02-19 — Completed 197-01 (Docker compose GHCR image + .env.example)

Progress: [████████░░] 80% (8/10 plans)

## Performance Metrics

**Cumulative:** 43 milestones, 193 phases, 407 plans, 1,128 reqs, ~4,066 tests, ~151,015 LOC TS

## Accumulated Context

### Decisions

Full log in PROJECT.md and milestones/.
Recent: Step logs downgraded to console.debug; EADDRINUSE detected via server error event; Admin UI URL in ready message; expiresIn === 86400 for default expiry detection in mcp-setup.
- [Phase 195]: Manual YYYY-MM-DD HH:mm date formatting for locale-independent expiry display
- [Phase 197]: Version synced to pyproject.toml 1.7.0 as single source of truth
- [Phase 196]: README content kept minimal for npm pages -- install + quickstart + key commands/methods only
- [Phase 196-01]: Root skills/ path resolved via relative navigation from packages/skills/; sync-version.mjs refactored to shared function
- [Phase 197-01]: GHCR image as docker-compose default (lowercase per GHCR policy); build override in separate file
- [Phase 197]: GHCR image as docker-compose default; build override in separate file; .env.example excludes docker-hardcoded vars

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-02-19
Stopped at: Completed 196-02-PLAN.md (CLI/SDK npm README)
Resume file: None
