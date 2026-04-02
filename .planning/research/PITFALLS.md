# Domain Pitfalls

**Domain:** Signing App Explicit Selection (wallet_type group radio, partial unique index, auto-toggle)
**Researched:** 2026-04-02

## Critical Pitfalls

Mistakes that cause data corruption, signing failures, or require migration rollback.

### Pitfall 1: Migration Data Integrity -- Multiple signing_enabled = 1 per wallet_type

**What goes wrong:** The v61 migration adds a partial unique index `ON wallet_apps(wallet_type) WHERE signing_enabled = 1`, but existing data may already have multiple rows with `signing_enabled = 1` for the same `wallet_type`. The `CREATE UNIQUE INDEX` statement will fail with a constraint violation, crashing the migration and blocking daemon startup.

**Why it happens:** Every `register()` call currently sets `signing_enabled = 1` unconditionally (line 66 of wallet-app-service.ts: hardcoded `1` in INSERT). If a user registered multiple apps with the same `wallet_type` (e.g., `dcent` production + `dcent-test` dev, both with `walletType: 'dcent'`), both have `signing_enabled = 1`.

**Consequences:** Migration failure blocks daemon startup. If other DDL was executed before the index creation in the same migration function, those changes cannot be rolled back (SQLite DDL auto-commits within `exec()`).

**Prevention:**
1. In the v61 migration, **first normalize existing data** before creating the index:
   ```sql
   -- Keep only the oldest app per wallet_type as signing primary
   UPDATE wallet_apps SET signing_enabled = 0
   WHERE id NOT IN (
     SELECT id FROM (
       SELECT id, ROW_NUMBER() OVER (PARTITION BY wallet_type ORDER BY created_at ASC) AS rn
       FROM wallet_apps WHERE signing_enabled = 1
     ) WHERE rn = 1
   );
   ```
2. **Then** create the partial unique index.
3. Both operations in a single migration step so it either fully succeeds or fully fails.

**Detection:** Migration test: seed data with multiple `signing_enabled = 1` for same wallet_type, apply v61, verify only oldest survives as primary. Also add a pre-migration assertion: `SELECT wallet_type, COUNT(*) FROM wallet_apps WHERE signing_enabled = 1 GROUP BY wallet_type HAVING COUNT(*) > 1`.

**Phase:** DB Migration phase (first phase) -- must be addressed before any service code changes.

---

### Pitfall 2: UPDATE Order Within Transaction -- SQLite Enforces Constraints Per Statement

**What goes wrong:** When auto-toggling signing_enabled, if the code sets the target app to `signing_enabled = 1` BEFORE setting siblings to `signing_enabled = 0`, the partial unique index rejects the statement immediately -- even inside a transaction. SQLite validates constraints per-statement, not at commit time.

**Why it happens:** Developers familiar with PostgreSQL or MySQL may assume constraint checking is deferred to transaction commit. In SQLite, `CREATE UNIQUE INDEX` constraints are enforced at each individual DML statement.

**Consequences:** `SQLITE_CONSTRAINT_UNIQUE` error, entire transaction rolls back. Signing app toggle fails with opaque 500 error.

**Prevention:**
1. Order operations: **first** `UPDATE ... SET signing_enabled = 0 WHERE wallet_type = ? AND id != ?` (disable siblings), **then** `UPDATE ... SET signing_enabled = 1 WHERE id = ?` (enable target).
2. Wrap both in `this.sqlite.transaction(() => { ... })()` for atomicity.
3. Unit test both orderings: correct order succeeds, reversed order would fail (if not transacted, the index catches it).

**Detection:** Unit test with reversed UPDATE order to confirm the constraint fires.

**Phase:** WalletAppService backend phase -- core logic change.

---

### Pitfall 3: SignRequestBuilder walletName-to-walletType Semantic Mismatch

**What goes wrong:** `SignRequestBuilder.buildRequest()` currently receives `walletName` (app name) and queries `wallet_apps WHERE name = ?` (lines 158-161). The design changes this to query `WHERE wallet_type = ? AND signing_enabled = 1`. But `walletName` is passed from `ApprovalChannelRouter` (line 89: `walletName: row.wallet_type || params.walletName`), which already resolves to `wallet_type`. The parameter is called `walletName` but carries a `wallet_type` value -- the type system cannot catch this semantic drift.

