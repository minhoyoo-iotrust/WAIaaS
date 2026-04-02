# Architecture Patterns: Signing App Explicit Selection

**Domain:** Wallet-as-a-Service signing target resolution
**Researched:** 2026-04-02

## Recommended Architecture

### Overview

The signing app explicit selection feature modifies 4 existing components and adds 1 DB migration. No new services or components are needed -- this is purely a refinement of existing data flow from "name-based lookup" to "wallet_type group + signing_enabled primary" lookup.

### Current Data Flow (Before)

```
ApprovalChannelRouter.route(walletId)
  -> reads wallet.wallet_type from wallets table
  -> checks wallet_apps WHERE wallet_type = ? AND signing_enabled = 1 (already exists!)
  -> enriches params.walletName = wallet_type
  -> calls PushRelaySigningChannel.sendRequest(enrichedParams)
       -> calls SignRequestBuilder.buildRequest(params)
            -> walletName = params.walletName || settings.get('signing_sdk.preferred_wallet')
            -> WalletLinkRegistry.getWallet(walletName) -- name-based lookup in settings JSON
            -> queries wallet_apps WHERE name = walletName for push_relay_url
            -> queries wallet_apps WHERE name = walletName for subscription_token
```

**Problem:** SignRequestBuilder uses `walletName` (individual app name) to resolve push_relay_url and subscription_token. When multiple apps share the same wallet_type, the `walletName` param is set to wallet_type by ApprovalChannelRouter, but the wallet_apps query uses `WHERE name = ?` which may not match any row (wallet_type != name).

### Target Data Flow (After)

```
ApprovalChannelRouter.route(walletId)
  -> reads wallet.wallet_type from wallets table
  -> checks wallet_apps WHERE wallet_type = ? AND signing_enabled = 1 (unchanged)
  -> enriches params.walletName = wallet_type (unchanged)
  -> calls PushRelaySigningChannel.sendRequest(enrichedParams)
       -> calls SignRequestBuilder.buildRequest(params)
            -> walletType = params.walletName (already set to wallet_type by router)
            -> queries wallet_apps WHERE wallet_type = ? AND signing_enabled = 1
            -> gets push_relay_url, subscription_token, name from the signing primary app
            -> WalletLinkRegistry.getWallet(appRow.name) -- uses actual app name
```

**Key insight:** The ApprovalChannelRouter already sets `walletName = wallet_type`. The fix is making SignRequestBuilder query by `wallet_type + signing_enabled` instead of `name`.

### Component Boundaries

| Component | Responsibility | Change Type | Communicates With |
|-----------|---------------|-------------|-------------------|
| DB Migration v61 | Enforce single signing primary per wallet_type | NEW | wallet_apps table |
| WalletAppService | CRUD for wallet_apps + auto-toggle signing primary | MODIFY | SQLite, Routes |
| SignRequestBuilder | Build SignRequest with correct push_relay_url/token | MODIFY | wallet_apps table, WalletLinkRegistry |
| Admin UI HumanWalletAppsPage | Group by wallet_type, radio for signing | MODIFY | REST API |
| ApprovalChannelRouter | Route PENDING_APPROVAL to channel | NO CHANGE | Already uses wallet_type + signing_enabled |
| WalletLinkRegistry | Universal link URL generation | NO CHANGE | Still needed for buildSignUrl() |
| PushRelaySigningChannel | Send push to relay | NO CHANGE | Delegates to SignRequestBuilder |
| REST API routes (wallet-apps.ts) | HTTP handlers | NO CHANGE | WalletAppService handles auto-toggle |

### Data Flow Changes

#### 1. DB Layer: Partial Unique Index

```sql
-- Migration v61: Enforce at most one signing_enabled=1 per wallet_type
CREATE UNIQUE INDEX idx_wallet_apps_signing_primary
  ON wallet_apps(wallet_type) WHERE signing_enabled = 1;
```

Data migration for existing rows:
```sql
-- For each wallet_type with multiple signing_enabled=1, keep oldest (min created_at)
UPDATE wallet_apps SET signing_enabled = 0
  WHERE signing_enabled = 1
    AND id NOT IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY wallet_type ORDER BY created_at ASC) as rn
        FROM wallet_apps WHERE signing_enabled = 1
      ) WHERE rn = 1
    );
```

