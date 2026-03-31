/**
 * Setup Wizard Step 4: Connect Owner Wallet (Optional)
 *
 * This step provides a "Connect via WalletConnect" button (placeholder
 * until Plan 03 wires in the WC QR modal) and a "Skip for now" option.
 */

import { signal } from '@preact/signals';
import type { ComponentType } from 'preact';
import { wizardData, nextStep, prevStep, skipOwnerStep } from '../wizard-store';

/** Placeholder type for the WC connect handler, injected by Plan 03 */
type OwnerConnectHandler = () => Promise<void>;

let _ownerConnectHandler: OwnerConnectHandler | null = null;

/** Called by Plan 03 to inject the WC connect handler */
export function setOwnerConnector(handler: OwnerConnectHandler): void {
  _ownerConnectHandler = handler;
}

const wcModalOpen = signal(false);
const wcConnected = signal(false);
const connectedAddress = signal<string | null>(null);

// Lazy-loaded WC modal component (injected by Plan 03 handleConnect)
const WcModalComponent = signal<ComponentType<{
  open: boolean;
  onClose: () => void;
  onConnected: (result: { success: boolean; ownerAddress?: string }) => void;
}> | null>(null);

const loading = signal(false);
const error = signal<string | null>(null);

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 'var(--space-4)',
  },
  description: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-text-secondary)',
    lineHeight: '1.5',
  },
  connectButton: {
    width: '100%',
    padding: 'var(--space-3) var(--space-4)',
    background: 'var(--color-primary)',
    color: '#0c0c0c',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-medium)',
    cursor: 'pointer',
  },
  buttonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  skipLink: {
    textAlign: 'center' as const,
    color: 'var(--color-text-secondary)',
    fontSize: 'var(--font-size-sm)',
    cursor: 'pointer',
    textDecoration: 'underline',
    background: 'none',
    border: 'none',
    padding: 'var(--space-2)',
  },
  successBox: {
    padding: 'var(--space-3)',
    background: 'var(--color-bg-secondary)',
    border: '1px solid var(--color-success)',
    borderRadius: 'var(--radius-md)',
    textAlign: 'center' as const,
  },
  successAddress: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-text-secondary)',
    wordBreak: 'break-all' as const,
    marginTop: 'var(--space-1)',
  },
  nextButton: {
    width: '100%',
    padding: 'var(--space-2) var(--space-4)',
    background: 'var(--color-primary)',
    color: '#0c0c0c',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-medium)',
    cursor: 'pointer',
  },
  buttonRow: {
    display: 'flex',
    gap: 'var(--space-3)',
  },
  buttonBack: {
    flex: 1,
    padding: 'var(--space-2) var(--space-4)',
    background: 'transparent',
    color: 'var(--color-text)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-size-base)',
    cursor: 'pointer',
  },
  noWallet: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-warning)',
    textAlign: 'center' as const,
  },
  error: {
    color: 'var(--color-danger)',
    fontSize: 'var(--font-size-sm)',
    textAlign: 'center' as const,
  },
} as const;

/**
 * Handle WalletConnect button click.
 * Plan 03 will update this to dynamically import the WC modules.
 * For now, it uses the injected _ownerConnectHandler if available.
 */
async function handleConnect() {
  if (!wizardData.value.walletId) return;
  error.value = null;
  loading.value = true;

  try {
    if (_ownerConnectHandler) {
      await _ownerConnectHandler();
    } else {
      error.value = 'WalletConnect not available yet. Skip for now.';
    }
  } catch {
    error.value = 'Failed to connect via WalletConnect';
  } finally {
    loading.value = false;
  }
}

function handleWcConnected(result: { success: boolean; ownerAddress?: string }) {
  wcModalOpen.value = false;
  if (result.success && result.ownerAddress) {
    wcConnected.value = true;
    connectedAddress.value = result.ownerAddress;
  }
}

function handleWcClose() {
  wcModalOpen.value = false;
}

export { wcModalOpen, wcConnected, connectedAddress, WcModalComponent, loading, error };

export function OwnerStep() {
  const hasWallet = wizardData.value.walletId !== null;
  const ModalComp = WcModalComponent.value;

  return (
    <div style={styles.container}>
      <p style={styles.description}>
        Connect an external wallet (MetaMask, Phantom, etc.) as the Owner of this wallet.
        The Owner can approve high-value transactions and manage security settings.
      </p>

      {!hasWallet && (
        <p style={styles.noWallet}>
          Wallet not created. Skip or go back to create a wallet first.
        </p>
      )}

      {wcConnected.value ? (
        <>
          <div style={styles.successBox}>
            <div>Owner Connected</div>
            <div style={styles.successAddress}>{connectedAddress.value}</div>
          </div>
          <button style={styles.nextButton} onClick={nextStep}>
            Continue
          </button>
        </>
      ) : (
        <>
          <button
            style={{
              ...styles.connectButton,
              ...(!hasWallet || loading.value ? styles.buttonDisabled : {}),
            }}
            disabled={!hasWallet || loading.value}
            onClick={handleConnect}
          >
            {loading.value ? 'Loading...' : 'Connect via WalletConnect'}
          </button>

          {error.value && <p style={styles.error}>{error.value}</p>}

          <div style={styles.buttonRow}>
            <button style={styles.buttonBack} onClick={prevStep}>Back</button>
            <button style={styles.skipLink} onClick={skipOwnerStep}>
              Skip for now
            </button>
          </div>
        </>
      )}

      {ModalComp && (
        <ModalComp
          open={wcModalOpen.value}
          onClose={handleWcClose}
          onConnected={handleWcConnected}
        />
      )}
    </div>
  );
}
