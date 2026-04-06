# Phase 278: Admin UI + Settings + E2E - Research

**Researched:** 2026-02-27
**Domain:** Admin UI (Preact), Admin Settings (SettingsService), E2E Integration Testing
**Confidence:** HIGH

## Summary

Phase 278 has three complementary work streams: (1) adding a DeFi positions section to the Admin dashboard, (2) adding Aave V3 runtime settings to `setting-keys.ts` and displaying them in the Actions page, and (3) writing an E2E integration test that exercises the full lending flow from supply through health-factor warning.

The existing codebase has well-established patterns for all three streams. The Admin UI (`packages/admin`) uses Preact 10.x + `@preact/signals` with mock-based testing via `@testing-library/preact`. The Settings SSoT is `setting-keys.ts` where all keys are defined, and the `SettingsService` handles DB > config.toml > default fallback. The Actions page (`actions.tsx`) already has the BUILTIN_PROVIDERS card + toggle pattern that we will extend for Aave V3. E2E integration tests in the daemon use vitest with in-memory SQLite, mock providers, and the `ActionProviderRegistry` pattern established by `lido-staking-integration.test.ts`.

**Primary recommendation:** Follow existing patterns exactly -- add settings keys to `setting-keys.ts`, add Aave V3 to `BUILTIN_PROVIDERS` in `actions.tsx`, add a DeFi Positions section to the dashboard (or wallet detail staking tab pattern), and write an integration test using the mock provider + DB pattern from `health-factor-monitor.test.ts`.

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ADMN-01 | Admin dashboard에 DeFi 포지션 섹션 표시 (예치/차입 현황, HF, APY) | Dashboard pattern from `dashboard.tsx` (StatCard + Table), DeFi position DB schema (`defi_positions` table), API endpoint `GET /v1/wallet/positions` and `GET /v1/wallet/health-factor` already exist. Need admin-facing cross-wallet DeFi positions aggregation endpoint (masterAuth) similar to `GET /admin/wallets/:id/staking` pattern. |
| ADMN-02 | Admin Settings에서 `aave_v3.health_factor_warning_threshold` 설정 가능 | `setting-keys.ts` SSoT pattern. HealthFactorMonitor already has `updateConfig()` accepting `health_factor_warning_threshold`. Must add key to SETTING_DEFINITIONS and `SETTING_CATEGORIES`. |
| ADMN-03 | Admin Settings에서 `aave_v3.position_sync_interval_sec` 설정 가능 | `setting-keys.ts` SSoT pattern. PositionTracker `DEFAULT_INTERVALS` currently hardcoded. Needs settingsService integration (constructor already accepts `settingsService` parameter reserved for Phase 278). |
| ADMN-04 | Admin Settings에서 `aave_v3.max_ltv_pct` 설정 가능 | `setting-keys.ts` SSoT pattern. LendingPolicyEvaluator uses `max_ltv_pct` for borrow limit evaluation. |
| ADMN-05 | Admin Settings에서 `aave_v3.enabled` 토글로 프로바이더 활성화/비활성화 | `registerBuiltInProviders()` already reads `actions.aave_v3_enabled` but the key is NOT yet in `setting-keys.ts`. Must add it. Actions page `BUILTIN_PROVIDERS` array needs Aave V3 entry. |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Preact | 10.x | Admin UI framework | Project standard, already installed |
| @preact/signals | latest | Reactive state management | Project standard pattern in all admin pages |
| @testing-library/preact | latest | Component testing | All admin tests use this, mock-based pattern |
| vitest | latest | Test runner | Project-wide test framework |
| better-sqlite3 | latest | In-memory DB for integration tests | PositionTracker/HealthFactorMonitor tests use this |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @hono/zod-openapi | latest | Admin route definitions | For any new admin API endpoint (if needed) |
| drizzle-orm | latest | DB queries | For typed queries in admin routes |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New `/admin/defi/positions` endpoint | Reuse session-auth `/v1/wallet/positions` | Admin needs cross-wallet view (all wallets), sessionAuth is per-wallet. New masterAuth admin endpoint needed. |
| Separate DeFi Settings page | Extend Actions page | Actions page already has provider card + toggle + settings pattern. Extending is simpler and consistent. |

