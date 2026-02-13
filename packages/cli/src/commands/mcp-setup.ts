/**
 * `waiaas mcp setup` -- Set up MCP integration for Claude Desktop.
 *
 * 7-step flow (CLI-02), extended for multi-wallet (CLIP-01..07):
 *   1. Check daemon is running (GET /health)
 *   2. Resolve master password
 *   3. Resolve wallet ID (auto-detect if single wallet, masterAuth)
 *   4. Create session via POST /v1/sessions (masterAuth)
 *   5. Write token to mcp-tokens/<walletId> file (atomic)
 *   6. Output result
 *   7. Print Claude Desktop config.json snippet with WAIAAS_WALLET_ID/NAME
 *
 * --all flag: set up all wallets at once with a combined config snippet.
 */

import { writeFile, rename, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { resolvePassword } from '../utils/password.js';
import { toSlug, resolveSlugCollisions } from '../utils/slug.js';

export interface McpSetupOptions {
  dataDir: string;
  baseUrl?: string;
  wallet?: string;
  expiresIn?: number;
  masterPassword?: string;
  all?: boolean;
}

interface WalletInfo {
  id: string;
  name?: string;
}

/** Fetch wallet list from daemon (masterAuth). */
async function fetchWallets(baseUrl: string, password: string): Promise<WalletInfo[]> {
  const walletsRes = await fetch(`${baseUrl}/v1/wallets`, {
    headers: {
      'Accept': 'application/json',
      'X-Master-Password': password,
    },
  });

  if (!walletsRes.ok) {
    console.error(`Error: Failed to list wallets (${walletsRes.status})`);
    process.exit(1);
  }

  const walletsData = await walletsRes.json() as { items: WalletInfo[] };
  return walletsData.items ?? [];
}

/** Create session for a single wallet and write token file atomically. */
async function setupWallet(opts: {
  baseUrl: string;
  dataDir: string;
  password: string;
  walletId: string;
  expiresIn: number;
}): Promise<{ token: string; expiresAt: number }> {
  const sessionRes = await fetch(`${opts.baseUrl}/v1/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Master-Password': opts.password,
    },
    body: JSON.stringify({
      walletId: opts.walletId,
      expiresIn: opts.expiresIn,
    }),
  });

  if (!sessionRes.ok) {
    const body = await sessionRes.json().catch(() => null) as Record<string, unknown> | null;
    const msg = body?.['message'] ?? sessionRes.statusText;
    console.error(`Error: Failed to create session (${sessionRes.status}): ${msg}`);
    process.exit(1);
  }

  const sessionData = await sessionRes.json() as { id: string; token: string; expiresAt: number };

  // Write token to mcp-tokens/<walletId> (atomic: write tmp then rename)
  const tokenPath = join(opts.dataDir, 'mcp-tokens', opts.walletId);
  const tmpPath = `${tokenPath}.tmp`;

  await mkdir(dirname(tokenPath), { recursive: true });
  await writeFile(tmpPath, sessionData.token, 'utf-8');
  await rename(tmpPath, tokenPath);

  return { token: sessionData.token, expiresAt: sessionData.expiresAt };
}

/** Build a single mcpServers config entry for a wallet. */
function buildConfigEntry(opts: {
  dataDir: string;
  baseUrl: string;
  walletId: string;
  walletName?: string;
}): Record<string, unknown> {
  const env: Record<string, string> = {
    WAIAAS_DATA_DIR: opts.dataDir,
    WAIAAS_BASE_URL: opts.baseUrl,
    WAIAAS_WALLET_ID: opts.walletId,
  };
  if (opts.walletName) {
    env['WAIAAS_WALLET_NAME'] = opts.walletName;
  }
  return {
    command: 'npx',
    args: ['@waiaas/mcp'],
    env,
  };
}

/** Print platform-specific Claude Desktop config.json path. */
function printConfigPath(): void {
  const platform = process.platform;
  if (platform === 'darwin') {
    console.log('\nConfig location: ~/Library/Application Support/Claude/claude_desktop_config.json');
  } else if (platform === 'win32') {
    console.log('\nConfig location: %APPDATA%\\Claude\\claude_desktop_config.json');
  } else {
    console.log('\nConfig location: ~/.config/Claude/claude_desktop_config.json');
  }
}

export async function mcpSetupCommand(opts: McpSetupOptions): Promise<void> {
  const baseUrl = (opts.baseUrl ?? 'http://127.0.0.1:3100').replace(/\/+$/, '');
  const expiresIn = opts.expiresIn ?? 86400;

  // Validate: --all and --wallet are mutually exclusive
  if (opts.all && opts.wallet) {
    console.error('Error: Cannot use --all with --wallet');
    process.exit(1);
  }

  // Step 1: Check daemon is running
  try {
    const healthRes = await fetch(`${baseUrl}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!healthRes.ok) {
      // Daemon is responding but unhealthy -- continue anyway
      console.error(`Warning: daemon returned ${healthRes.status} on health check`);
    }
  } catch {
    console.error('Error: Cannot reach WAIaaS daemon.');
    console.error(`  Tried: ${baseUrl}/health`);
    console.error('  Make sure the daemon is running: waiaas start');
    process.exit(1);
  }

  // Step 2: Resolve master password (before wallet list which requires masterAuth)
  const password = opts.masterPassword ?? await resolvePassword();

  // --all: set up all wallets at once
  if (opts.all) {
    const wallets = await fetchWallets(baseUrl, password);

    if (wallets.length === 0) {
      console.error('Error: No wallets found. Run waiaas init first.');
      process.exit(1);
    }

    // Resolve slug collisions
    const slugMap = resolveSlugCollisions(wallets);

    // Set up each wallet
    const mcpServers: Record<string, Record<string, unknown>> = {};
    for (const wallet of wallets) {
      const result = await setupWallet({
        baseUrl,
        dataDir: opts.dataDir,
        password,
        walletId: wallet.id,
        expiresIn,
      });

      const slug = slugMap.get(wallet.id)!;
      console.log(`MCP session created for ${wallet.name ?? wallet.id}!`);
      console.log(`  Token file: ${join(opts.dataDir, 'mcp-tokens', wallet.id)}`);
      console.log(`  Expires at: ${new Date(result.expiresAt * 1000).toISOString()}`);

      mcpServers[`waiaas-${slug}`] = buildConfigEntry({
        dataDir: opts.dataDir,
        baseUrl,
        walletId: wallet.id,
        walletName: wallet.name,
      });
    }

    // Print combined config snippet
    const configSnippet = { mcpServers };
    console.log('\nAdd to your Claude Desktop config.json:');
    console.log(JSON.stringify(configSnippet, null, 2));
    printConfigPath();
    return;
  }

  // Step 3: Resolve wallet ID (single wallet flow)
  let walletId = opts.wallet;
  let walletName: string | undefined;

  if (!walletId) {
    // Auto-detect: fetch wallets list
    try {
      const wallets = await fetchWallets(baseUrl, password);

      if (wallets.length === 0) {
        console.error('Error: No wallets found. Run waiaas init first.');
        process.exit(1);
      }

      if (wallets.length > 1) {
        console.error('Error: Multiple wallets found. Specify --wallet <id>');
        console.error('  Available wallets:');
        for (const w of wallets) {
          console.error(`    ${w.id}${w.name ? ` (${w.name})` : ''}`);
        }
        process.exit(1);
      }

      walletId = wallets[0]!.id;
      walletName = wallets[0]?.name ?? undefined;
      console.error(`Auto-detected wallet: ${walletId}`);
    } catch (err) {
      if (err instanceof Error && 'code' in err) {
        // Already handled exit cases above
        throw err;
      }
      console.error('Error: Failed to list wallets');
      process.exit(1);
    }
  } else {
    // --wallet specified: look up name from wallets list
    try {
      const wallets = await fetchWallets(baseUrl, password);
      const found = wallets.find((w) => w.id === walletId);
      walletName = found?.name ?? undefined;
    } catch {
      // Name lookup failure is not fatal -- continue without name
    }
  }

  // Step 4 + 5: Create session and write token file
  let result: { token: string; expiresAt: number };
  try {
    result = await setupWallet({
      baseUrl,
      dataDir: opts.dataDir,
      password,
      walletId,
      expiresIn,
    });
  } catch (err) {
    if (err instanceof Error && 'code' in err) {
      throw err;
    }
    console.error('Error: Failed to create session');
    process.exit(1);
  }

  // Step 6: Output result
  const tokenPath = join(opts.dataDir, 'mcp-tokens', walletId);
  console.log('MCP session created successfully!');
  console.log(`  Token file: ${tokenPath}`);
  console.log(`  Expires at: ${new Date(result.expiresAt * 1000).toISOString()}`);
  console.log(`  Wallet: ${walletId}`);

  // Step 7: Print Claude Desktop config.json snippet (CLI-05 + CLIP-02/03)
  const slug = toSlug(walletName ?? walletId);
  const configSnippet = {
    mcpServers: {
      [`waiaas-${slug}`]: buildConfigEntry({
        dataDir: opts.dataDir,
        baseUrl,
        walletId,
        walletName,
      }),
    },
  };

  console.log('\nAdd to your Claude Desktop config.json:');
  console.log(JSON.stringify(configSnippet, null, 2));
  printConfigPath();
}