**Why it happens:** `BuildRequestParams.walletName` is typed as `string | undefined`. There is no nominal type distinction between app name and wallet type. ApprovalChannelRouter already passes `wallet_type` as `walletName`, masking the mismatch.

**Consequences:** If any code path still passes an actual app `name` (not `wallet_type`) as `walletName`, the new query `WHERE wallet_type = ?` finds nothing. This causes `WALLET_NOT_REGISTERED` errors for legitimate signing requests -- a runtime-only failure.

**Prevention:**
1. Rename the parameter from `walletName` to `walletType` in `BuildRequestParams` and all callers. TypeScript compiler errors will surface every call site that needs updating.
2. Audit `PushRelaySigningChannel` (line 129) and `TelegramSigningChannel` -- both construct `BuildRequestParams`.
3. Add a unit test: register app with `name='dcent-dev'` and `walletType='dcent'`, set as signing primary, call `buildRequest({ walletType: 'dcent' })` -- assert it resolves to the correct app.

**Detection:** TypeScript compiler errors after rename (desired behavior).

**Phase:** SignRequestBuilder phase -- must coordinate with ApprovalChannelRouter.

---

### Pitfall 4: "None" Radio Option Creates Silent Signing Failure

**What goes wrong:** The "None" radio option sets all apps in a wallet_type group to `signing_enabled = 0`. APPROVAL-tier transactions then fail with `SIGNING_DISABLED` at `ApprovalChannelRouter` (lines 92-105). But the error surfaces only when a transaction hits APPROVAL policy tier -- not at configuration time. The admin sets "None", closes the page, and days later a high-value transaction silently fails.

**Why it happens:** No validation that at least one wallet_type group has signing enabled when APPROVAL-tier policies exist. The system is default-deny, but there is no proactive warning.

**Consequences:** APPROVAL-tier transactions stuck in PENDING_APPROVAL with no way to be approved. Transaction times out. No immediate feedback to admin about why.

**Prevention:**
1. Show a **confirmation dialog** when "None" is selected: "Signing will be disabled for all [wallet_type] wallets. APPROVAL-tier transactions will fail until a signing app is re-enabled."
2. Add a **warning banner** on the Wallet Apps page when any wallet_type group has zero signing-enabled apps.
3. Consider adding signing status to `/v1/connect-info` so agents can detect misconfiguration proactively.

**Detection:** Admin UI test: select "None" radio, verify confirmation dialog appears.

**Phase:** Admin UI phase.

## Moderate Pitfalls

### Pitfall 5: preferred_wallet Deprecation Breaks PresetAutoSetupService

**What goes wrong:** `PresetAutoSetupService.apply()` (lines 102-107) sets `signing_sdk.preferred_wallet` as Step 3 of the 4-step atomic setup. After deprecation, SignRequestBuilder stops reading this setting. But PresetAutoSetupService still calls `ensureRegistered()` (line 130), which calls `register()` -- which currently hardcodes `signing_enabled = 1`. After the new auto-toggle logic is added (new apps get `signing_enabled = 0` if a primary exists), preset auto-setup will register the new app as non-primary. The signing SDK appears enabled but no app is actually the signing target for the new wallet_type -- a silent misconfiguration.

**Consequences:** Signing appears configured (SDK enabled, wallet registered) but APPROVAL transactions fail because the new app is not the signing primary.

**Prevention:**
1. Update `PresetAutoSetupService` to explicitly set the new app as signing primary via `walletAppService.update(app.id, { signingEnabled: true })` after `ensureRegistered()`.
2. Remove `signing_sdk.preferred_wallet` from `SNAPSHOT_KEYS` and Step 3.
3. Keep the setting key in `SettingsService` to avoid breaking existing `config.toml` files, but stop reading it.
4. Add deprecation notice in Admin Settings UI.

**Detection:** Test: preset auto-setup with existing primary for different wallet_type, verify new app becomes signing primary for its wallet_type.

**Phase:** WalletAppService + PresetAutoSetupService phase -- must be coordinated.

---

### Pitfall 6: Admin UI Stale State After Server-Side Auto-Toggle

**What goes wrong:** User clicks signing radio for App A. Admin UI sends `PUT /admin/wallet-apps/{appA_id}` with `{ signing_enabled: true }`. Server auto-toggles App B to `signing_enabled = 0`. API response only contains App A's data (current `WalletAppResponseSchema`). If Admin UI uses optimistic updates or the re-fetch is slow, UI briefly shows both App A and App B as signing-enabled.

