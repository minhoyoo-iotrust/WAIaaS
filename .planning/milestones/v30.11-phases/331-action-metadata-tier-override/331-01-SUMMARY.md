---
phase: 331
plan: 01
subsystem: daemon/pipeline
tags: [tier-override, settings, pipeline, defi, actions]
dependency_graph:
  requires: [setting-keys, stages, actions-route, admin-route]
  provides: [resolveActionTier, dynamic-tier-keys, pipeline-tier-floor]
  affects: [stage3Policy, getSettingDefinition, admin-settings-api]
tech_stack:
  added: []
  patterns: [dynamic-setting-key-resolution, tier-floor-escalation]
key_files:
  created:
    - packages/daemon/src/__tests__/tier-override.test.ts
  modified:
    - packages/daemon/src/infrastructure/settings/setting-keys.ts
    - packages/daemon/src/infrastructure/settings/settings-service.ts
    - packages/daemon/src/infrastructure/settings/index.ts
    - packages/daemon/src/pipeline/stages.ts
    - packages/daemon/src/api/routes/actions.ts
    - packages/daemon/src/api/routes/admin.ts
decisions:
  - D4: Dynamic tier keys use regex pattern instead of 30+ static SETTING_DEFINITIONS entries
  - D5: Action tier is a FLOOR (escalation only) -- max(policyTier, actionTier)
  - D6: Empty string '' means "use provider default" for tier override
metrics:
  duration: 5m
  completed: 2026-03-05
---

# Phase 331 Plan 01: Backend Tier Override Summary

Dynamic per-action tier override via Settings with pipeline floor integration.

## What Was Done

### Task 1: Setting keys + tier resolution helper + pipeline integration (TDD)

**RED:** Created 13 failing tests covering resolveActionTier (6 cases), dynamic tier key recognition (5 cases), and ActionTierOverrideSchema validation (2 cases).

**GREEN:**
1. **setting-keys.ts:** Added `ActionTierOverrideSchema` (Zod enum: INSTANT/NOTIFY/DELAY/APPROVAL/''), dynamic tier key pattern regex (`/^actions\.[a-z][a-z0-9_]*_tier$/`), and `getDynamicTierDefinition` helper. Updated `getSettingDefinition` to fall back to dynamic tier key resolution.

2. **stages.ts:** Added `resolveActionTier` export function (Settings override > provider default). Added `actionProviderKey`, `actionName`, `actionDefaultTier` optional fields to `PipelineContext`. Integrated tier floor logic in `stage3Policy` after policy evaluation: `max(policyTier, actionTier)`.

3. **actions.ts:** Populated action tier context fields in PipelineContext from the resolved action entry in POST /actions/:provider/:action handler.

4. **admin.ts:** Added tier value validation in PUT /admin/settings -- rejects invalid values for `_tier` keys.

5. **settings-service.ts:** Updated `getAll()` and `getAllMasked()` to include dynamic tier override keys from DB in the `actions` category.

6. **index.ts:** Exported `ActionTierOverrideSchema` from settings barrel.

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

- 13/13 tier-override tests pass
- 13/13 api-actions tests pass
- 18/18 admin-settings-api tests pass
- Typecheck passes

## Commits

| Hash | Message |
|------|---------|
| a9e75eee | test(331-01): add failing tests for action tier override resolution |
| a76f08ab | feat(331-01): action tier override via Settings with pipeline floor integration |
