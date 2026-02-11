---
phase: 72-cli-mcp-setup-multi-agent
plan: 01
subsystem: cli
tags: [cli, mcp-setup, multi-agent, slug, config-snippet, token-path]

# Dependency graph
requires:
  - phase: 71-mcp-token-path-agent-identity
    provides: SessionManager agentId token path separation (mcp-tokens/<agentId>), AgentContext pattern
provides:
  - toSlug + resolveSlugCollisions utilities for agent name to config-safe key conversion
  - mcp-setup multi-agent support with per-agent token paths (mcp-tokens/<agentId>)
  - Config snippet with WAIAAS_AGENT_ID/WAIAAS_AGENT_NAME environment variables
  - --all flag for batch agent setup with combined config snippet
  - Slug collision resolution with agentId prefix
affects: [mcp-multi-agent-workflow, cli-improvements]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "toSlug: lowercase + non-alphanumeric to hyphen + collapse + trim + fallback"
    - "resolveSlugCollisions: count-based collision detection with agentId prefix"
    - "fetchAgents/setupAgent/buildConfigEntry: extracted helpers for code reuse between single and --all flows"

key-files:
  created:
    - packages/cli/src/utils/slug.ts
    - packages/cli/src/__tests__/slug.test.ts
  modified:
    - packages/cli/src/commands/mcp-setup.ts
    - packages/cli/src/index.ts
    - packages/cli/src/__tests__/mcp-setup.test.ts

key-decisions:
  - "Token path always uses mcp-tokens/<agentId> even for single agent auto-detect (no legacy mcp-token path in CLI)"
  - "Config key format: waiaas-{slug} where slug = toSlug(agentName ?? agentId)"
  - "WAIAAS_AGENT_NAME only included in env when agent has a name"
  - "--all and --agent are mutually exclusive (validated at command start)"
  - "Slug collision appends first 8 chars of agentId as suffix"
  - "Helper functions extracted (fetchAgents, setupAgent, buildConfigEntry, printConfigPath) for reuse"

patterns-established:
  - "Slug utility pattern: toSlug for name normalization, resolveSlugCollisions for batch uniqueness"
  - "Config entry builder: buildConfigEntry produces consistent mcpServers entries"

# Metrics
duration: 4min
completed: 2026-02-11
---

# Phase 72 Plan 01: CLI mcp setup Multi-Agent Summary

**CLI mcp setup extended with per-agent token paths (mcp-tokens/<agentId>), WAIAAS_AGENT_ID/NAME env vars in config snippets, --all batch setup flag, and slug collision resolution**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-11T12:50:16Z
- **Completed:** 2026-02-11T12:54:05Z
- **Tasks:** 2
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments
- CLI `mcp setup` now writes tokens to `mcp-tokens/<agentId>` path for all flows (CLIP-01, CLIP-07)
- Config snippets include `WAIAAS_AGENT_ID` and `WAIAAS_AGENT_NAME` env vars with `waiaas-{slug}` key names (CLIP-02, CLIP-03)
- `--all` flag creates sessions for all agents at once with combined config snippet (CLIP-04)
- `--all` + 0 agents shows error, slug collisions append agentId prefix (CLIP-05, CLIP-06)
- 31 tests passing: 9 slug unit tests + 22 mcp-setup integration tests covering all 7 CLIP requirements

## Task Commits

Each task was committed atomically:

1. **Task 1: slug utility + mcp-setup multi-agent support + index.ts --all flag** - `b1a7010` (feat)
2. **Task 2: slug unit tests + mcp-setup integration tests (7 CLIP requirements)** - `1b6a009` (test)

## Files Created/Modified
- `packages/cli/src/utils/slug.ts` - toSlug + resolveSlugCollisions utilities for agent name to config-safe slug
- `packages/cli/src/commands/mcp-setup.ts` - Multi-agent support: per-agent token paths, WAIAAS_AGENT_ID/NAME env vars, --all batch flag, extracted helpers
- `packages/cli/src/index.ts` - Wired --all option to mcp setup command
- `packages/cli/src/__tests__/slug.test.ts` - 9 unit tests for toSlug and resolveSlugCollisions
- `packages/cli/src/__tests__/mcp-setup.test.ts` - 22 tests: 14 existing updated for new paths + 8 new CLIP requirement tests

## Decisions Made
- Token path always uses `mcp-tokens/<agentId>` even for single agent auto-detect (CLI no longer writes to legacy `mcp-token` path)
- Config key format: `waiaas-{slug}` where slug = `toSlug(agentName ?? agentId)`
- `WAIAAS_AGENT_NAME` only included in env when agent has a name (not null/undefined)
- `--all` and `--agent` are mutually exclusive, validated at command start before health check
- Slug collision appends first 8 chars of agentId as suffix (e.g., `bot-01929abc`)
- Extracted helper functions (fetchAgents, setupAgent, buildConfigEntry, printConfigPath) for DRY between single and --all flows

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Existing `--agent` test expected no `/v1/agents` call, but new implementation calls it for name lookup. Updated test to provide agents mock response. Test now also verifies token file at new path.
- mcp-setup.test.ts originally had 14 tests (not 11 as plan stated), so final count is 22 (14 + 8) not 19.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- CLI multi-agent MCP setup complete, ready for end-to-end multi-agent workflow testing
- All CLIP-01 through CLIP-07 requirements verified with tests
- No blockers

## Self-Check: PASSED
