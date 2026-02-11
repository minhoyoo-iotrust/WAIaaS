import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { apiGet, apiPost, apiPut, apiDelete, ApiError } from '../api/client';
import { API } from '../api/endpoints';
import { Table } from '../components/table';
import type { Column } from '../components/table';
import { FormField, Button, Badge } from '../components/form';
import { Modal } from '../components/modal';
import { EmptyState } from '../components/empty-state';
import { showToast } from '../components/toast';
import { getErrorMessage } from '../utils/error-messages';

interface Agent {
  id: string;
  name: string;
  chain: string;
  network: string;
  publicKey: string;
  status: string;
  createdAt: number;
}

interface Policy {
  id: string;
  agentId: string | null;
  type: string;
  rules: Record<string, unknown>;
  priority: number;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

const POLICY_TYPES = [
  { label: 'Spending Limit', value: 'SPENDING_LIMIT' },
  { label: 'Whitelist', value: 'WHITELIST' },
  { label: 'Time Restriction', value: 'TIME_RESTRICTION' },
  { label: 'Rate Limit', value: 'RATE_LIMIT' },
  { label: 'Allowed Tokens', value: 'ALLOWED_TOKENS' },
  { label: 'Contract Whitelist', value: 'CONTRACT_WHITELIST' },
  { label: 'Method Whitelist', value: 'METHOD_WHITELIST' },
  { label: 'Approved Spenders', value: 'APPROVED_SPENDERS' },
  { label: 'Approve Amount Limit', value: 'APPROVE_AMOUNT_LIMIT' },
  { label: 'Approve Tier Override', value: 'APPROVE_TIER_OVERRIDE' },
];

const DEFAULT_RULES: Record<string, unknown> = {
  SPENDING_LIMIT: {
    instant_max: '1000000',
    notify_max: '5000000',
    delay_max: '10000000',
    delay_seconds: 300,
    approval_timeout: 3600,
  },
  WHITELIST: { allowed_addresses: [] },
  TIME_RESTRICTION: {
    allowed_hours: { start: 0, end: 24 },
    allowed_days: [0, 1, 2, 3, 4, 5, 6],
  },
  RATE_LIMIT: { max_requests: 100, window_seconds: 3600 },
  ALLOWED_TOKENS: { tokens: [] },
  CONTRACT_WHITELIST: { contracts: [] },
  METHOD_WHITELIST: { methods: [] },
  APPROVED_SPENDERS: { spenders: [] },
  APPROVE_AMOUNT_LIMIT: { max_amount: '1000000' },
  APPROVE_TIER_OVERRIDE: { overrides: {} },
};

function formatNumber(value: string | number): string {
  const num = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(num)) return String(value);
  return num.toLocaleString('en-US');
}

function TierVisualization({ rules }: { rules: Record<string, unknown> }) {
  const instantMax = Number(rules.instant_max ?? 0);
  const notifyMax = Number(rules.notify_max ?? 0);
  const delayMax = Number(rules.delay_max ?? 0);
  const maxValue = Math.max(instantMax, notifyMax, delayMax, 1);

  const tiers = [
    {
      label: 'Instant',
      value: rules.instant_max as string,
      width: (instantMax / maxValue) * 100,
      cls: 'instant',
    },
    {
      label: 'Notify',
      value: rules.notify_max as string,
      width: (notifyMax / maxValue) * 100,
      cls: 'notify',
    },
    {
      label: 'Delay',
      value: rules.delay_max as string,
      width: (delayMax / maxValue) * 100,
      cls: 'delay',
    },
    {
      label: 'Approval',
      value: '',
      width: 100,
      cls: 'approval',
    },
  ];

  return (
    <div class="tier-bars">
      {tiers.map((tier) => (
        <div class="tier-bar" key={tier.cls}>
          <span class="tier-bar-label">{tier.label}</span>
          <div class="tier-bar-track">
            <div
              class={`tier-bar-fill tier-bar-fill--${tier.cls}`}
              style={{ width: `${tier.width}%` }}
            />
          </div>
          <span class="tier-bar-value">
            {tier.value ? formatNumber(tier.value) : ''}
          </span>
        </div>
      ))}
    </div>
  );
}

function getAgentName(agentId: string | null, agentList: Agent[]): string {
  if (!agentId) return 'Global';
  const agent = agentList.find((a) => a.id === agentId);
  return agent ? agent.name : agentId.slice(0, 8) + '...';
}

function getPolicyTypeLabel(type: string): string {
  const found = POLICY_TYPES.find((t) => t.value === type);
  return found ? found.label : type;
}

