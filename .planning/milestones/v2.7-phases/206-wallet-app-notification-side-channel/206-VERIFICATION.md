---
phase: 206-wallet-app-notification-side-channel
verified: 2026-02-20T14:00:00Z
status: passed
score: 16/16 must-haves verified
re_verification: false
---

# Phase 206: Wallet App Notification Side Channel Verification Report

**Phase Goal:** 지갑 앱(D'CENT 등)이 Telegram 없이 모든 알림 이벤트를 ntfy 사이드 채널로 수신할 수 있는 상태
**Verified:** 2026-02-20T14:00:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | NotificationMessageSchema exists in core signing-protocol.ts with version, eventType, walletId, walletName, category, title, body, timestamp fields | VERIFIED | `packages/core/src/schemas/signing-protocol.ts` lines 218-229: full Zod schema with all required fields including optional `details` |
| 2 | EVENT_CATEGORY_MAP covers all 26 NotificationEventType values (verified by test) | VERIFIED | `signing-protocol.ts` lines 185-212: 26 entries confirmed by grep; `signing-protocol.test.ts` describe block at line 426 tests exact coverage |
| 3 | NotificationMessage type is re-exported from @waiaas/wallet-sdk | VERIFIED | `packages/wallet-sdk/src/index.ts` line 46: `NotificationMessage` in type export block |
| 4 | signing_sdk.notifications_enabled and signing_sdk.notify_categories setting keys exist in SETTING_DEFINITIONS | VERIFIED | `setting-keys.ts` lines 140-141: both keys with correct defaults ('true' and '[]') |
| 5 | WalletNotificationChannel publishes NotificationMessage to waiaas-notify-{walletName} ntfy topic as base64url-encoded body | VERIFIED | `wallet-notification-channel.ts` lines 125-138: `publishNotification()` builds `waiaas-notify-{walletName}` URL and POSTs base64url body; DAEMON-01 test confirms schema validity |
| 6 | security_alert category uses ntfy priority 5, all others use priority 3 | VERIFIED | `wallet-notification-channel.ts` line 79: `const priority = category === 'security_alert' ? 5 : 3`; DAEMON-05 tests confirm both values |
| 7 | Only sdk_ntfy wallets receive notifications | VERIFIED | `resolveTargetWallets()` lines 103-116: UUID path checks `owner_approval_method !== 'sdk_ntfy'` returns []; DAEMON-03 test confirms telegram_bot wallet is skipped |
| 8 | Non-UUID walletId broadcasts to all sdk_ntfy wallets with real per-wallet walletId | VERIFIED | `resolveTargetWallets()` non-UUID branch queries `WHERE owner_approval_method = 'sdk_ntfy' AND status = 'ACTIVE'`; DAEMON-04 test verifies 2 calls with real UUIDs (not 'system') |
| 9 | Side channel failure does not affect existing NotificationService channels | VERIFIED | `notification-service.ts` line 102: `.catch(() => {})` fire-and-forget; `wallet-notification-channel.ts` lines 97-99: outer try/catch swallows all errors; DAEMON-06 test confirms no throw |
| 10 | NotificationService.notify() calls side channel in parallel with existing channels | VERIFIED | `notification-service.ts` lines 99-103: side channel call placed BEFORE `channels.length === 0` guard, fires independently |
| 11 | signing_sdk.enabled=false suppresses side channel delivery | VERIFIED | `wallet-notification-channel.ts` line 54: Gate 1 check; SETTINGS-01/02 test confirms fetch not called when enabled='false' |
| 12 | signing_sdk.notifications_enabled=false suppresses side channel delivery | VERIFIED | `wallet-notification-channel.ts` line 56: Gate 2 check; SETTINGS-01/02 test confirms fetch not called when notifications_enabled='false' |
| 13 | signing_sdk.notify_categories filters events by category (empty array = all) | VERIFIED | `wallet-notification-channel.ts` lines 61-68: JSON.parse filter logic; SETTINGS-03 tests confirm transaction-only filter blocks security_alert, empty array allows all |
| 14 | subscribeToNotifications(topic, callback, serverUrl?) subscribes to ntfy SSE and delivers parsed NotificationMessage objects via callback | VERIFIED | `packages/wallet-sdk/src/channels/ntfy.ts` lines 177-281: full SSE implementation with AbortController, reconnect, and callback invocation; exported from wallet-sdk public API |
| 15 | parseNotification(data) decodes base64url -> JSON -> Zod-validated NotificationMessage | VERIFIED | `ntfy.ts` lines 159-162: `Buffer.from(data, 'base64url').toString('utf-8')` -> `JSON.parse` -> `NotificationMessageSchema.parse()`; 5 tests confirm valid/invalid cases |
| 16 | Admin Settings page shows Wallet App Notifications section with notifications_enabled toggle and 6 category checkboxes | VERIFIED | `packages/admin/src/pages/settings.tsx` lines 811-848: subgroup with toggle + NOTIFY_CATEGORY_OPTIONS mapped to checkboxes; handleCategoryToggle saves JSON array to `signing_sdk.notify_categories` |

**Score:** 16/16 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/core/src/schemas/signing-protocol.ts` | NotificationMessageSchema, EVENT_CATEGORY_MAP, NOTIFICATION_CATEGORIES | VERIFIED | All three exports present; 26-entry map, 6-element categories const, full Zod schema |
| `packages/core/src/__tests__/signing-protocol.test.ts` | Tests verifying EVENT_CATEGORY_MAP covers all 26 events | VERIFIED | describe blocks at line 426 and 444; covers map completeness, no extra keys, valid/invalid schema parse |
| `packages/wallet-sdk/src/index.ts` | Re-export of NotificationMessage type + subscribeToNotifications + parseNotification | VERIFIED | Lines 13-14 (JSDoc), 30-31 (function exports), 46 (type export) |
| `packages/daemon/src/infrastructure/settings/setting-keys.ts` | notifications_enabled and notify_categories setting definitions | VERIFIED | Lines 140-141; defaults 'true' and '[]'; total count 65 confirmed by test |
| `packages/daemon/src/services/signing-sdk/channels/wallet-notification-channel.ts` | WalletNotificationChannel class | VERIFIED | Full implementation: notify(), resolveTargetWallets(), publishNotification(), getNtfyServer(); 149 lines |
| `packages/daemon/src/__tests__/wallet-notification-channel.test.ts` | Unit tests for DAEMON-01 through DAEMON-06 scenarios | VERIFIED | 12 test cases covering all 7 requirement areas; mock fetch, mock SQLite, mock SettingsService |
| `packages/wallet-sdk/src/channels/ntfy.ts` | subscribeToNotifications and parseNotification functions | VERIFIED | parseNotification at line 159, subscribeToNotifications at line 177; exported via channels/index.ts |
| `packages/wallet-sdk/src/__tests__/channels.test.ts` | Tests for SSE parsing and parseNotification validation | VERIFIED | 8 new tests added for both functions; SSE URL construction, unsubscribe, valid/invalid parse cases |
| `packages/admin/src/pages/settings.tsx` | Wallet App Notifications subgroup in SigningSDKSettings | VERIFIED | Lines 811-848: subgroup with title, description, notifications_enabled toggle, 6 category checkboxes, info box |
| `packages/admin/src/__tests__/settings.test.tsx` | Admin UI tests for notification subgroup | VERIFIED | Test 26 at line 652: verifies 'Wallet App Notifications', 'Transaction Events', 'Security Alerts', and '(all categories)' hint |
| `skills/wallet.skill.md` | SDK API documentation for notification functions | VERIFIED | Section 13 (lines 980-1043): subscribeToNotifications, parseNotification, NotificationMessage type, categories table |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `packages/core/src/schemas/signing-protocol.ts` | `packages/core/src/enums/notification.ts` | `import type { NotificationEventType }` | WIRED | Line 14: type-only import used in `Record<NotificationEventType, NotificationCategory>` |
| `packages/wallet-sdk/src/index.ts` | `packages/core/src/schemas/signing-protocol.ts` | re-export type NotificationMessage | WIRED | Line 46: `NotificationMessage` in type export block from `@waiaas/core` |
| `packages/daemon/src/notifications/notification-service.ts` | `packages/daemon/src/services/signing-sdk/channels/wallet-notification-channel.ts` | `notifySideChannel()` called from notify() | WIRED | Lines 15, 35, 82-84, 99-103: import, field, setter, call in notify() |
| `packages/daemon/src/services/signing-sdk/channels/wallet-notification-channel.ts` | `packages/core/src/schemas/signing-protocol.ts` | import NotificationMessage, EVENT_CATEGORY_MAP | WIRED | Lines 12-15: both imports present and used in notify() logic |
| `packages/daemon/src/lifecycle/daemon.ts` | `packages/daemon/src/services/signing-sdk/channels/wallet-notification-channel.ts` | Instantiation during Step 4c-8 signing SDK lifecycle | WIRED | Lines 660, 709-714: WalletNotificationChannel destructured from dynamic import, instantiated, injected via setWalletNotificationChannel() |
| `packages/wallet-sdk/src/channels/ntfy.ts` | `packages/core/src/schemas/signing-protocol.ts` | import NotificationMessageSchema | WIRED | NotificationMessageSchema used in parseNotification() at line 162 |
| `packages/wallet-sdk/src/index.ts` | `packages/wallet-sdk/src/channels/index.ts` | export subscribeToNotifications, parseNotification | WIRED | Lines 30-31: both functions in public API export block |
| `packages/admin/src/pages/settings.tsx` | `signing_sdk.notify_categories` | handleFieldChange('signing_sdk.notify_categories', ...) | WIRED | Line 738: handleCategoryToggle calls handleFieldChange with JSON.stringify(updated) |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SCHEMA-01 | 206-01 | NotificationMessageSchema defined in core with 26-event mapping | SATISFIED | signing-protocol.ts lines 175-229: NOTIFICATION_CATEGORIES, EVENT_CATEGORY_MAP, NotificationMessageSchema all present |
| SCHEMA-02 | 206-01 | EVENT_CATEGORY_MAP covers all 26 NotificationEventType values (test-verified) | SATISFIED | 26 map entries confirmed; signing-protocol.test.ts describe block verifies completeness with NOTIFICATION_EVENT_TYPES loop |
| SCHEMA-03 | 206-01 | NotificationMessage type re-exported from wallet-sdk | SATISFIED | wallet-sdk/src/index.ts line 46: `type NotificationMessage` in export block |
| DAEMON-01 | 206-02 | WalletNotificationChannel publishes base64url NotificationMessage to waiaas-notify-{walletName} | SATISFIED | publishNotification() builds correct URL and POSTs base64url; test decodes and validates against NotificationMessageSchema |
| DAEMON-02 | 206-02 | Side channel operates independently of traditional channels | SATISFIED | notify() call placed before channels.length guard; fire-and-forget .catch(() => {}) pattern |
| DAEMON-03 | 206-02 | Non-sdk_ntfy wallets do not receive notifications | SATISFIED | resolveTargetWallets() returns [] for non-sdk_ntfy; DAEMON-03 test with telegram_bot wallet confirms fetch not called |
| DAEMON-04 | 206-02 | Non-UUID walletId broadcasts to all sdk_ntfy wallets with real UUIDs | SATISFIED | Non-UUID branch queries all ACTIVE sdk_ntfy wallets; DAEMON-04 test confirms 2 fetches with SDK_NTFY_WALLET_1.id and SDK_NTFY_WALLET_2.id |
| DAEMON-05 | 206-02 | security_alert gets priority 5, others get priority 3 | SATISFIED | Line 79 ternary; DAEMON-05 tests confirm Priority header '5' for KILL_SWITCH_ACTIVATED and '3' for TX_CONFIRMED |
| DAEMON-06 | 206-02 | Side channel failure does not affect existing channel delivery | SATISFIED | Outer try/catch in notify(); .catch(() => {}) on fire-and-forget call; DAEMON-06 test confirms resolves without throwing |
| SDK-01 | 206-03 | subscribeToNotifications subscribes to ntfy SSE and delivers NotificationMessage via callback | SATISFIED | Full SSE implementation with reader loop; parsed messages delivered via callback(); returns {unsubscribe()} |
| SDK-02 | 206-03 | parseNotification decodes base64url -> JSON -> Zod-validated NotificationMessage | SATISFIED | Three-line implementation at ntfy.ts lines 159-162; 5 tests covering valid and 3 error cases |
| SETTINGS-01 | 206-01 | signing_sdk.notifications_enabled toggle activates/deactivates wallet notification channel | SATISFIED | Default 'true' in setting-keys.ts; Gate 2 in wallet-notification-channel.ts; test verifies suppression when 'false' |
| SETTINGS-02 | 206-01 | signing_sdk.enabled=false suppresses regardless of notifications_enabled | SATISFIED | Gate 1 in wallet-notification-channel.ts precedes Gate 2; SETTINGS-01/02 test confirms both gates independently suppress |
| SETTINGS-03 | 206-01 | signing_sdk.notify_categories JSON array filters by category (empty = all) | SATISFIED | Lines 61-68: JSON.parse filter; 3 SETTINGS-03 tests confirm allow, block, and empty-array-allows-all behaviors |
| ADMIN-01 | 206-04 | Settings page shows 6-category multi-select checkboxes to configure notify_categories | SATISFIED | settings.tsx lines 713-739, 811-848: NOTIFY_CATEGORY_OPTIONS array + FormField per category + handleCategoryToggle writes JSON array |
| SYNC-01 | 206-04 | SDK public API changes reflected in skill file | SATISFIED | skills/wallet.skill.md Section 13: subscribeToNotifications, parseNotification, NotificationMessage type, categories table with priority column |

**All 16 requirements satisfied. No orphaned requirements found.**

---

### Anti-Patterns Found

No anti-patterns detected in any of the 11 created/modified files. No TODO, FIXME, placeholder comments, empty implementations, or stub return values found.

---

### Human Verification Required

#### 1. Admin UI Rendering — Category Checkbox State Persistence

**Test:** Open Admin Settings, navigate to Signing SDK section, select "Transaction Events" and "Security Alerts" checkboxes, click Save. Reload the page.
**Expected:** The two selected categories are still checked; "(all categories)" hint is hidden; other 4 categories remain unchecked.
**Why human:** JSON array serialization/deserialization round-trip through Admin UI settings form cannot be verified programmatically without running the browser app.

#### 2. Live ntfy SSE Delivery — End-to-End Wallet App Flow

**Test:** With a wallet configured with `owner_approval_method='sdk_ntfy'`, trigger a TX_CONFIRMED event. Subscribe to `waiaas-notify-{walletName}` topic on ntfy.sh using the SDK's `subscribeToNotifications()`. Observe the callback.
**Expected:** Callback receives a valid NotificationMessage with version='1', correct eventType='TX_CONFIRMED', category='transaction', walletId matching the wallet's UUID, and ntfy priority 3.
**Why human:** Requires a running daemon with an actual ntfy server and a wallet configured for sdk_ntfy — live network I/O cannot be verified statically.

---

### Gaps Summary

No gaps. All 16 observable truths are verified, all key links are wired, and all 16 requirements are satisfied. The 2 human verification items are quality/integration checks that require a running environment — they do not block the goal assessment.

---

## Commit Evidence

All 7 commits from SUMMARY files confirmed present in git log:

| Commit | Description | Plan |
|--------|-------------|------|
| `432e3d0` | feat(206-01): add NotificationMessage schema, EVENT_CATEGORY_MAP, and category types | 206-01 |
| `b33fa39` | feat(206-01): re-export NotificationMessage in wallet-sdk + add notification settings keys | 206-01 |
| `e21f79e` | feat(206-02): add WalletNotificationChannel with TDD tests | 206-02 |
| `eeae09c` | feat(206-02): integrate WalletNotificationChannel into NotificationService and daemon lifecycle | 206-02 |
| `fd666ad` | feat(206-03): add parseNotification and subscribeToNotifications to wallet-sdk | 206-03 |
| `db979c5` | feat(206-04): add Wallet App Notifications section to Admin Settings | 206-04 |
| `d7e8c55` | docs(206-04): add notification SDK functions to wallet.skill.md | 206-04 |

---

_Verified: 2026-02-20T14:00:00Z_
_Verifier: Claude (gsd-verifier)_
