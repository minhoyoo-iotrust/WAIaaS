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
 *   wallet info                       -- Show wallet details
 *   wallet set-default-network <net>  -- Change default network
 *   owner connect                     -- Connect external wallet via WalletConnect QR
 *   owner disconnect                  -- Disconnect WalletConnect session
 *   owner status                      -- Show WalletConnect session status
 *   mcp setup                         -- Set up MCP integration for Claude Desktop
 *   upgrade                           -- Upgrade WAIaaS to the latest version
 *   upgrade --check                   -- Check for available updates
 *   upgrade --to <version>            -- Upgrade to a specific version
 *   upgrade --rollback                -- Restore from the latest backup
 *
 * All commands accept --data-dir <path> (default: ~/.waiaas/)
 */

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { startCommand } from './commands/start.js';
import { stopCommand } from './commands/stop.js';
import { statusCommand } from './commands/status.js';
import { mcpSetupCommand } from './commands/mcp-setup.js';
import { quickstartCommand } from './commands/quickstart.js';
import { walletInfoCommand, walletSetDefaultNetworkCommand } from './commands/wallet.js';
import { ownerConnectCommand, ownerDisconnectCommand, ownerStatusCommand } from './commands/owner.js';
import { upgradeCommand } from './commands/upgrade.js';
import { resolveDataDir } from './utils/data-dir.js';
import { checkAndNotifyUpdate } from './utils/update-notify.js';

const program = new Command();

program
  .name('waiaas')
  .description('WAIaaS - AI Agent Wallet-as-a-Service')
  .version('0.0.0');

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
  const mode = opts.mode ?? 'testnet';
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
  .option('--mode <mode>', 'Environment mode: testnet or mainnet', 'testnet')
  .option('--expires-in <seconds>', 'Session expiration in seconds', '86400')
  .option('--password <password>', 'Master password')
  .action(quicksetAction);

program
  .command('quickstart')
  .description('(alias for quickset) Quick setup: create wallets, sessions, and MCP tokens')
  .option('--data-dir <path>', 'Data directory path')
  .option('--base-url <url>', 'Daemon base URL', 'http://127.0.0.1:3100')
  .option('--mode <mode>', 'Environment mode: testnet or mainnet', 'testnet')
  .option('--expires-in <seconds>', 'Session expiration in seconds', '86400')
  .option('--password <password>', 'Master password')
  .action(quicksetAction);

// Wallet subcommand group
const wallet = program.command('wallet').description('Wallet management commands');

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

program
  .command('upgrade')
  .description('Upgrade WAIaaS to the latest version')
  .option('--data-dir <path>', 'Data directory path')
  .option('--check', 'Check for updates without upgrading')
  .option('--to <version>', 'Upgrade to a specific version')
  .option('--rollback', 'Restore from the latest backup')
  .option('--no-start', 'Skip daemon restart after upgrade')
  .action(async (opts: {
    dataDir?: string;
    check?: boolean;
    to?: string;
    rollback?: boolean;
    start?: boolean; // commander inverts --no-start to start=false
  }) => {
    const dataDir = resolveDataDir(opts);
    await upgradeCommand({
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
