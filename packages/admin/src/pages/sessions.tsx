import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { apiGet, apiPost, apiDelete, ApiError } from '../api/client';
import { API } from '../api/endpoints';
import { Table } from '../components/table';
import type { Column } from '../components/table';
import { Button, Badge } from '../components/form';
import { Modal } from '../components/modal';
import { CopyButton } from '../components/copy-button';
import { showToast } from '../components/toast';
import { getErrorMessage } from '../utils/error-messages';
import { formatDate } from '../utils/format';

interface Wallet {
  id: string;
  name: string;
  chain: string;
  network: string;
  publicKey: string;
  status: string;
  createdAt: number;
}

interface Session {
  id: string;
  walletId: string;
  walletName: string | null;
  status: string;
  renewalCount: number;
  maxRenewals: number;
  expiresAt: number;
  absoluteExpiresAt: number;
  createdAt: number;
  lastRenewedAt: number | null;
}

interface CreatedSession {
  id: string;
  token: string;
  expiresAt: number;
  walletId: string;
}

function openRevoke(
  id: string,
  revokeSessionId: { value: string },
  revokeModal: { value: boolean },
) {
  revokeSessionId.value = id;
  revokeModal.value = true;
}

export default function SessionsPage() {
  const wallets = useSignal<Wallet[]>([]);
  const selectedWalletId = useSignal('');
  const sessions = useSignal<Session[]>([]);
  const loading = useSignal(false);
  const walletsLoading = useSignal(true);
  const createLoading = useSignal(false);
  const tokenModal = useSignal(false);
  const createdToken = useSignal('');
  const revokeModal = useSignal(false);
  const revokeSessionId = useSignal('');
  const revokeLoading = useSignal(false);

  const fetchWallets = async () => {
    try {
      const result = await apiGet<{ items: Wallet[] }>(API.WALLETS);
      wallets.value = result.items.filter((a) => a.status === 'ACTIVE');
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      walletsLoading.value = false;
    }
  };

  const fetchSessions = async () => {
    loading.value = true;
    try {
      const url = selectedWalletId.value
        ? `${API.SESSIONS}?walletId=${selectedWalletId.value}`
        : API.SESSIONS;
      const result = await apiGet<Session[]>(url);
      sessions.value = result;
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      loading.value = false;
    }
  };

  const handleCreate = async () => {
    createLoading.value = true;
    try {
      const result = await apiPost<CreatedSession>(API.SESSIONS, {
        walletId: selectedWalletId.value,
      });
      createdToken.value = result.token;
      tokenModal.value = true;
      await fetchSessions();
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      createLoading.value = false;
    }
  };

  const handleRevoke = async () => {
    revokeLoading.value = true;
    try {
      await apiDelete(API.SESSION(revokeSessionId.value));
      showToast('success', 'Session revoked');
      revokeModal.value = false;
      await fetchSessions();
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      revokeLoading.value = false;
    }
  };

  useEffect(() => {
    fetchWallets();
    fetchSessions();
  }, []);

  useEffect(() => {
    sessions.value = [];
    fetchSessions();
  }, [selectedWalletId.value]);

  const sessionColumns: Column<Session>[] = [
    { key: 'id', header: 'ID', render: (s) => s.id.slice(0, 8) + '...' },
    {
      key: 'walletName',
      header: 'Wallet',
      render: (s) => s.walletName ?? s.walletId.slice(0, 8) + '...',
    },
    {
      key: 'status',
      header: 'Status',
      render: (s) => (
        <Badge
          variant={
            s.status === 'ACTIVE' ? 'success' : s.status === 'EXPIRED' ? 'warning' : 'danger'
          }
        >
          {s.status}
        </Badge>
      ),
    },
    { key: 'expiresAt', header: 'Expires At', render: (s) => formatDate(s.expiresAt) },
    {
      key: 'renewals',
      header: 'Renewals',
      render: (s) => `${s.renewalCount}/${s.maxRenewals}`,
    },
    { key: 'createdAt', header: 'Created', render: (s) => formatDate(s.createdAt) },
    {
      key: 'actions',
      header: 'Actions',
      render: (s) =>
        s.status === 'ACTIVE' ? (
          <Button
            size="sm"
            variant="danger"
            onClick={() => openRevoke(s.id, revokeSessionId, revokeModal)}
          >
            Revoke
          </Button>
        ) : null,
    },
  ];

  return (
    <div class="page">
      <div class="session-controls">
        <div class="session-wallet-select">
          <label for="wallet-select">Wallet</label>
          <select
            id="wallet-select"
            value={selectedWalletId.value}
            onChange={(e) => {
              selectedWalletId.value = (e.target as HTMLSelectElement).value;
            }}
            disabled={walletsLoading.value}
          >
            <option value="">All Wallets</option>
            {wallets.value.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.chain}/{a.network})
              </option>
            ))}
          </select>
        </div>
        <Button
          onClick={handleCreate}
          disabled={!selectedWalletId.value}
          loading={createLoading.value}
        >
          Create Session
        </Button>
      </div>

      <Table<Session>
        columns={sessionColumns}
        data={sessions.value}
        loading={loading.value}
        emptyMessage="No sessions"
      />

      {/* Token Display Modal */}
      <Modal
        open={tokenModal.value}
        title="Session Created"
        onCancel={() => { tokenModal.value = false; }}
        cancelText="Close"
      >
        <p class="token-warning">Copy this token now. It will not be shown again.</p>
        <div class="token-display">
          <code class="token-value">{createdToken.value}</code>
          <CopyButton value={createdToken.value} label="Copy Token" />
        </div>
      </Modal>

      {/* Revoke Confirmation Modal */}
      <Modal
        open={revokeModal.value}
        title="Revoke Session"
        onCancel={() => { revokeModal.value = false; }}
        onConfirm={handleRevoke}
        confirmText="Revoke"
        confirmVariant="danger"
        loading={revokeLoading.value}
      >
        <p>
          Are you sure you want to revoke this session? The associated token will be immediately
          invalidated.
        </p>
      </Modal>
    </div>
  );
}
