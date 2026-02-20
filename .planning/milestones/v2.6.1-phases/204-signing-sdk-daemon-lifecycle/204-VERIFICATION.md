---
phase: 204-signing-sdk-daemon-lifecycle
verified: 2026-02-20T07:45:00Z
status: human_needed
score: 5/5 automated truths verified
re_verification: false
human_verification:
  - test: "SDK ntfy signing flow E2E — submit a PENDING_APPROVAL transaction with sdk_ntfy approval method, observe ntfy request published to real ntfy server, open universal link in wallet app, approve, confirm transaction resolves APPROVED"
    expected: "Transaction transitions from PENDING_APPROVAL to APPROVED after wallet app approves via ntfy response topic"
    why_human: "Requires real ntfy server, wallet app with universal link support, and live daemon. Cannot mock full SSE subscribe loop."
  - test: "Telegram SDK signing flow E2E — submit a PENDING_APPROVAL transaction with sdk_telegram approval method, observe Telegram message with inline button, use /sign_response command, confirm transaction resolves APPROVED"
    expected: "Transaction transitions from PENDING_APPROVAL to APPROVED after /sign_response command processes the wallet app response"
    why_human: "Requires real Telegram bot token, running daemon, and wallet app. Cannot verify Telegram API calls and /sign_response command dispatch end-to-end without live services."
---

# Phase 204: Signing SDK Daemon Lifecycle Verification Report

**Phase Goal:** 모든 signing SDK 클래스를 daemon.ts 라이프사이클에 인스턴스화하고, ApprovalChannelRouter를 ApprovalWorkflow에 연결하고, signResponseHandler를 TelegramBotService에 주입하여, PENDING_APPROVAL 트랜잭션이 SDK 서명 채널을 통해 Owner에게 전달되는 E2E 플로우가 실제 런타임에서 동작하는 상태
**Verified:** 2026-02-20T07:45:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Success Criteria (from ROADMAP.md)

| # | Success Criterion | Status | Evidence |
|---|---|---|---|
| SC1 | signing_sdk.enabled=true 시 ApprovalChannelRouter, NtfySigningChannel, TelegramSigningChannel, SignRequestBuilder, SignResponseHandler, WalletLinkRegistry가 모두 daemon.ts에서 인스턴스화된다 | VERIFIED | daemon.ts Step 4c-8 (lines 649-713) instantiates all 6 classes via dynamic import from signing-sdk/index.js when setting equals 'true' |
| SC2 | PENDING_APPROVAL 트랜잭션이 ApprovalChannelRouter를 통해 올바른 signing channel로 라우팅된다 | VERIFIED | stages.ts stage4Wait APPROVAL branch (lines 562-574) calls `void ctx.approvalChannelRouter.route(...)` fire-and-forget; full chain: daemon.ts → createApp() → transactionRoutes → PipelineContext → stage4Wait |
| SC3 | signResponseHandler가 TelegramBotService에 주입되어 /sign_response 명령어가 정상 동작한다 | VERIFIED | daemon.ts line 703 calls `this.telegramBotService.setSignResponseHandler(signResponseHandler)`; TelegramBotService.setSignResponseHandler() setter exists at line 104; /sign_response handler at line 758 checks presence before calling `this.signResponseHandler.handle()` |
| SC4 | SDK ntfy signing flow E2E가 동작한다 (SignRequest → ntfy → SignResponse → 승인/거부) | NEEDS HUMAN | Unit and mocked E2E tests pass in signing-sdk-e2e.test.ts. Real ntfy server communication requires live environment. |
| SC5 | Telegram SDK signing flow E2E가 동작한다 (SignRequest → Telegram → /sign_response → 승인/거부) | NEEDS HUMAN | TelegramSigningChannel wiring verified. Real Telegram bot requires live environment. |

**Automated Score:** 3/3 automatable criteria verified (SC4/SC5 deferred to human)

---

### Observable Truths (from PLAN 204-01 must_haves)

