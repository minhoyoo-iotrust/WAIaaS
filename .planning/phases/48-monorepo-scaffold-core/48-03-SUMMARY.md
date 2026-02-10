---
phase: 48-monorepo-scaffold-core
plan: 03
subsystem: core
tags: [typescript, interfaces, i18n, chain-adapter, keystore, policy-engine, notification, vitest]

# Dependency graph
requires:
  - phase: 48-02
    provides: "12 Enum SSoT + 5 Zod schemas + 66 error codes + WAIaaSError"
provides:
  - "IChainAdapter interface (10 v1.1 methods)"
  - "ILocalKeyStore interface (5 methods)"
  - "IPolicyEngine interface + PolicyEvaluation type"
  - "INotificationChannel interface + NotificationPayload type"
  - "Chain adapter common types (TokenAmount, TransferRequest, UnsignedTransaction, SimulationResult, SubmitResult, BalanceInfo, HealthInfo)"
  - "i18n message system (en/ko) with getMessages(locale) function"
  - "19 new tests (interfaces 5 + i18n 8 + package-exports 6), total 65"
affects: [49-sqlite-keystore-config, 50-solana-pipeline-api, 51-cli-e2e]

# Tech tracking
tech-stack:
  added: []
  patterns: [interface-contract-pattern, i18n-record-errorcode-string, messages-type-safe-key-parity]

key-files:
  created:
    - "packages/core/src/interfaces/chain-adapter.types.ts"
    - "packages/core/src/interfaces/IChainAdapter.ts"
    - "packages/core/src/interfaces/ILocalKeyStore.ts"
    - "packages/core/src/interfaces/IPolicyEngine.ts"
    - "packages/core/src/interfaces/INotificationChannel.ts"
    - "packages/core/src/interfaces/index.ts"
    - "packages/core/src/i18n/en.ts"
    - "packages/core/src/i18n/ko.ts"
    - "packages/core/src/i18n/index.ts"
    - "packages/core/src/__tests__/interfaces.test.ts"
    - "packages/core/src/__tests__/i18n.test.ts"
    - "packages/core/src/__tests__/package-exports.test.ts"
  modified:
    - "packages/core/src/index.ts"

key-decisions:
  - "Messages interface uses Record<ErrorCode, string> for type-safe key parity across locales"
  - "i18n uses explicit Messages interface (not as const) to allow different string values per locale"
  - "IChainAdapter defines 10 v1.1 methods; remaining 10 documented as v1.4 comments"
  - "IPolicyEngine.evaluate() takes generic object param (not Zod Transaction type) to avoid circular dependency"

patterns-established:
  - "Interface contract: interfaces are type-only exports, implementors in downstream packages"
  - "i18n key parity: Messages interface derived from ErrorCode type ensures en/ko always have same keys"
  - "Locale fallback: getMessages() defaults to 'en' if no locale specified"

# Metrics
duration: 5min
completed: 2026-02-10
---

# Phase 48 Plan 03: Interfaces + i18n Summary

**4 contract interfaces (IChainAdapter 10-method, ILocalKeyStore, IPolicyEngine, INotificationChannel) with chain adapter common types, and i18n bilingual message system (en/ko) covering 66 error codes, validated by 65 total unit tests**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-09T15:45:13Z
- **Completed:** 2026-02-09T15:49:47Z
- **Tasks:** 2/2
- **Files created:** 12
- **Files modified:** 1

## Accomplishments

- 4 interface contracts defined: IChainAdapter (10 methods for v1.1 4-stage tx pipeline), ILocalKeyStore (5 methods for Argon2id keystore), IPolicyEngine (evaluate with PolicyEvaluation), INotificationChannel (initialize/send/name)
- Chain adapter common types: TokenAmount, TransferRequest, UnsignedTransaction, SimulationResult, SubmitResult, BalanceInfo, HealthInfo -- all exported from @waiaas/core
- i18n bilingual message system with type-safe key parity: Messages interface uses Record<ErrorCode, string> ensuring en/ko always have exactly the same 66 error code keys
- @waiaas/core is now complete as shared dependency: 12 Enums, Zod schemas, 66 error codes, 4 interfaces, getMessages -- all importable from single entry point
- 65 total unit tests pass (46 from Plan 02 + 19 new: 5 interface + 8 i18n + 6 package-exports)

## Task Commits

Each task was committed atomically:

1. **Task 1: 4 interfaces + chain adapter common types** - `1a36b0f` (feat)
2. **Task 2: i18n message system + interface/export tests** - `98f1706` (feat)

