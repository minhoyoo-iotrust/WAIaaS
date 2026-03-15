import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { api, ApiError } from '../api/typed-client';
import type { components } from '../api/types.generated';
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

type WalletSummary = components['schemas']['WalletCrudResponse'];

// WcSession: path-level type (no named schema)
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

// WcPairingResult, WcPairingStatus, WcTableRow: UI-only types (not from API schema)
// UI-only type (not from API schema)
interface WcPairingResult {
  uri: string;
  qrCode: string;
  expiresAt: number;
}

// UI-only type (not from API schema)
interface WcPairingStatus {
  status: 'pending' | 'connected' | 'expired' | 'none';
  session?: WcSession | null;
}

// UI-only type (not from API schema)
interface WcTableRow {
  wallet: WalletSummary;
  session: WcSession | null;
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export function WalletConnectPage() {
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
      const { data: result } = await api.GET('/v1/wallets');
      wallets.value = result!.items;

      // Fetch WC session for each wallet (404 = null)
      const sessionMap: Record<string, WcSession | null> = {};
      await Promise.all(
        result!.items.map(async (w) => {
          try {
            const { data } = await api.GET('/v1/wallets/{id}/wc/session', { params: { path: { id: w.id } } });
            sessionMap[w.id] = data as unknown as WcSession;
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
        const { data: status } = await api.GET('/v1/wallets/{id}/wc/pair/status', { params: { path: { id: walletId } } }) as { data: WcPairingStatus };
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
      const { data: result } = await api.POST('/v1/wallets/{id}/wc/pair', { params: { path: { id: walletId } } });
      pairingResult.value = result as unknown as WcPairingResult;
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
      await api.DELETE('/v1/wallets/{id}/wc/session', { params: { path: { id: walletId } } });
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
