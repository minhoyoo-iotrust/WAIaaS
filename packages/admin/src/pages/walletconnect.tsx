import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { apiGet, apiPost, apiDelete, ApiError } from '../api/client';
import { API } from '../api/endpoints';
import { Table } from '../components/table';
import type { Column } from '../components/table';
import { Button, Badge } from '../components/form';
import { Modal } from '../components/modal';
import { showToast } from '../components/toast';
import { getErrorMessage } from '../utils/error-messages';
import { formatDate, formatAddress } from '../utils/format';

// ---------------------------------------------------------------------------
// Types (same shapes as wallets.tsx WC interfaces)
// ---------------------------------------------------------------------------

interface WalletSummary {
  id: string;
  name: string;
  chain: string;
  environment: string;
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

interface WcPairingResult {
  uri: string;
  qrCode: string;
  expiresAt: number;
}

interface WcPairingStatus {
  status: 'pending' | 'connected' | 'expired' | 'none';
  session?: WcSession | null;
}

// ---------------------------------------------------------------------------
// Merged row for table display
// ---------------------------------------------------------------------------

interface WcTableRow {
  wallet: WalletSummary;
  session: WcSession | null;
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function WalletConnectPage() {
  const wallets = useSignal<WalletSummary[]>([]);
  const wcSessions = useSignal<Record<string, WcSession | null>>({});
  const loading = useSignal(true);
  const pairingWalletId = useSignal<string | null>(null);
  const pairingResult = useSignal<WcPairingResult | null>(null);
  const pairingPollRef = useSignal<ReturnType<typeof setInterval> | null>(null);
  const disconnectLoading = useSignal<string | null>(null);

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  const fetchAll = async () => {
    loading.value = true;
    try {
      const result = await apiGet<{ items: WalletSummary[] }>(API.WALLETS);
      wallets.value = result.items;

      // Fetch WC session for each wallet (404 = null)
      const sessionMap: Record<string, WcSession | null> = {};
      await Promise.all(
        result.items.map(async (w) => {
          try {
            sessionMap[w.id] = await apiGet<WcSession>(API.WALLET_WC_SESSION(w.id));
          } catch {
            sessionMap[w.id] = null;
          }
        }),
      );
      wcSessions.value = sessionMap;
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      loading.value = false;
    }
  };

  // -----------------------------------------------------------------------
  // Pairing flow
  // -----------------------------------------------------------------------

  const startPairingPoll = (walletId: string) => {
    if (pairingPollRef.value) clearInterval(pairingPollRef.value);
    pairingPollRef.value = setInterval(async () => {
      try {
        const status = await apiGet<WcPairingStatus>(API.WALLET_WC_PAIR_STATUS(walletId));
        if (status.status === 'connected') {
          if (pairingPollRef.value) clearInterval(pairingPollRef.value);
          pairingPollRef.value = null;
          pairingWalletId.value = null;
          pairingResult.value = null;
          // Update session in map
          wcSessions.value = {
            ...wcSessions.value,
            [walletId]: status.session ?? null,
          };
          showToast('success', 'Wallet connected via WalletConnect');
        } else if (status.status === 'expired' || status.status === 'none') {
          if (pairingPollRef.value) clearInterval(pairingPollRef.value);
          pairingPollRef.value = null;
          pairingWalletId.value = null;
          pairingResult.value = null;
          showToast('error', 'Pairing expired. Try again.');
        }
      } catch {
        // Network error -- keep polling
      }
    }, 3000);
  };

  const handleConnect = async (walletId: string) => {
    pairingWalletId.value = walletId;
    try {
      const result = await apiPost<WcPairingResult>(API.WALLET_WC_PAIR(walletId));
      pairingResult.value = result;
      startPairingPoll(walletId);
    } catch (err) {
      pairingWalletId.value = null;
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    }
  };

  const handleDisconnect = async (walletId: string) => {
    disconnectLoading.value = walletId;
    try {
      await apiDelete(API.WALLET_WC_SESSION(walletId));
      wcSessions.value = { ...wcSessions.value, [walletId]: null };
      showToast('success', 'WalletConnect session disconnected');
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      disconnectLoading.value = null;
    }
  };

  const closeQrModal = () => {
    if (pairingPollRef.value) clearInterval(pairingPollRef.value);
    pairingPollRef.value = null;
    pairingWalletId.value = null;
    pairingResult.value = null;
  };

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  useEffect(() => {
    fetchAll();
    return () => {
      if (pairingPollRef.value) clearInterval(pairingPollRef.value);
    };
  }, []);

  // -----------------------------------------------------------------------
  // Build table rows
  // -----------------------------------------------------------------------

  const rows: WcTableRow[] = wallets.value.map((w) => ({
    wallet: w,
    session: wcSessions.value[w.id] ?? null,
  }));

  const columns: Column<WcTableRow>[] = [
    {
      key: 'name',
      header: 'Wallet',
      render: (r) => r.wallet.name,
    },
    {
      key: 'chain',
      header: 'Chain',
      render: (r) => r.wallet.chain,
    },
    {
      key: 'status',
      header: 'WC Status',
      render: (r) => (
        <Badge variant={r.session ? 'success' : 'neutral'}>
          {r.session ? 'Connected' : 'Not Connected'}
        </Badge>
      ),
    },
    {
      key: 'peerName',
      header: 'Peer',
      render: (r) => r.session?.peerName ?? '--',
    },
    {
      key: 'ownerAddress',
      header: 'Owner Address',
      render: (r) => r.session ? formatAddress(r.session.ownerAddress) : '--',
    },
    {
      key: 'expiry',
      header: 'Expiry',
      render: (r) => r.session ? formatDate(r.session.expiry) : '--',
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (r) =>
        r.session ? (
          <Button
            size="sm"
            variant="danger"
            onClick={() => handleDisconnect(r.wallet.id)}
            loading={disconnectLoading.value === r.wallet.id}
          >
            Disconnect
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => handleConnect(r.wallet.id)}
            loading={pairingWalletId.value === r.wallet.id}
          >
            Connect
          </Button>
        ),
    },
  ];

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div class="page">
      <div class="card" style={{ marginBottom: 'var(--space-4)' }}>
        <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
          Manage WalletConnect sessions across all wallets. Connect an external wallet
          (D'CENT, MetaMask, Phantom) for transaction approval via WalletConnect.
        </p>
      </div>

      <Table<WcTableRow>
        columns={columns}
        data={rows}
        loading={loading.value}
        emptyMessage="No wallets found. Create a wallet first."
      />

      <Modal
        open={pairingResult.value !== null}
        title="Scan QR Code"
        onCancel={closeQrModal}
      >
        {pairingResult.value && (
          <div style={{ textAlign: 'center' }}>
            <img
              src={pairingResult.value.qrCode}
              alt="WalletConnect QR Code"
              style={{ width: '280px', height: '280px', margin: '0 auto' }}
            />
            <p style={{ marginTop: 'var(--space-3)', color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
              Scan with D'CENT, MetaMask, Phantom, or any WalletConnect-compatible wallet
            </p>
            <p style={{ marginTop: 'var(--space-2)', color: 'var(--color-text-secondary)', fontSize: '0.75rem' }}>
              Waiting for connection...
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
