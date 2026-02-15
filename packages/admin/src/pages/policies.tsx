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
import { PolicyFormRouter } from '../components/policy-forms';
import { PolicyRulesSummary } from '../components/policy-rules-summary';

interface Wallet {
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
  walletId: string | null;
  type: string;
  network: string | null;
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
  { label: 'Allowed Networks', value: 'ALLOWED_NETWORKS' },
  { label: 'x402 Allowed Domains', value: 'X402_ALLOWED_DOMAINS' },
];

const DEFAULT_RULES: Record<string, Record<string, unknown>> = {
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
  APPROVE_AMOUNT_LIMIT: { maxAmount: '1000000', blockUnlimited: true },
  APPROVE_TIER_OVERRIDE: { tier: 'DELAY' },
  ALLOWED_NETWORKS: { networks: [] },
  X402_ALLOWED_DOMAINS: { domains: [] },
};

// Validation for structured form rules per policy type
function validateRules(type: string, rules: Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {};

  if (type === 'SPENDING_LIMIT') {
    if (!rules.instant_max || !/^\d+$/.test(rules.instant_max as string))
      errors.instant_max = 'Positive integer required';
    if (!rules.notify_max || !/^\d+$/.test(rules.notify_max as string))
      errors.notify_max = 'Positive integer required';
    if (!rules.delay_max || !/^\d+$/.test(rules.delay_max as string))
      errors.delay_max = 'Positive integer required';
    const ds = Number(rules.delay_seconds);
    if (rules.delay_seconds === undefined || rules.delay_seconds === '' || Number.isNaN(ds) || ds < 60)
      errors.delay_seconds = 'Minimum 60 seconds';
  } else if (type === 'WHITELIST') {
    const addrs = (rules.allowed_addresses as string[]) || [];
    if (addrs.length === 0) errors.allowed_addresses = 'At least one address required';
    addrs.forEach((a, i) => {
      if (!a || a.trim() === '') errors[`allowed_addresses.${i}`] = 'Address required';
    });
  } else if (type === 'RATE_LIMIT') {
    const mr = Number(rules.max_requests);
    if (!rules.max_requests || Number.isNaN(mr) || mr < 1 || !Number.isInteger(mr))
      errors.max_requests = 'Positive integer required';
    const ws = Number(rules.window_seconds);
    if (!rules.window_seconds || Number.isNaN(ws) || ws < 1 || !Number.isInteger(ws))
      errors.window_seconds = 'Positive integer required';
  } else if (type === 'APPROVE_AMOUNT_LIMIT') {
    if (rules.maxAmount && !/^\d+$/.test(rules.maxAmount as string))
      errors.maxAmount = 'Must be a positive integer string';
  } else if (type === 'ALLOWED_TOKENS') {
    const tokens = (rules.tokens as Array<{ address: string }>) || [];
    if (tokens.length === 0) errors.tokens = 'At least one token required';
    tokens.forEach((t, i) => {
      if (!t.address || t.address.trim() === '') errors[`tokens.${i}.address`] = 'Address required';
    });
  } else if (type === 'CONTRACT_WHITELIST') {
    const contracts = (rules.contracts as Array<{ address: string }>) || [];
    if (contracts.length === 0) errors.contracts = 'At least one contract required';
    contracts.forEach((c, i) => {
      if (!c.address || c.address.trim() === '') errors[`contracts.${i}.address`] = 'Address required';
    });
  } else if (type === 'METHOD_WHITELIST') {
    const methods = (rules.methods as Array<{ contractAddress: string; selectors: string[] }>) || [];
    if (methods.length === 0) errors.methods = 'At least one method entry required';
    methods.forEach((m, i) => {
      if (!m.contractAddress || m.contractAddress.trim() === '')
        errors[`methods.${i}.contractAddress`] = 'Contract address required';
      if (!m.selectors || m.selectors.length === 0)
        errors[`methods.${i}.selectors`] = 'At least one selector required';
      else
        m.selectors.forEach((s, j) => {
          if (!s || s.trim() === '') errors[`methods.${i}.selectors.${j}`] = 'Selector required';
        });
    });
  } else if (type === 'APPROVED_SPENDERS') {
    const spenders = (rules.spenders as Array<{ address: string; maxAmount?: string }>) || [];
    if (spenders.length === 0) errors.spenders = 'At least one spender required';
    spenders.forEach((sp, i) => {
      if (!sp.address || sp.address.trim() === '') errors[`spenders.${i}.address`] = 'Address required';
      if (sp.maxAmount && !/^\d+$/.test(sp.maxAmount))
        errors[`spenders.${i}.maxAmount`] = 'Must be a positive integer';
    });
  } else if (type === 'TIME_RESTRICTION') {
    const days = (rules.allowed_days as number[]) || [];
    if (days.length === 0) errors.allowed_days = 'At least one day required';
    const hours = rules.allowed_hours as { start: number; end: number } | undefined;
    if (hours && hours.start >= hours.end) errors.allowed_hours = 'Start must be before end';
  } else if (type === 'ALLOWED_NETWORKS') {
    const networks = (rules.networks as Array<{ network: string }>) || [];
    if (networks.length === 0) errors.networks = 'At least one network required';
    networks.forEach((n, i) => {
      if (!n.network || n.network.trim() === '') errors[`networks.${i}.network`] = 'Network required';
    });
  } else if (type === 'X402_ALLOWED_DOMAINS') {
    const domains = (rules.domains as string[]) || [];
    if (domains.length === 0) errors.domains = 'At least one domain required';
    domains.forEach((d, i) => {
      if (!d || d.trim() === '') errors[`domains.${i}`] = 'Domain required';
    });
  }
  // APPROVE_TIER_OVERRIDE uses a select so it's always valid

  return errors;
}