## Files Created/Modified

- `packages/core/src/interfaces/chain-adapter.types.ts` - 7 chain adapter common types (TokenAmount, TransferRequest, UnsignedTransaction, SimulationResult, SubmitResult, BalanceInfo, HealthInfo)
- `packages/core/src/interfaces/IChainAdapter.ts` - IChainAdapter interface: 10 v1.1 methods (connect/disconnect/isConnected/getHealth/getBalance/buildTransaction/simulateTransaction/signTransaction/submitTransaction/waitForConfirmation)
- `packages/core/src/interfaces/ILocalKeyStore.ts` - ILocalKeyStore interface: 5 methods (generateKeyPair/decryptPrivateKey/releaseKey/hasKey/deleteKey)
- `packages/core/src/interfaces/IPolicyEngine.ts` - IPolicyEngine interface: evaluate() + PolicyEvaluation type
- `packages/core/src/interfaces/INotificationChannel.ts` - INotificationChannel interface: initialize/send/name + NotificationPayload type
- `packages/core/src/interfaces/index.ts` - Barrel re-export for all interfaces and types
- `packages/core/src/i18n/en.ts` - English messages (66 errors + system + cli) with Messages interface definition
- `packages/core/src/i18n/ko.ts` - Korean messages (66 errors + system + cli)
- `packages/core/src/i18n/index.ts` - getMessages(locale) function with SupportedLocale type
- `packages/core/src/index.ts` - Updated: re-exports interfaces and i18n modules
- `packages/core/src/__tests__/interfaces.test.ts` - 5 tests: type import verification for all 4 interfaces + 9 common types
- `packages/core/src/__tests__/i18n.test.ts` - 8 tests: en/ko messages, key parity, ERROR_CODES 1:1 match, 66 count
- `packages/core/src/__tests__/package-exports.test.ts` - 6 tests: 12 enums, 12 Zod enums, schemas, errors, getMessages

## Decisions Made

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Messages interface uses `Record<ErrorCode, string>` | Type-safe key parity: compiler enforces all 66 error codes have messages in every locale |
| 2 | No `as const` on messages objects | `as const` makes values literal string types, preventing Korean translations from having different strings |
| 3 | IChainAdapter 10 methods for v1.1, 10 as comments for v1.4 | Matches design doc phasing; v1.4 methods documented but not enforced as contract yet |
| 4 | IPolicyEngine.evaluate() takes plain object (not Zod Transaction) | Avoids circular dependency between interfaces and schemas; keeps interface lightweight |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Messages type `as const` prevents multilingual values**
- **Found during:** Task 2 (i18n build)
- **Issue:** Plan specified `as const` on en.ts messages and `type Messages = typeof messages`. This makes all string values literal types (e.g., `'Agent not found'`), so ko.ts cannot assign Korean strings like `'에이전트를 찾을 수 없습니다'` to the same keys -- TypeScript rejects the assignment.
- **Fix:** Replaced `as const` + `typeof` pattern with explicit `Messages` interface using `Record<ErrorCode, string>` for errors and `string` for system/cli values. This enforces key structure while allowing different string values per locale.
- **Files modified:** packages/core/src/i18n/en.ts
- **Verification:** `pnpm build` succeeds, ko.ts type-checks correctly, all 8 i18n tests pass
- **Committed in:** 98f1706 (Task 2 commit)

**2. [Rule 1 - Bug] Unused type import in i18n.test.ts**
- **Found during:** Task 2 (build verification)
- **Issue:** Test file had `import type { SupportedLocale, Messages }` that were unused, causing TS6192 error
- **Fix:** Removed unused type import line
- **Files modified:** packages/core/src/__tests__/i18n.test.ts
- **Verification:** Build succeeds without TS6192 error
- **Committed in:** 98f1706 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes necessary for correct compilation. Messages type design is arguably better (compiler-enforced key parity via ErrorCode). No scope creep.

## Issues Encountered

None beyond the deviations documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- @waiaas/core package is now complete for Phase 48: 12 Enums, 5 Zod schemas, 66 error codes, 4 interfaces, i18n -- all exported from single entry point
- Phase 49 (SQLite + Keystore + Config) can import ILocalKeyStore, ConfigSchema, enums, error codes
- Phase 50 (Solana pipeline) can import IChainAdapter, TransferRequest, UnsignedTransaction, etc.
- Phase 51 (CLI + E2E) can import getMessages for CLI output
- No blockers

## Self-Check: PASSED
