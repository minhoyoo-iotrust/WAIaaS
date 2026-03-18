import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { parse as parseToml } from 'smol-toml';

const PushwooshConfigSchema = z.object({
  api_token: z.string().min(1),
  application_code: z.string().min(1),
  api_url: z.string().url().default('https://api.pushwoosh.com/json/1.3/createMessage'),
});

const FcmConfigSchema = z.object({
  project_id: z.string().min(1),
  service_account_key_path: z.string().min(1),
});

const CategoryFieldsSchema = z.record(z.string(), z.string());

const PayloadConfigSchema = z.object({
  static_fields: z.record(z.string(), z.string()).default({}),
  category_map: z.record(z.string(), CategoryFieldsSchema).default({}),
});

const PushConfigSchema = z.object({
  provider: z.enum(['pushwoosh', 'fcm']),
  pushwoosh: PushwooshConfigSchema.optional(),
  fcm: FcmConfigSchema.optional(),
  payload: PayloadConfigSchema.optional(),
});

const ServerConfigSchema = z.object({
  port: z.number().int().min(1).max(65535).default(3200),
  host: z.string().default('0.0.0.0'),
  api_key: z.string().min(1),
});

const RelayConfigSchema = z.object({
  push: PushConfigSchema,
  server: ServerConfigSchema,
});

export const ConfigSchema = z.object({
  relay: RelayConfigSchema,
});

export type RelayConfig = z.infer<typeof ConfigSchema>;
export type PushwooshConfig = z.infer<typeof PushwooshConfigSchema>;
export type FcmConfig = z.infer<typeof FcmConfigSchema>;
export type PayloadConfig = z.infer<typeof PayloadConfigSchema>;

export function loadConfig(path: string): RelayConfig {
  const raw = readFileSync(path, 'utf-8');
  const parsed: unknown = parseToml(raw);
  const config = ConfigSchema.parse(parsed);

  // Validate provider-specific config exists
  if (config.relay.push.provider === 'pushwoosh' && !config.relay.push.pushwoosh) {
    throw new Error('Provider is "pushwoosh" but [relay.push.pushwoosh] section is missing');
  }
  if (config.relay.push.provider === 'fcm' && !config.relay.push.fcm) {
    throw new Error('Provider is "fcm" but [relay.push.fcm] section is missing');
  }

  return config;
}
