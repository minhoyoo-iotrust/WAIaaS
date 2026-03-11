import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { apiGet, apiPost, apiDelete, apiPut, ApiError } from '../api/client';
import { API } from '../api/endpoints';
import { Table } from '../components/table';
import type { Column } from '../components/table';
import { FormField, Button, Badge } from '../components/form';
import { Modal } from '../components/modal';
import { EmptyState } from '../components/empty-state';
import { showToast } from '../components/toast';
import { getErrorMessage } from '../utils/error-messages';
import { formatDate } from '../utils/format';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CredentialMetadata {
  id: string;
  walletId: string | null;
  type: string;
  name: string;
  metadata: Record<string, unknown>;
  expiresAt: number | null;
  createdAt: number;
  updatedAt: number;
}

const CREDENTIAL_TYPES = [
  { label: 'API Key', value: 'api-key' },
  { label: 'HMAC Secret', value: 'hmac-secret' },
  { label: 'RSA Private Key', value: 'rsa-private-key' },
  { label: 'Session Token', value: 'session-token' },
  { label: 'Custom', value: 'custom' },
];

function getTypeVariant(type: string): 'info' | 'success' | 'warning' | 'danger' {
  switch (type) {
    case 'api-key': return 'info';
    case 'hmac-secret': return 'success';
    case 'rsa-private-key': return 'warning';
    case 'session-token': return 'info';
    default: return 'info';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CredentialsPage() {
  const credentials = useSignal<CredentialMetadata[]>([]);
  const loading = useSignal(true);

  // Add modal
  const showAddModal = useSignal(false);
  const addType = useSignal('api-key');
  const addName = useSignal('');
  const addValue = useSignal('');
  const addMetadata = useSignal('');
  const addExpiresAt = useSignal('');
  const addLoading = useSignal(false);

  // Delete modal
  const deleteModal = useSignal(false);
  const deleteRef = useSignal<string | null>(null);
  const deleteName = useSignal('');
  const deleteLoading = useSignal(false);

  // Rotate modal
  const rotateModal = useSignal(false);
  const rotateRef = useSignal<string | null>(null);
  const rotateName = useSignal('');
  const rotateValue = useSignal('');
  const rotateLoading = useSignal(false);

  const fetchCredentials = async () => {
    loading.value = true;
    try {
      const result = await apiGet<{ credentials: CredentialMetadata[] }>(API.ADMIN_CREDENTIALS);
      credentials.value = result.credentials;
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      loading.value = false;
    }
  };

  useEffect(() => {
    fetchCredentials();
  }, []);

  const handleAdd = async () => {
    if (!addName.value.trim()) {
      showToast('error', 'Name is required');
      return;
    }
    if (!addValue.value.trim()) {
      showToast('error', 'Value is required');
      return;
    }

    addLoading.value = true;
    try {
      const body: Record<string, unknown> = {
        type: addType.value,
        name: addName.value.trim(),
        value: addValue.value,
      };
      if (addMetadata.value.trim()) {
        body.metadata = JSON.parse(addMetadata.value);
      }
      if (addExpiresAt.value) {
        body.expiresAt = Math.floor(new Date(addExpiresAt.value).getTime() / 1000);
      }
      await apiPost(API.ADMIN_CREDENTIALS, body);
      showToast('success', 'Credential created');
      showAddModal.value = false;
      addType.value = 'api-key';
      addName.value = '';
      addValue.value = '';
      addMetadata.value = '';
      addExpiresAt.value = '';
      await fetchCredentials();
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      addLoading.value = false;
    }
  };

  const handleDelete = async () => {
    if (!deleteRef.value) return;
    deleteLoading.value = true;
    try {
      await apiDelete(API.ADMIN_CREDENTIAL_DELETE(deleteRef.value));
      showToast('success', 'Credential deleted');
      deleteModal.value = false;
      deleteRef.value = null;
      await fetchCredentials();
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      deleteLoading.value = false;
    }
  };

  const handleRotate = async () => {
    if (!rotateRef.value || !rotateValue.value.trim()) return;
    rotateLoading.value = true;
    try {
      await apiPut(API.ADMIN_CREDENTIAL_ROTATE(rotateRef.value), { value: rotateValue.value });
      showToast('success', 'Credential rotated');
      rotateModal.value = false;
      rotateRef.value = null;
      rotateValue.value = '';
      await fetchCredentials();
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      rotateLoading.value = false;
    }
  };

  const openDelete = (cred: CredentialMetadata) => {
    deleteRef.value = cred.name;
    deleteName.value = cred.name;
    deleteModal.value = true;
  };

  const openRotate = (cred: CredentialMetadata) => {
    rotateRef.value = cred.name;
    rotateName.value = cred.name;
    rotateValue.value = '';
    rotateModal.value = true;
  };

  const columns: Column<CredentialMetadata>[] = [
    { key: 'name', header: 'Name' },
    {
      key: 'type',
      header: 'Type',
      render: (c) => <Badge variant={getTypeVariant(c.type)}>{c.type}</Badge>,
    },
    {
      key: 'expiresAt',
      header: 'Expires',
      render: (c) => c.expiresAt ? formatDate(c.expiresAt) : 'Never',
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (c) => formatDate(c.createdAt),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (c) => (
        <span style={{ display: 'flex', gap: '0.25rem' }}>
          <Button size="sm" variant="ghost" onClick={() => openRotate(c)}>
            Rotate
          </Button>
          <Button size="sm" variant="danger" onClick={() => openDelete(c)}>
            Delete
          </Button>
        </span>
      ),
    },
  ];

  if (!loading.value && credentials.value.length === 0) {
    return (
      <div class="page">
        <EmptyState
          title="No Credentials"
          description="Add credentials for external service authentication."
          actionLabel="Add Credential"
          onAction={() => { showAddModal.value = true; }}
        />

        {/* Add Modal (also rendered in empty state) */}
        <Modal
          open={showAddModal.value}
          title="Add Global Credential"
          onCancel={() => { showAddModal.value = false; }}
          onConfirm={handleAdd}
          confirmText="Create"
          loading={addLoading.value}
        >
          <FormField label="Type" name="cred-type" type="select" value={addType.value} onChange={(v) => { addType.value = v as string; }} options={CREDENTIAL_TYPES} />
          <FormField label="Name" name="cred-name" value={addName.value} onChange={(v) => { addName.value = v as string; }} placeholder="e.g. polymarket-api-key" required />
          <FormField label="Value" name="cred-value" type="password" value={addValue.value} onChange={(v) => { addValue.value = v as string; }} placeholder="Secret value" required />
          <FormField label="Metadata (JSON)" name="cred-metadata" type="textarea" value={addMetadata.value} onChange={(v) => { addMetadata.value = v as string; }} placeholder='{"key": "value"}' />
          <FormField label="Expires At" name="cred-expires" value={addExpiresAt.value} onChange={(v) => { addExpiresAt.value = v as string; }} placeholder="YYYY-MM-DDTHH:mm (optional)" />
        </Modal>
      </div>
    );
  }

  return (
    <div class="page">
      <div class="page-actions" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <Button onClick={() => { showAddModal.value = true; }}>Add Credential</Button>
      </div>

      <Table<CredentialMetadata>
        columns={columns}
        data={credentials.value}
        loading={loading.value}
        emptyMessage="No credentials found"
      />

      {/* Add Modal */}
      <Modal
        open={showAddModal.value}
        title="Add Global Credential"
        onCancel={() => { showAddModal.value = false; }}
        onConfirm={handleAdd}
        confirmText="Create"
        loading={addLoading.value}
      >
        <FormField label="Type" name="cred-type" type="select" value={addType.value} onChange={(v) => { addType.value = v as string; }} options={CREDENTIAL_TYPES} />
        <FormField label="Name" name="cred-name" value={addName.value} onChange={(v) => { addName.value = v as string; }} placeholder="e.g. polymarket-api-key" required />
        <FormField label="Value" name="cred-value" type="password" value={addValue.value} onChange={(v) => { addValue.value = v as string; }} placeholder="Secret value" required />
        <FormField label="Metadata (JSON)" name="cred-metadata" type="textarea" value={addMetadata.value} onChange={(v) => { addMetadata.value = v as string; }} placeholder='{"key": "value"}' />
        <FormField label="Expires At" name="cred-expires" value={addExpiresAt.value} onChange={(v) => { addExpiresAt.value = v as string; }} placeholder="YYYY-MM-DDTHH:mm (optional)" />
      </Modal>

      {/* Delete Modal */}
      <Modal
        open={deleteModal.value}
        title="Delete Credential"
        onCancel={() => { deleteModal.value = false; }}
        onConfirm={handleDelete}
        confirmText="Delete"
        confirmVariant="danger"
        loading={deleteLoading.value}
      >
        <p>
          Are you sure you want to delete credential <strong>{deleteName.value}</strong>?
          This action cannot be undone.
        </p>
      </Modal>

      {/* Rotate Modal */}
      <Modal
        open={rotateModal.value}
        title="Rotate Credential"
        onCancel={() => { rotateModal.value = false; }}
        onConfirm={handleRotate}
        confirmText="Rotate"
        loading={rotateLoading.value}
      >
        <p>Enter a new value for credential <strong>{rotateName.value}</strong>:</p>
        <FormField label="New Value" name="rotate-value" type="password" value={rotateValue.value} onChange={(v) => { rotateValue.value = v as string; }} placeholder="New secret value" required />
      </Modal>
    </div>
  );
}