**Prevention:**
1. **No optimistic updates for radio state.** Wait for PUT response, then immediately re-fetch the full app list before updating UI signals.
2. Disable the entire radio group (not just the clicked radio) during the save operation using `toggleSaving` signal.
3. The re-fetch must be awaited before any state update.

**Detection:** Admin UI test: toggle signing radio, simulate slow API response, verify intermediate state never shows two active radios.

**Phase:** Admin UI phase.

---

### Pitfall 7: Missing CHECK Constraint on signing_enabled Column

**What goes wrong:** The partial unique index uses `WHERE signing_enabled = 1`. SQLite has no native boolean type -- it stores integers. If any code path writes a truthy-but-not-1 value (e.g., `2` or `true` as string), those rows bypass the partial unique index entirely, allowing multiple "enabled" apps per wallet_type without constraint violation.

**Why it happens:** Raw SQL `INSERT`/`UPDATE` statements in WalletAppService bypass Drizzle's boolean-to-integer mapping. Currently the `wallet_apps` table has NO `CHECK` constraint on `signing_enabled` (unlike `webhooks` table which has `check_webhook_enabled` at schema.ts line 585).

**Prevention:**
1. Add `CHECK (signing_enabled IN (0, 1))` to wallet_apps in the v61 migration.
2. Use explicit `1` and `0` (not `true`/`false`) in all raw SQL for `signing_enabled`.

**Detection:** Migration test: attempt INSERT with `signing_enabled = 2`, verify CHECK constraint rejects it.

**Phase:** DB Migration phase.

---

### Pitfall 8: "None" Option Missing for Single-App wallet_type Groups

**What goes wrong:** The design says single-app groups should have "라디오 자동 선택 (비활성 표시)". A disabled auto-selected radio with no "None" option means the admin cannot disable signing for that wallet_type without removing the app entirely. This contradicts existing behavior where `signing_enabled` can be independently toggled.

**Prevention:**
1. Always show the "None" option, even for single-app groups.
2. Radio options for a 1-app group: `[AppName]` (selected) and `[None]` (unselected), both enabled.
3. Only disable the radio if the business logic requires an always-active app (design does not mandate this).

**Phase:** Admin UI phase.

---

### Pitfall 9: "None" Selection API -- Avoid Multi-PUT Race

**What goes wrong:** If Admin UI implements "None" by sending PUT `signingEnabled: false` to every app in the group, multiple concurrent requests could interleave with user clicks on other groups. Network latency could cause out-of-order responses.

**Prevention:** "None" selection only needs to PUT `signingEnabled: false` on the **current signing primary** (the one app with `signing_enabled = 1`). All other apps in the group are already `signing_enabled = 0`. This is a single API call, no race condition.

**Detection:** Verify that clicking "None" triggers exactly one PUT request (not N requests for N apps in group).

**Phase:** Admin UI phase.

## Minor Pitfalls

### Pitfall 10: wallet_type Empty String Edge Case

**What goes wrong:** `wallet_type` column has `DEFAULT ''` (schema.ts line 555). Legacy apps registered without `walletType` default to `''`. The partial unique index groups all empty-wallet_type apps together, and `SignRequestBuilder` query with empty string returns an unexpected app.

**Prevention:** In v61 migration, normalize `wallet_type = ''` rows to `wallet_type = name` (same pattern as v34 migration, line 77 of v31-v40.ts). Consider adding `CHECK (wallet_type != '')`.

**Phase:** DB Migration phase.

---

### Pitfall 11: ApprovalChannelRouter SIGNING_DISABLED Uses Plain Error

**What goes wrong:** `ApprovalChannelRouter` throws `new Error('SIGNING_DISABLED: ...')` (line 103), not `WAIaaSError`. REST API returns generic 500 instead of structured error with `SIGNING_DISABLED` code. With the "None" radio option, admins will intentionally trigger this path and need a clear error message.

**Prevention:** Change to `throw new WAIaaSError('SIGNING_DISABLED', { message: ... })`.

**Phase:** WalletAppService backend phase -- quick fix.

---

### Pitfall 12: register() Hardcodes signing_enabled = 1 -- Index Violation

