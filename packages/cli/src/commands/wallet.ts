/**
 * `waiaas wallet` subcommand group:
 *   wallet create                        -- Create a new wallet
 *   wallet info                          -- Show wallet details
 *
 * All commands use masterAuth (X-Master-Password header) for daemon communication.
 */

import { resolvePassword } from '../utils/password.js';

export interface WalletCommandOptions {
  baseUrl: string;
  password?: string;
  walletId?: string;
}

interface WalletListItem {
  id: string;
  name: string;
  chain: string;
  network: string;
  environment: string;
  publicKey: string;
  status: string;
}

interface NetworkInfo {
  network: string;
}

interface WalletNetworksResponse {
  id: string;
  chain: string;
  environment: string;
  availableNetworks: NetworkInfo[];
}

/**
 * Resolve master password from --password flag or env/prompt.
 */
async function getMasterPassword(opts: WalletCommandOptions): Promise<string> {
  if (opts.password) return opts.password;
  return resolvePassword();
}

/**
 * Make an authenticated request to the daemon.
 */
async function daemonRequest<T>(
  baseUrl: string,
  method: string,
  path: string,
  password: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Master-Password': password,
  };

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => null) as Record<string, unknown> | null;
    const msg = errBody?.['message'] ?? res.statusText;
    console.error(`Error (${res.status}): ${msg}`);
    process.exit(1);
  }

  return (await res.json()) as T;
}

/**
 * Select wallet: use --wallet if provided, otherwise auto-detect if only one exists.
 */
async function selectWallet(
  baseUrl: string,
  password: string,
  walletId?: string,
): Promise<WalletListItem> {
  const data = await daemonRequest<{ items: WalletListItem[] }>(
    baseUrl, 'GET', '/v1/wallets', password,
  );

  if (data.items.length === 0) {
    console.error('Error: No wallets found. Create one first with `waiaas quickstart`.');
    process.exit(1);
  }

  if (walletId) {
    const found = data.items.find((w) => w.id === walletId || w.name === walletId);
    if (!found) {
      console.error(`Error: Wallet '${walletId}' not found.`);
      process.exit(1);
    }
    return found;
  }

  if (data.items.length > 1) {
    console.error('Error: Multiple wallets found. Use --wallet <id> to specify one.');
    console.error('  Available wallets:');
    for (const w of data.items) {
      console.error(`    ${w.id}  ${w.name}  (${w.chain}/${w.environment})`);
    }
    process.exit(1);
  }

  return data.items[0]!;
}

/**
 * `waiaas wallet info` -- Show wallet details including address and networks.
 */
export async function walletInfoCommand(opts: WalletCommandOptions): Promise<void> {
  const password = await getMasterPassword(opts);
  const wallet = await selectWallet(opts.baseUrl, password, opts.walletId);

  // Fetch available networks
  const networks = await daemonRequest<WalletNetworksResponse>(
    opts.baseUrl, 'GET', `/v1/wallets/${wallet.id}/networks`, password,
  );

  const available = networks.availableNetworks.map((n) => n.network).join(', ') || 'none';

  console.log('');
  console.log(`Wallet: ${wallet.name}`);
  console.log(`  ID:               ${wallet.id}`);
  console.log(`  Chain:            ${wallet.chain}`);
  console.log(`  Environment:      ${wallet.environment}`);
  console.log(`  Address:          ${wallet.publicKey}`);
  console.log(`  Available:        ${available}`);
  console.log(`  Status:           ${wallet.status}`);
  console.log('');
}

export interface WalletCreateOptions {
  baseUrl: string;
  password?: string;
  chain?: string;
  all?: boolean;
  mode?: string;
  name?: string;
}

interface CreatedWallet {
  id: string;
  name: string;
  chain: string;
  environment: string;
  publicKey: string;
}

const SUPPORTED_CHAINS = ['solana', 'ethereum'] as const;

/**
 * `waiaas wallet create` -- Create one or more wallets.
 */
export async function walletCreateCommand(opts: WalletCreateOptions): Promise<void> {
  if (opts.chain && opts.all) {
    console.error('Error: --chain and --all cannot be used together.');
    process.exit(1);
  }

  if (!opts.chain && !opts.all) {
    console.error('Error: Specify --chain <solana|ethereum> or --all.');
    process.exit(1);
  }

  if (opts.chain && !SUPPORTED_CHAINS.includes(opts.chain as typeof SUPPORTED_CHAINS[number])) {
    console.error("Error: Unsupported chain. Use 'solana' or 'ethereum'.");
    process.exit(1);
  }

  const password = opts.password ?? await resolvePassword();
  const mode = opts.mode ?? 'mainnet';

  const chains: Array<{ chain: string; name: string }> = opts.all
    ? SUPPORTED_CHAINS.map((c) => ({ chain: c, name: `${c === 'ethereum' ? 'evm' : c}-${mode}` }))
    : [{ chain: opts.chain!, name: opts.name ?? `${opts.chain === 'ethereum' ? 'evm' : opts.chain}-${mode}` }];

  const created: CreatedWallet[] = [];

  for (const { chain, name } of chains) {
    let res: Response;
    try {
      res = await fetch(`${opts.baseUrl}/v1/wallets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Master-Password': password,
        },
        body: JSON.stringify({ name, chain, environment: mode }),
      });
    } catch {
      console.error('Error: Daemon is not running. Start it with `waiaas start`.');
      process.exit(1);
    }

    if (res.status === 409) {
      // Idempotent: wallet with same name already exists, reuse it
      const listRes = await fetch(`${opts.baseUrl}/v1/wallets`, {
        headers: { 'Accept': 'application/json', 'X-Master-Password': password },
      });
      if (!listRes.ok) {
        console.error(`Error: Failed to list wallets (HTTP ${listRes.status})`);
        process.exit(1);
      }
      const listData = await listRes.json() as { wallets: Array<CreatedWallet> };
      const existing = listData.wallets.find((w) => w.name === name);
      if (!existing) {
        console.error(`Error: Wallet '${name}' reported as existing but not found`);
        process.exit(1);
      }
      console.log(`Reusing existing wallet: ${existing.name} (${existing.id})`);
      created.push(existing);
    } else if (!res.ok) {
      const body = await res.json().catch(() => null) as Record<string, unknown> | null;
      const msg = body?.['message'] ?? res.statusText;
      console.error(`Error: Failed to create ${chain} wallet (HTTP ${res.status}): ${msg}`);
      process.exit(1);
    } else {
      const data = await res.json() as CreatedWallet;
      console.log(`Created wallet: ${data.name} (${data.id})`);
      created.push(data);
    }
  }

  // Fetch networks for each wallet and display summary
  console.log('');
  for (const w of created) {
    const networks = await daemonRequest<WalletNetworksResponse>(
      opts.baseUrl, 'GET', `/v1/wallets/${w.id}/networks`, password,
    );
    const available = networks.availableNetworks.map((n) => n.network).join(', ') || 'none';
    console.log(`Wallet: ${w.name}`);
    console.log(`  ID:               ${w.id}`);
    console.log(`  Chain:            ${w.chain}`);
    console.log(`  Environment:      ${w.environment}`);
    console.log(`  Address:          ${w.publicKey}`);
    console.log(`  Available:        ${available}`);
    console.log('');
  }
}

