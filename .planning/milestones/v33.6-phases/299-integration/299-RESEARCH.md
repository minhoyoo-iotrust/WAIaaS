# Phase 299: 통합 (Integration) - Research

**Researched:** 2026-03-02
**Domain:** Drift Perp Trading cross-interface integration (MCP, Admin Settings, Admin UI, Skill, SDK, Positions API, Provider Registration)
**Confidence:** HIGH

## Summary

Phase 299 integrates the already-implemented DriftPerpProvider (from Phase 298) across all 7 WAIaaS interfaces. The provider code in `packages/actions/src/providers/drift/index.ts` is complete with 5 actions, IPerpProvider, and IPositionProvider implementations. However, it is NOT yet wired into `registerBuiltInProviders()`, NOT listed in the Admin UI BUILTIN_PROVIDERS array, NOT in the hot-reload BUILTIN_NAMES, NOT documented in actions.skill.md, and the positions endpoint only queries DB cache (no PERP-specific handling needed -- PositionTracker already supports PERP category via generic IPositionProvider duck-typing in daemon.ts Step 4f-5).

All 7 integration points follow well-established patterns from prior providers (Jupiter, 0x, LiFi, Lido, Jito, Aave V3, Kamino, Pendle). The key insight is that each integration is a mechanical copy-adapt of existing patterns, with Drift-specific values substituted.

**Primary recommendation:** Follow the Pendle integration pattern exactly (most recent provider, same scope), adapting for Drift's 5 settings and 5 actions on Solana chain.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INTG-01 | MCP 5 tools auto-exposed | `mcpExpose: true` already set on DriftPerpProvider metadata. MCP auto-registration via `registerActionProviderTools()` reads `GET /v1/actions/providers` and creates tools for mcpExpose=true providers. **No MCP code changes needed** -- it's fully automatic once provider is registered. |
| INTG-02 | Admin Settings 5 keys runtime adjustable | 5 Drift settings already defined in `setting-keys.ts` (lines 222-227). `DaemonConfigSchema` does NOT include drift keys (settings-only pattern like Pendle). Hot-reload already triggers `reloadActionProviders()` for any `actions.*` key change. **BUILTIN_NAMES list in hot-reload.ts needs `drift_perp` added.** |
| INTG-03 | Admin UI Drift Perp Trading card | Add entry to `BUILTIN_PROVIDERS` array in `packages/admin/src/pages/actions.tsx`. Add advanced settings block for drift-specific keys (like Aave V3/Kamino pattern). |
| INTG-04 | actions.skill.md Drift section | Add section 11 "Drift Perp Trading" following Pendle section 10 format. 5 actions, configuration table, risk levels, MCP tool names. |
| INTG-05 | TS/Python SDK executeAction | Both SDKs already have generic `executeAction(provider, action, params)` methods. **No SDK code changes needed** -- Drift works via existing generic action dispatch. |
| INTG-06 | GET /v1/wallets/:id/positions PERP integration | Positions route reads from `defi_positions` DB table by walletId+status='ACTIVE'. PositionTracker syncs PERP category every 60s (DEFAULT_INTERVALS.PERP). DriftPerpProvider implements IPositionProvider.getPositions(). **No route code changes needed** -- integration is via PositionTracker automatic registration in daemon.ts Step 4f-5. |
| INTG-07 | registerBuiltInProviders auto-registration | Add `drift_perp` entry to `registerBuiltInProviders()` in `packages/actions/src/index.ts`. Import DriftPerpProvider, read 5 settings from SettingsReader. |
</phase_requirements>

## Standard Stack

### Core (No New Dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @waiaas/actions | current | DriftPerpProvider already implemented | Phase 298 output |
| @waiaas/core | current | IPerpProvider, IPositionProvider, ActionDefinition types | Existing types |
| Preact + @preact/signals | 10.x | Admin UI Actions page | Existing Admin stack |

### Supporting

No new libraries needed. All integration is within existing code.

## Architecture Patterns

