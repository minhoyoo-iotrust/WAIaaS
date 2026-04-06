---
phase: 48-monorepo-scaffold-core
verified: 2026-02-10T00:55:00Z
status: passed
score: 8/8 must-haves verified
---

# Phase 48: 모노레포 스캐폴드 + @waiaas/core Verification Report

**Phase Goal:** 4개 패키지가 빌드-테스트-린트 파이프라인으로 연결되고, 모든 다운스트림 패키지가 import할 공유 타입/스키마/에러/인터페이스가 준비된다
**Verified:** 2026-02-10T00:55:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `pnpm install && pnpm build && pnpm test && pnpm lint`가 루트에서 한 번에 성공한다 | ✓ VERIFIED | 4 packages built, 8 tasks cached, 65 tests passed, 0 lint errors |
| 2 | `@waiaas/core`를 다른 패키지에서 import하면 12개 Enum, Zod 스키마, 66개 에러 코드, 4개 인터페이스에 대한 타입 추론이 IDE에서 동작한다 | ✓ VERIFIED | 34 exports from @waiaas/core, all types in dist/*.d.ts, daemon successfully imports |
| 3 | WAIaaSError를 throw하고 catch하면 에러 코드(code)와 HTTP 상태(httpStatus)를 프로그래밍적으로 조회할 수 있다 | ✓ VERIFIED | WAIaaSError base class with code->httpStatus auto-resolution, 14 error tests passing |
| 4 | `getMessages('ko')` 호출 시 한글 메시지 객체가 반환되고, `getMessages('en')` 호출 시 영문 메시지 객체가 반환된다 | ✓ VERIFIED | i18n tests confirm Korean/English messages, key parity verified across locales |
| 5 | Enum 값과 Zod 스키마가 일치하는지 검증하는 단위 테스트가 통과한다 | ✓ VERIFIED | 16 enum tests pass, Zod-array consistency verified |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `pnpm-workspace.yaml` | pnpm workspace config | ✓ VERIFIED | 29 lines, packages/* + packages/adapters/* globs |
| `turbo.json` | Turborepo pipeline | ✓ VERIFIED | 40 lines, build->test dependency chain, ^build workspace ordering |
| `tsconfig.base.json` | Shared TypeScript config | ✓ VERIFIED | 19 lines, ES2022, NodeNext, strict, ESM settings |
| `eslint.config.js` | ESLint flat config | ✓ VERIFIED | 18 lines, typescript-eslint + prettier integration |
| `vitest.workspace.ts` | Vitest workspace | ✓ VERIFIED | 6 lines, packages/* + packages/adapters/* globs |
| `.nvmrc` | Node.js 22 LTS | ✓ VERIFIED | 1 line: "22" |
| `packages/core/package.json` | @waiaas/core package | ✓ VERIFIED | type: module, main: dist/index.js, types: dist/index.d.ts |
| `packages/daemon/package.json` | @waiaas/daemon package | ✓ VERIFIED | depends on @waiaas/core (workspace:*) |
| `packages/adapters/solana/package.json` | @waiaas/adapter-solana package | ✓ VERIFIED | depends on @waiaas/core (workspace:*) |
| `packages/cli/package.json` | @waiaas/cli package | ✓ VERIFIED | depends on @waiaas/core + @waiaas/daemon (workspace:*) |
| `packages/core/src/enums/*.ts` | 12 Enum SSoT files | ✓ VERIFIED | 10 enum files (9 modules + 1 index), exporting 12 enums total |
| `packages/core/src/schemas/*.ts` | 5 domain Zod schemas | ✓ VERIFIED | 6 files (5 schemas + 1 index): Agent, Session, Transaction, Policy, Config |
| `packages/core/src/errors/error-codes.ts` | 66 error codes matrix | ✓ VERIFIED | 66 error codes across 10 domains (AUTH:8, SESSION:8, TX:20, POLICY:4, OWNER:5, SYSTEM:6, AGENT:3, WITHDRAW:4, ACTION:7, ADMIN:1) |
| `packages/core/src/errors/base-error.ts` | WAIaaSError base class | ✓ VERIFIED | 40 lines, code->httpStatus resolution, toJSON() method |
| `packages/core/src/interfaces/IChainAdapter.ts` | IChainAdapter interface | ✓ VERIFIED | 73 lines, 10 v1.1 methods (connect/disconnect/isConnected/getHealth/getBalance/buildTransaction/simulateTransaction/signTransaction/submitTransaction/waitForConfirmation) |
| `packages/core/src/interfaces/ILocalKeyStore.ts` | ILocalKeyStore interface | ✓ VERIFIED | 33 lines, 5 methods (generateKeyPair/decryptPrivateKey/releaseKey/hasKey/deleteKey) |
| `packages/core/src/interfaces/IPolicyEngine.ts` | IPolicyEngine interface | ✓ VERIFIED | 39 lines, evaluate() method + PolicyEvaluation type |
| `packages/core/src/interfaces/INotificationChannel.ts` | INotificationChannel interface | ✓ VERIFIED | 36 lines, initialize/send/name + NotificationPayload type |
| `packages/core/src/interfaces/chain-adapter.types.ts` | Chain adapter common types | ✓ VERIFIED | 7 types: TokenAmount, TransferRequest, UnsignedTransaction, SimulationResult, SubmitResult, BalanceInfo, HealthInfo |
| `packages/core/src/i18n/index.ts` | getMessages() function | ✓ VERIFIED | 14 lines, SupportedLocale type, en/ko message imports |
| `packages/core/src/i18n/en.ts` | English messages | ✓ VERIFIED | 66 error messages + system + cli |
| `packages/core/src/i18n/ko.ts` | Korean messages | ✓ VERIFIED | 66 error messages + system + cli, key parity verified |
| `packages/core/src/index.ts` | @waiaas/core entry point | ✓ VERIFIED | 89 lines, re-exports enums, schemas, errors, interfaces, i18n |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `turbo.json` | `packages/*/package.json` | Turborepo pipeline reads package.json scripts | ✓ WIRED | build script in all 4 packages, ^build dependency ensures workspace order |
| `packages/*/tsconfig.json` | `tsconfig.base.json` | extends field | ✓ WIRED | All 4 packages extend ../../tsconfig.base.json |
| `packages/daemon/tsconfig.json` | `packages/core` | TypeScript project references | ✓ WIRED | references: [{ "path": "../core" }] |
| `packages/cli/tsconfig.json` | `packages/core` + `packages/daemon` | TypeScript project references | ✓ WIRED | references: [{ "path": "../core" }, { "path": "../daemon" }] |
| `vitest.workspace.ts` | `packages/*` | workspace glob pattern | ✓ WIRED | packages/*/vitest.config.ts + packages/adapters/*/vitest.config.ts |
| `packages/core/src/interfaces/IChainAdapter.ts` | `packages/core/src/interfaces/chain-adapter.types.ts` | import types for method signatures | ✓ WIRED | imports TransferRequest, UnsignedTransaction, etc. |
| `packages/core/src/interfaces/IChainAdapter.ts` | `packages/core/src/enums/chain.ts` | ChainType, NetworkType for adapter identity | ✓ WIRED | imports ChainType, NetworkType |
| `packages/core/src/i18n/index.ts` | `packages/core/src/i18n/en.ts` | static import for en messages | ✓ WIRED | import { messages as en } from './en.js' |
| `packages/core/src/i18n/index.ts` | `packages/core/src/i18n/ko.ts` | static import for ko messages | ✓ WIRED | import { messages as ko } from './ko.js' |
| `packages/core/src/index.ts` | all submodules | re-export all public APIs | ✓ WIRED | exports enums, schemas, errors, interfaces, i18n |

### Requirements Coverage

| Requirement | Status | Supporting Truths | Blocking Issue |
|-------------|--------|-------------------|----------------|
| MONO-01 | ✓ SATISFIED | Truth 1 | None — 4 packages built, tested, linted via Turborepo |
| MONO-02 | ✓ SATISFIED | Truth 1 | None — shared configs verified in build/lint/test |
| MONO-03 | ✓ SATISFIED | Truth 1 | None — .nvmrc = 22, all packages type: module, ESM builds |
| CORE-01 | ✓ SATISFIED | Truth 2, Truth 5 | None — 12 enums exported, enum tests pass |
| CORE-02 | ✓ SATISFIED | Truth 2 | None — 5 Zod schemas + z.infer types verified |
| CORE-03 | ✓ SATISFIED | Truth 3 | None — 66 error codes + WAIaaSError class verified |
| CORE-04 | ✓ SATISFIED | Truth 2 | None — 4 interfaces exported, IChainAdapter 10 methods |
| CORE-05 | ✓ SATISFIED | Truth 4 | None — getMessages('en'/'ko') returns correct locales |

**Coverage:** 8/8 requirements satisfied

### Anti-Patterns Found

None — no blockers, warnings, or info-level issues found.

All code follows established patterns:
- Enum SSoT: as const -> TS type -> Zod enum
- Schema SSoT: Zod schema -> z.infer type
- Error pattern: WAIaaSError(code) auto-resolves httpStatus
- Interface pattern: type-only exports, implementations in downstream packages
- i18n pattern: Messages interface enforces key parity across locales

### Human Verification Required

None — all phase success criteria can be verified programmatically.

---

## Detailed Evidence

### Truth 1: Full Pipeline Success

```
> pnpm install && pnpm build && pnpm test && pnpm lint

Already up to date
Done in 729ms

• Packages in scope: @waiaas/adapter-solana, @waiaas/cli, @waiaas/core, @waiaas/daemon
 Tasks:    4 successful, 4 total
Cached:    4 cached, 4 total
  Time:    129ms >>> FULL TURBO

• Packages in scope: @waiaas/adapter-solana, @waiaas/cli, @waiaas/core, @waiaas/daemon
@waiaas/core:test: Test Files  6 passed (6)
@waiaas/core:test:      Tests  65 passed (65)
 Tasks:    8 successful, 8 total
Cached:    8 cached, 8 total
  Time:    177ms >>> FULL TURBO

• Packages in scope: @waiaas/adapter-solana, @waiaas/cli, @waiaas/core, @waiaas/daemon
 Tasks:    4 successful, 4 total
Cached:    4 cached, 4 total
  Time:    110ms >>> FULL TURBO
```

### Truth 2: @waiaas/core Export Verification

34 exports from `packages/core/src/index.ts`:
- 12 Enum as const arrays: CHAIN_TYPES, NETWORK_TYPES, AGENT_STATUSES, TRANSACTION_STATUSES, TRANSACTION_TYPES, POLICY_TYPES, POLICY_TIERS, SESSION_STATUSES, NOTIFICATION_EVENT_TYPES, AUDIT_ACTIONS, KILL_SWITCH_STATES, OWNER_STATES
- 12 Zod enums: ChainTypeEnum, NetworkTypeEnum, AgentStatusEnum, TransactionStatusEnum, TransactionTypeEnum, PolicyTypeEnum, PolicyTierEnum, SessionStatusEnum, NotificationEventTypeEnum, AuditActionEnum, KillSwitchStateEnum, OwnerStateEnum
- 7 Zod schemas: AgentSchema, CreateAgentRequestSchema, SessionSchema, TransactionSchema, SendTransactionRequestSchema, PolicySchema, ConfigSchema
- ERROR_CODES object (66 entries), WAIaaSError class
- 4 interfaces: IChainAdapter, ILocalKeyStore, IPolicyEngine, INotificationChannel
- 7 chain adapter types: TokenAmount, TransferRequest, UnsignedTransaction, SimulationResult, SubmitResult, BalanceInfo, HealthInfo
- getMessages function, SupportedLocale type, Messages type

TypeScript declaration files exist:
- `packages/core/dist/index.d.ts` (1495 bytes)
- `packages/core/dist/enums/*.d.ts` (42 files)
- `packages/core/dist/schemas/*.d.ts` (26 files)
- `packages/core/dist/errors/*.d.ts` (14 files)
- `packages/core/dist/interfaces/*.d.ts` (26 files)
- `packages/core/dist/i18n/*.d.ts` (14 files)

Import from daemon package succeeds:
```
cd packages/daemon && node -e "import('@waiaas/core').then(m => console.log('SUCCESS: imports', Object.keys(m).length, 'exports'))"
SUCCESS: imports 34 exports
```

### Truth 3: WAIaaSError Verification

`packages/core/src/errors/base-error.ts`:
- WAIaaSError class extends Error
- Constructor takes ErrorCode and auto-resolves httpStatus/retryable from ERROR_CODES matrix
- Properties: code, httpStatus, retryable, details, requestId
- toJSON() method returns API-friendly JSON (excludes httpStatus)

14 error tests passing:
- WAIaaSError throw/catch
- code->httpStatus auto-resolution
- toJSON() format
- ERROR_CODES count (66)
- All domains represented

### Truth 4: i18n Verification

`packages/core/src/i18n/index.ts`:
- getMessages(locale: SupportedLocale = 'en'): Messages
- SupportedLocale = 'en' | 'ko'
- Messages type enforces key parity via Record<ErrorCode, string> for errors

8 i18n tests passing:
- getMessages('en') returns English messages
- getMessages('ko') returns Korean messages
- Default locale is 'en'
- en/ko error message keys are identical (66 each)
- en/ko system message keys are identical
- en/ko cli message keys are identical
- All 66 error codes have corresponding messages
- Error code keys match ERROR_CODES keys

Sample verification:
- `getMessages('en').errors.AGENT_NOT_FOUND` = "Agent not found"
- `getMessages('ko').errors.AGENT_NOT_FOUND` = "에이전트를 찾을 수 없습니다"

### Truth 5: Enum-Zod Consistency

16 enum tests passing:
- Each enum array has expected count (e.g., CHAIN_TYPES = 2, NETWORK_TYPES = 3, AGENT_STATUSES = 5, etc.)
- No duplicate values in arrays
- All values are strings
- Zod enum wraps same array
- Zod enum parse succeeds for all valid values
- Zod enum parse fails for invalid values

Total count: 12 enums verified
- ChainType: 2
- NetworkType: 3
- AgentStatus: 5
- TransactionStatus: 8
- TransactionType: 5
- PolicyType: 10
- PolicyTier: 4
- SessionStatus: 3
- NotificationEventType: 16
- AuditAction: 23
- KillSwitchState: 3
- OwnerState: 3

---

## Phase Success Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| 1. `pnpm install && pnpm build && pnpm test && pnpm lint` 루트에서 한 번에 성공 | ✓ PASS | Truth 1 verified, 4 packages, 0 errors |
| 2. 12개 Enum, Zod 스키마, 66개 에러 코드, 4개 인터페이스 IDE 타입 추론 | ✓ PASS | Truth 2 verified, 34 exports, .d.ts files generated |
| 3. WAIaaSError throw/catch로 code + httpStatus 조회 | ✓ PASS | Truth 3 verified, 14 error tests passing |
| 4. getMessages('ko') 한글, getMessages('en') 영문 | ✓ PASS | Truth 4 verified, 8 i18n tests passing |
| 5. Enum-Zod 일치 단위 테스트 통과 | ✓ PASS | Truth 5 verified, 16 enum tests passing |

**Overall:** 5/5 criteria passed

---

_Verified: 2026-02-10T00:55:00Z_
_Verifier: Claude (gsd-verifier)_
_Total test count: 65 (16 enum + 16 schema + 14 error + 5 interface + 8 i18n + 6 package-exports)_
