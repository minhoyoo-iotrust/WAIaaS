# Phase 227: Config + Settings + Notifications - Research

**Researched:** 2026-02-22
**Domain:** WAIaaS daemon configuration pipeline (config.toml + SettingsService + HotReload) + notification event type system + i18n message templates
**Confidence:** HIGH

## Summary

Phase 227 connects the incoming transaction monitoring subsystem (built in Phases 224-226) to the operator-facing configuration and notification systems. The work spans three layers: (1) adding a `[incoming]` section to the DaemonConfigSchema Zod schema and KNOWN_SECTIONS in `loader.ts` so that `config.toml` parsing and `WAIAAS_INCOMING_*` environment variable overrides work, (2) verifying and completing the SettingsService + HotReloadOrchestrator integration (7 incoming.* keys were already registered in Phase 226-04, but config.toml layer is missing), and (3) adding `TX_INCOMING` and `TX_INCOMING_SUSPICIOUS` to the `NotificationEventType` enum in `@waiaas/core` with en/ko i18n message templates, plus fixing the monitor service to use these canonical names instead of the interim string literals.

The codebase has clear precedent patterns for all three areas. The `[telegram]` and `[display]` sections in `DaemonConfigSchema` demonstrate the exact pattern for adding a new config section. The `BalanceMonitorService` hot-reload path shows how to wire `reloadIncomingMonitor()` (already done in Phase 226-04). The notification templates in `en.ts`/`ko.ts` demonstrate the `{title, body}` pattern with `{variable}` interpolation placeholders.

**Primary recommendation:** Add `[incoming]` to DaemonConfigSchema + KNOWN_SECTIONS, add 2 NotificationEventType entries + i18n templates, fix monitor service notification type names from `INCOMING_TX_DETECTED`/`INCOMING_TX_SUSPICIOUS` to `TX_INCOMING`/`TX_INCOMING_SUSPICIOUS`, add `TX_INCOMING_SUSPICIOUS` to BROADCAST_EVENTS, and add IncomingSettings component to Admin UI.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CFG-01 | config.toml [incoming] section with 7 keys (enabled, mode, poll_interval, retention_days, suspicious_dust_usd, suspicious_amount_multiplier, wss_url) | DaemonConfigSchema needs `incoming` z.object() added; KNOWN_SECTIONS needs `'incoming'`; 7 flat keys with Zod defaults. Note: existing setting-keys.ts has `cooldown_minutes` instead of `mode` -- the actual 7 keys are: enabled, poll_interval, retention_days, suspicious_dust_usd, suspicious_amount_multiplier, cooldown_minutes, wss_url (matching setting-keys.ts) |
| CFG-02 | SettingsService registers 'incoming' category with 7 setting keys supporting hot-reload | **Already done in Phase 226-04.** 7 keys in setting-keys.ts lines 144-152, category 'incoming' in SETTING_CATEGORIES line 45. Verification only needed. |
| CFG-03 | HotReloadOrchestrator handles incoming.* key changes by restarting monitor with new settings | **Already done in Phase 226-04.** `INCOMING_KEYS_PREFIX`, `hasIncomingChanges`, and `reloadIncomingMonitor()` all exist in hot-reload.ts. Verification only needed. |
| CFG-05 | Environment variable mapping follows WAIAAS_INCOMING_* pattern for all 7 config keys | `applyEnvOverrides` in loader.ts auto-maps `WAIAAS_{SECTION}_{KEY}` when the section is in KNOWN_SECTIONS. Adding `'incoming'` to KNOWN_SECTIONS enables this automatically. |
| EVT-02 | NotificationEventType adds TX_INCOMING and TX_INCOMING_SUSPICIOUS (28 to 30 total) | Add 2 entries to NOTIFICATION_EVENT_TYPES array in `packages/core/src/enums/notification.ts`. Update enums.test.ts count from 28 to 30. Fix monitor service notification type names. |
| EVT-06 | i18n message templates (en/ko) for TX_INCOMING and TX_INCOMING_SUSPICIOUS notification types | Add entries to `en.ts` and `ko.ts` notifications objects. Messages interface enforces key parity via `Record<NotificationEventType, {title: string; body: string}>`. |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | 3.x | DaemonConfigSchema SSoT for config.toml | Project-wide SSoT rule (CLAUDE.md) |
| smol-toml | - | TOML parsing in config loader | Already used in loader.ts |
| @waiaas/core | workspace | NotificationEventType enum, i18n messages | Central type package |
| vitest | 3.x | Testing framework | Project standard |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| preact | 10.x | Admin UI incoming settings panel | Settings page component |
| @preact/signals | - | Reactive state for Admin settings | Form field binding |

