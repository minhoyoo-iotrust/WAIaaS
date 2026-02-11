import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { currentPath } from '../components/layout';
import { apiGet, apiPost, apiPut, apiDelete, ApiError } from '../api/client';
import { API } from '../api/endpoints';
import { Table } from '../components/table';
import type { Column } from '../components/table';
import { FormField, Button, Badge } from '../components/form';
import { Modal } from '../components/modal';
import { CopyButton } from '../components/copy-button';
import { EmptyState } from '../components/empty-state';
import { showToast } from '../components/toast';
import { getErrorMessage } from '../utils/error-messages';
import { formatDate, formatAddress } from '../utils/format';

interface Agent {
  id: string;
  name: string;
  chain: string;
  network: string;
  publicKey: string;
  status: string;
  createdAt: number;
}

interface AgentDetail extends Agent {
  ownerAddress: string | null;
  ownerVerified: boolean | null;
  ownerState: 'NONE' | 'GRACE' | 'LOCKED';
  updatedAt: number | null;
}

function chainNetworkOptions(chain: string): { label: string; value: string }[] {
  if (chain === 'solana') {
    return [
      { label: 'Devnet', value: 'devnet' },
      { label: 'Testnet', value: 'testnet' },
      { label: 'Mainnet Beta', value: 'mainnet-beta' },
    ];
  }
  if (chain === 'ethereum') {
    return [
      { label: 'Sepolia', value: 'sepolia' },
      { label: 'Mainnet', value: 'mainnet' },
    ];
  }
  return [{ label: 'Devnet', value: 'devnet' }];
}

