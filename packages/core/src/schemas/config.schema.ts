import { z } from 'zod';
import { PolicyTierEnum } from '../enums/policy.js';

// 17 flattened config keys (24-monorepo-data-directory section 3)
export const ConfigSchema = z.object({
  server_port: z.number().int().min(1).max(65535).default(3100),
  server_host: z.string().default('127.0.0.1'),
  data_dir: z.string().default('~/.waiaas'),
  log_level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  session_default_ttl: z.number().int().min(60).default(3600),
  session_max_ttl: z.number().int().min(300).default(86400),
  session_max_renewals: z.number().int().min(0).default(24),
  session_absolute_lifetime: z.number().int().min(3600).default(604800),
  security_master_password_max_attempts: z.number().int().min(1).default(5),
  security_master_password_lockout_duration: z.number().int().min(60).default(1800),
  security_auto_stop_enabled: z.boolean().default(true),
  rpc_solana_mainnet: z.string().url().default('https://api.mainnet-beta.solana.com'),
  rpc_solana_devnet: z.string().url().default('https://api.devnet.solana.com'),
  rpc_solana_testnet: z.string().url().default('https://api.testnet.solana.com'),
  policy_default_tier: PolicyTierEnum.default('INSTANT'),
  notification_channels: z.array(z.enum(['TELEGRAM', 'DISCORD', 'NTFY'])).default([]),
  kill_switch_recovery_timeout: z.number().int().min(60).default(86400),
});
export type Config = z.infer<typeof ConfigSchema>;
