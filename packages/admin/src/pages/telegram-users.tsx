import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { apiGet, apiPut, apiDelete, ApiError } from '../api/client';
import { API } from '../api/endpoints';
import { Badge, Button } from '../components/form';
import { Table } from '../components/table';
import type { Column } from '../components/table';
import { Modal } from '../components/modal';
import { showToast } from '../components/toast';
import { getErrorMessage } from '../utils/error-messages';
import { formatDate } from '../utils/format';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TelegramUser {
  chat_id: number;
  username: string | null;
  role: 'PENDING' | 'ADMIN' | 'READONLY';
  registered_at: number;
  approved_at: number | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Embeddable content (no page wrapper) for Notifications tabs */
export function TelegramUsersContent() {
  return <TelegramUsersInner />;
}

export default function TelegramUsersPage() {
  return <TelegramUsersInner />;
}

function TelegramUsersInner() {
  const users = useSignal<TelegramUser[]>([]);
  const loading = useSignal(true);

  // Approve modal state
  const approveModal = useSignal(false);
  const approveUser = useSignal<TelegramUser | null>(null);
  const approveRole = useSignal<'ADMIN' | 'READONLY'>('ADMIN');
  const approveLoading = useSignal(false);

  // Delete modal state
  const deleteModal = useSignal(false);
  const deleteUser = useSignal<TelegramUser | null>(null);
  const deleteLoading = useSignal(false);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchUsers = async () => {
    loading.value = true;
    try {
      const result = await apiGet<{ users: TelegramUser[]; total: number }>(API.ADMIN_TELEGRAM_USERS);
      users.value = result.users;
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      loading.value = false;
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // ---------------------------------------------------------------------------
  // Approve handler
  // ---------------------------------------------------------------------------

  const openApprove = (user: TelegramUser) => {
    approveUser.value = user;
    approveRole.value = 'ADMIN';
    approveModal.value = true;
  };

  const handleApprove = async () => {
    if (!approveUser.value) return;
    approveLoading.value = true;
    try {
      await apiPut(API.ADMIN_TELEGRAM_USER(approveUser.value.chat_id), {
        role: approveRole.value,
      });
      showToast('success', `User approved as ${approveRole.value}`);
      approveModal.value = false;
      approveUser.value = null;
      await fetchUsers();
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      approveLoading.value = false;
    }
  };

  // ---------------------------------------------------------------------------
  // Delete handler
  // ---------------------------------------------------------------------------

  const openDelete = (user: TelegramUser) => {
    deleteUser.value = user;
    deleteModal.value = true;
  };

  const handleDelete = async () => {
    if (!deleteUser.value) return;
    deleteLoading.value = true;
    try {
      await apiDelete(API.ADMIN_TELEGRAM_USER(deleteUser.value.chat_id));
      showToast('success', 'User deleted');
      deleteModal.value = false;
      deleteUser.value = null;
      await fetchUsers();
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      deleteLoading.value = false;
    }
  };

  // ---------------------------------------------------------------------------
  // Table columns
  // ---------------------------------------------------------------------------

  const roleBadgeVariant = (role: string): 'warning' | 'success' | 'info' => {
    if (role === 'PENDING') return 'warning';
    if (role === 'ADMIN') return 'success';
    return 'info';
  };

  const columns: Column<TelegramUser>[] = [
    {
      key: 'chat_id',
      header: 'Chat ID',
      render: (u) => String(u.chat_id),
    },
    {
      key: 'username',
      header: 'Username',
      render: (u) => u.username ?? '-',
    },
    {
      key: 'role',
      header: 'Role',
      render: (u) => (
        <Badge variant={roleBadgeVariant(u.role)}>
          {u.role}
        </Badge>
      ),
    },
    {
      key: 'registered_at',
      header: 'Registered',
      render: (u) => formatDate(u.registered_at),
    },
    {
      key: 'approved_at',
      header: 'Approved',
      render: (u) => (u.approved_at ? formatDate(u.approved_at) : '-'),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (u) => (
        <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
          {u.role === 'PENDING' && (
            <Button size="sm" variant="primary" onClick={() => openApprove(u)}>
              Approve
            </Button>
          )}
          <Button size="sm" variant="danger" onClick={() => openDelete(u)}>
            Delete
          </Button>
        </div>
      ),
    },
  ];

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div class="page">
      <Table<TelegramUser>
        columns={columns}
        data={users.value}
        loading={loading.value}
        emptyMessage="No Telegram users registered. Users appear here after sending /start to the bot."
      />

      {/* Approve Modal */}
      <Modal
        open={approveModal.value}
        title="Approve Telegram User"
        onCancel={() => {
          approveModal.value = false;
          approveUser.value = null;
        }}
        onConfirm={handleApprove}
        confirmText="Approve"
        confirmVariant="primary"
        loading={approveLoading.value}
      >
        {approveUser.value && (
          <div>
            <p>
              <strong>Chat ID:</strong> {approveUser.value.chat_id}
              {approveUser.value.username && (
                <span> (<strong>@{approveUser.value.username}</strong>)</span>
              )}
            </p>
            <div class="form-field" style={{ marginTop: 'var(--space-3)' }}>
              <label for="approve-role">Role</label>
              <select
                id="approve-role"
                value={approveRole.value}
                onChange={(e) => {
                  approveRole.value = (e.target as HTMLSelectElement).value as 'ADMIN' | 'READONLY';
                }}
              >
                <option value="ADMIN">ADMIN</option>
                <option value="READONLY">READONLY</option>
              </select>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={deleteModal.value}
        title="Delete Telegram User"
        onCancel={() => {
          deleteModal.value = false;
          deleteUser.value = null;
        }}
        onConfirm={handleDelete}
        confirmText="Delete"
        confirmVariant="danger"
        loading={deleteLoading.value}
      >
        <p>
          Are you sure you want to remove this user? They will need to /start again to re-register.
        </p>
      </Modal>
    </div>
  );
}
