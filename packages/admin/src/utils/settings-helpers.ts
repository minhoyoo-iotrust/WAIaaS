// ---------------------------------------------------------------------------
// Shared types and helpers for settings pages (Security, System, Settings)
// Extracted from settings.tsx for reuse across multiple pages.
// ---------------------------------------------------------------------------

import type { components } from '../api/types.generated';
import { api } from '../api/typed-client';

// ---------------------------------------------------------------------------
// Types — generated type aliases where possible
// ---------------------------------------------------------------------------

// SettingsResponse has explicit category keys; SettingsData is a wider Record type
// used across settings helpers. Keep as manual alias until GET /v1/admin/settings
// returns a dynamic shape. TODO(Phase 415): Add named Zod schema for this endpoint
export type SettingsData = Record<string, Record<string, string | boolean>>;

// Generated type alias (replaces manual interface)
export type KillSwitchState = components['schemas']['KillSwitchResponse'];

// ApiKeyEntry: no named schema in generated types (inline response in /v1/admin/api-keys)
// TODO(Phase 415): Add named Zod schema for this endpoint
export interface ApiKeyEntry {
  providerName: string;
  hasKey: boolean;
  maskedKey: string | null;
  requiresApiKey: boolean;
  updatedAt: string | null;
}

// Generated type alias (replaces manual interface)
export type RpcTestResult = components['schemas']['TestRpcResponse'];

// NotifTestResult: generated NotificationTestResponse.results[number] matches
export type NotifTestResult = components['schemas']['NotificationTestResponse']['results'][number];

// Generated type alias (replaces manual interface)
export type RpcEndpointStatusEntry = components['schemas']['RpcEndpointStatus'];

export type RpcPoolStatus = components['schemas']['RpcStatusResponse']['networks'];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Credential fields come back as boolean from GET. These are the known credential keys. */
export const CREDENTIAL_KEYS = new Set([
  'notifications.telegram_bot_token',
  'notifications.discord_webhook_url',
  'notifications.slack_webhook_url',
  'telegram.bot_token',
]);

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

export function isCredentialField(fullKey: string): boolean {
  return CREDENTIAL_KEYS.has(fullKey);
}

// ---------------------------------------------------------------------------
// Settings schema cache (populated from GET /v1/admin/settings/schema)
// ---------------------------------------------------------------------------

/** Map of short key (e.g. 'enabled') -> label from API schema */
const schemaLabelByShortKey = new Map<string, string>();
/** Map of full key (e.g. 'notifications.enabled') -> label from API schema */
const schemaLabelByFullKey = new Map<string, string>();

/** Promise deduplication: only one in-flight fetch at a time */
let schemaLoadPromise: Promise<void> | null = null;

/** Whether the schema has been successfully loaded */
let schemaLoaded = false;

/**
 * Fetch settings schema from the API and populate the label cache.
 * Safe to call multiple times -- deduplicates concurrent requests and
 * skips if already loaded. Errors are silently caught (keyToLabel falls
 * back to title-case transform).
 */
export function loadSettingsSchema(): Promise<void> {
  if (schemaLoaded) return Promise.resolve();
  if (schemaLoadPromise) return schemaLoadPromise;

  schemaLoadPromise = (async () => {
    try {
      const { data } = await api.GET('/v1/admin/settings/schema');
      if (data && 'settings' in data && Array.isArray(data.settings)) {
        for (const entry of data.settings) {
          // Full key lookup (e.g. 'notifications.enabled' -> 'Enabled')
          schemaLabelByFullKey.set(entry.key, entry.label);
          // Short key lookup (part after last dot)
          const dotIdx = entry.key.lastIndexOf('.');
          const shortKey = dotIdx >= 0 ? entry.key.slice(dotIdx + 1) : entry.key;
          // First occurrence wins for short key (same short key across
          // categories typically shares the same label)
          if (!schemaLabelByShortKey.has(shortKey)) {
            schemaLabelByShortKey.set(shortKey, entry.label);
          }
        }
        schemaLoaded = true;
      }
    } catch {
      // Schema fetch failed -- keyToLabel will use fallback transform.
      // This is non-critical: labels degrade gracefully to title-case.
    } finally {
      schemaLoadPromise = null;
    }
  })();

  return schemaLoadPromise;
}

