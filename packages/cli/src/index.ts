/**
 * WAIaaS CLI entry point.
 *
 * Commands:
 *   init                              -- Initialize WAIaaS data directory
 *   start                             -- Start the WAIaaS daemon
 *   stop                              -- Stop the WAIaaS daemon
 *   status                            -- Check WAIaaS daemon status
 *   quickset                          -- Quick setup: create wallets, sessions, and MCP tokens
 *   quickstart                        -- (alias for quickset)
 *   wallet create                     -- Create a new wallet
 *   wallet info                       -- Show wallet details
 *   wallet set-default-network <net>  -- Change default network
 *   session prompt                    -- Generate agent connection prompt
 *   owner connect                     -- Connect external wallet via WalletConnect QR
 *   owner disconnect                  -- Disconnect WalletConnect session
 *   owner status                      -- Show WalletConnect session status
 *   mcp setup                         -- Set up MCP integration for Claude Desktop
 *   notification setup                -- Set up Telegram notifications
 *   update                            -- Update WAIaaS to the latest version
 *   update --check                    -- Check for available updates
 *   update --to <version>             -- Update to a specific version
 *   update --rollback                 -- Restore from the latest backup
 *
 * All commands accept --data-dir <path> (default: ~/.waiaas/)
 */

import { createRequire } from 'node:module';
import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { startCommand } from './commands/start.js';
import { stopCommand } from './commands/stop.js';
import { statusCommand } from './commands/status.js';
import { mcpSetupCommand } from './commands/mcp-setup.js';
import { quickstartCommand } from './commands/quickstart.js';
import { walletInfoCommand, walletSetDefaultNetworkCommand, walletCreateCommand } from './commands/wallet.js';
import { ownerConnectCommand, ownerDisconnectCommand, ownerStatusCommand } from './commands/owner.js';
import { sessionPromptCommand } from './commands/session.js';
import { notificationSetupCommand } from './commands/notification-setup.js';
import { updateCommand } from './commands/update.js';
import { resolveDataDir } from './utils/data-dir.js';
import { checkAndNotifyUpdate } from './utils/update-notify.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

const program = new Command();

program
  .name('waiaas')
  .description('WAIaaS - AI Agent Wallet-as-a-Service')
  .version(pkg.version);

program
  .command('init')
  .description('Initialize WAIaaS data directory')
  .option('--data-dir <path>', 'Data directory path')
  .action(async (opts: { dataDir?: string }) => {
    const dataDir = resolveDataDir(opts);
    await initCommand(dataDir);
  });

program
  .command('start')
  .description('Start the WAIaaS daemon')
  .option('--data-dir <path>', 'Data directory path')
  .action(async (opts: { dataDir?: string }) => {
    const dataDir = resolveDataDir(opts);
    await startCommand(dataDir);
  });

program
  .command('stop')
  .description('Stop the WAIaaS daemon')
  .option('--data-dir <path>', 'Data directory path')
  .action(async (opts: { dataDir?: string }) => {
    const dataDir = resolveDataDir(opts);
    await stopCommand(dataDir);
  });

program
  .command('status')
  .description('Check WAIaaS daemon status')
  .option('--data-dir <path>', 'Data directory path')
  .action(async (opts: { dataDir?: string }) => {
    const dataDir = resolveDataDir(opts);
    await statusCommand(dataDir);
  });

/** Shared handler for quickset / quickstart commands. */
const quicksetAction = async (opts: {
  dataDir?: string;
  baseUrl?: string;
  mode?: string;
  expiresIn?: string;
  password?: string;
}) => {
  const dataDir = resolveDataDir(opts);
  const mode = opts.mode ?? 'mainnet';
  if (mode !== 'testnet' && mode !== 'mainnet') {
    console.error("Error: --mode must be 'testnet' or 'mainnet'");
    process.exit(1);
  }
  await quickstartCommand({
    dataDir,
    baseUrl: opts.baseUrl,
    mode: mode as 'testnet' | 'mainnet',
    expiresIn: parseInt(opts.expiresIn ?? '86400', 10),
    masterPassword: opts.password,
  });
};

program
  .command('quickset')
  .description('Quick setup: create wallets, sessions, and MCP tokens')
  .option('--data-dir <path>', 'Data directory path')
  .option('--base-url <url>', 'Daemon base URL', 'http://127.0.0.1:3100')
  .option('--mode <mode>', 'Environment mode: testnet or mainnet', 'mainnet')
  .option('--expires-in <seconds>', 'Session expiration in seconds', '86400')
  .option('--password <password>', 'Master password')
  .action(quicksetAction);

