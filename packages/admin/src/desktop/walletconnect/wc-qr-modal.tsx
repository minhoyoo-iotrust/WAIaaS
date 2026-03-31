/**
 * WalletConnect QR code display modal for Desktop pairing.
 *
 * Reads pairingState signal reactively to show QR, waiting state,
 * success, or error conditions.
 */

import { useEffect } from 'preact/hooks';
import { Modal } from '../../components/modal';
import { pairingState, cancelPairing } from './wc-connector';
import type { WcConnectionResult } from './wc-types';

interface WcQrModalProps {
  open: boolean;
  onClose: () => void;
  onConnected: (result: WcConnectionResult) => void;
}

const styles = {
  center: {
    textAlign: 'center' as const,
  },
  qrImage: {
    width: '280px',
    height: '280px',
    margin: '0 auto',
    display: 'block',
  },
  hint: {
    marginTop: 'var(--space-3)',
    color: 'var(--color-text-secondary)',
    fontSize: '0.85rem',
  },
  waiting: {
    marginTop: 'var(--space-2)',
    color: 'var(--color-text-secondary)',
    fontSize: '0.75rem',
  },
  spinner: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '200px',
    color: 'var(--color-text-secondary)',
  },
  success: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 'var(--space-3)',
    minHeight: '200px',
    justifyContent: 'center',
  },
  successIcon: {
    fontSize: '3rem',
    color: 'var(--color-success)',
  },
  address: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-text-secondary)',
    wordBreak: 'break-all' as const,
  },
  errorBox: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 'var(--space-3)',
    minHeight: '200px',
    justifyContent: 'center',
  },
  errorText: {
    color: 'var(--color-danger)',
    fontSize: 'var(--font-size-sm)',
  },
  retryButton: {
    padding: 'var(--space-2) var(--space-4)',
    background: 'var(--color-primary)',
    color: '#0c0c0c',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-size-sm)',
    cursor: 'pointer',
  },
} as const;

export function WcQrModal({ open, onClose, onConnected }: WcQrModalProps) {
  const state = pairingState.value;

  // Auto-close and notify on successful connection
  useEffect(() => {
    if (state.status === 'connected' && state.ownerAddress) {
      const timer = setTimeout(() => {
        onConnected({
          success: true,
          ownerAddress: state.ownerAddress!,
        });
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [state.status, state.ownerAddress, onConnected]);

  function handleClose() {
    cancelPairing();
    onClose();
  }

  function getTitle(): string {
    switch (state.status) {
      case 'connected': return 'Connected!';
      case 'expired':
      case 'error': return 'Pairing Failed';
      default: return 'Scan QR Code';
    }
  }

  return (
    <Modal open={open} title={getTitle()} onCancel={handleClose}>
      <div style={styles.center}>
        {state.status === 'pairing' && (
          <div style={styles.spinner}>Starting pairing...</div>
        )}

        {state.status === 'waiting' && state.qrCodeDataUrl && (
          <>
            <img
              src={state.qrCodeDataUrl}
              alt="WalletConnect QR Code"
              style={styles.qrImage}
            />
            <p style={styles.hint}>
              Scan with Phantom, MetaMask, or any WalletConnect-compatible wallet
            </p>
            <p style={styles.waiting}>Waiting for connection...</p>
          </>
        )}

        {state.status === 'connected' && (
          <div style={styles.success}>
            <span style={styles.successIcon}>&#10003;</span>
            <div>Owner wallet connected</div>
            {state.ownerAddress && (
              <div style={styles.address}>{state.ownerAddress}</div>
            )}
          </div>
        )}

        {(state.status === 'expired' || state.status === 'error') && (
          <div style={styles.errorBox}>
            <p style={styles.errorText}>{state.error || 'Pairing failed'}</p>
            <button style={styles.retryButton} onClick={handleClose}>
              Try Again
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