## Architecture Patterns

### Recommended Project Structure

```
Changes needed across:

packages/daemon/src/infrastructure/settings/
  setting-keys.ts             # +4 new setting definitions (aave_v3 category)

packages/admin/src/
  pages/actions.tsx            # +Aave V3 to BUILTIN_PROVIDERS array
  pages/dashboard.tsx          # +DeFi Positions section (or separate component)
  api/endpoints.ts             # +ADMIN_DEFI_POSITIONS endpoint
  utils/settings-helpers.ts    # +aave_v3 key labels in keyToLabel()

packages/daemon/src/api/routes/
  admin.ts                     # +GET /admin/defi/positions cross-wallet endpoint

packages/daemon/src/__tests__/
  aave-lending-e2e.test.ts     # E2E integration test

packages/admin/src/__tests__/
  defi-positions-dashboard.test.tsx   # Admin UI test for DeFi positions section
  actions-aave-v3.test.tsx            # Admin UI test for Aave V3 settings card
```

### Pattern 1: Settings Key Definition (setting-keys.ts SSoT)

**What:** Add new Aave V3 runtime-adjustable settings to the SSoT setting definitions.
**When to use:** ADMN-02 through ADMN-05
**Example:**

```typescript
// In setting-keys.ts SETTING_DEFINITIONS array:
// --- Aave V3 Lending ---
{ key: 'actions.aave_v3_enabled', category: 'actions', configPath: 'actions.aave_v3_enabled', defaultValue: 'true', isCredential: false },
{ key: 'actions.aave_v3_health_factor_warning_threshold', category: 'actions', configPath: 'actions.aave_v3_health_factor_warning_threshold', defaultValue: '1.2', isCredential: false },
{ key: 'actions.aave_v3_position_sync_interval_sec', category: 'actions', configPath: 'actions.aave_v3_position_sync_interval_sec', defaultValue: '300', isCredential: false },
{ key: 'actions.aave_v3_max_ltv_pct', category: 'actions', configPath: 'actions.aave_v3_max_ltv_pct', defaultValue: '0.8', isCredential: false },
```

Note: The `actions` category already exists in `SETTING_CATEGORIES`. No new category needed.

### Pattern 2: BUILTIN_PROVIDERS Card (actions.tsx)

**What:** Add Aave V3 entry to the static BUILTIN_PROVIDERS list in the Actions page.
**When to use:** ADMN-05
**Example:**

```typescript
// In actions.tsx BUILTIN_PROVIDERS array:
{
  key: 'aave_v3',
  name: 'Aave V3',
  description: 'EVM lending protocol (supply, borrow, repay, withdraw)',
  chain: 'evm',
  requiresApiKey: false,
  docsUrl: 'https://docs.aave.com/developers',
},
```

This follows the exact pattern of existing providers (Jupiter, 0x, LI.FI, Lido, Jito). The toggle binds to `actions.aave_v3_enabled`.

### Pattern 3: Dashboard DeFi Section (dashboard.tsx)

**What:** Add a DeFi Positions section below the stat cards and above Recent Activity.
**When to use:** ADMN-01
**Example approach:**

Two options:
1. **Option A: Dashboard section** -- Add a new section to the main dashboard that fetches cross-wallet positions from a new admin endpoint `GET /v1/admin/defi/positions`.
2. **Option B: Wallet detail tab** -- Add a "DeFi" tab to the wallet detail page (similar to the existing "Staking" tab in `wallets.tsx`).

**Recommended: Both.** Dashboard gets a summary (total portfolio value, worst HF), wallet detail gets full positions list. Dashboard calls a new admin endpoint that aggregates across wallets.