### Alternatives Considered

None -- all patterns are established in the codebase.

## Architecture Patterns

### Recommended File Structure

```
packages/
  core/src/
    enums/notification.ts          # Add TX_INCOMING, TX_INCOMING_SUSPICIOUS
    i18n/en.ts                     # Add 2 notification templates
    i18n/ko.ts                     # Add 2 notification templates
  daemon/src/
    infrastructure/config/loader.ts    # Add [incoming] Zod schema + KNOWN_SECTIONS
    services/incoming/incoming-tx-monitor-service.ts  # Fix notification type names
    notifications/notification-service.ts  # Add TX_INCOMING_SUSPICIOUS to BROADCAST_EVENTS
    __tests__/config-loader.test.ts   # Add [incoming] section tests
  admin/src/
    pages/settings.tsx             # Add IncomingSettings component
```

### Pattern 1: Adding a New Config Section (DaemonConfigSchema)

**What:** Add a new TOML section to config.toml with Zod validation and env override support.
**When to use:** When a new subsystem needs persistent config.toml-level settings.
**Example:**
```typescript
// Source: packages/daemon/src/infrastructure/config/loader.ts (telegram section pattern)
export const DaemonConfigSchema = z.object({
  // ... existing sections ...
  incoming: z
    .object({
      enabled: z.boolean().default(false),
      poll_interval: z.number().int().min(5).max(3600).default(30),
      retention_days: z.number().int().min(1).max(365).default(90),
      suspicious_dust_usd: z.number().min(0).max(1000).default(0.01),
      suspicious_amount_multiplier: z.number().min(1).max(1000).default(10),
      cooldown_minutes: z.number().int().min(1).max(1440).default(5),
      wss_url: z.string().default(''),
    })
    .default({}),
});

// Also add to KNOWN_SECTIONS:
const KNOWN_SECTIONS = [
  // ... existing ...
  'incoming',
] as const;
```

### Pattern 2: NotificationEventType Addition

**What:** Add new event types to the notification enum.
**When to use:** When new notification types need to flow through the 4-channel system.
**Example:**
```typescript
// Source: packages/core/src/enums/notification.ts
export const NOTIFICATION_EVENT_TYPES = [
  // ... existing 28 types ...
  'TX_INCOMING',
  'TX_INCOMING_SUSPICIOUS',
] as const;
```

### Pattern 3: i18n Template Addition

**What:** Add notification message templates in en.ts and ko.ts with variable interpolation.
**When to use:** When new NotificationEventType values are added.
**Example:**
```typescript
// Source: packages/core/src/i18n/en.ts (notifications section)
TX_INCOMING: {
  title: 'Incoming Transaction Detected',
  body: 'Wallet {walletId} received {amount} from {fromAddress} on {chain} {display_amount}'
},
TX_INCOMING_SUSPICIOUS: {
  title: 'Suspicious Incoming Transaction',
  body: 'Wallet {walletId} received suspicious transaction: {amount} from {fromAddress}. Reasons: {reasons} {display_amount}'
},
```

### Pattern 4: BROADCAST_EVENTS for Critical Notifications

**What:** TX_INCOMING_SUSPICIOUS should be sent to ALL channels (broadcast mode).
**When to use:** For security-critical events that operators must see.
**Example:**
```typescript
// Source: packages/daemon/src/notifications/notification-service.ts
const BROADCAST_EVENTS: Set<string> = new Set([
  'KILL_SWITCH_ACTIVATED',
  'KILL_SWITCH_RECOVERED',
  'AUTO_STOP_TRIGGERED',
  'TX_INCOMING_SUSPICIOUS',  // NEW: suspicious incoming tx broadcast to all channels
]);
```

### Pattern 5: Admin UI Settings Section

**What:** Add an IncomingSettings component to the Settings page.
**When to use:** When a new settings category needs UI exposure.
**Example:** Follow the SigningSDKSettings component pattern (settings.tsx lines 722-840) -- a function component that reads/writes via `getEffectiveValue()` and `handleFieldChange()`, rendered as a collapsible section with FormField components.

### Anti-Patterns to Avoid

