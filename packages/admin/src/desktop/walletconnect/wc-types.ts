/**
 * WalletConnect-related type definitions for Desktop app.
 *
 * Uses Plan B approach: daemon REST API for WC pairing (no @reown/appkit dependency).
 */

export interface WcPairingState {
  status: 'idle' | 'pairing' | 'waiting' | 'connected' | 'expired' | 'error';
  qrCodeDataUrl: string | null;
  uri: string | null;
  expiresAt: number | null;
  error: string | null;
  ownerAddress: string | null;
}

export interface WcConnectionResult {
  success: boolean;
  ownerAddress?: string;
  chain?: string;
  error?: string;
}