```typescript
// Dashboard section pattern -- similar to Agent Connection Prompt card:
<div class="prompt-card" style={{ marginTop: 'var(--space-4)' }}>
  <h3 style={{ marginBottom: 'var(--space-2)' }}>DeFi Positions</h3>
  <div class="stat-grid">
    <StatCard label="Total DeFi Value" value={formatUsd(totalValue)} />
    <StatCard label="Health Factor" value={worstHf.toFixed(2)} badge={hfBadge} />
    <StatCard label="Active Positions" value={positionCount.toString()} />
  </div>
  {/* Positions table */}
  <Table columns={defiColumns} data={positions} ... />
</div>
```

### Pattern 4: Admin Cross-Wallet DeFi Endpoint

**What:** New masterAuth admin endpoint for cross-wallet DeFi position summary.
**When to use:** ADMN-01 (dashboard data source)

```typescript
// GET /v1/admin/defi/positions
// Returns: { positions: DefiPosition[], totalValueUsd, worstHealthFactor }
// masterAuth, no wallet-specific session required
```

This follows the pattern of `GET /admin/wallets/:id/staking` but aggregated across all wallets.

### Pattern 5: E2E Integration Test

**What:** Full lending flow test: supply -> position sync -> HF check -> borrow -> HF warning.
**When to use:** E2E verification
**Example structure:**

```typescript
// Pattern from lido-staking-integration.test.ts + health-factor-monitor.test.ts
describe('Aave V3 Lending E2E', () => {
  let sqlite: DatabaseType;
  let registry: ActionProviderRegistry;

  // 1. Supply resolve -> ContractCallRequest
  // 2. Mock supply execution -> insert position in DB
  // 3. PositionTracker sync -> verify DB updated
  // 4. HealthFactorMonitor check -> verify SAFE
  // 5. Borrow resolve -> ContractCallRequest
  // 6. Mock borrow execution -> update HF to 1.15
  // 7. HealthFactorMonitor check -> verify LIQUIDATION_WARNING sent
});
```

### Anti-Patterns to Avoid
- **Adding Aave V3 settings keys outside SETTING_DEFINITIONS:** All setting keys MUST be in `setting-keys.ts`. The daemon SettingsService rejects unknown keys.
- **Using a new settings category for Aave V3:** Reuse the `actions` category. All DeFi providers use `actions.*_enabled` convention.
- **Fetching positions client-side from session endpoints:** The dashboard needs masterAuth, not sessionAuth. Create a proper admin endpoint.
- **Hardcoding DeFi settings values in the Admin UI:** Use the SettingsService fallback chain (DB > config.toml > default).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Settings key management | Custom settings storage | `setting-keys.ts` SETTING_DEFINITIONS + SettingsService | SSoT pattern, encryption, fallback chain already built |
| Provider toggle | Custom enable/disable logic | `BUILTIN_PROVIDERS` + `handleToggle()` in actions.tsx | Established pattern with toast, error handling |
| Position DB queries | ORM queries for positions | Direct SQL via `sqlite.prepare()` | Existing pattern in `defi-positions.ts`, performance |
| Health factor display | Custom severity logic | `classifySeverity()` from HealthFactorMonitor | Consistent thresholds |
| Admin test mocking | Real API calls | `vi.mock('../api/client')` pattern | All 36 admin test files use this pattern |

**Key insight:** Every piece of this phase has a direct precedent in the codebase. The settings pattern (`lido_staking_enabled`), the Actions page card pattern (`BUILTIN_PROVIDERS`), the dashboard section pattern (`StatCard`), and the E2E test pattern (`lido-staking-integration.test.ts`) are all established. Follow them.

## Common Pitfalls

### Pitfall 1: Forgetting to add setting keys to setting-keys.ts
**What goes wrong:** `SettingsService.get('actions.aave_v3_enabled')` throws `Unknown setting key` because the key isn't defined.
**Why it happens:** The key is used in `registerBuiltInProviders()` but was never added to the SSoT.
**How to avoid:** Add ALL four Aave V3 settings to `SETTING_DEFINITIONS` before testing the Actions page.
**Warning signs:** `ACTION_VALIDATION_FAILED: Unknown setting key` in daemon logs.