### Pattern 1: registerBuiltInProviders Entry (INTG-07)

**What:** Add Drift entry to the providers array in `packages/actions/src/index.ts`.
**When to use:** Every new built-in DeFi provider.
**Example (from Pendle, adapted for Drift):**
```typescript
// Source: packages/actions/src/index.ts lines 222-236 (Pendle pattern)
{
  key: 'drift_perp',
  enabledKey: 'actions.drift_enabled',
  factory: () => {
    const config: DriftConfig = {
      enabled: true,
      subAccount: 0,
    };
    return new DriftPerpProvider(config);
  },
},
```

**Key differences from other providers:**
- DriftConfig is minimal (just `enabled` + `subAccount`) -- no API key, no slippage settings
- Drift settings (`drift_max_leverage`, `drift_max_position_usd`, etc.) are policy/monitoring parameters, NOT constructor config
- The 5 Admin Settings keys are read by MarginMonitor and position sync, not by the provider factory

### Pattern 2: Hot-Reload BUILTIN_NAMES Update (INTG-02)

**What:** Add `drift_perp` to `BUILTIN_NAMES` array in `hot-reload.ts`.
**Source:** `packages/daemon/src/infrastructure/settings/hot-reload.ts` line 474
```typescript
const BUILTIN_NAMES = [
  'jupiter_swap', 'zerox_swap', 'lifi',
  'lido_staking', 'jito_staking',
  'aave_v3', 'kamino',
  'pendle_yield', 'drift_perp',  // <-- add both missing entries
];
```

**Critical note:** `pendle_yield` is also missing from this list (pre-existing gap). Should be fixed alongside Drift.

### Pattern 3: Admin UI BUILTIN_PROVIDERS Card (INTG-03)

**What:** Add static card definition to `packages/admin/src/pages/actions.tsx`.
**Source pattern:** Lines 24-33 (BUILTIN_PROVIDERS array)
```typescript
{
  key: 'drift_perp',
  name: 'Drift Perp',
  description: 'Solana perpetual futures trading (open, close, modify positions with leverage)',
  chain: 'solana',
  requiresApiKey: false,
  docsUrl: 'https://docs.drift.trade',
},
```

**Advanced settings block:** Add Drift-specific advanced settings when enabled (like Aave V3 pattern at line 348):
- `drift_max_leverage` (default 5)
- `drift_max_position_usd` (default 10000)
- `drift_margin_warning_threshold_pct` (default 0.15)
- `drift_position_sync_interval_sec` (default 60)

### Pattern 4: MCP Auto-Exposure (INTG-01) -- Zero Code Change

**What:** `mcpExpose: true` on DriftPerpProvider metadata triggers automatic MCP tool registration.
**How:** `registerActionProviderTools()` in `packages/mcp/src/tools/action-provider.ts` fetches `GET /v1/actions/providers`, filters `mcpExpose=true`, and registers tools with naming `action_{provider}_{action}`.

Expected 5 MCP tools:
- `action_drift_perp_drift_open_position`
- `action_drift_perp_drift_close_position`
- `action_drift_perp_drift_modify_position`
- `action_drift_perp_drift_add_margin`
- `action_drift_perp_drift_withdraw_margin`

### Pattern 5: actions.skill.md Section (INTG-04)

**What:** Add section 11 documenting Drift Perp Trading.
**Format:** Follow section 10 (Pendle) format exactly.
**Content requirements:**
- Configuration table (5 settings with env vars and defaults)
- 5 action descriptions with params tables
- Risk levels and default tiers
- MCP tool names
- Security notice

### Pattern 6: PositionTracker Auto-Registration (INTG-06) -- Zero Code Change

**What:** DriftPerpProvider already implements IPositionProvider interface. Daemon lifecycle Step 4f-5 automatically duck-type checks all registered providers for `getPositions`, `getSupportedCategories`, and `getProviderName` methods. DriftPerpProvider passes all three checks.

