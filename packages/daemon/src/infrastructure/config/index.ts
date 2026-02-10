/**
 * Config module barrel export.
 *
 * Re-exports config loader, schema, and type.
 */

export { loadConfig, DaemonConfigSchema, detectNestedSections, applyEnvOverrides, parseEnvValue } from './loader.js';
export type { DaemonConfig } from './loader.js';