/** Reset the schema cache (for testing) */
export function resetSettingsSchemaCache(): void {
  schemaLabelByShortKey.clear();
  schemaLabelByFullKey.clear();
  schemaLoadPromise = null;
  schemaLoaded = false;
}

/**
 * Human-readable label from a setting key.
 *
 * Checks the API-populated schema cache first (by full key, then short key),
 * falling back to a title-case transform if the schema has not loaded yet.
 */
export function keyToLabel(key: string): string {
  // Try full key first (e.g. 'notifications.enabled')
  const fullLabel = schemaLabelByFullKey.get(key);
  if (fullLabel) return fullLabel;
  // Try short key (e.g. 'enabled')
  const shortLabel = schemaLabelByShortKey.get(key);
  if (shortLabel) return shortLabel;
  // Fallback: title-case transform
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Settings value helpers (pure functions, no signal access)
// ---------------------------------------------------------------------------

/** Get effective display value for a field, considering dirty overrides */
export function getEffectiveValue(
  settings: SettingsData,
  dirty: Record<string, string>,
  category: string,
  shortKey: string,
): string {
  const fullKey = `${category}.${shortKey}`;
  if (dirty[fullKey] !== undefined) {
    return dirty[fullKey];
  }
  const catData = settings[category];
  if (!catData) return '';
  const catValue = catData[shortKey];
  if (typeof catValue === 'boolean') {
    // Credential fields: boolean indicates presence, not actual value
    if (isCredentialField(fullKey)) return '';
    return String(catValue);
  }
  return catValue ?? '';
}

/** Get effective boolean value (for checkbox fields) */
export function getEffectiveBoolValue(
  settings: SettingsData,
  dirty: Record<string, string>,
  category: string,
  shortKey: string,
): boolean {
  const fullKey = `${category}.${shortKey}`;
  if (dirty[fullKey] !== undefined) {
    return dirty[fullKey] === 'true';
  }
  const catData = settings[category];
  if (!catData) return false;
  const catValue = catData[shortKey];
  if (typeof catValue === 'boolean') return catValue;
  return catValue === 'true';
}

// ---------------------------------------------------------------------------
// Slippage BPS ↔ % conversion helpers
// ---------------------------------------------------------------------------

const SLIPPAGE_BPS_KEYS = new Set([
  'jupiter_swap_default_slippage_bps',
  'jupiter_swap_max_slippage_bps',
  'zerox_swap_default_slippage_bps',
  'zerox_swap_max_slippage_bps',
  'pendle_yield_default_slippage_bps',
  'pendle_yield_max_slippage_bps',
  'dcent_swap_default_slippage_bps',
  'dcent_swap_max_slippage_bps',
]);

/** Check if a setting key is a slippage BPS field */
export function isSlippageBpsKey(key: string): boolean {
  return SLIPPAGE_BPS_KEYS.has(key);
}

/** Convert BPS value to % for display (e.g. 100 → "1") */
export function bpsToPercent(bpsValue: string): string {
  const num = Number(bpsValue);
  if (isNaN(num) || bpsValue === '') return bpsValue;
  return String(num / 100);
}

/** Convert % value to BPS for storage (e.g. "1" → "100") */
export function percentToBps(pctValue: string): string {
  const num = Number(pctValue);
  if (isNaN(num) || pctValue === '') return pctValue;
  return String(Math.round(num * 100));
}

/** Check if a credential field is configured (GET returned true) */
export function isCredentialConfigured(
  settings: SettingsData,
  dirty: Record<string, string>,
  category: string,
  shortKey: string,
): boolean {
  const fullKey = `${category}.${shortKey}`;
  if (dirty[fullKey] !== undefined) return false; // user is editing
  const catData = settings[category];
  if (!catData) return false;
  return catData[shortKey] === true;
}
