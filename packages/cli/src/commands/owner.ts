/**
 * `waiaas owner` subcommand group:
 *   owner connect              -- Connect external wallet via WalletConnect QR
 *   owner disconnect           -- Disconnect WC session
 *   owner status               -- Show WC session status
 *
 * All commands use masterAuth (X-Master-Password header) for daemon communication.
 */

import QRCode from 'qrcode';
import { resolvePassword } from '../utils/password.js';

export interface OwnerCommandOptions {
  baseUrl: string;
  password?: string;
  walletId?: string;
  poll?: boolean;
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

interface WcPairingResult {
  uri: string;
  qrCode: string;
  expiresAt: number;
}

interface WcPairingStatus {
  status: 'pending' | 'connected' | 'expired' | 'none';
  session?: WcSession | null;
}

interface WcSession {
  walletId: string;
  topic: string;
  peerName: string | null;
  peerUrl: string | null;
  chainId: string;
  ownerAddress: string;
  expiry: number;
  createdAt: number;
}

/**
 * Resolve master password from --password flag or env/prompt.
 */
async function getMasterPassword(opts: OwnerCommandOptions): Promise<string> {
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
 * `waiaas owner connect` -- Connect external wallet via WalletConnect QR code.
 */
export async function ownerConnectCommand(opts: OwnerCommandOptions): Promise<void> {
  const password = await getMasterPassword(opts);
  const wallet = await selectWallet(opts.baseUrl, password, opts.walletId);

  console.log(`\nInitiating WalletConnect pairing for wallet '${wallet.name}'...`);

  const result = await daemonRequest<WcPairingResult>(
    opts.baseUrl, 'POST', `/v1/wallets/${wallet.id}/wc/pair`, password,
  );

  // Generate terminal QR code from URI
  const terminalQr = await QRCode.toString(result.uri, { type: 'terminal', small: true });
  console.log('\n' + terminalQr);
  console.log(`URI: ${result.uri}`);
  console.log("\nScan with D'CENT, MetaMask, Phantom, or any WalletConnect-compatible wallet.\n");

  if (!opts.poll) return;

  // Poll for connection status
  console.log('Waiting for wallet to connect...');
  const maxPolls = 100; // ~5 minutes at 3s intervals
  for (let i = 0; i < maxPolls; i++) {
    await new Promise((resolve) => setTimeout(resolve, 3000));

    try {
      const status = await daemonRequest<WcPairingStatus>(
        opts.baseUrl, 'GET', `/v1/wallets/${wallet.id}/wc/pair/status`, password,
      );

      if (status.status === 'connected') {
        const peerName = status.session?.peerName ?? 'Unknown';
        const ownerAddr = status.session?.ownerAddress ?? 'N/A';
        console.log(`\nConnected! Peer: ${peerName}`);
        console.log(`  Owner Address: ${ownerAddr}`);
        console.log(`  Chain ID: ${status.session?.chainId ?? 'N/A'}`);
        return;
      }

      if (status.status === 'expired' || status.status === 'none') {
        console.log('\nPairing expired. Try again.');
        process.exit(1);
      }

      // Still pending -- continue polling
      process.stdout.write('.');
    } catch {
      // Network error -- keep trying
      process.stdout.write('x');
    }
  }

  console.log('\nTimeout: No connection after 5 minutes.');
  process.exit(1);
}

/**
 * `waiaas owner disconnect` -- Disconnect WalletConnect session.
 */
export async function ownerDisconnectCommand(opts: OwnerCommandOptions): Promise<void> {
  const password = await getMasterPassword(opts);
  const wallet = await selectWallet(opts.baseUrl, password, opts.walletId);

  await daemonRequest<unknown>(
    opts.baseUrl, 'DELETE', `/v1/wallets/${wallet.id}/wc/session`, password,
  );

  console.log(`\nWalletConnect session disconnected for wallet '${wallet.name}'.\n`);
}

/**
 * `waiaas owner status` -- Show WalletConnect session status.
 */
export async function ownerStatusCommand(opts: OwnerCommandOptions): Promise<void> {
  const password = await getMasterPassword(opts);
  const wallet = await selectWallet(opts.baseUrl, password, opts.walletId);

  try {
    const session = await daemonRequest<WcSession>(
      opts.baseUrl, 'GET', `/v1/wallets/${wallet.id}/wc/session`, password,
    );

    console.log('');
    console.log(`WalletConnect Session for '${wallet.name}':`);
    console.log(`  Peer:           ${session.peerName ?? 'Unknown'}`);
    console.log(`  Peer URL:       ${session.peerUrl ?? 'N/A'}`);
    console.log(`  Owner Address:  ${session.ownerAddress}`);
    console.log(`  Chain ID:       ${session.chainId}`);
    console.log(`  Expires:        ${new Date(session.expiry * 1000).toISOString()}`);
    console.log(`  Created:        ${new Date(session.createdAt * 1000).toISOString()}`);
    console.log('');
  } catch {
    // daemonRequest exits on error, so if we get 404 it'll exit there
    // This catch is a safety net
    console.log(`\nNo active WalletConnect session for wallet '${wallet.name}'.\n`);
  }
}