- **Nested config.toml sections:** The project enforces flat keys. `[incoming.websocket]` is NOT allowed -- use `incoming_wss_url` instead.
- **Adding to DaemonConfigSchema without updating KNOWN_SECTIONS:** detectNestedSections() would reject `[incoming]` as an unknown section.
- **Hardcoded notification type strings:** Use the canonical `NotificationEventType` values, not string literals like `'INCOMING_TX_DETECTED' as any`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Env var override for [incoming] | Custom parsing logic | `applyEnvOverrides()` in loader.ts | Automatic once section is in KNOWN_SECTIONS |
| Credential encryption | Custom AES | `settings-crypto.ts` AES-GCM | Existing encrypt/decrypt for isCredential keys |
| Config.toml fallback chain | Custom get() logic | `SettingsService.get()` (DB > config > default) | Already implements 3-level fallback |
| i18n type safety | Manual key checks | `Messages` interface in en.ts | TypeScript enforces key parity across locales |

**Key insight:** Most of the infrastructure is already built. This phase is primarily about connecting the config.toml layer (which is currently missing for `incoming`) and adding 2 notification event types with templates.

## Common Pitfalls

### Pitfall 1: Setting Keys Already Registered but Config Schema Missing

**What goes wrong:** The 7 incoming.* setting keys are in `setting-keys.ts` (Phase 226-04) and HotReloadOrchestrator is wired, but `DaemonConfigSchema` does NOT have an `incoming` section and `KNOWN_SECTIONS` does NOT include `'incoming'`. This means:
- `config.toml [incoming] enabled = true` would be REJECTED ("Unknown config section")
- `WAIAAS_INCOMING_ENABLED=true` env var would be SILENTLY IGNORED
- `SettingsService.getConfigValue()` returns `undefined` because `config.incoming` doesn't exist
**Why it happens:** Phase 226-04 added setting-keys and hot-reload but deferred config.toml schema to Phase 227.
**How to avoid:** Add `incoming` section to both DaemonConfigSchema AND KNOWN_SECTIONS in the same task.
**Warning signs:** `SettingsService.get('incoming.enabled')` always falls through to defaultValue.

### Pitfall 2: Notification Event Type Name Mismatch

**What goes wrong:** The monitor service (incoming-tx-monitor-service.ts line 297-298) currently uses `'INCOMING_TX_SUSPICIOUS'` and `'INCOMING_TX_DETECTED'` as string literals cast with `as any`. These do NOT match the required names `TX_INCOMING` and `TX_INCOMING_SUSPICIOUS`.
**Why it happens:** Phase 226-04 used placeholder names because the NotificationEventType enum hadn't been extended yet.
**How to avoid:** When adding the new enum values, also update the monitor service to use the canonical names AND remove the `as any` cast.
**Warning signs:** `notificationService.notify()` silently fails for unknown event types because `getNotificationMessage()` would try to look up a non-existent key.

### Pitfall 3: Enums Test Count Assertion

**What goes wrong:** `enums.test.ts` line 103 asserts `NOTIFICATION_EVENT_TYPES` has 28 values. Adding 2 types without updating this test causes test failure.
**Why it happens:** The count is hardcoded for regression detection.
**How to avoid:** Update the assertion to 30.
**Warning signs:** Test suite fails with "Expected: 28, Received: 30".

### Pitfall 4: Messages Interface Enforcement

**What goes wrong:** TypeScript compilation fails because `Messages` interface defines `notifications: Record<NotificationEventType, {title: string; body: string}>`. Adding new NotificationEventType values without adding corresponding entries in BOTH `en.ts` AND `ko.ts` breaks the type.
**Why it happens:** The `Messages` interface uses the enum type as keys.
**How to avoid:** Always add templates to both locale files in the same task as the enum change.
**Warning signs:** TypeScript error: "Property 'TX_INCOMING' is missing in type...".

### Pitfall 5: BROADCAST_EVENTS Not Updated

**What goes wrong:** `TX_INCOMING_SUSPICIOUS` uses `notify()` (priority fallback) instead of `broadcast()` (all channels). The objective doc explicitly says suspicious notifications should use `broadcast()`.
**Why it happens:** The BROADCAST_EVENTS set is defined separately in notification-service.ts and is easy to forget.
**How to avoid:** Add `TX_INCOMING_SUSPICIOUS` to `BROADCAST_EVENTS` in the same task as the enum addition.
**Warning signs:** Suspicious transaction alerts only go to the first channel, not all channels.

### Pitfall 6: Config Key Naming Discrepancy (mode vs cooldown_minutes)

