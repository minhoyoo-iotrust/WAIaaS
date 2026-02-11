---
phase: 65-pages-components-api-design
plan: 01
subsystem: ui
tags: [preact, css-variables, design-tokens, error-mapping, admin-ui, component-interfaces, api-patterns, design-doc]

# Dependency graph
requires:
  - phase: 64-infra-auth-security-design
    provides: "Design doc 67 sections 1-7: infra, auth, security foundation"
provides:
  - "Design doc 67 sections 8-10: page designs, common components, API integration"
  - "5 page designs (Dashboard, Agents, Sessions, Policies, Settings) with wireframes and data flows"
  - "CSS Variables design token system (colors, spacing, typography, tier colors)"
  - "8 common component interfaces (Table, Form, Modal, Toast, Button, Badge, CopyButton, EmptyState)"
  - "fetch wrapper specification with typed helpers and error handling"
  - "68 error code to user-friendly message mapping table"
  - "4 UX state patterns (loading/empty/error/shutdown overlay)"
  - "Form validation strategy (client-side independent, Zod-free)"
  - "API endpoint constants for type-safe usage"
affects: ["v1.3.2-admin-ui-impl"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CSS Variables design tokens with 4px spacing grid"
    - "Generic Table<T> component with Column render functions"
    - "Global toast signal for cross-component notifications"
    - "Signal-based UX state pattern (data/loading/error triplet)"
    - "ApiError class with status/code/serverMessage for structured error handling"
    - "Error code mapping with getErrorMessage() fallback"
    - "TierVisualization for SPENDING_LIMIT policy (INSTANT/DELAY/BLOCKED color bars)"
    - "Shutdown overlay as top-priority global state"

key-files:
  created: []
  modified:
    - "docs/67-admin-web-ui-spec.md"

key-decisions:
  - "Dashboard uses 30s setInterval polling with cleanup on unmount (not SSE/WebSocket)"
  - "Agent create/edit uses inline form (not modal) for better UX flow"
  - "Session token shown only once via Modal with CopyButton (security: DB stores hash only)"
  - "Policy form is inline panel below table, dynamic rules editor per policy type"
  - "Shutdown triggers global overlay that overrides auth guard and blocks all interaction"
  - "Client-side validation mirrors server Zod schemas without importing Zod (~13KB savings)"
  - "Error mapping covers all 68 codes with fallback for unknown codes"
  - "CSS Variables structured for future dark mode extensibility"

patterns-established:
  - "Page-level data fetching pattern: signal triplet (data/loading/error) + async fetchData()"
  - "Component interface documentation: TypeScript props + behavior table + usage examples"
  - "Wireframe + component tree + data flow + interaction table per page"

# Metrics
duration: 7min
completed: 2026-02-11
---

# Phase 65 Plan 01: Pages, Components, API Integration Design Summary

**5 page wireframes with data flows, CSS Variables design tokens, 8 component interfaces, 68 error code mapping, and fetch wrapper specification in design doc 67 sections 8-10**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-11T04:27:01Z
- **Completed:** 2026-02-11T04:33:47Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Completed design doc 67 (all 10 sections) providing full Admin Web UI specification
- Defined 5 page designs (Dashboard, Agents, Sessions, Policies, Settings) with ASCII wireframes, component hierarchies, API endpoint mappings, user interaction flows, and state management patterns
- Specified CSS Variables design token system covering colors (primary, neutral, status, tier), spacing (4px grid), typography (system fonts), borders, shadows, and layout dimensions
- Defined 8 common component interfaces with TypeScript props: Table (generic), Form/FormField, Modal, Toast (global signal), Button (4 variants), Badge (5 variants), CopyButton (clipboard with fallback), EmptyState
- Created complete 68 error code to user-friendly English message mapping table covering all 11 domains (AUTH, SESSION, PIPELINE, TX, POLICY, OWNER, SYSTEM, AGENT, WITHDRAW, ACTION, ADMIN)
- Specified fetch wrapper with typed helpers (apiGet/apiPost/apiPut/apiDelete), 10s timeout, automatic X-Master-Password injection, 401 auto-logout, and structured ApiError class
- Defined form validation strategy (client-side independent, Zod-free) with field-level rules mirroring server schemas

## Task Commits

Each task was committed atomically:

1. **Task 1: Section 8 (5 page designs)** - `88cde0f` (docs)
2. **Task 2: Sections 9-10 (components, API patterns, error mapping)** - `2df086e` (docs)

## Files Created/Modified

- `docs/67-admin-web-ui-spec.md` - Added sections 8-10 (page designs, common components, API integration patterns). Removed "후속 섹션 예고" placeholder. Updated final timestamp.

## Decisions Made

1. **Dashboard 30s polling via setInterval**: Simple and sufficient for admin tool. SSE/WebSocket would add complexity for marginal benefit on a 5-page management UI
2. **Inline forms (not modal) for Agent create and Policy create/edit**: Keeps context visible, reduces click depth, allows form and list to coexist on screen
3. **Session token one-time display via Modal**: Security requirement (DB stores hash only). Modal with CopyButton + warning text provides clear UX
4. **SPENDING_LIMIT tier visualization**: Horizontal color bar (green/amber/red) maps directly to policy evaluation tiers, making configuration intuitive
5. **Shutdown overlay as global priority**: `daemonShutdown` signal takes precedence over auth guard, preventing impossible interactions after daemon stops
6. **Client-side validation without Zod import**: Saves ~13KB gzip bundle, avoids build-time coupling to @waiaas/core. Lightweight validation functions mirror server rules
7. **Complete 68 error code mapping**: Even though Admin UI only encounters ~20 codes in practice, full mapping provides robustness for edge cases and future endpoint changes
8. **CSS Variables for future dark mode**: `:root` variable structure makes dark mode a matter of overriding values, no CSS refactoring needed

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Design doc 67 is complete (all 10 sections) and provides sufficient specification for v1.3.2 Admin Web UI implementation
- All 11 requirements addressed: PAGE-01~05 (section 8), COMP-01~03 (section 9), APIC-01~03 (section 10)
- No blockers for implementation phase

## Self-Check: PASSED

---
*Phase: 65-pages-components-api-design*
*Completed: 2026-02-11*