```typescript
// Source: packages/daemon/src/lifecycle/daemon.ts Step 4f-5
if (provider && 'getPositions' in provider && 'getSupportedCategories' in provider && 'getProviderName' in provider) {
  this.positionTracker.registerProvider(provider as unknown as IPositionProvider);
}
```

PositionTracker polls PERP category every 60 seconds (`DEFAULT_INTERVALS.PERP = 60_000`).

### Pattern 7: SDK executeAction (INTG-05) -- Zero Code Change

**What:** Both TS and Python SDKs have generic `executeAction(provider, action, params)` methods.

TS SDK:
```typescript
await client.executeAction('drift_perp', 'drift_open_position', {
  params: { market: 'SOL-PERP', direction: 'LONG', size: '100', orderType: 'MARKET' },
});
```

Python SDK:
```python
await client.execute_action('drift_perp', 'drift_open_position', params={
    'market': 'SOL-PERP', 'direction': 'LONG', 'size': '100', 'orderType': 'MARKET',
})
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MCP tool registration | Custom MCP tool definitions | `registerActionProviderTools()` auto-conversion | Reads mcpExpose=true from REST API, creates tools automatically |
| Position sync | Custom cron job | PositionTracker + IPositionProvider | Duck-type auto-detection in daemon lifecycle |
| Settings hot-reload | Manual restart | `reloadActionProviders()` via HotReloadOrchestrator | Settings key prefix match triggers auto-reload |
| SDK integration | New SDK methods | Existing `executeAction(provider, action, params)` | Generic action dispatch handles all providers uniformly |

**Key insight:** The Action Provider framework is designed for zero-touch interface integration. Most integration is mechanical: register the provider, and MCP/positions/SDK work automatically.

## Common Pitfalls

### Pitfall 1: BUILTIN_NAMES Missing Entry in hot-reload.ts
**What goes wrong:** Provider cannot be toggled on/off at runtime without daemon restart.
**Why it happens:** The BUILTIN_NAMES array is a separate hardcoded list from registerBuiltInProviders. Both must be updated.
**How to avoid:** Always update BUILTIN_NAMES when adding to registerBuiltInProviders.
**Warning signs:** `actions.drift_enabled` toggle has no effect until restart.

### Pitfall 2: Provider Name Mismatch Between Registration and Admin UI
**What goes wrong:** Admin UI shows "Inactive" even when provider is enabled.
**Why it happens:** `isRegistered()` uses fuzzy name matching against `BUILTIN_PROVIDERS[].key` and provider metadata `name`. If key='drift_perp' but metadata.name='drift_perp', the matching logic works. But if there's a mismatch (e.g., key='drift' vs name='drift_perp'), it breaks.
**How to avoid:** Use consistent naming: key='drift_perp' in BUILTIN_PROVIDERS, name='drift_perp' in metadata, enabledKey='actions.drift_enabled' in settings.
**Warning signs:** Badge shows "Inactive" when logs show "drift_perp registered".

### Pitfall 3: DriftConfig Simplicity vs Admin Settings Complexity
**What goes wrong:** Trying to pass Admin Settings values into DriftConfig constructor when they're not constructor params.
**Why it happens:** Other providers (Jupiter, Pendle) read many settings in the factory function. Drift's constructor only needs `{ enabled: true, subAccount: 0 }`.
**How to avoid:** The 5 Admin Settings keys (drift_max_leverage, drift_max_position_usd, etc.) are consumed by MarginMonitor/PositionTracker, NOT by the provider factory.
**Warning signs:** Unused settingsReader.get() calls in the Drift factory function.

### Pitfall 4: Pendle Missing from BUILTIN_NAMES (Pre-existing Bug)
**What goes wrong:** Pendle provider hot-reload does not work -- toggle requires restart.
**Why it happens:** `pendle_yield` was never added to the BUILTIN_NAMES list in hot-reload.ts.
**How to avoid:** Fix alongside Drift addition. Both `pendle_yield` and `drift_perp` need to be added.
**Warning signs:** Hot-reload logs show "0 disabled" for pendle when it should show "pendle_yield disabled".

### Pitfall 5: actions.skill.md Tag List Not Updated
**What goes wrong:** Skill file is not discoverable by AI agents searching for "drift" or "perp" capabilities.
**Why it happens:** Frontmatter `tags` array must be updated alongside the section content.
**How to avoid:** Add drift, perp, perpetual, leverage tags to the frontmatter.

## Code Examples

### 1. registerBuiltInProviders Drift Entry
```typescript
// Source: packages/actions/src/index.ts (add after pendle_yield entry at line 237)
import { DriftPerpProvider } from './providers/drift/index.js';
import type { DriftConfig } from './providers/drift/config.js';

