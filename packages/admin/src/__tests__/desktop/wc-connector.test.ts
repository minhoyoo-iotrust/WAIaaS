/**
 * Tests for desktop/walletconnect/wc-connector.ts -- WalletConnect pairing orchestration.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch is set up globally in setup.ts
const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;

import {
  pairingState,
  cancelPairing,
  connectViaWalletConnect,
} from '../../desktop/walletconnect/wc-connector';

describe('wc-connector', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch.mockReset();
    cancelPairing();
  });

  afterEach(() => {
    cancelPairing();
    vi.useRealTimers();
  });

  it('should export pairingState with idle initial state', () => {
    expect(pairingState.value.status).toBe('idle');
    expect(pairingState.value.qrCodeDataUrl).toBeNull();
    expect(pairingState.value.uri).toBeNull();
    expect(pairingState.value.ownerAddress).toBeNull();
  });

  it('cancelPairing should reset state to idle', () => {
    // Manually modify state
    pairingState.value = { ...pairingState.value, status: 'waiting', uri: 'wc:test' };
    cancelPairing();
    expect(pairingState.value.status).toBe('idle');
    expect(pairingState.value.uri).toBeNull();
  });

  it('should return error when pairing POST fails with error response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ message: 'Wallet not found' }),
    });

    const result = await connectViaWalletConnect('wallet-1', 'pass123');
    expect(result).toEqual({ success: false, error: 'Wallet not found' });
    expect(pairingState.value.status).toBe('error');
    expect(pairingState.value.error).toBe('Wallet not found');
  });

  it('should return error when pairing POST fails with non-JSON response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.reject(new Error('not json')),
    });

    const result = await connectViaWalletConnect('wallet-1', 'pass123');
    expect(result).toEqual({ success: false, error: 'Failed to start pairing' });
  });

  it('should return error when fetch throws (network error)', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const result = await connectViaWalletConnect('wallet-1', 'pass123');
    expect(result).toEqual({ success: false, error: 'Cannot connect to daemon' });
    expect(pairingState.value.status).toBe('error');
  });

  it('should set waiting state with QR data after successful pairing POST', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            uri: 'wc:abc@2',
            qrCode: 'data:image/png;base64,qrdata',
            expiresAt: 1700000000,
          }),
      })
      // The poll will start -- return pending status
      .mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'pending' }),
      });

    // Start connection -- don't await (it returns a promise that resolves on poll result)
    const promise = connectViaWalletConnect('wallet-1', 'pass123');

    // Wait for the POST to complete
    await vi.waitFor(() => {
      expect(pairingState.value.status).toBe('waiting');
    });

    expect(pairingState.value.qrCodeDataUrl).toBe('data:image/png;base64,qrdata');
    expect(pairingState.value.uri).toBe('wc:abc@2');
    expect(pairingState.value.expiresAt).toBe(1700000000);

    // Resolve by simulating a connected poll response
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: 'connected',
          session: { ownerAddress: '0xowner', chainId: 'eip155:1' },
        }),
    });

    // Advance timer to trigger poll
    await vi.advanceTimersByTimeAsync(3000);

    const result = await promise;
    expect(result).toEqual({
      success: true,
      ownerAddress: '0xowner',
      chain: 'eip155:1',
    });
    expect(pairingState.value.status).toBe('connected');
    expect(pairingState.value.ownerAddress).toBe('0xowner');
  });

  it('should resolve with error when status becomes expired', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            uri: 'wc:abc@2',
            qrCode: 'data:image/png;base64,qr',
            expiresAt: 1700000000,
          }),
      })
      .mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'expired' }),
      });

    const promise = connectViaWalletConnect('wallet-1', 'pass123');

    await vi.advanceTimersByTimeAsync(3000);

    const result = await promise;
    expect(result).toEqual({ success: false, error: 'Pairing expired' });
    expect(pairingState.value.status).toBe('expired');
  });

  it('should resolve with error when status becomes none', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            uri: 'wc:abc@2',
            qrCode: 'data:image/png;base64,qr',
            expiresAt: 1700000000,
          }),
      })
      .mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'none' }),
      });

    const promise = connectViaWalletConnect('wallet-1', 'pass123');

    await vi.advanceTimersByTimeAsync(3000);

    const result = await promise;
    expect(result).toEqual({ success: false, error: 'Pairing expired' });
  });

  it('should keep polling on network error during status check', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            uri: 'wc:abc@2',
            qrCode: 'data:image/png;base64,qr',
            expiresAt: 1700000000,
          }),
      })
      // First poll: network error
      .mockRejectedValueOnce(new Error('Network'))
      // Second poll: still pending
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'pending' }),
      })
      // Third poll: connected
      .mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'connected',
            session: { ownerAddress: '0xowner2', chainId: 'eip155:137' },
          }),
      });

    const promise = connectViaWalletConnect('wallet-1', 'pass123');

    // Advance through 3 poll cycles
    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(3000);

    const result = await promise;
    expect(result.success).toBe(true);
    expect(result.ownerAddress).toBe('0xowner2');
  });

  it('should keep polling on non-ok status response', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            uri: 'wc:abc@2',
            qrCode: 'data:image/png;base64,qr',
            expiresAt: 1700000000,
          }),
      })
      // First poll: 500 error
      .mockResolvedValueOnce({ ok: false })
      // Second poll: connected
      .mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'connected',
            session: { ownerAddress: '0xowner3', chainId: 'eip155:1' },
          }),
      });

    const promise = connectViaWalletConnect('wallet-1', 'pass123');

    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(3000);

    const result = await promise;
    expect(result.success).toBe(true);
  });

  it('should timeout after MAX_POLLS (100) intervals', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            uri: 'wc:abc@2',
            qrCode: 'data:image/png;base64,qr',
            expiresAt: 1700000000,
          }),
      })
      // All polls return pending
      .mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'pending' }),
      });

    const promise = connectViaWalletConnect('wallet-1', 'pass123');

    // Advance 101 intervals (100 polls + 1 to trigger the timeout check)
    for (let i = 0; i < 101; i++) {
      await vi.advanceTimersByTimeAsync(3000);
    }

    const result = await promise;
    expect(result).toEqual({ success: false, error: 'Pairing timed out' });
    expect(pairingState.value.status).toBe('expired');
  });

  it('should send correct headers with master password', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({}),
    });

    await connectViaWalletConnect('wallet-1', 'my-secret-pass');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/wc/pair'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-Master-Password': 'my-secret-pass',
        }),
      }),
    );
  });
});