**Note:** SQLite supports partial indexes via `WHERE` clause since 3.8.0 (2013). The WAIaaS project uses better-sqlite3 which bundles a modern SQLite version. HIGH confidence.

#### 2. WalletAppService: Auto-Toggle in update()

Current `update()` is a simple field-setter. Two changes needed:

**2a. update() with transactional auto-toggle:**
```typescript
update(id: string, fields: { signingEnabled?: boolean; ... }): WalletApp {
  // ... existing validation ...

  if (fields.signingEnabled === true) {
    // Wrap in transaction: disable others in same wallet_type, then enable this one
    this.sqlite.transaction(() => {
      this.sqlite.prepare(
        'UPDATE wallet_apps SET signing_enabled = 0, updated_at = ? WHERE wallet_type = ? AND id != ? AND signing_enabled = 1'
      ).run(now, existingApp.wallet_type, id);
      // ... existing SET logic with signing_enabled = 1 ...
    })();
  } else {
    // ... existing non-transactional logic (signingEnabled=false or other fields) ...
  }
}
```

**2b. register() with conditional signing_enabled:**
```typescript
register(name, displayName, opts) {
  // Check if wallet_type already has a signing primary
  const walletType = opts?.walletType || name;
  const existingPrimary = this.sqlite.prepare(
    'SELECT id FROM wallet_apps WHERE wallet_type = ? AND signing_enabled = 1'
  ).get(walletType);

  const signingEnabled = existingPrimary ? 0 : 1;  // New app is secondary if primary exists
  // ... rest of register with signingEnabled ...
}
```

#### 3. SignRequestBuilder: wallet_type-Based Lookup

Three query sites in `buildRequest()` currently use `WHERE name = ?` and must change to `WHERE wallet_type = ? AND signing_enabled = 1`:

| Line | Current Query | New Query |
|------|--------------|-----------|
| L97 | `settings.get('signing_sdk.preferred_wallet')` | `wallet_apps WHERE wallet_type = ? AND signing_enabled = 1` |
| L158-163 | `wallet_apps WHERE name = ?` (push_relay_url) | Merged into single query above |
| L219-224 | `wallet_apps WHERE name = ? AND subscription_token IS NOT NULL` | Merged into single query above |

Refactored flow:
```typescript
buildRequest(params: BuildRequestParams): BuildRequestResult {
  // 1. Check signing SDK enabled (unchanged)
  // 2. Determine wallet type (replaces wallet name resolution)
  const walletType = params.walletName; // Already set to wallet_type by ApprovalChannelRouter

  if (!walletType) {
    throw new WAIaaSError('WALLET_NOT_REGISTERED', {
      message: 'No wallet type specified for signing',
    });
  }

  // 3. Single query: get signing primary app for this wallet_type
  const appRow = this.sqlite.prepare(
    'SELECT name, push_relay_url, subscription_token FROM wallet_apps WHERE wallet_type = ? AND signing_enabled = 1'
  ).get(walletType);

  if (!appRow) {
    throw new WAIaaSError('WALLET_NOT_REGISTERED', {
      message: `No signing-enabled app for wallet type: ${walletType}`,
    });
  }

  // 4. Use appRow.name for WalletLinkRegistry (universal link)
  this.walletLinkRegistry.getWallet(appRow.name);

  // 5. Use appRow.push_relay_url for response channel
  // 6. Use appRow.subscription_token for request topic
  // ... (consolidates 3 separate queries into 1)
}
```

**Deprecation:** `signing_sdk.preferred_wallet` setting is no longer consulted. The signing primary is determined by the `signing_enabled = 1` row in wallet_apps. The setting key remains in `setting-keys.ts` with updated description marking it deprecated.

#### 4. Admin UI: Grouped Radio Layout

Current flat list -> grouped by wallet_type with radio buttons for signing:

```typescript
// Group apps by wallet_type
const grouped = new Map<string, WalletAppApi[]>();
for (const app of apps.value) {
  const key = app.wallet_type || app.name;
  if (!grouped.has(key)) grouped.set(key, []);
  grouped.get(key)!.push(app);
}
```

Radio button handler calls existing `PUT /admin/wallet-apps/{id}` with `{ signing_enabled: true }`. The backend auto-toggle ensures mutual exclusivity. Admin UI refetches list after PUT.

"None" radio option: Admin UI sends `PUT /admin/wallet-apps/{currentPrimaryId}` with `{ signing_enabled: false }`. This disables signing for the entire wallet_type group.

## Patterns to Follow

### Pattern 1: Transactional Auto-Toggle (Radio Semantics)

**What:** When setting `signing_enabled = true` on one app, disable all others in the same wallet_type within a single SQLite transaction.

**When:** Any mutation that changes signing_enabled to true.

**Why:** The partial unique index enforces the constraint at DB level, but the application must proactively manage the toggle to avoid constraint violation errors. The transaction ensures atomicity -- if the enable fails, the disable is rolled back.

```typescript
this.sqlite.transaction(() => {
  // Step 1: Disable all in group
  this.sqlite.prepare(
    'UPDATE wallet_apps SET signing_enabled = 0, updated_at = ? WHERE wallet_type = ? AND signing_enabled = 1'
  ).run(now, walletType);
  // Step 2: Enable target
  this.sqlite.prepare(
    'UPDATE wallet_apps SET signing_enabled = 1, updated_at = ? WHERE id = ?'
  ).run(now, id);
})();
```

### Pattern 2: Single-Query Resolution

**What:** Consolidate multiple wallet_apps queries in SignRequestBuilder into one query that returns all needed fields.

**When:** Building a SignRequest.

**Why:** Current code queries wallet_apps 3 separate times (name lookup, push_relay_url, subscription_token). The new approach uses one query with `WHERE wallet_type = ? AND signing_enabled = 1` returning all fields.

### Pattern 3: Existing API Surface, New Backend Behavior

**What:** Keep REST API schema identical. The auto-toggle is a server-side side effect.

**When:** PUT /admin/wallet-apps/{id} with `signing_enabled: true`.

**Why:** Admin UI already refetches the full list after any update. No need for new response fields or new endpoints. The same `WalletAppUpdateRequestSchema` and `WalletAppResponseSchema` work unchanged.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Client-Side Radio Enforcement

**What:** Making the Admin UI responsible for sending two API calls (disable old + enable new).

**Why bad:** Race conditions, partial failure (one succeeds, other fails), inconsistent state if another client updates simultaneously.

**Instead:** Server-side transactional auto-toggle. Client sends one PUT, server handles the rest.

### Anti-Pattern 2: New Endpoints for Toggle

**What:** Creating `POST /admin/wallet-apps/{id}/set-signing-primary` or similar.

**Why bad:** Unnecessary API surface expansion. The existing PUT with `signing_enabled: true` is semantically correct -- the only change is server-side behavior.

**Instead:** Reuse existing PUT endpoint. The auto-toggle is an implementation detail.

### Anti-Pattern 3: Removing preferred_wallet Immediately

**What:** Deleting the `signing_sdk.preferred_wallet` setting key from setting-keys.ts.

**Why bad:** Users who have configured it will get errors. Preset auto-setup references it.

**Instead:** Deprecate by updating description, stop consulting it in SignRequestBuilder, update preset-auto-setup.ts to set signing_enabled instead.

### Anti-Pattern 4: Settings Fallback Chain

**What:** `signing_sdk.preferred_wallet` -> wallet_type primary -> first app fallback chain.

**Why bad:** Unpredictable behavior, debugging difficulty.

**Instead:** wallet_type + signing_enabled=1 single query. If no result, throw WALLET_NOT_REGISTERED error.

## Integration Points

### Existing Integration (No Changes Needed)