**What goes wrong:** Current `register()` hardcodes `signing_enabled = 1` in INSERT (line 66). After the partial unique index exists, registering a second app with the same `wallet_type` violates the constraint immediately.

**Prevention:** Update `register()` to check if wallet_type already has a `signing_enabled = 1` app. If yes, insert new app with `signing_enabled = 0`. Must be in a transaction to prevent TOCTOU race. This change must be deployed **before or simultaneously with** the v61 migration.

**Detection:** Unit test: register two apps with same wallet_type, second must have `signing_enabled = false`.

**Phase:** WalletAppService backend phase -- must precede or coincide with migration.

---

### Pitfall 13: Test Coverage Gap During preferred_wallet Removal

**What goes wrong:** `sign-request-builder.test.ts` has 8+ tests referencing `signing_sdk.preferred_wallet` (lines 28, 199, 202-203, 277, 280). Removing the fallback without writing replacement tests creates a coverage gap.

**Prevention:** Write new `wallet_type + signing_enabled` query tests BEFORE modifying SignRequestBuilder. Then update implementation. Then update/remove old tests. Coverage never drops.

**Phase:** SignRequestBuilder phase.

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| DB Migration (v61) | Pitfall 1: Existing data has multiple signing_enabled=1 per wallet_type | Normalize data BEFORE creating partial unique index |
| DB Migration (v61) | Pitfall 10: Empty wallet_type strings | Normalize `'' -> name` like v34 migration |
| DB Migration (v61) | Pitfall 7: No CHECK on signing_enabled | Add `CHECK (signing_enabled IN (0, 1))` |
| WalletAppService | Pitfall 2: UPDATE order within transaction | Disable siblings FIRST, enable target SECOND |
| WalletAppService | Pitfall 12: register() hardcodes signing_enabled=1 | Check for existing primary, insert as 0 if exists |
| WalletAppService | Pitfall 11: SIGNING_DISABLED is plain Error | Change to `WAIaaSError('SIGNING_DISABLED')` |
| PresetAutoSetupService | Pitfall 5: preferred_wallet deprecation | Replace Step 3 with explicit `update({ signingEnabled: true })` |
| SignRequestBuilder | Pitfall 3: walletName/walletType semantic mismatch | Rename parameter, audit all callers |
| SignRequestBuilder | Pitfall 13: Test coverage gap | Write new tests before modifying code |
| Admin UI | Pitfall 6: Stale state after server-side toggle | Full list re-fetch, no optimistic updates, disable group during save |
| Admin UI | Pitfall 8: "None" missing for single-app groups | Always show "None" option |
| Admin UI | Pitfall 4: No warning for all-disabled wallet_type | Confirmation dialog + warning banner |
| Admin UI | Pitfall 9: "None" multi-PUT race | Only PUT the current signing primary |

## Sources

- [SQLite Partial Indexes](https://www.sqlite.org/partialindex.html) -- official docs on partial index behavior, per-statement constraint enforcement
- [SQLite CREATE INDEX](https://sqlite.org/lang_createindex.html) -- UNIQUE constraint behavior
- Codebase: `packages/daemon/src/services/signing-sdk/wallet-app-service.ts` -- register hardcodes signing_enabled=1 (line 66), update method (line 141)
- Codebase: `packages/daemon/src/services/signing-sdk/sign-request-builder.ts` -- preferred_wallet fallback (line 97), wallet_apps queries (lines 158-161, 219-224)
- Codebase: `packages/daemon/src/services/signing-sdk/approval-channel-router.ts` -- wallet_type + signing_enabled check (lines 92-106), walletName enrichment (line 89)
- Codebase: `packages/daemon/src/services/signing-sdk/preset-auto-setup.ts` -- preferred_wallet Step 3 (lines 102-107), ensureRegistered (line 130)
- Codebase: `packages/daemon/src/infrastructure/database/schema.ts` -- wallet_apps table (lines 551-564), no CHECK on signing_enabled
- Codebase: `packages/daemon/src/infrastructure/database/migrations/v31-v40.ts` -- v34 wallet_type normalization pattern (line 77)
- Codebase: `internal/objectives/m33-04-signing-app-explicit-selection.md` -- milestone design document

---
*Pitfalls research for: Signing App Explicit Selection*
*Researched: 2026-04-02*