function getWalletName(walletId: string | null, walletList: Wallet[]): string {
  if (!walletId) return 'Global';
  const wallet = walletList.find((a) => a.id === walletId);
  return wallet ? wallet.name : walletId.slice(0, 8) + '...';
}

function getPolicyTypeLabel(type: string): string {
  const found = POLICY_TYPES.find((t) => t.value === type);
  return found ? found.label : type;
}

export default function PoliciesPage() {
  const wallets = useSignal<Wallet[]>([]);
  const policies = useSignal<Policy[]>([]);
  const filterWalletId = useSignal('__all__');
  const loading = useSignal(false);
  const walletsLoading = useSignal(true);

  // Create form state
  const showForm = useSignal(false);
  const formType = useSignal('SPENDING_LIMIT');
  const formWalletId = useSignal('');
  const formRules = useSignal(JSON.stringify(DEFAULT_RULES.SPENDING_LIMIT, null, 2));
  const formRulesObj = useSignal<Record<string, unknown>>(DEFAULT_RULES.SPENDING_LIMIT as Record<string, unknown>);
  const formErrors = useSignal<Record<string, string>>({});
  const jsonMode = useSignal(false);
  const formPriority = useSignal<number>(0);
  const formEnabled = useSignal(true);
  const formNetwork = useSignal('');
  const formError = useSignal<string | null>(null);
  const formLoading = useSignal(false);

  // Edit modal state
  const editModal = useSignal(false);
  const editPolicy = useSignal<Policy | null>(null);
  const editRules = useSignal('');
  const editRulesObj = useSignal<Record<string, unknown>>({});
  const editJsonMode = useSignal(false);
  const editFormErrors = useSignal<Record<string, string>>({});
  const editPriority = useSignal<number>(0);
  const editEnabled = useSignal(true);
  const editError = useSignal<string | null>(null);
  const editLoading = useSignal(false);

  // Delete modal state
  const deleteModal = useSignal(false);
  const deletePolicy = useSignal<Policy | null>(null);
  const deleteLoading = useSignal(false);

  const fetchWallets = async () => {
    try {
      const result = await apiGet<{ items: Wallet[] }>(API.WALLETS);
      wallets.value = result.items;
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      walletsLoading.value = false;
    }
  };

  const fetchPolicies = async () => {
    loading.value = true;
    try {
      let url = API.POLICIES;
      if (filterWalletId.value !== '__all__' && filterWalletId.value !== '__global__') {
        url = `${API.POLICIES}?walletId=${filterWalletId.value}`;
      }
      const result = await apiGet<Policy[]>(url);
      if (filterWalletId.value === '__global__') {
        policies.value = result.filter((p) => p.walletId === null);
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
    if (jsonMode.value) {
      try {
        parsedRules = JSON.parse(formRules.value);
      } catch {
        formError.value = 'Invalid JSON in rules field';
        return;
      }
    } else {
      const validationErrors = validateRules(formType.value, formRulesObj.value);
      if (Object.keys(validationErrors).length > 0) {
        formErrors.value = validationErrors;
        return;
      }
      formErrors.value = {};
      parsedRules = formRulesObj.value;
    }

    formLoading.value = true;
    try {
      await apiPost(API.POLICIES, {
        walletId: formWalletId.value || undefined,
        type: formType.value,
        rules: parsedRules,
        priority: formPriority.value,
        enabled: formEnabled.value,
        network: formNetwork.value || undefined,
      });
      showToast('success', 'Policy created');
      showForm.value = false;
      formType.value = 'SPENDING_LIMIT';
      formWalletId.value = '';
      formNetwork.value = '';
      formRules.value = JSON.stringify(DEFAULT_RULES.SPENDING_LIMIT, null, 2);
      formRulesObj.value = DEFAULT_RULES.SPENDING_LIMIT as Record<string, unknown>;
      formErrors.value = {};
      jsonMode.value = false;
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
    editRulesObj.value = { ...policy.rules };
    editJsonMode.value = false;
    editFormErrors.value = {};
    editPriority.value = policy.priority;
    editEnabled.value = policy.enabled;
    editError.value = null;
    editModal.value = true;
  };

  const handleEdit = async () => {
    editError.value = null;
    let parsedRules: Record<string, unknown>;
    if (editJsonMode.value) {
      try {
        parsedRules = JSON.parse(editRules.value);
      } catch {
        editError.value = 'Invalid JSON in rules field';
        return;
      }
    } else {
      const validationErrors = validateRules(editPolicy.value!.type, editRulesObj.value);
      if (Object.keys(validationErrors).length > 0) {
        editFormErrors.value = validationErrors;
        return;
      }
      editFormErrors.value = {};
      parsedRules = editRulesObj.value;
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

  const handleEditJsonToggle = () => {
    if (!editJsonMode.value) {
      // Structured form -> JSON
      editRules.value = JSON.stringify(editRulesObj.value, null, 2);
    } else {
      // JSON -> Structured form
      try {
        editRulesObj.value = JSON.parse(editRules.value);
        editError.value = null;
      } catch {
        editError.value = 'Invalid JSON — cannot switch to form mode';
        return;
      }
    }
    editJsonMode.value = !editJsonMode.value;
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
      formRulesObj.value = { ...defaultRule };
    }
    formErrors.value = {};
    jsonMode.value = false;
  };

  const handleJsonToggle = () => {
    if (!jsonMode.value) {
      // Structured form -> JSON: sync formRulesObj to formRules string
      formRules.value = JSON.stringify(formRulesObj.value, null, 2);
    } else {
      // JSON -> Structured form: parse formRules string to formRulesObj
      try {
        formRulesObj.value = JSON.parse(formRules.value);
        formError.value = null;
      } catch {
        formError.value = 'Invalid JSON — cannot switch to form mode';
        return; // Abort toggle
      }
    }
    jsonMode.value = !jsonMode.value;
  };

  useEffect(() => {
    fetchWallets();
  }, []);

  useEffect(() => {
    fetchPolicies();
  }, [filterWalletId.value]);

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
      key: 'walletId',
      header: 'Wallet',
      render: (p) => getWalletName(p.walletId, wallets.value),
    },
    {
      key: 'network',
      header: 'Network',
      render: (p) => p.network ?? 'All',
    },
    {
      key: 'rules',
      header: 'Rules',
      render: (p) => <PolicyRulesSummary type={p.type} rules={p.rules} />,
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
          <label for="policy-wallet-filter">Filter by Wallet</label>
          <select
            id="policy-wallet-filter"
            value={filterWalletId.value}
            onChange={(e) => {
              filterWalletId.value = (e.target as HTMLSelectElement).value;
            }}
            disabled={walletsLoading.value}
          >
            <option value="__all__">All Policies</option>
            <option value="__global__">Global Only</option>
            {wallets.value.map((a) => (
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
            label="Wallet"
            name="walletId"
            type="select"
            value={formWalletId.value}
            onChange={(v) => { formWalletId.value = v as string; }}
            options={[
              { label: 'Global (no wallet)', value: '' },
              ...wallets.value.map((a) => ({
                label: `${a.name} (${a.chain}/${a.network})`,
                value: a.id,
              })),
            ]}
          />
          <FormField
            label="Network Scope"
            name="network"
            value={formNetwork.value}
            onChange={(v) => { formNetwork.value = v as string; }}
            placeholder="e.g. polygon-mainnet (leave empty for all networks)"
          />
          <div class="policy-form-section">
            <div class="policy-form-header">
              <label>Rules</label>
              <button class="btn btn-ghost btn-sm json-toggle" onClick={handleJsonToggle}>
                {jsonMode.value ? 'Switch to Form' : 'JSON Direct Edit'}
              </button>
            </div>
            {jsonMode.value ? (
              <FormField
                label=""
                name="rules"
                type="textarea"
                value={formRules.value}
                onChange={(v) => { formRules.value = v as string; }}
                error={formError.value ?? undefined}
              />
            ) : (
              <PolicyFormRouter
                type={formType.value}
                rules={formRulesObj.value}
                onChange={(r) => {
                  formRulesObj.value = r;
                  // Re-validate to clear resolved field errors
                  if (Object.keys(formErrors.value).length > 0) {
                    formErrors.value = validateRules(formType.value, r);
                  }
                }}
                errors={formErrors.value}
              />
            )}
          </div>
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
            <div class="policy-form-section">
              <div class="policy-form-header">
                <label>Rules</label>
                <button class="btn btn-ghost btn-sm json-toggle" onClick={handleEditJsonToggle}>
                  {editJsonMode.value ? 'Switch to Form' : 'JSON Direct Edit'}
                </button>
              </div>
              {editJsonMode.value ? (
                <div class="edit-rules-textarea">
                  <FormField
                    label=""
                    name="edit-rules"
                    type="textarea"
                    value={editRules.value}
                    onChange={(v) => { editRules.value = v as string; }}
                    error={editError.value ?? undefined}
                  />
                </div>
              ) : (
                <PolicyFormRouter
                  type={editPolicy.value.type}
                  rules={editRulesObj.value}
                  onChange={(r) => {
                    editRulesObj.value = r;
                    if (Object.keys(editFormErrors.value).length > 0) {
                      editFormErrors.value = validateRules(editPolicy.value!.type, r);
                    }
                  }}
                  errors={editFormErrors.value}
                />
              )}
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
