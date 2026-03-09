---
phase: 361-cicd-workflow
plan: 01
subsystem: ci-cd
tags: [e2e, ci, github-actions, workflow]
dependency_graph:
  requires: [packages/e2e-tests]
  provides: [e2e-smoke-workflow, ci-reporter]
  affects: [.github/workflows]
tech_stack:
  added: [schneegans/dynamic-badges-action]
  patterns: [vitest-custom-reporter, release-trigger-e2e]
key_files:
  created:
    - .github/workflows/e2e-smoke.yml
    - packages/e2e-tests/src/helpers/ci-reporter.ts
  modified:
    - packages/e2e-tests/vitest.config.ts
decisions:
  - "Combined failure notification into e2e-smoke.yml instead of separate Plan 03 (all in one workflow)"
  - "Used vitest custom Reporter interface instead of globalTeardown for report generation"
metrics:
  duration: 3min
  completed: 2026-03-09
---

# Phase 361 Plan 01: e2e-smoke.yml Workflow + RC Trigger + Summary Report

E2E smoke test CI workflow with release trigger, RC version install, vitest CI reporter for markdown report generation

## What Was Done

### Task 1: e2e-smoke.yml Workflow
- Created `.github/workflows/e2e-smoke.yml` with dual triggers: `release: published` and `workflow_dispatch`
- Version determination: workflow_dispatch input > release tag_name > latest fallback
- RC daemon installed globally via `npm install -g @waiaas/daemon@VERSION`
- Offchain E2E tests run with `E2E_DAEMON_INSTALL_MODE=global`
- GitHub Actions Summary displays test results from `e2e-report.md`
- Failure notification creates GitHub Issue with `e2e-failure` label (duplicate prevention via open issue check)
- Permissions: `contents: read`, `issues: write`

### Task 2: CI Reporter
- Created `packages/e2e-tests/src/helpers/ci-reporter.ts` implementing vitest `Reporter` interface
- `onFinished` hook collects test stats from all files recursively
- Generates markdown table with Status/Test/Duration/Details columns
- Only writes `e2e-report.md` when `CI=true` (no local file generation)
- Registered in `vitest.config.ts` reporters array alongside `default`

## Deviations from Plan

### Auto-merged Content
**[Rule 3 - Blocking] Combined Plan 03 Task 1 into e2e-smoke.yml**
- Plan 03 Task 1 adds failure notification to e2e-smoke.yml; since we created the file fresh, the failure steps were included directly
- This avoids a separate modification pass in Plan 03

## Key Decisions

1. **Reporter approach**: Used vitest's Reporter interface (`onFinished`) instead of E2EReporter's `markdownSummary()` -- the vitest reporter has access to all test files globally, while E2EReporter requires per-scenario integration
2. **Failure notification in same workflow**: Added `gh issue create` step directly in e2e-smoke.yml rather than creating a separate notification workflow

## Verification

- e2e-smoke.yml contains `release: published` trigger (1 match)
- e2e-smoke.yml contains `workflow_dispatch` trigger (2 matches)
- e2e-smoke.yml contains `GITHUB_STEP_SUMMARY` references (6 matches)
- ci-reporter.ts contains `onFinished` and `Reporter` (3 matches)
- vitest.config.ts contains `reporters` with `ci-reporter` path (1 match)
