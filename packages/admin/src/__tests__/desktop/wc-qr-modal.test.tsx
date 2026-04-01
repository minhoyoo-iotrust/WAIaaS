/**
 * Tests for desktop/walletconnect/wc-qr-modal.tsx -- WalletConnect QR display modal.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/preact';

// Mock the wc-connector module
const mockCancelPairing = vi.fn();
vi.mock('../../desktop/walletconnect/wc-connector', async () => {
  const { signal } = await import('@preact/signals');
  return {
    pairingState: signal({
      status: 'idle',
      qrCodeDataUrl: null,
      uri: null,
      expiresAt: null,
      error: null,
      ownerAddress: null,
    }),
    cancelPairing: () => mockCancelPairing(),
  };
});

// Mock the Modal component to simplify testing
vi.mock('../../components/modal', () => ({
  Modal: ({ open, title, children, onCancel }: any) =>
    open ? (
      <div data-testid="modal">
        <div data-testid="modal-title">{title}</div>
        <button data-testid="modal-cancel" onClick={onCancel}>
          Cancel
        </button>
        {children}
      </div>
    ) : null,
}));

// Import after mocks
import { pairingState } from '../../desktop/walletconnect/wc-connector';
import { WcQrModal } from '../../desktop/walletconnect/wc-qr-modal';

describe('WcQrModal', () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    onConnected: vi.fn(),
  };

  beforeEach(() => {
    vi.useFakeTimers();
    mockCancelPairing.mockReset();
    defaultProps.onClose.mockReset();
    defaultProps.onConnected.mockReset();
    // Reset pairing state
    pairingState.value = {
      status: 'idle',
      qrCodeDataUrl: null,
      uri: null,
      expiresAt: null,
      error: null,
      ownerAddress: null,
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should not render when open is false', () => {
    const { container } = render(<WcQrModal {...defaultProps} open={false} />);
    expect(container.querySelector('[data-testid="modal"]')).toBeNull();
  });

  it('should show "Starting pairing..." when status is pairing', () => {
    pairingState.value = { ...pairingState.value, status: 'pairing' };
    render(<WcQrModal {...defaultProps} />);
    expect(screen.getByText('Starting pairing...')).toBeTruthy();
    expect(screen.getByTestId('modal-title').textContent).toBe('Scan QR Code');
  });

  it('should show QR code when status is waiting', () => {
    pairingState.value = {
      ...pairingState.value,
      status: 'waiting',
      qrCodeDataUrl: 'data:image/png;base64,abc',
      uri: 'wc:test@2',
    };
    render(<WcQrModal {...defaultProps} />);
    const img = screen.getByAltText('WalletConnect QR Code') as HTMLImageElement;
    expect(img.src).toBe('data:image/png;base64,abc');
    expect(screen.getByText(/Scan with Phantom/)).toBeTruthy();
    expect(screen.getByText('Waiting for connection...')).toBeTruthy();
  });

  it('should show success state when connected', () => {
    pairingState.value = {
      ...pairingState.value,
      status: 'connected',
      ownerAddress: '0xabc123',
    };
    render(<WcQrModal {...defaultProps} />);
    expect(screen.getByTestId('modal-title').textContent).toBe('Connected!');
    expect(screen.getByText('Owner wallet connected')).toBeTruthy();
    expect(screen.getByText('0xabc123')).toBeTruthy();
  });

  it('should call onConnected after 2s delay when connected', async () => {
    pairingState.value = {
      ...pairingState.value,
      status: 'connected',
      ownerAddress: '0xabc123',
    };
    render(<WcQrModal {...defaultProps} />);

    // Not called immediately
    expect(defaultProps.onConnected).not.toHaveBeenCalled();

    // Advance timer by 2s
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(defaultProps.onConnected).toHaveBeenCalledWith({
      success: true,
      ownerAddress: '0xabc123',
    });
  });

  it('should show error state with "Try Again" button', () => {
    pairingState.value = {
      ...pairingState.value,
      status: 'error',
      error: 'Connection failed',
    };
    render(<WcQrModal {...defaultProps} />);
    expect(screen.getByTestId('modal-title').textContent).toBe('Pairing Failed');
    expect(screen.getByText('Connection failed')).toBeTruthy();
    expect(screen.getByText('Try Again')).toBeTruthy();
  });

  it('should show expired state', () => {
    pairingState.value = {
      ...pairingState.value,
      status: 'expired',
      error: 'Pairing expired',
    };
    render(<WcQrModal {...defaultProps} />);
    expect(screen.getByTestId('modal-title').textContent).toBe('Pairing Failed');
    expect(screen.getByText('Pairing expired')).toBeTruthy();
  });

  it('should show default error text when error is null', () => {
    pairingState.value = {
      ...pairingState.value,
      status: 'error',
      error: null,
    };
    render(<WcQrModal {...defaultProps} />);
    expect(screen.getByText('Pairing failed')).toBeTruthy();
  });

  it('should call cancelPairing and onClose when Try Again is clicked', () => {
    pairingState.value = {
      ...pairingState.value,
      status: 'error',
      error: 'Some error',
    };
    render(<WcQrModal {...defaultProps} />);
    fireEvent.click(screen.getByText('Try Again'));
    expect(mockCancelPairing).toHaveBeenCalled();
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('should call cancelPairing and onClose when modal cancel is clicked', () => {
    pairingState.value = { ...pairingState.value, status: 'pairing' };
    render(<WcQrModal {...defaultProps} />);
    fireEvent.click(screen.getByTestId('modal-cancel'));
    expect(mockCancelPairing).toHaveBeenCalled();
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('getTitle should return "Scan QR Code" for idle/pairing/waiting states', () => {
    pairingState.value = { ...pairingState.value, status: 'idle' };
    const { rerender } = render(<WcQrModal {...defaultProps} />);
    expect(screen.getByTestId('modal-title').textContent).toBe('Scan QR Code');

    pairingState.value = { ...pairingState.value, status: 'waiting', qrCodeDataUrl: 'data:x' };
    rerender(<WcQrModal {...defaultProps} />);
    expect(screen.getByTestId('modal-title').textContent).toBe('Scan QR Code');
  });
});