### Pitfall 2: Settings key naming inconsistency
**What goes wrong:** Admin UI reads `aave_v3.health_factor_warning_threshold` but setting-keys defines `actions.aave_v3_health_factor_warning_threshold`.
**Why it happens:** Objective doc uses dot notation (`aave_v3.health_factor_warning_threshold`) while the SSoT uses flat snake_case under the `actions` category.
**How to avoid:** Stick to the existing pattern: `actions.{provider}_{setting}`. The objective doc's `aave_v3.X` notation means `actions.aave_v3_X` in implementation.
**Warning signs:** Settings not showing up in the Admin UI after save.

### Pitfall 3: keyToLabel missing entries
**What goes wrong:** Admin Settings page shows raw keys like `aave_v3_health_factor_warning_threshold` instead of human-readable labels.
**Why it happens:** Forgot to add entries to `keyToLabel()` in `settings-helpers.ts`.
**How to avoid:** Add labels for all 4 new keys in the `map` object inside `keyToLabel()`.
**Warning signs:** Raw underscore-separated keys visible in the UI.

### Pitfall 4: PositionTracker settingsService not wired
**What goes wrong:** Changing `position_sync_interval_sec` in Admin Settings has no effect.
**Why it happens:** PositionTracker constructor accepts `settingsService` but it's "reserved for Phase 278" -- currently unused.
**How to avoid:** Wire the settingsService to read `actions.aave_v3_position_sync_interval_sec` and use it to override `DEFAULT_INTERVALS.LENDING`.
**Warning signs:** Position sync always runs at 5min regardless of setting changes.

### Pitfall 5: Coverage threshold drops from new untested code
**What goes wrong:** Admin package coverage drops below 77% branches / 70% functions / 84% lines threshold.
**Why it happens:** New page components added without corresponding tests.
**How to avoid:** Write admin UI tests for every new component/section. The threshold is enforced in `packages/admin/vitest.config.ts`.
**Warning signs:** CI failure with "coverage below threshold" message.

### Pitfall 6: E2E test not covering the full notification flow
**What goes wrong:** Test verifies position creation but not the HF warning notification.
**Why it happens:** Mock NotificationService not properly asserted.
**How to avoid:** Mock both NotificationService.notify and PositionTracker.syncCategory. Assert that `notify('LIQUIDATION_WARNING', ...)` is called with the correct wallet ID and variables.
**Warning signs:** E2E test passes but doesn't actually test the warning path.

## Code Examples

### Setting Key Definitions (to add in setting-keys.ts)

```typescript
// Source: existing pattern from actions.lido_staking_* entries
// --- Aave V3 Lending ---
{ key: 'actions.aave_v3_enabled', category: 'actions', configPath: 'actions.aave_v3_enabled', defaultValue: 'true', isCredential: false },
{ key: 'actions.aave_v3_health_factor_warning_threshold', category: 'actions', configPath: 'actions.aave_v3_health_factor_warning_threshold', defaultValue: '1.2', isCredential: false },
{ key: 'actions.aave_v3_position_sync_interval_sec', category: 'actions', configPath: 'actions.aave_v3_position_sync_interval_sec', defaultValue: '300', isCredential: false },
{ key: 'actions.aave_v3_max_ltv_pct', category: 'actions', configPath: 'actions.aave_v3_max_ltv_pct', defaultValue: '0.8', isCredential: false },
```

### BUILTIN_PROVIDERS entry (to add in actions.tsx)

```typescript
// Source: existing pattern from BUILTIN_PROVIDERS array
{
  key: 'aave_v3',
  name: 'Aave V3 Lending',
  description: 'EVM lending protocol (supply, borrow, repay, withdraw)',
  chain: 'evm',
  requiresApiKey: false,
  docsUrl: 'https://docs.aave.com/developers',
},
```

### keyToLabel entries (to add in settings-helpers.ts)