| # | Truth | Status | Evidence |
|---|---|---|---|
| T1 | signing_sdk.enabled=true 시 SignRequestBuilder, SignResponseHandler, WalletLinkRegistry, NtfySigningChannel, TelegramSigningChannel, ApprovalChannelRouter가 daemon.ts에서 인스턴스화된다 | VERIFIED | daemon.ts lines 652-699: all 6 classes destructured from dynamic import and instantiated under `if (this._settingsService?.get('signing_sdk.enabled') === 'true')` guard |
| T2 | signing_sdk.enabled=false 시 signing SDK 클래스가 인스턴스화되지 않는다 | VERIFIED | daemon.ts line 708-709: else branch logs "Signing SDK disabled", no instantiation; lifecycle test case "signing SDK classes are not instantiated when signing_sdk.enabled is false" covers this |
| T3 | PENDING_APPROVAL 트랜잭션에서 ApprovalChannelRouter.route()가 호출되어 올바른 채널로 라우팅된다 | VERIFIED | stages.ts APPROVAL branch (line 562-574) calls `void ctx.approvalChannelRouter.route(ctx.walletId, {...})` with full params; lifecycle tests verify ntfy/telegram dispatch |
| T4 | ApprovalChannelRouter가 shutdown 시 정리된다 | VERIFIED | daemon.ts lines 1057-1061: `if (this.approvalChannelRouter) { this.approvalChannelRouter.shutdown(); this.approvalChannelRouter = null; }` |

**Truth Score:** 4/4 verified

### Additional Truth (from PLAN 204-02 must_haves)

| # | Truth | Status | Evidence |
|---|---|---|---|
| T5 | signResponseHandler가 TelegramBotService에 주입되어 /sign_response 명령어가 'not enabled' 대신 실제 처리를 수행한다 | VERIFIED | daemon.ts line 701-705: conditional injection via `this.telegramBotService.setSignResponseHandler(signResponseHandler)`; TelegramBotService line 758-783: handler called only when `this.signResponseHandler` is set |

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `packages/daemon/src/lifecycle/daemon.ts` | Step 4c-8: Signing SDK lifecycle wiring | VERIFIED | Lines 649-713: Step 4c-8 block with all 6 classes instantiated; line 857: `approvalChannelRouter: this.approvalChannelRouter ?? undefined` passed to createApp(); lines 1057-1061: shutdown cleanup |
| `packages/daemon/src/pipeline/stages.ts` | ApprovalChannelRouter integration in stage4Wait | VERIFIED | Line 47: `import type { ApprovalChannelRouter }` from approval-channel-router.js; line 106: `approvalChannelRouter?: ApprovalChannelRouter` in PipelineContext; lines 562-574: APPROVAL branch routing |
| `packages/daemon/src/api/server.ts` | approvalChannelRouter in CreateAppDeps | VERIFIED | Line 73: import; line 118: `approvalChannelRouter?: ApprovalChannelRouter` in CreateAppDeps interface; line 341: `approvalChannelRouter: deps.approvalChannelRouter` passed to transactionRoutes |
| `packages/daemon/src/api/routes/transactions.ts` | approvalChannelRouter passed to PipelineContext | VERIFIED | Line 42: import; line 93: `approvalChannelRouter?: ApprovalChannelRouter` in route deps; lines 373-374: `approvalChannelRouter: deps.approvalChannelRouter` in PipelineContext construction |
| `packages/daemon/src/infrastructure/telegram/telegram-bot-service.ts` | setSignResponseHandler() public setter method | VERIFIED | Line 101-105: `setSignResponseHandler(handler: SignResponseHandler): void { this.signResponseHandler = handler; }` |
| `packages/daemon/src/__tests__/signing-sdk-lifecycle.test.ts` | Integration tests for signing SDK lifecycle wiring | VERIFIED | 11 test cases covering instantiation, routing dispatch, shutdown, conditional init, and TelegramBotService injection |