program
  .command('quickstart')
  .description('(alias for quickset) Quick setup: create wallets, sessions, and MCP tokens')
  .option('--data-dir <path>', 'Data directory path')
  .option('--base-url <url>', 'Daemon base URL', 'http://127.0.0.1:3100')
  .option('--mode <mode>', 'Environment mode: testnet or mainnet', 'mainnet')
  .option('--expires-in <seconds>', 'Session expiration in seconds', '86400')
  .option('--password <password>', 'Master password')
  .action(quicksetAction);

// Wallet subcommand group
const wallet = program.command('wallet').description('Wallet management commands');

wallet
  .command('create')
  .description('Create a new wallet')
  .option('--base-url <url>', 'Daemon base URL', 'http://127.0.0.1:3100')
  .option('--chain <chain>', 'Chain type: solana or ethereum')
  .option('--all', 'Create wallets for all supported chains')
  .option('--mode <mode>', 'Environment mode: testnet or mainnet', 'mainnet')
  .option('--name <name>', 'Wallet name (ignored with --all)')
  .option('--password <password>', 'Master password')
  .action(async (opts: { baseUrl?: string; chain?: string; all?: boolean; mode?: string; name?: string; password?: string }) => {
    await walletCreateCommand({
      baseUrl: opts.baseUrl ?? 'http://127.0.0.1:3100',
      chain: opts.chain,
      all: opts.all,
      mode: opts.mode,
      name: opts.name,
      password: opts.password,
    });
  });

wallet
  .command('info')
  .description('Show wallet details')
  .option('--base-url <url>', 'Daemon base URL', 'http://127.0.0.1:3100')
  .option('--wallet <id>', 'Wallet ID or name (auto-detected if only one)')
  .option('--password <password>', 'Master password')
  .action(async (opts: { baseUrl?: string; wallet?: string; password?: string }) => {
    await walletInfoCommand({
      baseUrl: opts.baseUrl ?? 'http://127.0.0.1:3100',
      password: opts.password,
      walletId: opts.wallet,
    });
  });

wallet
  .command('set-default-network')
  .description('Change wallet default network')
  .argument('<network>', 'Network to set as default (e.g., polygon-amoy)')
  .option('--base-url <url>', 'Daemon base URL', 'http://127.0.0.1:3100')
  .option('--wallet <id>', 'Wallet ID or name (auto-detected if only one)')
  .option('--password <password>', 'Master password')
  .action(async (network: string, opts: { baseUrl?: string; wallet?: string; password?: string }) => {
    await walletSetDefaultNetworkCommand({
      baseUrl: opts.baseUrl ?? 'http://127.0.0.1:3100',
      password: opts.password,
      walletId: opts.wallet,
    }, network);
  });

// Session subcommand group
const session = program.command('session').description('Session management commands');

session
  .command('prompt')
  .description('Generate agent connection prompt (magic word)')
  .option('--base-url <url>', 'Daemon base URL', 'http://127.0.0.1:3100')
  .option('--wallet <id>', 'Wallet ID or name (all ACTIVE wallets if omitted)')
  .option('--expires-in <seconds>', 'Session TTL in seconds', '86400')
  .option('--password <password>', 'Master password')
  .action(async (opts: { baseUrl?: string; wallet?: string; expiresIn?: string; password?: string }) => {
    await sessionPromptCommand({
      baseUrl: opts.baseUrl ?? 'http://127.0.0.1:3100',
      walletId: opts.wallet,
      expiresIn: parseInt(opts.expiresIn ?? '86400', 10),
      password: opts.password,
    });
  });

// Owner subcommand group
const owner = program.command('owner').description('Owner wallet connection commands');

owner
  .command('connect')
  .description('Connect external wallet via WalletConnect QR code')
  .option('--base-url <url>', 'Daemon base URL', 'http://127.0.0.1:3100')
  .option('--wallet <id>', 'Wallet ID or name (auto-detected if only one)')
  .option('--password <password>', 'Master password')
  .option('--poll', 'Wait for wallet to connect')
  .action(async (opts: { baseUrl?: string; wallet?: string; password?: string; poll?: boolean }) => {
    await ownerConnectCommand({
      baseUrl: opts.baseUrl ?? 'http://127.0.0.1:3100',
      password: opts.password,
      walletId: opts.wallet,
      poll: opts.poll ?? false,
    });
  });

