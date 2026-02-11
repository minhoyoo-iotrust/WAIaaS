/**
 * WAIaaS CLI entry point.
 *
 * Commands:
 *   init       -- Initialize WAIaaS data directory
 *   start      -- Start the WAIaaS daemon
 *   stop       -- Stop the WAIaaS daemon
 *   status     -- Check WAIaaS daemon status
 *   mcp setup  -- Set up MCP integration for Claude Desktop
 *
 * All commands accept --data-dir <path> (default: ~/.waiaas/)
 */

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { startCommand } from './commands/start.js';
import { stopCommand } from './commands/stop.js';
import { statusCommand } from './commands/status.js';
import { mcpSetupCommand } from './commands/mcp-setup.js';
import { resolveDataDir } from './utils/data-dir.js';

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

// MCP subcommand group
const mcp = program.command('mcp').description('MCP integration commands');

mcp
  .command('setup')
  .description('Set up MCP integration for Claude Desktop')
  .option('--data-dir <path>', 'Data directory path')
  .option('--base-url <url>', 'Daemon base URL', 'http://127.0.0.1:3100')
  .option('--agent <id>', 'Agent ID (auto-detected if only one)')
  .option('--expires-in <seconds>', 'Session expiration in seconds', '86400')
  .option('--password <password>', 'Master password')
  .action(async (opts: {
    dataDir?: string;
    baseUrl?: string;
    agent?: string;
    expiresIn?: string;
    password?: string;
  }) => {
    const dataDir = resolveDataDir(opts);
    await mcpSetupCommand({
      dataDir,
      baseUrl: opts.baseUrl,
      agent: opts.agent,
      expiresIn: parseInt(opts.expiresIn ?? '86400', 10),
      masterPassword: opts.password,
    });
  });

program.parseAsync(process.argv).catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
