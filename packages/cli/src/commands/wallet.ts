/**
 * `waiaas wallet` subcommand group:
 *   wallet info                          -- Show wallet details
 *   wallet set-default-network <network> -- Change default network
 *
 * Both commands use masterAuth (X-Master-Password header) for daemon communication.
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
  isDefault: boolean;
}

interface WalletNetworksResponse {
  id: string;
  chain: string;
  environment: string;
  defaultNetwork: string | null;
  availableNetworks: NetworkInfo[];
}

interface SetDefaultNetworkResponse {
  id: string;
  defaultNetwork: string;
  previousNetwork: string | null;
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

  const defaultNet = networks.availableNetworks.find((n) => n.isDefault)?.network ?? wallet.network;
  const available = networks.availableNetworks.map((n) => n.network).join(', ') || 'none';

  console.log('');
  console.log(`Wallet: ${wallet.name}`);
  console.log(`  ID:               ${wallet.id}`);
  console.log(`  Chain:            ${wallet.chain}`);
  console.log(`  Environment:      ${wallet.environment}`);
  console.log(`  Address:          ${wallet.publicKey}`);
  console.log(`  Default Network:  ${defaultNet}`);
  console.log(`  Available:        ${available}`);
  console.log(`  Status:           ${wallet.status}`);
  console.log('');
}

/**
 * `waiaas wallet set-default-network <network>` -- Change default network.
 */
export async function walletSetDefaultNetworkCommand(
  opts: WalletCommandOptions,
  network: string,
): Promise<void> {
  const password = await getMasterPassword(opts);
  const wallet = await selectWallet(opts.baseUrl, password, opts.walletId);

  const result = await daemonRequest<SetDefaultNetworkResponse>(
    opts.baseUrl,
    'PUT',
    `/v1/wallets/${wallet.id}/default-network`,
    password,
    { network },
  );

  console.log('');
  console.log(`Default network changed for wallet '${wallet.name}':`);
  console.log(`  Previous: ${result.previousNetwork ?? '(none)'}`);
  console.log(`  Current:  ${result.defaultNetwork}`);
  console.log('');
}