owner
  .command('disconnect')
  .description('Disconnect WalletConnect session')
  .option('--base-url <url>', 'Daemon base URL', 'http://127.0.0.1:3100')
  .option('--wallet <id>', 'Wallet ID or name (auto-detected if only one)')
  .option('--password <password>', 'Master password')
  .action(async (opts: { baseUrl?: string; wallet?: string; password?: string }) => {
    await ownerDisconnectCommand({
      baseUrl: opts.baseUrl ?? 'http://127.0.0.1:3100',
      password: opts.password,
      walletId: opts.wallet,
    });
  });

owner
  .command('status')
  .description('Show WalletConnect session status')
  .option('--base-url <url>', 'Daemon base URL', 'http://127.0.0.1:3100')
  .option('--wallet <id>', 'Wallet ID or name (auto-detected if only one)')
  .option('--password <password>', 'Master password')
  .action(async (opts: { baseUrl?: string; wallet?: string; password?: string }) => {
    await ownerStatusCommand({
      baseUrl: opts.baseUrl ?? 'http://127.0.0.1:3100',
      password: opts.password,
      walletId: opts.wallet,
    });
  });

// MCP subcommand group
const mcp = program.command('mcp').description('MCP integration commands');

mcp
  .command('setup')
  .description('Set up MCP integration for Claude Desktop')
  .option('--data-dir <path>', 'Data directory path')
  .option('--base-url <url>', 'Daemon base URL', 'http://127.0.0.1:3100')
  .option('--wallet <id>', 'Wallet ID (auto-detected if only one)')
  .option('--all', 'Set up all wallets at once')
  .option('--expires-in <seconds>', 'Session expiration in seconds', '86400')
  .option('--password <password>', 'Master password')
  .action(async (opts: {
    dataDir?: string;
    baseUrl?: string;
    wallet?: string;
    all?: boolean;
    expiresIn?: string;
    password?: string;
  }) => {
    const dataDir = resolveDataDir(opts);
    await mcpSetupCommand({
      dataDir,
      baseUrl: opts.baseUrl,
      wallet: opts.wallet,
      all: opts.all ?? false,
      expiresIn: parseInt(opts.expiresIn ?? '86400', 10),
      masterPassword: opts.password,
    });
  });

// Notification subcommand group
const notification = program.command('notification').description('Notification management commands');

notification
  .command('setup')
  .description('Set up Telegram notifications')
  .option('--base-url <url>', 'Daemon base URL', 'http://127.0.0.1:3100')
  .option('--bot-token <token>', 'Telegram bot token')
  .option('--chat-id <id>', 'Telegram chat ID')
  .option('--locale <locale>', 'Notification language (en/ko)', 'en')
  .option('--password <password>', 'Master password')
  .option('--test', 'Send test notification after setup', false)
  .action(async (opts: {
    baseUrl?: string;
    botToken?: string;
    chatId?: string;
    locale?: string;
    password?: string;
    test?: boolean;
  }) => {
    await notificationSetupCommand({
      baseUrl: opts.baseUrl,
      botToken: opts.botToken,
      chatId: opts.chatId,
      locale: opts.locale,
      password: opts.password,
      test: opts.test,
    });
  });

program
  .command('update')
  .alias('upgrade')
  .description('Update WAIaaS to the latest version')
  .option('--data-dir <path>', 'Data directory path')
  .option('--check', 'Check for updates without upgrading')
  .option('--to <version>', 'Update to a specific version')
  .option('--rollback', 'Restore from the latest backup')
  .option('--no-start', 'Skip daemon restart after update')
  .action(async (opts: {
    dataDir?: string;
    check?: boolean;
    to?: string;
    rollback?: boolean;
    start?: boolean; // commander inverts --no-start to start=false
  }) => {
    const dataDir = resolveDataDir(opts);
    await updateCommand({
      dataDir,
      check: opts.check,
      to: opts.to,
      rollback: opts.rollback,
      noStart: opts.start === false, // commander: --no-start → start=false
    });
  });

// Pre-parse --quiet and --data-dir from argv (program.opts() is empty before parseAsync)
const hasQuiet = process.argv.includes('--quiet');
const dataDirIdx = process.argv.indexOf('--data-dir');
const dataDirArg = dataDirIdx >= 0 ? process.argv[dataDirIdx + 1] : undefined;
const effectiveDataDir = resolveDataDir({ dataDir: dataDirArg });

// Fire-and-forget: do not await, do not block CLI startup
checkAndNotifyUpdate({ dataDir: effectiveDataDir, quiet: hasQuiet }).catch(() => {});

program.parseAsync(process.argv).catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