const agentColumns: Column<Agent>[] = [
  { key: 'name', header: 'Name' },
  { key: 'chain', header: 'Chain' },
  { key: 'network', header: 'Network' },
  {
    key: 'publicKey',
    header: 'Public Key',
    render: (a) => (
      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
        {formatAddress(a.publicKey)} <CopyButton value={a.publicKey} />
      </span>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    render: (a) => (
      <Badge variant={a.status === 'ACTIVE' ? 'success' : 'danger'}>{a.status}</Badge>
    ),
  },
  { key: 'createdAt', header: 'Created', render: (a) => formatDate(a.createdAt) },
];

function ownerStateBadge(state: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  switch (state) {
    case 'NONE':
      return 'neutral';
    case 'GRACE':
      return 'warning';
    case 'LOCKED':
      return 'success';
    default:
      return 'neutral';
  }
}

function DetailRow({
  label,
  value,
  copy,
  children,
}: {
  label: string;
  value?: string;
  copy?: boolean;
  children?: ComponentChildren;
}) {
  return (
    <div class="detail-row">
      <div class="detail-row-label">{label}</div>
      <div class="detail-row-value">
        {children ?? value ?? '\u2014'}
        {copy && value && <CopyButton value={value} />}
      </div>
    </div>
  );
}

function AgentDetailView({ id }: { id: string }) {
  const agent = useSignal<AgentDetail | null>(null);
  const loading = useSignal(true);
  const editing = useSignal(false);
  const editName = useSignal('');
  const editLoading = useSignal(false);
  const deleteModal = useSignal(false);
  const deleteLoading = useSignal(false);

  const fetchAgent = async () => {
    try {
      const result = await apiGet<AgentDetail>(API.AGENT(id));
      agent.value = result;
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      loading.value = false;
    }
  };

  const handleSaveName = async () => {
    editLoading.value = true;
    try {
      const result = await apiPut<AgentDetail>(API.AGENT(id), { name: editName.value });
      agent.value = result;
      editing.value = false;
      showToast('success', 'Agent name updated');
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      editLoading.value = false;
    }
  };

  const handleDelete = async () => {
    deleteLoading.value = true;
    try {
      await apiDelete(API.AGENT(id));
      showToast('success', 'Agent terminated');
      window.location.hash = '#/agents';
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      deleteLoading.value = false;
    }
  };

  const startEdit = () => {
    editName.value = agent.value!.name;
    editing.value = true;
  };

  const cancelEdit = () => {
    editing.value = false;
  };

  useEffect(() => {
    fetchAgent();
  }, [id]);

  return (
    <div class="page">
      <a href="#/agents" class="back-link">&larr; Back to Agents</a>

      {loading.value ? (
        <div class="stat-skeleton" style={{ height: '200px', marginTop: 'var(--space-4)' }} />
      ) : agent.value ? (
        <div class="agent-detail">
          <div class="detail-header">
            <div class="detail-name">
              {editing.value ? (
                <div class="inline-edit">
                  <input
                    value={editName.value}
                    onInput={(e) => {
                      editName.value = (e.target as HTMLInputElement).value;
                    }}
                    class="inline-edit-input"
                  />
                  <Button size="sm" onClick={handleSaveName} loading={editLoading.value}>
                    Save
                  </Button>
                  <Button size="sm" variant="secondary" onClick={cancelEdit}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <span>
                  {agent.value.name}
                  <button class="btn btn-ghost btn-sm" onClick={startEdit} title="Edit name">
                    &#9998;
                  </button>
                </span>
              )}
            </div>
            <Button variant="danger" onClick={() => { deleteModal.value = true; }}>
              Terminate Agent
            </Button>
          </div>

          <div class="detail-grid">
            <DetailRow label="ID" value={agent.value.id} copy />
            <DetailRow label="Public Key" value={agent.value.publicKey} copy />
            <DetailRow label="Chain" value={agent.value.chain} />
            <DetailRow label="Network" value={agent.value.network} />
            <DetailRow label="Status">
              <Badge variant={agent.value.status === 'ACTIVE' ? 'success' : 'danger'}>
                {agent.value.status}
              </Badge>
            </DetailRow>
            <DetailRow
              label="Owner Address"
              value={agent.value.ownerAddress ?? 'None'}
              copy={!!agent.value.ownerAddress}
            />
            <DetailRow label="Owner State">
              <Badge variant={ownerStateBadge(agent.value.ownerState)}>
                {agent.value.ownerState}
              </Badge>
            </DetailRow>
            <DetailRow label="Created" value={formatDate(agent.value.createdAt)} />
            <DetailRow
              label="Updated"
              value={agent.value.updatedAt ? formatDate(agent.value.updatedAt) : 'Never'}
            />
          </div>

          <Modal
            open={deleteModal.value}
            title="Terminate Agent"
            onCancel={() => { deleteModal.value = false; }}
            onConfirm={handleDelete}
            confirmText="Terminate"
            confirmVariant="danger"
            loading={deleteLoading.value}
          >
            <p>
              Are you sure you want to terminate agent <strong>{agent.value.name}</strong>? This
              action cannot be undone.
            </p>
          </Modal>
        </div>
      ) : (
        <EmptyState title="Agent not found" description="The agent may have been deleted." />
      )}
    </div>
  );
}

function AgentListView() {
  const agents = useSignal<Agent[]>([]);
  const loading = useSignal(true);
  const showForm = useSignal(false);
  const formName = useSignal('');
  const formChain = useSignal('solana');
  const formNetwork = useSignal('devnet');
  const formError = useSignal<string | null>(null);
  const formLoading = useSignal(false);

  const fetchAgents = async () => {
    try {
      const result = await apiGet<{ items: Agent[] }>(API.AGENTS);
      agents.value = result.items;
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      loading.value = false;
    }
  };

  const handleCreate = async () => {
    if (!formName.value.trim()) {
      formError.value = 'Name is required';
      return;
    }
    formError.value = null;
    formLoading.value = true;
    try {
      await apiPost<Agent>(API.AGENTS, {
        name: formName.value.trim(),
        chain: formChain.value,
        network: formNetwork.value,
      });
      showToast('success', 'Agent created');
      formName.value = '';
      formChain.value = 'solana';
      formNetwork.value = 'devnet';
      showForm.value = false;
      loading.value = true;
      await fetchAgents();
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      formError.value = getErrorMessage(e.code);
    } finally {
      formLoading.value = false;
    }
  };

  const navigateToDetail = (agent: Agent) => {
    window.location.hash = '#/agents/' + agent.id;
  };

  const handleChainChange = (value: string | number | boolean) => {
    const chain = value as string;
    formChain.value = chain;
    const options = chainNetworkOptions(chain);
    formNetwork.value = options[0].value;
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  return (
    <div class="page">
      <div class="page-actions">
        {!showForm.value && (
          <Button onClick={() => { showForm.value = true; }}>Create Agent</Button>
        )}
      </div>

      {showForm.value && (
        <div class="inline-form">
          <FormField
            label="Name"
            name="name"
            value={formName.value}
            onChange={(v) => { formName.value = v as string; }}
            required
            placeholder="e.g. trading-bot"
            error={formError.value ?? undefined}
          />
          <FormField
            label="Chain"
            name="chain"
            type="select"
            value={formChain.value}
            onChange={handleChainChange}
            options={[
              { label: 'Solana', value: 'solana' },
              { label: 'Ethereum', value: 'ethereum' },
            ]}
          />
          <FormField
            label="Network"
            name="network"
            type="select"
            value={formNetwork.value}
            onChange={(v) => { formNetwork.value = v as string; }}
            options={chainNetworkOptions(formChain.value)}
          />
          <div class="inline-form-actions">
            <Button onClick={handleCreate} loading={formLoading.value}>Create</Button>
            <Button
              variant="secondary"
              onClick={() => { showForm.value = false; formError.value = null; }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      <Table<Agent>
        columns={agentColumns}
        data={agents.value}
        loading={loading.value}
        onRowClick={navigateToDetail}
        emptyMessage="No agents yet"
      />
    </div>
  );
}

export default function AgentsPage() {
  const path = currentPath.value;
  const agentId = path.startsWith('/agents/') ? path.slice('/agents/'.length) : null;

  if (agentId) {
    return <AgentDetailView id={agentId} />;
  }
  return <AgentListView />;
}