// In providers array:
{
  key: 'drift_perp',
  enabledKey: 'actions.drift_enabled',
  factory: () => {
    const config: DriftConfig = {
      enabled: true,
      subAccount: 0,
    };
    return new DriftPerpProvider(config);
  },
},
```

### 2. Re-export from @waiaas/actions index
```typescript
// Source: packages/actions/src/index.ts (add after Pendle re-exports)
export { DriftPerpProvider } from './providers/drift/index.js';
export { DRIFT_DEFAULTS, DRIFT_PROGRAM_ID } from './providers/drift/config.js';
export type { DriftConfig } from './providers/drift/config.js';
export { MockDriftSdkWrapper } from './providers/drift/drift-sdk-wrapper.js';
export type { IDriftSdkWrapper, DriftInstruction, DriftPosition, DriftMarginInfo } from './providers/drift/drift-sdk-wrapper.js';
```

### 3. Admin UI BUILTIN_PROVIDERS Card
```typescript
// Source: packages/admin/src/pages/actions.tsx BUILTIN_PROVIDERS array
{
  key: 'drift_perp',
  name: 'Drift Perp',
  description: 'Solana perpetual futures trading (open, close, modify positions with leverage)',
  chain: 'solana',
  requiresApiKey: false,
  docsUrl: 'https://docs.drift.trade',
},
```

### 4. Admin UI Advanced Settings Block (Drift-specific)
```tsx
{/* Drift Perp Advanced Settings -- only when Drift is enabled */}
{bp.key === 'drift_perp' && enabled && (
  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
    <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-2)', color: 'var(--text-secondary)' }}>
      Advanced Settings
    </div>
    {(['drift_max_leverage', 'drift_max_position_usd', 'drift_margin_warning_threshold_pct', 'drift_position_sync_interval_sec'] as const).map((shortKey) => {
      const cat = settings.value['actions'] as Record<string, string> | undefined;
      const currentValue = advancedDirty.value[shortKey] ?? cat?.[shortKey] ?? '';
      return (
        <div key={shortKey} style={{ marginBottom: 'var(--space-2)' }}
          onBlur={() => {
            const val = advancedDirty.value[shortKey];
            if (val !== undefined) void handleAdvancedSave(shortKey, val);
          }}>
          <FormField label={keyToLabel(shortKey)} name={`actions.${shortKey}`} type="text"
            value={currentValue} onChange={(v) => { advancedDirty.value = { ...advancedDirty.value, [shortKey]: String(v) }; }} />
        </div>
      );
    })}
  </div>
)}
```

### 5. settings-helpers.ts Label Additions
```typescript
// Add to keyToLabel map in packages/admin/src/utils/settings-helpers.ts
drift_enabled: 'Drift Perp Enabled',
drift_max_leverage: 'Max Leverage',
drift_max_position_usd: 'Max Position Size (USD)',
drift_margin_warning_threshold_pct: 'Margin Warning Threshold (%)',
drift_position_sync_interval_sec: 'Position Sync Interval (seconds)',
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual MCP tool registration | mcpExpose=true auto-registration | v1.5 (Phase 129) | Zero MCP code for new providers |
| Config.toml DeFi settings | Admin Settings only (SettingsService) | v28.8 (Phase 265) | No config schema changes needed |
| Manual PositionTracker registration | Duck-type auto-detection in daemon lifecycle | v29.0 (Phase 274) | Zero position code for new IPositionProvider |