| Integration Point | Why No Change |
|---|---|
| ApprovalChannelRouter | Already queries `wallet_type + signing_enabled = 1` (lines 93-106) |
| PushRelaySigningChannel | Delegates to SignRequestBuilder, passes params through |
| TelegramSigningChannel | Same delegation pattern |
| REST API wallet-apps routes | WalletAppService handles toggle internally |
| MCP tools | No wallet app management tools exist |
| SDK (@waiaas/wallet-sdk) | Signing protocol only, unaware of app selection |

### Modified Integration Points

| Integration Point | What Changes |
|---|---|
| WalletAppService.update() | Add transactional auto-toggle for signingEnabled=true |
| WalletAppService.register() | Check existing primary, register as secondary if exists |
| SignRequestBuilder.buildRequest() | Replace walletName-based queries with wallet_type + signing_enabled query |
| preset-auto-setup.ts | Stop setting `signing_sdk.preferred_wallet`, set signing_enabled on app instead |
| Admin UI HumanWalletAppsPage | Group by wallet_type, radio for signing, checkbox for alerts |

### New Components

| Component | Type | Location |
|---|---|---|
| Migration v61 | DB migration function | `packages/daemon/src/infrastructure/database/migrations/` (add to v51-v59.ts or create new file) |
| Partial unique index | DB constraint | `idx_wallet_apps_signing_primary ON wallet_apps(wallet_type) WHERE signing_enabled = 1` |

## Suggested Build Order

Based on dependency analysis, build in this order:

### Phase 1: DB Migration v61

**Rationale:** Foundation. All other changes depend on the partial unique index being in place.

- Add migration v61 with partial unique index
- Include data migration for existing rows (keep oldest signing_enabled per wallet_type)
- Update `LATEST_VERSION` constant
- Write migration test

**Dependencies:** None
**Blocks:** Phase 2, 3

### Phase 2: WalletAppService Backend Changes

**Rationale:** Backend logic must be in place before Admin UI can use radio semantics.

- Modify `update()` with transactional auto-toggle
- Modify `register()` with conditional signing_enabled
- Update `preset-auto-setup.ts` to stop setting preferred_wallet
- Deprecate `signing_sdk.preferred_wallet` in setting-keys.ts description
- Write unit tests for auto-toggle behavior

**Dependencies:** Phase 1 (index must exist)
**Blocks:** Phase 4

### Phase 3: SignRequestBuilder Query Change

**Rationale:** Can be done in parallel with Phase 2 since it only changes read queries, but logically depends on the auto-toggle being correct.

- Replace 3 wallet_apps name-based queries with 1 wallet_type + signing_enabled query
- Remove preferred_wallet fallback from buildRequest()
- Update unit tests

**Dependencies:** Phase 1 (partial index guarantees single result)
**Blocks:** Phase 4 (full flow test)

### Phase 4: Admin UI Grouped Radio Layout

**Rationale:** UI change depends on backend auto-toggle being in place for correct behavior.

- Group apps by wallet_type in render
- Replace signing checkbox with radio button (per group)
- Add "None" radio option for disabling signing in a group
- Auto-select for single-app groups (disabled radio)
- Keep alerts as checkboxes
- Write Admin UI tests

**Dependencies:** Phase 2 (backend auto-toggle), Phase 3 (query change)
**Blocks:** None

## Scalability Considerations

Not applicable -- wallet_apps table is small (typically 1-5 rows). Partial unique index has negligible overhead. No performance concerns.

## Sources

- `packages/daemon/src/services/signing-sdk/wallet-app-service.ts` -- current WalletAppService implementation
- `packages/daemon/src/services/signing-sdk/sign-request-builder.ts` -- current SignRequestBuilder with walletName-based lookup
- `packages/daemon/src/services/signing-sdk/approval-channel-router.ts` -- existing wallet_type + signing_enabled pattern (lines 93-106)
- `packages/daemon/src/api/routes/wallet-apps.ts` -- REST API handlers
- `packages/admin/src/pages/human-wallet-apps.tsx` -- current Admin UI with per-app checkboxes
- `packages/daemon/src/infrastructure/database/schema.ts` -- wallet_apps table definition (line 551)
- `internal/objectives/m33-04-signing-app-explicit-selection.md` -- milestone objective document
- SQLite partial index documentation (supported since 3.8.0, 2013) -- HIGH confidence