**What goes wrong:** The requirements document mentions 7 keys including `mode`, but the actual implementation in setting-keys.ts has `cooldown_minutes` instead of `mode`. The requirement ID CFG-01 lists `(enabled, mode, poll_interval, retention_days, suspicious_dust_usd, suspicious_amount_multiplier, wss_url)` but the actual 7 keys are `(enabled, poll_interval, retention_days, suspicious_dust_usd, suspicious_amount_multiplier, cooldown_minutes, wss_url)`.
**Why it happens:** The design evolved between the requirements document and the Phase 226-04 implementation. The `mode` key (ws/poll/auto) was dropped in favor of automatic detection in the subscriber.
**How to avoid:** Follow the setting-keys.ts definitions (the SSoT) rather than the literal text of CFG-01. The config.toml Zod schema should match setting-keys.ts exactly.
**Warning signs:** Extra or missing keys between config.toml, setting-keys.ts, and env var mappings.

## Code Examples

### config.toml [incoming] Section Zod Schema

```typescript
// Add to DaemonConfigSchema in loader.ts
incoming: z
  .object({
    enabled: z.boolean().default(false),
    poll_interval: z.number().int().min(5).max(3600).default(30),
    retention_days: z.number().int().min(1).max(365).default(90),
    suspicious_dust_usd: z.number().min(0).max(1000).default(0.01),
    suspicious_amount_multiplier: z.number().min(1).max(1000).default(10),
    cooldown_minutes: z.number().int().min(1).max(1440).default(5),
    wss_url: z.string().default(''),
  })
  .default({}),
```

### Environment Variable Examples

```bash
WAIAAS_INCOMING_ENABLED=true
WAIAAS_INCOMING_POLL_INTERVAL=60
WAIAAS_INCOMING_RETENTION_DAYS=30
WAIAAS_INCOMING_SUSPICIOUS_DUST_USD=0.05
WAIAAS_INCOMING_SUSPICIOUS_AMOUNT_MULTIPLIER=20
WAIAAS_INCOMING_COOLDOWN_MINUTES=10
WAIAAS_INCOMING_WSS_URL=wss://custom.rpc.com
```

### Monitor Service Fix (notification type names)

```typescript
// Before (incorrect):
const eventType = isSuspicious
  ? 'INCOMING_TX_SUSPICIOUS'
  : 'INCOMING_TX_DETECTED';
// ...
this.notificationService?.notify(eventType as any, tx.walletId, ...);

// After (correct):
const eventType = isSuspicious
  ? 'TX_INCOMING_SUSPICIOUS' as const
  : 'TX_INCOMING' as const;
// ...
this.notificationService?.notify(eventType, tx.walletId, {
  txHash: tx.txHash,
  amount: tx.amount,
  chain: tx.chain,
  fromAddress: tx.fromAddress,
});
```

### English Notification Templates

```typescript
TX_INCOMING: {
  title: 'Incoming Transaction Detected',
  body: 'Wallet {walletId} received {amount} from {fromAddress} on {chain} {display_amount}'
},
TX_INCOMING_SUSPICIOUS: {
  title: 'Suspicious Incoming Transaction',
  body: 'Wallet {walletId} received suspicious transaction: {amount} from {fromAddress}. Reasons: {reasons} {display_amount}'
},
```

### Korean Notification Templates

```typescript
TX_INCOMING: {
  title: '수신 트랜잭션 감지',
  body: '지갑 {walletId}이(가) {chain}에서 {fromAddress}로부터 {amount}을(를) 수신했습니다 {display_amount}'
},
TX_INCOMING_SUSPICIOUS: {
  title: '의심스러운 수신 트랜잭션',
  body: '지갑 {walletId}에 의심스러운 입금 감지: {fromAddress}로부터 {amount}. 사유: {reasons} {display_amount}'
},
```

### Config Loader Test Example

