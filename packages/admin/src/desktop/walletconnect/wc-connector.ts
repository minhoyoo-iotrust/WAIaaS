/**
 * WalletConnect pairing + signing orchestration via daemon REST API.
 *
 * Uses Plan B approach: all WC traffic handled server-side by the daemon.
 * No @reown/appkit dependency -- zero additional npm packages required.
 *
 * IMPORTANT: This file must ONLY be loaded via dynamic import inside
 * isDesktop() guards. It is NEVER statically imported in browser code.
 */

import { signal } from '@preact/signals';
import { API } from '../../api/endpoints';
import type { WcPairingState, WcConnectionResult } from './wc-types';

const POLL_INTERVAL_MS = 3_000;
const MAX_POLLS = 100; // 5 minutes timeout

/** Reactive pairing state for UI consumption */
export const pairingState = signal<WcPairingState>({
  status: 'idle',
  qrCodeDataUrl: null,
  uri: null,
  expiresAt: null,
  error: null,
  ownerAddress: null,
});

let pollInterval: ReturnType<typeof setInterval> | null = null;
let pollCount = 0;

function resetState(): void {
  pairingState.value = {
    status: 'idle',
    qrCodeDataUrl: null,
    uri: null,
    expiresAt: null,
    error: null,
    ownerAddress: null,
  };
  pollCount = 0;
}

/** Cancel any active pairing poll and reset state */
export function cancelPairing(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  resetState();
}

/**
 * Start WalletConnect pairing via daemon REST API.
 *
 * Flow:
 * 1. POST /v1/wallets/{id}/wc/pair -> get QR code + URI
 * 2. Poll GET /v1/wallets/{id}/wc/pair/status every 3s
 * 3. Return result when connected or expired/timeout
 */
export async function connectViaWalletConnect(
  walletId: string,
  masterPassword: string,
): Promise<WcConnectionResult> {
  // Cancel any existing pairing
  cancelPairing();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Master-Password': masterPassword,
  };

  // Step 1: Start pairing
  pairingState.value = { ...pairingState.value, status: 'pairing' };

  let pairResult: { uri: string; qrCode: string; expiresAt: number };
  try {
    const res = await fetch(API.WALLET_WC_PAIR(walletId), {
      method: 'POST',
      headers,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const errMsg = (body as { message?: string }).message || 'Failed to start pairing';
      pairingState.value = { ...pairingState.value, status: 'error', error: errMsg };
      return { success: false, error: errMsg };
    }
    pairResult = await res.json() as typeof pairResult;
  } catch {
    pairingState.value = { ...pairingState.value, status: 'error', error: 'Cannot connect to daemon' };
    return { success: false, error: 'Cannot connect to daemon' };
  }

  // Step 2: Show QR code and start polling
  pairingState.value = {
    status: 'waiting',
    qrCodeDataUrl: pairResult.qrCode,
    uri: pairResult.uri,
    expiresAt: pairResult.expiresAt,
    error: null,
    ownerAddress: null,
  };

  // Step 3: Poll for connection status
  return new Promise<WcConnectionResult>((resolve) => {
    pollCount = 0;

    pollInterval = setInterval(async () => {
      pollCount++;

      if (pollCount > MAX_POLLS) {
        cancelPairing();
        pairingState.value = { ...pairingState.value, status: 'expired', error: 'Pairing timed out' };
        resolve({ success: false, error: 'Pairing timed out' });
        return;
      }

      try {
        const res = await fetch(API.WALLET_WC_PAIR_STATUS(walletId), { headers });
        if (!res.ok) return; // Network error -- keep polling

        const status = await res.json() as {
          status: 'pending' | 'connected' | 'expired' | 'none';
          session?: { ownerAddress: string; chainId: string };
        };

        if (status.status === 'connected' && status.session) {
          if (pollInterval) clearInterval(pollInterval);
          pollInterval = null;
          pairingState.value = {
            ...pairingState.value,
            status: 'connected',
            ownerAddress: status.session.ownerAddress,
          };
          resolve({
            success: true,
            ownerAddress: status.session.ownerAddress,
            chain: status.session.chainId,
          });
        } else if (status.status === 'expired' || status.status === 'none') {
          if (pollInterval) clearInterval(pollInterval);
          pollInterval = null;
          pairingState.value = { ...pairingState.value, status: 'expired', error: 'Pairing expired' };
          resolve({ success: false, error: 'Pairing expired' });
        }
      } catch {
        // Network error -- keep polling
      }
    }, POLL_INTERVAL_MS);
  });
}
