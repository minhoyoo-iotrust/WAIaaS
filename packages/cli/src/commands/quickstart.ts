/**
 * `waiaas quickset` -- Quick setup: create wallets, sessions, and MCP tokens.
 * (Also available as `waiaas quickstart` for backward compatibility.)
 *
 * One-command multi-chain environment setup:
 *   1. Check daemon is running (GET /health)
 *   2. Resolve master password
 *   3. Create Solana + EVM wallets with environment mode
 *   4. Fetch available networks for each wallet
 *   5. Create single multi-wallet session + write single token file
 *   6. Output wallet info + single MCP config entry
 */

import { writeFile, rename, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { resolvePassword } from '../utils/password.js';

export interface QuickstartOptions {
  dataDir: string;
  baseUrl?: string;
  mode?: 'testnet' | 'mainnet';
  masterPassword?: string;
  expiresIn?: number;
}

interface CreatedWallet {
  id: string;
  name: string;
  chain: string;
  environment: string;
  publicKey: string;
  defaultNetwork: string | null;
  availableNetworks: string[];
}

interface NetworkInfo {
  network: string;
  isDefault?: boolean;
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

export async function quickstartCommand(opts: QuickstartOptions): Promise<void> {
  const baseUrl = (opts.baseUrl ?? 'http://127.0.0.1:3100').replace(/\/+$/, '');
  const mode = opts.mode ?? 'mainnet';
  const expiresIn = opts.expiresIn ?? 86400;

  // Validate mode
  if (mode !== 'testnet' && mode !== 'mainnet') {
    console.error("Error: --mode must be 'testnet' or 'mainnet'");
    process.exit(1);
  }

  // Step 1: Check daemon is running
  try {
    const healthRes = await fetch(`${baseUrl}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!healthRes.ok) {
      console.error(`Warning: daemon returned ${healthRes.status} on health check`);
    }
  } catch {
    console.error('Error: Cannot reach WAIaaS daemon.');
    console.error(`  Tried: ${baseUrl}/health`);
    console.error('  Make sure the daemon is running: waiaas start');
    process.exit(1);
  }

  // Step 2: Resolve master password
  const password = opts.masterPassword ?? await resolvePassword();

  // Step 3: Create Solana + EVM wallets
  const chains = [
    { chain: 'solana', name: `solana-${mode}` },
    { chain: 'ethereum', name: `evm-${mode}` },
  ] as const;

  const createdWallets: CreatedWallet[] = [];

  for (const { chain, name } of chains) {
    const walletRes = await fetch(`${baseUrl}/v1/wallets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Password': password,
      },
      body: JSON.stringify({ name, chain, environment: mode }),
    });

    let walletData: {
      id: string;
      name: string;
      chain: string;
      environment: string;
      publicKey: string;
      defaultNetwork: string | null;
    };

    if (walletRes.status === 409) {
      // QS-03: Idempotent -- wallet with same name already exists, reuse it
      const listRes = await fetch(`${baseUrl}/v1/wallets`, {
        headers: {
          'Accept': 'application/json',
          'X-Master-Password': password,
        },
      });
      if (!listRes.ok) {
        console.error(`Error: Failed to list wallets (HTTP ${listRes.status})`);
        process.exit(1);
      }
      const listData = await listRes.json() as { wallets: Array<{
        id: string; name: string; chain: string; environment: string;
        publicKey: string; defaultNetwork: string | null;
      }> };
      const existing = listData.wallets.find((w) => w.name === name);
      if (!existing) {
        console.error(`Error: Wallet '${name}' reported as existing but not found in list`);
        process.exit(1);
      }
      console.log(`Reusing existing wallet: ${existing.name} (${existing.id})`);
      walletData = existing;
    } else if (!walletRes.ok) {
      const body = await walletRes.json().catch(() => null) as Record<string, unknown> | null;
      const msg = body?.['message'] ?? walletRes.statusText;
      console.error(`Error: Failed to create ${chain} wallet (HTTP ${walletRes.status}): ${msg}`);
      process.exit(1);
    } else {
      walletData = await walletRes.json() as {
        id: string;
        name: string;
        chain: string;
        environment: string;
        publicKey: string;
        defaultNetwork: string | null;
      };
    }

    // Fetch available networks (graceful degradation on failure)
    let availableNetworks: string[] = [];
    try {
      const networksRes = await fetch(`${baseUrl}/v1/wallets/${walletData.id}/networks`, {
        headers: {
          'Accept': 'application/json',
          'X-Master-Password': password,
        },
      });
      if (networksRes.ok) {
        const networksData = await networksRes.json() as { availableNetworks: NetworkInfo[] };
        availableNetworks = (networksData.availableNetworks ?? []).map((n) => n.network);
      }
    } catch {
      // Graceful degradation: continue with empty networks
    }

    createdWallets.push({
      id: walletData.id,
      name: walletData.name,
      chain: walletData.chain,
      environment: walletData.environment,
      publicKey: walletData.publicKey,
      defaultNetwork: walletData.defaultNetwork,
      availableNetworks,
    });
  }

  // Step 4: Create single multi-wallet session
  const walletIds = createdWallets.map((w) => w.id);

  const sessionRes = await fetch(`${baseUrl}/v1/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Master-Password': password,
    },
    body: JSON.stringify({
      walletIds,
      expiresIn,
    }),
  });

  if (!sessionRes.ok) {
    const body = await sessionRes.json().catch(() => null) as Record<string, unknown> | null;
    const msg = body?.['message'] ?? sessionRes.statusText;
    console.error(`Error: Failed to create multi-wallet session (${sessionRes.status}): ${msg}`);
    process.exit(1);
  }

  const sessionData = await sessionRes.json() as { id: string; token: string; expiresAt: number };

  // Write single token file: DATA_DIR/mcp-token (atomic: write tmp then rename)
  const tokenPath = join(opts.dataDir, 'mcp-token');
  const tmpPath = `${tokenPath}.tmp`;
  await mkdir(dirname(tokenPath), { recursive: true });
  await writeFile(tmpPath, sessionData.token, 'utf-8');
  await rename(tmpPath, tokenPath);

  // Step 5: Output results
  console.log('WAIaaS Quickset Complete!');
  console.log('');
  console.log(`Mode: ${mode}`);

  for (const wallet of createdWallets) {
    const chainLabel = wallet.chain === 'solana' ? 'Solana' : 'EVM';
    console.log('');
    console.log(`${chainLabel} Wallet:`);
    console.log(`  Name: ${wallet.name}`);
    console.log(`  Address: ${wallet.publicKey}`);
    console.log(`  Environment: ${wallet.environment}`);
    if (wallet.defaultNetwork) {
      console.log(`  Default Network: ${wallet.defaultNetwork}`);
    }
    if (wallet.availableNetworks.length > 0) {
      console.log(`  Available Networks: ${wallet.availableNetworks.join(', ')}`);
    }
  }

  // Multi-wallet session info
  const defaultWallet = createdWallets[0];
  const walletNames = createdWallets.map((w) => w.name).join(', ');
  console.log('');
  console.log('Multi-Wallet Session:');
  console.log(`  Session ID: ${sessionData.id}`);
  console.log(`  Connected Wallets: ${createdWallets.length} (${walletNames})`);
  if (defaultWallet) {
    console.log(`  Default Wallet: ${defaultWallet.name}`);
  }
  const expDate = new Date(sessionData.expiresAt * 1000);
  const yyyy = expDate.getFullYear();
  const mm = String(expDate.getMonth() + 1).padStart(2, '0');
  const dd = String(expDate.getDate()).padStart(2, '0');
  const hh = String(expDate.getHours()).padStart(2, '0');
  const min = String(expDate.getMinutes()).padStart(2, '0');
  console.log(`  Expires at: ${yyyy}-${mm}-${dd} ${hh}:${min}`);

  // Step 6: Single MCP config entry (no WAIAAS_WALLET_ID)
  const mcpServers: Record<string, Record<string, unknown>> = {
    'waiaas': {
      command: 'npx',
      args: ['@waiaas/mcp'],
      env: {
        WAIAAS_DATA_DIR: opts.dataDir,
        WAIAAS_BASE_URL: baseUrl,
      },
    },
  };

  console.log('');
  console.log('MCP Configuration:');
  console.log('(Add to your claude_desktop_config.json)');
  const configSnippet = { mcpServers };
  console.log(JSON.stringify(configSnippet, null, 2));
  printConfigPath();

  // Step 7: Agent connection prompt
  console.log('');
  console.log('AI Agent Connection Prompt:');
  console.log('(Copy and paste the block below to your AI agent)');
  console.log('\u2500'.repeat(40));
  console.log('[WAIaaS Connection]');
  console.log(`- URL: ${baseUrl}`);
  console.log(`- Session Token: ${sessionData.token}`);
  console.log('');
  console.log('Connected Wallets:');
  createdWallets.forEach((wallet, index) => {
    const network = wallet.defaultNetwork ?? wallet.environment;
    console.log(`${index + 1}. ${wallet.name} (${wallet.id.slice(0, 8)}) \u2014 ${network}`);
  });
  console.log('');
  console.log('Use GET /v1/connect-info with this session token to discover');
  console.log('your wallets, policies, capabilities, and available operations.');
  console.log('\u2500'.repeat(40));
}
