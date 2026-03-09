---
phase: 365-agent-uat-infra
plan: 02
subsystem: testing
tags: [uat, skill, agent, subcommands, dry-run, wallet-selection]

requires:
  - phase: 365-01
    provides: scenario format, template, index, wallet CRUD scenario
provides:
  - /agent-uat skill file with 10 subcommands
  - 7-phase execution protocol (load, wallet selection, dry-run, execute, verify, cleanup, report)
  - Wallet auto-selection rules via connect-info API
  - Dry-run cost warning system
  - UAT report format (PASS/FAIL/SKIP, gas summary)
affects: [366, 367, 368, 369]

tech-stack:
  added: []
  patterns: [skill-dispatch-prompt, 7-phase-protocol, wallet-network-matching]

key-files:
  created:
    - skills/agent-uat.skill.md
  modified: []

key-decisions:
  - "Skill uses dispatch.kind=prompt (not tool) since it orchestrates interactive multi-step flows"
  - "7-phase protocol: load -> wallet selection -> dry-run -> execute -> verify -> cleanup -> report"
  - "Wallet selection via connect-info API with environment/network matching rules"
  - "Dry-run cost warning threshold: 2x estimated_cost_usd"

patterns-established:
  - "Skill dispatch: prompt-based trigger with subcommand routing table"
  - "Wallet selection: environment->network mapping (ethereum->ethereum-*/polygon-*/arbitrum-*/base-*, solana->solana-*)"
  - "Report format: table with PASS/FAIL/SKIP + gas summary + failed scenario details"

requirements-completed: [INFRA-03, INFRA-04, INFRA-05, INFRA-06]

duration: 2min
completed: 2026-03-09
---

# Phase 365 Plan 02: Skill File + Infrastructure Guidelines Summary

**/agent-uat skill with 10 subcommands, 7-phase execution protocol, wallet auto-selection, dry-run warnings, and UAT report format**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-09T14:11:30Z
- **Completed:** 2026-03-09T14:13:30Z
- **Tasks:** 1
- **Files created:** 1

## Accomplishments
- Created /agent-uat skill file (270 lines) with prompt-based dispatch
- Defined 10 subcommands covering category, network, tag, and ID-based filtering
- Documented 7-phase execution protocol with interactive user confirmation at each stage
- Specified wallet selection rules via connect-info API with environment/network matching
- Added dry-run cost warning system with 2x threshold
- Defined UAT report format with PASS/FAIL/SKIP status and gas cost summary

## Task Commits

Each task was committed atomically:

1. **Task 1: agent-uat.skill.md** - `e09da9a0` (docs)

## Files Created/Modified
- `skills/agent-uat.skill.md` - /agent-uat skill file with subcommands, execution protocol, wallet selection, dry-run, report

## Decisions Made
- Used `dispatch.kind: "prompt"` instead of `"tool"` since Agent UAT orchestrates interactive multi-step flows
- Set dry-run cost warning threshold at 2x the scenario's estimated_cost_usd

## Deviations from Plan
None - plan executed exactly as written

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Agent UAT infrastructure complete (format + skill)
- Phase 366 (Testnet + Transfer scenarios) can proceed
- All INFRA requirements (INFRA-01 through INFRA-07) satisfied

---
*Phase: 365-agent-uat-infra*
*Completed: 2026-03-09*