---

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| daemon.ts Step 4c-8 | ApprovalChannelRouter constructor | `new ApprovalChannelRouter(...)` | WIRED | Line 694: `this.approvalChannelRouter = new ApprovalChannelRouter({ sqlite, settingsService, ntfyChannel, telegramChannel })` |
| daemon.ts Step 5 createApp() | CreateAppDeps.approvalChannelRouter | `approvalChannelRouter: this.approvalChannelRouter ?? undefined` | WIRED | Line 857: field passed to createApp() |
| stage4Wait APPROVAL branch | ApprovalChannelRouter.route() | `ctx.approvalChannelRouter?.route(...)` | WIRED | Lines 562-574: `void ctx.approvalChannelRouter.route(ctx.walletId, { walletId, txId, chain, network, type, from, to, amount, policyTier: 'APPROVAL' })` |
| daemon.ts Step 4c-8 | TelegramBotService.signResponseHandler | `this.telegramBotService.setSignResponseHandler(signResponseHandler)` | WIRED | Line 703: late-binding injection after both created |
| server.ts CreateAppDeps | TransactionRouteDeps | `approvalChannelRouter: deps.approvalChannelRouter` | WIRED | Line 341: passthrough to transactionRoutes |
| TransactionRouteDeps | PipelineContext | `approvalChannelRouter: deps.approvalChannelRouter` | WIRED | Line 374: included in PipelineContext construction |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| PROTO-01 | 204-01 | PENDING_APPROVAL 트랜잭션에서 SignRequest를 생성하여 유니버셜 링크 URL로 인코딩할 수 있다 | SATISFIED | SignRequestBuilder instantiated in daemon.ts Step 4c-8; NtfySigningChannel and TelegramSigningChannel call buildRequest internally |
| PROTO-03 | 204-01 | SignResponse를 수신하여 requestId 매칭, 만료 체크, 서명 검증 후 트랜잭션 승인/거부 | SATISFIED | SignResponseHandler instantiated in daemon.ts; injected into TelegramBotService for /sign_response processing |
| CHAN-01 | 204-01 | NtfySigningChannel이 ntfy 요청 토픽에 SignRequest를 publish하고 응답 토픽을 subscribe하여 SignResponse를 수신 | SATISFIED | NtfySigningChannel instantiated and wired into ApprovalChannelRouter; routing dispatch verified by lifecycle tests |
| CHAN-02 | 204-01 | NtfySigningChannel이 reject 응답 수신 시 트랜잭션을 CANCELLED 상태로 변경 | SATISFIED | Implemented in NtfySigningChannel (Phase 202); lifecycle wiring in daemon.ts Step 4c-8 makes it reachable at runtime |
| CHAN-03 | 204-01 | TelegramSigningChannel이 유니버셜 링크 인라인 버튼이 포함된 메시지를 전송 | SATISFIED | TelegramSigningChannel instantiated conditionally (when telegramBotService + botToken available); wired into ApprovalChannelRouter |
| CHAN-04 | 204-02 | TelegramSigningChannel이 /sign_response 명령어로 SignResponse를 수신하여 처리 | SATISFIED | signResponseHandler injected into TelegramBotService via setSignResponseHandler(); /sign_response handler at line 783 calls `this.signResponseHandler.handle()` |
| CHAN-05 | 204-01 | ApprovalChannelRouter가 지갑별 owner_approval_method에 따라 올바른 채널로 라우팅 | SATISFIED | ApprovalChannelRouter.route() wired in stage4Wait; routing dispatch tests verify sdk_ntfy/sdk_telegram dispatch |
| CHAN-06 | 204-01 | ApprovalChannelRouter가 owner_approval_method 미설정 시 글로벌 우선순위 fallback | SATISFIED | ApprovalChannelRouter implementation (Phase 203) handles fallback; lifecycle wiring makes it reachable |
| CHAN-07 | 204-01 | SDK 채널 비활성(signing_sdk.enabled=false) 시 WalletConnect 또는 Telegram Bot으로 fallback | SATISFIED | daemon.ts Step 4c-8 only creates SDK classes when enabled=true; when disabled, stage4Wait falls through to existing WcSigningBridge and TelegramBot paths |
| WALLET-01 | 204-01 | WalletLinkRegistry에 지갑 메타데이터를 등록하고 조회할 수 있다 | SATISFIED | WalletLinkRegistry instantiated in daemon.ts Step 4c-8; passed to SignRequestBuilder constructor |