```typescript
// Source: existing keyToLabel map in settings-helpers.ts
aave_v3_enabled: 'Aave V3 Enabled',
aave_v3_health_factor_warning_threshold: 'HF Warning Threshold',
aave_v3_position_sync_interval_sec: 'Position Sync Interval (seconds)',
aave_v3_max_ltv_pct: 'Max LTV Percentage',
```

### Admin Defi Positions Endpoint (new in admin.ts)

```typescript
// Source: GET /admin/wallets/:id/staking pattern
const adminDefiPositionsRoute = createRoute({
  method: 'get',
  path: '/admin/defi/positions',
  tags: ['Admin'],
  summary: 'Get all DeFi positions across wallets',
  responses: {
    200: {
      description: 'All active DeFi positions with aggregated totals',
      content: { 'application/json': { schema: AdminDefiPositionsResponseSchema } },
    },
  },
});
```

### Dashboard DeFi Section

```typescript
// Source: StatCard pattern from dashboard.tsx
function DefiSection({ positions, loading }: { positions: DefiPositionSummary; loading: boolean }) {
  const worstHf = positions.worstHealthFactor;
  const hfBadge = worstHf < 1.2 ? 'danger' : worstHf < 1.5 ? 'warning' : 'success';

  return (
    <div style={{ marginTop: 'var(--space-4)' }}>
      <h3 style={{ marginBottom: 'var(--space-3)' }}>DeFi Positions</h3>
      <div class="stat-grid">
        <StatCard label="Total DeFi Value" value={formatUsd(positions.totalValueUsd)} loading={loading} />
        <StatCard label="Worst Health Factor" value={worstHf.toFixed(2)} loading={loading} badge={hfBadge} />
        <StatCard label="Active Positions" value={positions.count.toString()} loading={loading} />
      </div>
    </div>
  );
}
```

### E2E Test Pattern