## Open Questions

1. **BUILTIN_NAMES gap for pendle_yield**
   - What we know: `pendle_yield` is missing from the BUILTIN_NAMES array in hot-reload.ts
   - What's unclear: Whether this was intentional or a bug from Phase 290
   - Recommendation: Fix alongside drift_perp addition (low risk, high consistency benefit)

2. **Drift position_sync_interval_sec runtime override**
   - What we know: PositionTracker reads `actions.aave_v3_position_sync_interval_sec` for LENDING category interval override
   - What's unclear: Whether Drift's `actions.drift_position_sync_interval_sec` should similarly override PERP category interval
   - Recommendation: Not needed for Phase 299 (the default 60s PERP interval is appropriate). Can be added later if needed.

## File Change Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `packages/actions/src/index.ts` | MODIFY | Add DriftPerpProvider import, re-exports, registerBuiltInProviders entry |
| `packages/daemon/src/infrastructure/settings/hot-reload.ts` | MODIFY | Add `drift_perp` (and `pendle_yield`) to BUILTIN_NAMES |
| `packages/admin/src/pages/actions.tsx` | MODIFY | Add Drift card to BUILTIN_PROVIDERS, add advanced settings block |
| `packages/admin/src/utils/settings-helpers.ts` | MODIFY | Add drift setting key labels to keyToLabel map |
| `skills/actions.skill.md` | MODIFY | Add section 11 Drift Perp Trading, update frontmatter tags |
| `packages/skills/skills/actions.skill.md` | MODIFY | Mirror of skills/actions.skill.md |

**No changes needed:**
- `packages/mcp/src/tools/action-provider.ts` -- auto-registration handles it
- `packages/sdk/src/client.ts` -- generic executeAction works
- `python-sdk/waiaas/client.py` -- generic execute_action works
- `packages/daemon/src/api/routes/defi-positions.ts` -- reads from DB cache
- `packages/daemon/src/services/defi/position-tracker.ts` -- auto-detects IPositionProvider
- `packages/daemon/src/lifecycle/daemon.ts` -- Step 4f-5 auto-registers
- `packages/daemon/src/infrastructure/settings/setting-keys.ts` -- 5 drift keys already defined
- `packages/daemon/src/api/routes/actions.ts` -- generic action route handles all providers

## Sources

### Primary (HIGH confidence)
- `packages/actions/src/index.ts` -- registerBuiltInProviders pattern, provider array structure
- `packages/actions/src/providers/drift/index.ts` -- DriftPerpProvider implementation, metadata, actions
- `packages/daemon/src/infrastructure/settings/hot-reload.ts` -- BUILTIN_NAMES, reloadActionProviders
- `packages/daemon/src/infrastructure/settings/setting-keys.ts` -- 5 drift setting definitions
- `packages/daemon/src/lifecycle/daemon.ts` -- Step 4f-5 IPositionProvider auto-registration
- `packages/mcp/src/tools/action-provider.ts` -- mcpExpose auto-registration
- `packages/admin/src/pages/actions.tsx` -- BUILTIN_PROVIDERS array, card rendering
- `packages/daemon/src/api/routes/defi-positions.ts` -- positions DB query (category-agnostic)
- `packages/sdk/src/client.ts` -- executeAction generic method
- `python-sdk/waiaas/client.py` -- execute_action generic method

### Secondary (MEDIUM confidence)
- `packages/admin/src/utils/settings-helpers.ts` -- keyToLabel map for Admin UI
- `skills/actions.skill.md` -- current skill file content structure

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all patterns directly observed in codebase
- Architecture: HIGH - 8 prior providers follow identical integration patterns
- Pitfalls: HIGH - identified from code inspection (BUILTIN_NAMES gap confirmed)

**Research date:** 2026-03-02
**Valid until:** 2026-04-02 (stable patterns, no external dependency changes expected)
