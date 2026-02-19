/**
 * `waiaas quickset` -- Quick setup: create wallets, sessions, and MCP tokens.
 * (Also available as `waiaas quickstart` for backward compatibility.)
 *
 * One-command multi-chain environment setup:
 *   1. Check daemon is running (GET /health)
 *   2. Resolve master password
 *   3. Create Solana + EVM wallets with environment mode
 *   4. Fetch available networks for each wallet
 *   5. Create MCP sessions + write token files
 *   6. Output wallet info + MCP config snippet
 */

import { writeFile, rename, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { resolvePassword } from '../utils/password.js';
import { toSlug } from '../utils/slug.js';

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
  sessionToken: string | null;
}

interface NetworkInfo {
  network: string;
  isDefault?: boolean;
}

/** Create session for a wallet and write token file atomically. */
async function createSessionAndWriteToken(opts: {
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
    console.error(`Error: Failed to create session for wallet ${opts.walletId} (${sessionRes.status}): ${msg}`);
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

export async function quickstartCommand(opts: QuickstartOptions): Promise<void> {
  const baseUrl = (opts.baseUrl ?? 'http://127.0.0.1:3100').replace(/\/+$/, '');
  const mode = opts.mode ?? 'testnet';
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

    if (!walletRes.ok) {
      const body = await walletRes.json().catch(() => null) as Record<string, unknown> | null;
      const msg = body?.['message'] ?? walletRes.statusText;
      console.error(`Error: Failed to create ${chain} wallet (HTTP ${walletRes.status}): ${msg}`);
      process.exit(1);
    }

    const walletData = await walletRes.json() as {
      id: string;
      name: string;
      chain: string;
      environment: string;
      publicKey: string;
      defaultNetwork: string | null;
      session: { id: string; token: string; expiresAt: number } | null;
    };

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
        const networksData = await networksRes.json() as { networks: NetworkInfo[] };
        availableNetworks = (networksData.networks ?? []).map((n) => n.network);
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
      sessionToken: walletData.session?.token ?? null,
    });
  }

  // Step 4: Write MCP token files + build config (sessions auto-created in Step 3)
  const mcpServers: Record<string, Record<string, unknown>> = {};

  for (const wallet of createdWallets) {
    if (wallet.sessionToken) {
      // Write token to mcp-tokens/<walletId> (atomic: write tmp then rename)
      const tokenPath = join(opts.dataDir, 'mcp-tokens', wallet.id);
      const tmpPath = `${tokenPath}.tmp`;
      await mkdir(dirname(tokenPath), { recursive: true });
      await writeFile(tmpPath, wallet.sessionToken, 'utf-8');
      await rename(tmpPath, tokenPath);
    } else {
      // Fallback: create session separately (for older daemons without auto-session)
      await createSessionAndWriteToken({
        baseUrl,
        dataDir: opts.dataDir,
        password,
        walletId: wallet.id,
        expiresIn,
      });
    }

    const slug = toSlug(wallet.name);
    mcpServers[`waiaas-${slug}`] = buildConfigEntry({
      dataDir: opts.dataDir,
      baseUrl,
      walletId: wallet.id,
      walletName: wallet.name,
    });
  }

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

  // Step 6: MCP config snippet
  console.log('');
  console.log('MCP Configuration:');
  console.log('(claude_desktop_config.json에 추가하세요)');
  const configSnippet = { mcpServers };
  console.log(JSON.stringify(configSnippet, null, 2));
  printConfigPath();

  // Step 7: Agent connection prompt (magic word)
  console.log('');
  console.log('AI Agent Connection Prompt:');
  console.log('(Copy and paste the block below to your AI agent)');
  console.log('\u2500'.repeat(40));
  console.log('[WAIaaS Connection]');
  console.log(`- URL: ${baseUrl}`);
  console.log('');
  console.log('Wallets:');
  createdWallets.forEach((wallet, index) => {
    const network = wallet.defaultNetwork ?? wallet.environment;
    console.log(`${index + 1}. ${wallet.name} (${wallet.id}) \u2014 ${network}`);
    console.log(`   Session: ${wallet.sessionToken ?? 'N/A'}`);
  });
  console.log('');
  console.log('\uC138\uC158\uC774 \uB9CC\uB8CC\uB418\uBA74(401 Unauthorized)');
  console.log('POST /v1/wallets/{walletId}/sessions/{sessionId}/renew \uC73C\uB85C \uAC31\uC2E0\uD558\uC138\uC694.');
  console.log('');
  console.log('\uC704 \uC815\uBCF4\uB85C WAIaaS \uC9C0\uAC11\uC5D0 \uC5F0\uACB0\uD558\uC5EC \uC794\uC561\uC744 \uD655\uC778\uD558\uACE0 \uAD00\uB9AC\uD574\uC8FC\uC138\uC694.');
  console.log('\u2500'.repeat(40));
}