```typescript
// Source: lido-staking-integration.test.ts + health-factor-monitor.test.ts hybrid
describe('Aave V3 Lending E2E flow', () => {
  let sqlite: DatabaseType;

  beforeEach(() => {
    sqlite = createDatabase(':memory:');
    pushSchema(sqlite);
    insertTestWallet(sqlite, 'wallet-1');
  });

  it('supply -> position-sync -> health-check -> borrow -> HF-warning', async () => {
    // 1. Register provider
    const registry = new ActionProviderRegistry();
    const reader = makeSettingsReader({ 'actions.aave_v3_enabled': 'true' });
    registerBuiltInProviders(registry, reader, { rpcCaller: mockRpcCaller });

    // 2. Resolve supply -> verify ContractCallRequest
    const supplyResult = await registry.executeResolve('aave_v3/aave_supply', {...}, context);
    expect(supplyResult).toHaveLength(2); // approve + supply

    // 3. Mock position in DB (simulating post-supply)
    insertPosition(sqlite, 'wallet-1', 2.5);

    // 4. HealthFactorMonitor check -> SAFE
    const monitor = new HealthFactorMonitor({ sqlite, notificationService: mockNotif });
    await monitor.checkAllPositions();
    expect(mockNotif.notify).not.toHaveBeenCalled();

    // 5. Update HF to 1.15 (simulating borrow impact)
    updatePositionHF(sqlite, 'pos-1', 1.15);

    // 6. HealthFactorMonitor check -> LIQUIDATION_WARNING
    await monitor.checkAllPositions();
    expect(mockNotif.notify).toHaveBeenCalledWith('LIQUIDATION_WARNING', 'wallet-1', expect.any(Object));
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hard-coded config | Admin Settings SSoT (`setting-keys.ts`) | v1.4.4 (Phase 100) | All runtime settings use DB > config.toml > default chain |
| Separate settings page | Function-grouped pages (Actions, Security, System) | v2.3 (Phase 182) | Settings distributed across domain pages |
| Per-provider custom UI | BUILTIN_PROVIDERS static array | v1.4.4 (Phase 100) | Consistent card + toggle pattern for all DeFi providers |

## Open Questions

1. **Admin DeFi positions endpoint scope**
   - What we know: Dashboard needs cross-wallet aggregation (masterAuth). Session endpoints are per-wallet (sessionAuth).
   - What's unclear: Should the admin endpoint return positions for ALL wallets or accept a wallet_id filter? Should it include a cross-wallet health factor summary?
   - Recommendation: Return all wallets' positions with optional `?wallet_id=` filter. Include `worstHealthFactor` and `totalValueUsd` aggregates. Follow the `GET /admin/transactions` cross-wallet pattern.

2. **PositionTracker settings hot-reload**
   - What we know: PositionTracker constructor already accepts `settingsService` (reserved for Phase 278). Changing `position_sync_interval_sec` should take effect without daemon restart.
   - What's unclear: Should we restart timers on settings change, or just read the new interval on next timer fire?
   - Recommendation: Read the setting value each time `start()` is called or when a new sync cycle starts. If settings change, the new interval takes effect after the current cycle completes. No need for a change listener -- the next timer tick will pick up the new value.

3. **HealthFactorMonitor config hot-reload**
   - What we know: HealthFactorMonitor has `updateConfig()` method. Settings changes should propagate.
   - What's unclear: How to wire the SettingsService change to the monitor's `updateConfig()`.
   - Recommendation: Have the admin settings PUT handler call `healthFactorMonitor.updateConfig()` after saving, or have the monitor read from SettingsService directly on each check cycle (simpler, lower coupling).

4. **Actions page Aave V3 settings fields**
   - What we know: Current BUILTIN_PROVIDERS cards show only enabled toggle + API key. Aave V3 has 3 additional settings (HF threshold, sync interval, max LTV) beyond the toggle.
   - What's unclear: Should these additional settings appear inline in the card, or in a separate expandable section?
   - Recommendation: Add an "Advanced Settings" section within the Aave V3 card body (below the toggle, above the actions table). Use FormField components for each setting with immediate save (like the notifications settings pattern). This keeps all Aave V3 config in one place.

## Sources

### Primary (HIGH confidence)
- `packages/daemon/src/infrastructure/settings/setting-keys.ts` -- SSoT for all setting definitions, naming conventions
- `packages/admin/src/pages/actions.tsx` -- BUILTIN_PROVIDERS pattern for provider card + toggle
- `packages/admin/src/pages/dashboard.tsx` -- StatCard + Table pattern for dashboard sections
- `packages/admin/src/utils/settings-helpers.ts` -- keyToLabel, getEffectiveValue helpers
- `packages/daemon/src/services/defi/position-tracker.ts` -- PositionTracker with settingsService reservation
- `packages/daemon/src/services/monitoring/health-factor-monitor.ts` -- HF monitor with updateConfig()
- `packages/daemon/src/api/routes/defi-positions.ts` -- Session-auth position + HF endpoints
- `packages/daemon/src/api/routes/admin.ts` -- Admin endpoint patterns (staking, transactions)
- `packages/daemon/src/__tests__/health-factor-monitor.test.ts` -- HF monitor test pattern
- `packages/daemon/src/__tests__/lido-staking-integration.test.ts` -- Integration test pattern with ActionProviderRegistry
- `packages/admin/src/__tests__/actions.test.tsx` -- Admin UI test pattern with mock API
- `packages/actions/src/index.ts` -- registerBuiltInProviders with aave_v3 entry using `actions.aave_v3_enabled`

### Secondary (MEDIUM confidence)
- `packages/admin/vitest.config.ts` -- Coverage thresholds (77% branches, 70% functions, 84% lines, 84% statements)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries/patterns already established in codebase
- Architecture: HIGH -- every component has a direct precedent in existing code
- Pitfalls: HIGH -- based on observed gaps in actual codebase (missing setting keys, unfinished settingsService wiring)

**Research date:** 2026-02-27
**Valid until:** 2026-03-27 (stable patterns, internal project)