```typescript
describe('[incoming] section', () => {
  it('loads [incoming] section with defaults', () => {
    const dir = saveTempDir(createTempDir());
    const config = loadConfig(dir);
    expect(config.incoming.enabled).toBe(false);
    expect(config.incoming.poll_interval).toBe(30);
    expect(config.incoming.retention_days).toBe(90);
    expect(config.incoming.suspicious_dust_usd).toBe(0.01);
    expect(config.incoming.suspicious_amount_multiplier).toBe(10);
    expect(config.incoming.cooldown_minutes).toBe(5);
    expect(config.incoming.wss_url).toBe('');
  });

  it('WAIAAS_INCOMING_ENABLED=true overrides', () => {
    const dir = saveTempDir(createTempDir());
    setEnv('WAIAAS_INCOMING_ENABLED', 'true');
    const config = loadConfig(dir);
    expect(config.incoming.enabled).toBe(true);
  });

  it('config.toml [incoming] section accepted', () => {
    const dir = saveTempDir(createTempDir());
    writeFileSync(join(dir, 'config.toml'), `[incoming]\nenabled = true\npoll_interval = 60\n`);
    const config = loadConfig(dir);
    expect(config.incoming.enabled).toBe(true);
    expect(config.incoming.poll_interval).toBe(60);
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| String literal notification types | Canonical enum types | Phase 227 | Type safety for notification events |
| Monitor-only settings (no config.toml) | config.toml + SettingsService + env override | Phase 227 | Operators can configure via file, env, or Admin UI |
| No incoming notification events | TX_INCOMING + TX_INCOMING_SUSPICIOUS | Phase 227 | 4-channel notification for incoming TX |

**Pre-existing state from Phase 226-04:**
- 7 incoming.* keys in `setting-keys.ts` (DONE)
- `'incoming'` category in `SETTING_CATEGORIES` (DONE)
- `INCOMING_KEYS_PREFIX` + `hasIncomingChanges` + `reloadIncomingMonitor()` in `hot-reload.ts` (DONE)
- Duck-typed `incomingTxMonitorService` in `HotReloadDeps` (DONE)

**Missing (Phase 227 scope):**
- `incoming` section in `DaemonConfigSchema` (NOT done)
- `'incoming'` in `KNOWN_SECTIONS` (NOT done)
- `TX_INCOMING`/`TX_INCOMING_SUSPICIOUS` in `NOTIFICATION_EVENT_TYPES` (NOT done)
- i18n templates in `en.ts`/`ko.ts` (NOT done)
- Monitor service notification type name fix (NOT done)
- `TX_INCOMING_SUSPICIOUS` in `BROADCAST_EVENTS` (NOT done)
- Admin UI incoming settings panel (NOT done)
- Config-loader tests for [incoming] section (NOT done)

## Open Questions

1. **Config key `mode` vs `cooldown_minutes`**
   - What we know: Requirements CFG-01 lists 7 keys including `mode`. The actual setting-keys.ts implementation has `cooldown_minutes` instead of `mode`. The subscriber auto-detects WS vs polling mode.
   - What's unclear: Whether `mode` should still be added as a config key.
   - Recommendation: Follow setting-keys.ts (SSoT). The `mode` key was superseded by automatic detection in the 3-state connection machine. Use the 7 keys already in setting-keys.ts.

2. **Notification template variables**
   - What we know: The monitor service currently passes `{txHash, amount, chain}` to notify(). Templates should reference `{walletId}`, `{amount}`, `{fromAddress}`, `{chain}`, `{reasons}`, `{display_amount}`.
   - What's unclear: Whether additional variables are needed (e.g., `{tokenAddress}`, `{network}`).
   - Recommendation: Include `{walletId}`, `{amount}`, `{fromAddress}`, `{chain}`, `{txHash}`, and `{reasons}` (for suspicious). The monitor service vars object should be expanded to include `fromAddress`.

## Sources

### Primary (HIGH confidence)
- `packages/daemon/src/infrastructure/config/loader.ts` - DaemonConfigSchema, KNOWN_SECTIONS, applyEnvOverrides
- `packages/daemon/src/infrastructure/settings/setting-keys.ts` - 7 incoming.* keys already registered (Phase 226-04)
- `packages/daemon/src/infrastructure/settings/hot-reload.ts` - reloadIncomingMonitor() already implemented
- `packages/core/src/enums/notification.ts` - Current 28 NotificationEventType values
- `packages/core/src/i18n/en.ts` / `ko.ts` - Messages interface with notification templates
- `packages/daemon/src/notifications/notification-service.ts` - BROADCAST_EVENTS, notify/broadcast patterns
- `packages/daemon/src/services/incoming/incoming-tx-monitor-service.ts` - Current notification type names (lines 297-298)
- `internal/objectives/m27-01-incoming-transaction-monitoring-impl.md` - TX_INCOMING_SUSPICIOUS uses broadcast()
- `.planning/phases/226-monitor-service-resilience/226-04-SUMMARY.md` - What was already done

### Secondary (MEDIUM confidence)
- `.planning/REQUIREMENTS.md` - CFG-01 through CFG-05, EVT-02, EVT-06 requirement definitions
- `.planning/ROADMAP.md` - Phase 227 success criteria

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries and patterns already in codebase
- Architecture: HIGH - Existing patterns for config, settings, notifications are well-established
- Pitfalls: HIGH - All identified from reading actual code, not speculation

**Research date:** 2026-02-22
**Valid until:** 2026-03-22 (stable internal architecture)