export default function PoliciesPage() {
  const agents = useSignal<Agent[]>([]);
  const policies = useSignal<Policy[]>([]);
  const filterAgentId = useSignal('__all__');
  const loading = useSignal(false);
  const agentsLoading = useSignal(true);

  // Create form state
  const showForm = useSignal(false);
  const formType = useSignal('SPENDING_LIMIT');
  const formAgentId = useSignal('');
  const formRules = useSignal(JSON.stringify(DEFAULT_RULES.SPENDING_LIMIT, null, 2));
  const formPriority = useSignal<number>(0);
  const formEnabled = useSignal(true);
  const formError = useSignal<string | null>(null);
  const formLoading = useSignal(false);

  // Edit modal state
  const editModal = useSignal(false);
  const editPolicy = useSignal<Policy | null>(null);
  const editRules = useSignal('');
  const editPriority = useSignal<number>(0);
  const editEnabled = useSignal(true);
  const editError = useSignal<string | null>(null);
  const editLoading = useSignal(false);

  // Delete modal state
  const deleteModal = useSignal(false);
  const deletePolicy = useSignal<Policy | null>(null);
  const deleteLoading = useSignal(false);

  const fetchAgents = async () => {
    try {
      const result = await apiGet<{ items: Agent[] }>(API.AGENTS);
      agents.value = result.items;
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      agentsLoading.value = false;
    }
  };

  const fetchPolicies = async () => {
    loading.value = true;
    try {
      let url = API.POLICIES;
      if (filterAgentId.value !== '__all__' && filterAgentId.value !== '__global__') {
        url = `${API.POLICIES}?agentId=${filterAgentId.value}`;
      }
      const result = await apiGet<Policy[]>(url);
      if (filterAgentId.value === '__global__') {
        policies.value = result.filter((p) => p.agentId === null);
      } else {
        policies.value = result;
      }
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      loading.value = false;
    }
  };

  const handleCreate = async () => {
    formError.value = null;
    let parsedRules: Record<string, unknown>;
    try {
      parsedRules = JSON.parse(formRules.value);
    } catch {
      formError.value = 'Invalid JSON in rules field';
      return;
    }

    formLoading.value = true;
    try {
      await apiPost(API.POLICIES, {
        agentId: formAgentId.value || undefined,
        type: formType.value,
        rules: parsedRules,
        priority: formPriority.value,
        enabled: formEnabled.value,
      });
      showToast('success', 'Policy created');
      showForm.value = false;
      formType.value = 'SPENDING_LIMIT';
      formAgentId.value = '';
      formRules.value = JSON.stringify(DEFAULT_RULES.SPENDING_LIMIT, null, 2);
      formPriority.value = 0;
      formEnabled.value = true;
      formError.value = null;
      await fetchPolicies();
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      formLoading.value = false;
    }
  };

  const openEdit = (policy: Policy) => {
    editPolicy.value = policy;
    editRules.value = JSON.stringify(policy.rules, null, 2);
    editPriority.value = policy.priority;
    editEnabled.value = policy.enabled;
    editError.value = null;
    editModal.value = true;
  };

  const handleEdit = async () => {
    editError.value = null;
    let parsedRules: Record<string, unknown>;
    try {
      parsedRules = JSON.parse(editRules.value);
    } catch {
      editError.value = 'Invalid JSON in rules field';
      return;
    }

    editLoading.value = true;
    try {
      await apiPut(API.POLICY(editPolicy.value!.id), {
        rules: parsedRules,
        priority: editPriority.value,
        enabled: editEnabled.value,
      });
      showToast('success', 'Policy updated');
      editModal.value = false;
      await fetchPolicies();
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      editLoading.value = false;
    }
  };

  const openDelete = (policy: Policy) => {
    deletePolicy.value = policy;
    deleteModal.value = true;
  };

  const handleDelete = async () => {
    deleteLoading.value = true;
    try {
      await apiDelete(API.POLICY(deletePolicy.value!.id));
      showToast('success', 'Policy deleted');
      deleteModal.value = false;
      await fetchPolicies();
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      deleteLoading.value = false;
    }
  };

  const handleTypeChange = (value: string | number | boolean) => {
    const type = value as string;
    formType.value = type;
    const defaultRule = DEFAULT_RULES[type];
    if (defaultRule) {
      formRules.value = JSON.stringify(defaultRule, null, 2);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  useEffect(() => {
    fetchPolicies();
  }, [filterAgentId.value]);

  const policyColumns: Column<Policy>[] = [
    {
      key: 'type',
      header: 'Type',
      render: (p) => (
        <Badge variant={p.type === 'SPENDING_LIMIT' ? 'success' : 'info'}>
          {getPolicyTypeLabel(p.type)}
        </Badge>
      ),
    },
    {
      key: 'agentId',
      header: 'Agent',
      render: (p) => getAgentName(p.agentId, agents.value),
    },
    {
      key: 'rules',
      header: 'Rules',
      render: (p) => {
        if (p.type === 'SPENDING_LIMIT') {
          return <TierVisualization rules={p.rules} />;
        }
        const json = JSON.stringify(p.rules);
        return (
          <span class="rules-summary">
            {json.length > 60 ? json.slice(0, 60) + '...' : json}
          </span>
        );
      },
    },
    {
      key: 'priority',
      header: 'Priority',
    },
    {
      key: 'enabled',
      header: 'Enabled',
      render: (p) => (
        <Badge variant={p.enabled ? 'success' : 'danger'}>
          {p.enabled ? 'ON' : 'OFF'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (p) => (
        <span style={{ display: 'flex', gap: '0.25rem' }}>
          <button
            class="btn btn-ghost btn-sm"
            onClick={(e) => { e.stopPropagation(); openEdit(p); }}
          >
            Edit
          </button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => openDelete(p)}
          >
            Delete
          </Button>
        </span>
      ),
    },
  ];

  return (
    <div class="page">
      <div class="policy-controls">
        <div class="policy-filter-select">
          <label for="policy-agent-filter">Filter by Agent</label>
          <select
            id="policy-agent-filter"
            value={filterAgentId.value}
            onChange={(e) => {
              filterAgentId.value = (e.target as HTMLSelectElement).value;
            }}
            disabled={agentsLoading.value}
          >
            <option value="__all__">All Policies</option>
            <option value="__global__">Global Only</option>
            {agents.value.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.chain}/{a.network})
              </option>
            ))}
          </select>
        </div>
        {!showForm.value && (
          <Button onClick={() => { showForm.value = true; }}>Create Policy</Button>
        )}
      </div>

      {showForm.value && (
        <div class="inline-form">
          <FormField
            label="Type"
            name="type"
            type="select"
            value={formType.value}
            onChange={handleTypeChange}
            options={POLICY_TYPES}
          />
          <FormField
            label="Agent"
            name="agentId"
            type="select"
            value={formAgentId.value}
            onChange={(v) => { formAgentId.value = v as string; }}
            options={[
              { label: 'Global (no agent)', value: '' },
              ...agents.value.map((a) => ({
                label: `${a.name} (${a.chain}/${a.network})`,
                value: a.id,
              })),
            ]}
          />
          <FormField
            label="Rules (JSON)"
            name="rules"
            type="textarea"
            value={formRules.value}
            onChange={(v) => { formRules.value = v as string; }}
            error={formError.value ?? undefined}
          />
          <FormField
            label="Priority"
            name="priority"
            type="number"
            value={formPriority.value}
            onChange={(v) => { formPriority.value = v as number; }}
            min={0}
            max={999}
          />
          <FormField
            label="Enabled"
            name="enabled"
            type="checkbox"
            value={formEnabled.value}
            onChange={(v) => { formEnabled.value = v as boolean; }}
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

      <Table<Policy>
        columns={policyColumns}
        data={policies.value}
        loading={loading.value}
        emptyMessage="No policies found"
      />

      {/* Edit Modal */}
      <Modal
        open={editModal.value}
        title="Edit Policy"
        onCancel={() => { editModal.value = false; }}
        onConfirm={handleEdit}
        confirmText="Save"
        loading={editLoading.value}
      >
        {editPolicy.value && (
          <div>
            <div class="policy-type-readonly">
              Type: {getPolicyTypeLabel(editPolicy.value.type)}
            </div>
            <div class="edit-rules-textarea">
              <FormField
                label="Rules (JSON)"
                name="edit-rules"
                type="textarea"
                value={editRules.value}
                onChange={(v) => { editRules.value = v as string; }}
                error={editError.value ?? undefined}
              />
            </div>
            <FormField
              label="Priority"
              name="edit-priority"
              type="number"
              value={editPriority.value}
              onChange={(v) => { editPriority.value = v as number; }}
              min={0}
              max={999}
            />
            <FormField
              label="Enabled"
              name="edit-enabled"
              type="checkbox"
              value={editEnabled.value}
              onChange={(v) => { editEnabled.value = v as boolean; }}
            />
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={deleteModal.value}
        title="Delete Policy"
        onCancel={() => { deleteModal.value = false; }}
        onConfirm={handleDelete}
        confirmText="Delete"
        confirmVariant="danger"
        loading={deleteLoading.value}
      >
        {deletePolicy.value && (
          <p>
            Are you sure you want to delete this{' '}
            <strong>{getPolicyTypeLabel(deletePolicy.value.type)}</strong> policy?
            This action cannot be undone.
          </p>
        )}
      </Modal>
    </div>
  );
}