**All 10 requirements (PROTO-01, PROTO-03, CHAN-01~07, WALLET-01) satisfied.**

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| daemon.ts | 1024-1025 | `// Steps 5-6: In-flight signing -- STUB (Phase 50-04)` | INFO | Pre-existing known stub, not introduced by Phase 204; unrelated to signing SDK lifecycle |

No blocking anti-patterns introduced by Phase 204 changes.

---

### Human Verification Required

#### 1. SDK ntfy Signing Flow E2E

**Test:** Configure daemon with `signing_sdk.enabled=true`, set wallet `owner_approval_method=sdk_ntfy`, submit a transfer transaction via REST API, observe ntfy request published to `{ntfy_server}/{request_topic}`, decode the universal link from the notification, send a SignResponse to the response topic, confirm transaction status changes to APPROVED.

**Expected:** Transaction transitions PENDING_APPROVAL → APPROVED. The full chain (daemon → stage4Wait → ApprovalChannelRouter → NtfySigningChannel → ntfy publish → SSE subscribe → SignResponseHandler → approval) executes end-to-end.

**Why human:** Requires a running ntfy server (real or local), a live daemon, and ability to send SSE responses. The mocked E2E tests in `signing-sdk-e2e.test.ts` cover the unit paths but not the actual ntfy HTTP transport.

#### 2. Telegram SDK Signing Flow E2E

**Test:** Configure daemon with `signing_sdk.enabled=true` and a valid Telegram bot token, set wallet `owner_approval_method=sdk_telegram`, submit a transfer transaction, observe Telegram message with universal link inline button, use `/sign_response {encoded}` command in the bot chat, confirm transaction resolves APPROVED.

**Expected:** `/sign_response` command dispatches to `signResponseHandler.handle()` (injected via `setSignResponseHandler()`) and the transaction transitions to APPROVED. Without injection, the command returns "Signing SDK is not enabled".

**Why human:** Requires a real Telegram bot token and running daemon. The late-binding injection path (`setSignResponseHandler` called in Step 4c-8 after TelegramBotService started in Step 4c-5) is verified in code but actual Telegram API communication cannot be verified programmatically.

---

## Summary

Phase 204's goal — instantiating all signing SDK classes in daemon.ts lifecycle and wiring ApprovalChannelRouter through the full pipeline — is fully achieved in code. All automated checks pass:

- **daemon.ts Step 4c-8** instantiates all 6 classes (SignRequestBuilder, SignResponseHandler, WalletLinkRegistry, NtfySigningChannel, TelegramSigningChannel, ApprovalChannelRouter) conditionally on `signing_sdk.enabled=true`
- **Full pipeline chain** daemon.ts → createApp() → transactionRoutes → PipelineContext → stage4Wait APPROVAL branch verified through all 4 files
- **fire-and-forget routing** `void ctx.approvalChannelRouter.route(...)` pattern mirrors existing wcSigningBridge pattern
- **shutdown cleanup** approvalChannelRouter.shutdown() called and field nulled in daemon shutdown sequence
- **late-binding injection** signResponseHandler injected into TelegramBotService via setSignResponseHandler() after Step 4c-8
- **11 integration tests** in signing-sdk-lifecycle.test.ts cover instantiation, routing dispatch, shutdown, conditional init, and injection
- **All 4 commits verified** in git history: 33b1987, 479dfc2, 69c4976, f5b8817

The only items requiring human verification are the actual E2E flows with real ntfy/Telegram services (SC4, SC5) — these cannot be tested without live infrastructure.

---

_Verified: 2026-02-20T07:45:00Z_
_Verifier: Claude (gsd-verifier)_
