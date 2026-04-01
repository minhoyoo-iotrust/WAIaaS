/**
 * Tests for desktop/walletconnect/wc-types.ts -- WalletConnect type definitions.
 */
import { describe, it, expect } from 'vitest';
import type { WcPairingState, WcConnectionResult } from '../../desktop/walletconnect/wc-types';

describe('wc-types', () => {
  it('should define WcPairingState with all status values', () => {
    const states: WcPairingState['status'][] = [
      'idle',
      'pairing',
      'waiting',
      'connected',
      'expired',
      'error',
    ];
    expect(states).toHaveLength(6);
  });

  it('should define WcPairingState idle state', () => {
    const state: WcPairingState = {
      status: 'idle',
      qrCodeDataUrl: null,
      uri: null,
      expiresAt: null,
      error: null,
      ownerAddress: null,
    };
    expect(state.status).toBe('idle');
    expect(state.qrCodeDataUrl).toBeNull();
  });

  it('should define WcPairingState waiting state with QR data', () => {
    const state: WcPairingState = {
      status: 'waiting',
      qrCodeDataUrl: 'data:image/png;base64,abc123',
      uri: 'wc:abc123@2?relay-protocol=irn&symKey=xyz',
      expiresAt: 1700000000,
      error: null,
      ownerAddress: null,
    };
    expect(state.uri).toContain('wc:');
    expect(state.expiresAt).toBe(1700000000);
  });

  it('should define WcPairingState connected state', () => {
    const state: WcPairingState = {
      status: 'connected',
      qrCodeDataUrl: null,
      uri: null,
      expiresAt: null,
      error: null,
      ownerAddress: '0x1234567890abcdef',
    };
    expect(state.ownerAddress).toBe('0x1234567890abcdef');
  });

  it('should define WcPairingState error state', () => {
    const state: WcPairingState = {
      status: 'error',
      qrCodeDataUrl: null,
      uri: null,
      expiresAt: null,
      error: 'Connection failed',
      ownerAddress: null,
    };
    expect(state.error).toBe('Connection failed');
  });

  it('should define WcConnectionResult success', () => {
    const result: WcConnectionResult = {
      success: true,
      ownerAddress: '0xabc',
      chain: 'eip155:1',
    };
    expect(result.success).toBe(true);
    expect(result.ownerAddress).toBe('0xabc');
  });

  it('should define WcConnectionResult failure', () => {
    const result: WcConnectionResult = {
      success: false,
      error: 'Timeout',
    };
    expect(result.success).toBe(false);
    expect(result.error).toBe('Timeout');
  });
});
