/**
 * Agent Identity page (ERC-8004).
 *
 * Three tabs:
 * 1. Identity - Agent registration table, register modal, wallet linking
 * 2. Registration File - JSON tree viewer + URL copy
 * 3. Reputation - Score dashboard, tag filter, external lookup
 *
 * Toggle at the top enables/disables the feature (persisted via PUT /v1/admin/settings).
 * When disabled: read-only Identity tab shown, management tabs hidden.
 */

import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { api, ApiError } from '../api/typed-client';
import type { components } from '../api/types.generated';
import { Button, Badge, FormField } from '../components/form';
import { Modal } from '../components/modal';
import { CopyButton } from '../components/copy-button';
import { EmptyState } from '../components/empty-state';
import { showToast } from '../components/toast';
import { getErrorMessage } from '../utils/error-messages';
import { TabNav } from '../components/tab-nav';
import type { SettingsData } from '../utils/settings-helpers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Wallet = components['schemas']['WalletCrudResponse'];

// AgentEntry and ReputationData: path-level types (no named schema)
// UI-only type (not from API schema)
interface AgentEntry {
  walletId: string;
  walletName: string;
  agentId: string | null;
  status: 'REGISTERED' | 'NOT_REGISTERED' | 'WALLET_LINKED';
  registryAddress: string;
}

// UI-only type (not from API schema)
interface ReputationData {
  agentId: string;
  count: number;
  score: string;
  decimals: number;
  tag1: string;
  tag2: string;
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

const ALL_TABS = [
  { key: 'identity', label: 'Identity' },
  { key: 'registration', label: 'Registration File' },
  { key: 'reputation', label: 'Reputation' },
];

// ---------------------------------------------------------------------------
// JSON Tree Viewer
// ---------------------------------------------------------------------------

function JsonTree({ data, depth = 0 }: { data: unknown; depth?: number }) {
  if (data === null || data === undefined) {
    return <span style={{ color: 'var(--color-text-muted)' }}>null</span>;
  }

  if (typeof data === 'string') {
    return <span style={{ color: 'var(--color-success)' }}>"{data}"</span>;
  }

  if (typeof data === 'number' || typeof data === 'boolean') {
    return <span style={{ color: 'var(--color-primary)' }}>{String(data)}</span>;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return <span>[]</span>;
    return (
      <div style={{ paddingLeft: depth > 0 ? 'var(--space-3)' : '0' }}>
        {'['}
        {data.map((item, i) => (
          <div key={i} style={{ paddingLeft: 'var(--space-3)' }}>
            <JsonTree data={item} depth={depth + 1} />
            {i < data.length - 1 ? ',' : ''}
          </div>
        ))}
        {']'}
      </div>
    );
  }

  if (typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) return <span>{'{}'}</span>;
    return (
      <div style={{ paddingLeft: depth > 0 ? 'var(--space-3)' : '0' }}>
        {'{'}
        {entries.map(([key, val], i) => (
          <div key={key} style={{ paddingLeft: 'var(--space-3)' }}>
            <span style={{ fontWeight: 'bold' }}>"{key}"</span>: <JsonTree data={val} depth={depth + 1} />
            {i < entries.length - 1 ? ',' : ''}
          </div>
        ))}
        {'}'}
      </div>
    );
  }

  return <span>{String(data)}</span>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types for provider actions
// ---------------------------------------------------------------------------

interface ProviderAction {
  name: string;
  description: string;
  chain: string;
  riskLevel: string;
  defaultTier: string;
}

export default function Erc8004Page() {
  const activeTab = useSignal('identity');
  const loading = useSignal(true);
  const featureEnabled = useSignal(false);
  const wallets = useSignal<Wallet[]>([]);
  const erc8004Actions = useSignal<ProviderAction[]>([]);
  const agents = useSignal<AgentEntry[]>([]);

  // Settings state for tier overrides
  const settings = useSignal<SettingsData>({});

  // Toggle state
  const toggleSaving = useSignal(false);

  // Register modal state
  const showRegisterModal = useSignal(false);
  const registerWalletId = useSignal('');
  const registerName = useSignal('');
  const registerDescription = useSignal('');
  const registerSaving = useSignal(false);

  // Registration file state
  const regFileWalletId = useSignal('');
  const regFileData = useSignal<unknown>(null);
  const regFileLoading = useSignal(false);

  // Reputation state
  const reputationData = useSignal<ReputationData | null>(null);
  const repTag1 = useSignal('');
  const repTag2 = useSignal('');
  const lookupAgentId = useSignal('');
  const lookupResult = useSignal<ReputationData | null>(null);
  const lookupLoading = useSignal(false);

  // WC linking state
  const linkingWalletId = useSignal<string | null>(null);
  const linkingUri = useSignal('');
  const linkingConnected = useSignal(false);

  // -----------------------------------------------------------------------
  // Data loading
  // -----------------------------------------------------------------------

  async function loadData() {
    loading.value = true;
    try {
      // Check feature gate (unified nested SettingsData format)
      const { data: settingsData } = await api.GET('/v1/admin/settings');
      settings.value = settingsData as unknown as SettingsData;
      const actionsCategory = (settingsData as unknown as SettingsData)['actions'] as Record<string, string> | undefined;
      featureEnabled.value = actionsCategory?.['erc8004_agent_enabled'] === 'true';

      // Fetch erc8004_agent actions from providers list
      try {
        const { data: result } = await api.GET('/v1/actions/providers');
        const erc8004 = (result as unknown as { providers: Array<{ name: string; actions: ProviderAction[] }> }).providers?.find(p => p.name === 'erc8004_agent');
        erc8004Actions.value = erc8004?.actions ?? [];
      } catch { /* keep empty */ }

      // Always load wallets and agent entries (for read-only table when disabled)
      const { data: result } = await api.GET('/v1/wallets');
      const walletList = result!.items ?? [];
      wallets.value = walletList;

      // Build agent entries for EVM wallets
      const evmWallets = walletList.filter(w => w.chain === 'ethereum');
      const entries: AgentEntry[] = [];

      for (const w of evmWallets) {
        try {
          const { data: regFile } = await api.GET('/v1/erc8004/registration-file/{walletId}', { params: { path: { walletId: w.id } } }) as { data: Record<string, unknown> };
          const agentId = regFile['agentId'] as string | undefined;
          entries.push({
            walletId: w.id,
            walletName: w.name,
            agentId: agentId ?? null,
            status: agentId ? 'REGISTERED' : 'NOT_REGISTERED',
            registryAddress: (regFile['registryAddress'] as string) ?? '',
          });
        } catch {
          entries.push({
            walletId: w.id,
            walletName: w.name,
            agentId: null,
            status: 'NOT_REGISTERED',
            registryAddress: '',
          });
        }
      }

      agents.value = entries;
    } catch (err) {
      if (err instanceof ApiError) showToast(getErrorMessage(err.code), 'error');
    } finally {
      loading.value = false;
    }
  }

  useEffect(() => { loadData(); }, []);

  // -----------------------------------------------------------------------
  // Toggle handler
  // -----------------------------------------------------------------------

  async function handleToggleEnabled(newEnabled: boolean) {
    toggleSaving.value = true;
    try {
      await api.PUT('/v1/admin/settings', {
        body: { settings: [{ key: 'actions.erc8004_agent_enabled', value: String(newEnabled) }] },
      });
      featureEnabled.value = newEnabled;
      showToast(`Agent Identity ${newEnabled ? 'enabled' : 'disabled'}`, 'success');
      // Reload data to refresh UI
      await loadData();
    } catch (err) {
      if (err instanceof ApiError) showToast(getErrorMessage(err.code), 'error');
    } finally {
      toggleSaving.value = false;
    }
  }

  // -----------------------------------------------------------------------
  // Register agent
  // -----------------------------------------------------------------------

  async function handleRegister() {
    if (!registerWalletId.value || !registerName.value) return;
    registerSaving.value = true;
    try {
      await api.POST('/v1/admin/actions/{provider}/{action}', {
        params: { path: { provider: 'erc8004_agent', action: 'register_agent' } },
        body: {
          params: {
            name: registerName.value,
            ...(registerDescription.value ? { description: registerDescription.value } : {}),
          },
          walletId: registerWalletId.value,
        },
      });
      showToast('Agent registration initiated', 'success');
      showRegisterModal.value = false;
      registerName.value = '';
      registerDescription.value = '';
      registerWalletId.value = '';
      await loadData();
    } catch (err) {
      if (err instanceof ApiError) showToast(getErrorMessage(err.code), 'error');
    } finally {
      registerSaving.value = false;
    }
  }

  // -----------------------------------------------------------------------
  // Wallet linking
  // -----------------------------------------------------------------------

  async function handleLinkWallet(walletId: string, agentId: string) {
    linkingWalletId.value = walletId;
    linkingConnected.value = false;
    linkingUri.value = '';

    try {
      const { data: pairResult } = await api.POST('/v1/wallets/{id}/wc/pair', { params: { path: { id: walletId } } });
      linkingUri.value = (pairResult as unknown as { uri: string }).uri;

      // Poll for connection
      const poll = setInterval(async () => {
        try {
          const { data: status } = await api.GET('/v1/wallets/{id}/wc/pair/status', { params: { path: { id: walletId } } }) as unknown as { data: { connected: boolean } };
          if (status.connected) {
            clearInterval(poll);
            linkingConnected.value = true;

            // Trigger set_agent_wallet
            await api.POST('/v1/admin/actions/{provider}/{action}', {
              params: { path: { provider: 'erc8004_agent', action: 'set_agent_wallet' } },
              body: { params: { agentId }, walletId },
            });
            showToast('Wallet linking initiated via EIP-712', 'success');
            linkingWalletId.value = null;
            await loadData();
          }
        } catch {
          // Ignore polling errors
        }
      }, 1000);

      // Timeout after 60s
      setTimeout(() => {
        clearInterval(poll);
        if (!linkingConnected.value && linkingWalletId.value) {
          showToast('WalletConnect pairing timed out', 'error');
          linkingWalletId.value = null;
        }
      }, 60000);
    } catch (err) {
      if (err instanceof ApiError) showToast(getErrorMessage(err.code), 'error');
      linkingWalletId.value = null;
    }
  }

  async function handleUnlinkWallet(walletId: string, agentId: string) {
    try {
      await api.POST('/v1/admin/actions/{provider}/{action}', {
        params: { path: { provider: 'erc8004_agent', action: 'unset_agent_wallet' } },
        body: { params: { agentId }, walletId },
      });
      showToast('Wallet unlinking initiated', 'success');
      await loadData();
    } catch (err) {
      if (err instanceof ApiError) showToast(getErrorMessage(err.code), 'error');
    }
  }

  // -----------------------------------------------------------------------
  // Registration file
  // -----------------------------------------------------------------------

  async function loadRegistrationFile(walletId: string) {
    if (!walletId) return;
    regFileLoading.value = true;
    try {
      const { data } = await api.GET('/v1/erc8004/registration-file/{walletId}', { params: { path: { walletId } } });
      regFileData.value = data;
    } catch (err) {
      if (err instanceof ApiError) showToast(getErrorMessage(err.code), 'error');
      regFileData.value = null;
    } finally {
      regFileLoading.value = false;
    }
  }

  // -----------------------------------------------------------------------
  // Reputation
  // -----------------------------------------------------------------------

  async function loadReputation(agentId: string, tag1?: string, tag2?: string) {
    try {
      const params = new URLSearchParams();
      if (tag1) params.set('tag1', tag1);
      if (tag2) params.set('tag2', tag2);
      const qs = params.toString();
      const query: Record<string, string> = {};
      if (tag1) query.tag1 = tag1;
      if (tag2) query.tag2 = tag2;
      const { data } = await api.GET('/v1/erc8004/agent/{agentId}/reputation', { params: { path: { agentId }, query } }) as { data: ReputationData };
      reputationData.value = data;
    } catch {
      reputationData.value = null;
    }
  }

  async function handleLookup() {
    if (!lookupAgentId.value) return;
    lookupLoading.value = true;
    try {
      const params = new URLSearchParams();
      if (repTag1.value) params.set('tag1', repTag1.value);
      if (repTag2.value) params.set('tag2', repTag2.value);
      const qs = params.toString();
      const lookupQuery: Record<string, string> = {};
      if (repTag1.value) lookupQuery.tag1 = repTag1.value;
      if (repTag2.value) lookupQuery.tag2 = repTag2.value;
      const { data } = await api.GET('/v1/erc8004/agent/{agentId}/reputation', { params: { path: { agentId: lookupAgentId.value }, query: lookupQuery } }) as { data: ReputationData };
      lookupResult.value = data;
    } catch (err) {
      if (err instanceof ApiError) showToast(getErrorMessage(err.code), 'error');
      lookupResult.value = null;
    } finally {
      lookupLoading.value = false;
    }
  }

  function getScoreBadgeVariant(score: number): 'success' | 'warning' | 'danger' {
    if (score >= 50) return 'success';
    if (score >= 20) return 'warning';
    return 'danger';
  }

  // -----------------------------------------------------------------------
  // Tier override helpers (Phase 331)
  // -----------------------------------------------------------------------

  function getTierOverride(providerKey: string, actionName: string): string {
    const cat = settings.value['actions'] as Record<string, string> | undefined;
    return cat?.[`${providerKey}_${actionName}_tier`] || '';
  }

  function isOverridden(providerKey: string, actionName: string): boolean {
    const override = getTierOverride(providerKey, actionName);
    return override !== '' && override !== undefined;
  }

  async function handleTierChange(providerKey: string, actionName: string, newTier: string) {
    const settingKey = `actions.${providerKey}_${actionName}_tier`;
    try {
      const { data: result } = await api.PUT('/v1/admin/settings', { body: { settings: [{ key: settingKey, value: newTier }] } });
      settings.value = result!.settings as unknown as SettingsData;
      showToast(`Tier updated for ${providerKey}/${actionName}`, 'success');
    } catch (err) {
      if (err instanceof ApiError) showToast(getErrorMessage(err.code), 'error');
    }
  }

  async function handleTierReset(providerKey: string, actionName: string) {
    const settingKey = `actions.${providerKey}_${actionName}_tier`;
    try {
      const { data: result } = await api.PUT('/v1/admin/settings', { body: { settings: [{ key: settingKey, value: '' }] } });
      settings.value = result!.settings as unknown as SettingsData;
      showToast(`Tier reset to default for ${providerKey}/${actionName}`, 'success');
    } catch (err) {
      if (err instanceof ApiError) showToast(getErrorMessage(err.code), 'error');
    }
  }

  // -----------------------------------------------------------------------
  // Tab filtering: only show Identity tab when disabled
  // -----------------------------------------------------------------------

  const visibleTabs = featureEnabled.value ? ALL_TABS : ALL_TABS.filter(t => t.key === 'identity');

  // Reset to identity tab if current tab is hidden
  if (!visibleTabs.some(t => t.key === activeTab.value)) {
    activeTab.value = 'identity';
  }

  // -----------------------------------------------------------------------
  // EVM wallets for selectors
  // -----------------------------------------------------------------------

  const evmWallets = wallets.value.filter(w => w.chain === 'ethereum');

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div>
      {/* Toggle section -- always visible */}
      <div class="settings-category" style={{ marginBottom: 'var(--space-4)' }}>
        <div class="settings-category-header">
          <h3 style={{ margin: 0 }}>ERC-8004 Agent Identity</h3>
        </div>
        <div class="settings-category-body">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <FormField
              label="Enabled"
              name="actions.erc8004_agent_enabled"
              type="checkbox"
              value={featureEnabled.value}
              onChange={(v) => handleToggleEnabled(!!v)}
              disabled={toggleSaving.value}
            />
            {toggleSaving.value && <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>Saving...</span>}
          </div>
        </div>
      </div>

      {/* Disabled message */}
      {!loading.value && !featureEnabled.value && (
        <div class="empty-state" style={{ marginTop: 'var(--space-3)' }}>
          <p>Agent Identity features are disabled. Enable the toggle above to manage agent registrations, reputation, and wallet linking.</p>
        </div>
      )}

      {/* Tabs + content */}
      {!loading.value && (
        <>
          <TabNav tabs={visibleTabs} activeTab={activeTab.value} onTabChange={(k) => { activeTab.value = k; }} />

          {/* Identity Tab -- shown in both enabled and disabled states */}
          {activeTab.value === 'identity' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                <h3 style={{ margin: 0 }}>Registered Agents</h3>
                {featureEnabled.value && (
                  <Button variant="primary" onClick={() => { showRegisterModal.value = true; }}>
                    Register Agent
                  </Button>
                )}
              </div>

              {agents.value.length === 0 ? (
                <EmptyState title="No EVM wallets found" description="Create an EVM wallet first to register agents." />
              ) : (
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Wallet Name</th>
                      <th>Wallet ID</th>
                      <th>Status</th>
                      <th>Agent ID</th>
                      <th>Registry Address</th>
                      {featureEnabled.value && <th>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {agents.value.map(a => (
                      <tr key={a.walletId}>
                        <td>{a.walletName}</td>
                        <td title={a.walletId}>{a.walletId.slice(0, 8)}...</td>
                        <td>
                          <Badge variant={a.status === 'REGISTERED' ? 'success' : a.status === 'WALLET_LINKED' ? 'info' : 'default'}>
                            {a.status}
                          </Badge>
                        </td>
                        <td>{a.agentId ?? '-'}</td>
                        <td title={a.registryAddress}>{a.registryAddress ? `${a.registryAddress.slice(0, 10)}...` : '-'}</td>
                        {featureEnabled.value && (
                          <td>
                            {a.agentId && a.status === 'REGISTERED' && (
                              <Button
                                variant="secondary"
                                onClick={() => handleLinkWallet(a.walletId, a.agentId!)}
                                disabled={linkingWalletId.value === a.walletId}
                              >
                                {linkingWalletId.value === a.walletId ? 'Linking...' : 'Link Wallet'}
                              </Button>
                            )}
                            {a.agentId && a.status === 'WALLET_LINKED' && (
                              <Button variant="danger" onClick={() => handleUnlinkWallet(a.walletId, a.agentId!)}>
                                Unlink
                              </Button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* WC Pairing URI display */}
              {linkingWalletId.value && linkingUri.value && (
                <div style={{ marginTop: 'var(--space-3)', padding: 'var(--space-3)', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                  <p style={{ fontWeight: 'bold' }}>WalletConnect Pairing URI</p>
                  <code style={{ wordBreak: 'break-all', fontSize: 'var(--font-sm)' }}>{linkingUri.value}</code>
                  <div style={{ marginTop: 'var(--space-2)' }}>
                    <CopyButton value={linkingUri.value} label="Copy URI" />
                  </div>
                </div>
              )}

              {/* Registered Actions section (Phase 331) */}
              {erc8004Actions.value.length > 0 && (
                <div style={{ marginTop: 'var(--space-4)', borderTop: '1px solid var(--border)', paddingTop: 'var(--space-3)' }}>
                  <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-2)', color: 'var(--text-secondary)' }}>
                    Registered Actions
                  </div>
                  <table class="table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Description</th>
                        <th>Risk Level</th>
                        <th>Tier</th>
                      </tr>
                    </thead>
                    <tbody>
                      {erc8004Actions.value.map(action => (
                        <tr key={action.name}>
                          <td>{action.name}</td>
                          <td style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', maxWidth: '300px' }}>{action.description}</td>
                          <td>{action.riskLevel}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                              <select
                                value={getTierOverride('erc8004_agent', action.name) || action.defaultTier}
                                onChange={(e) => handleTierChange('erc8004_agent', action.name, (e.target as HTMLSelectElement).value)}
                                style={{ padding: '2px 4px', fontSize: 'var(--font-size-sm)', borderRadius: 'var(--radius-sm)' }}
                                disabled={!featureEnabled.value}
                              >
                                {['INSTANT', 'NOTIFY', 'DELAY', 'APPROVAL'].map(t => (
                                  <option key={t} value={t}>{t}</option>
                                ))}
                              </select>
                              {isOverridden('erc8004_agent', action.name) && featureEnabled.value && (
                                <>
                                  <Badge variant="warning">customized</Badge>
                                  <button
                                    onClick={() => handleTierReset('erc8004_agent', action.name)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', textDecoration: 'underline' }}
                                    title="Reset to provider default"
                                  >
                                    reset
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Registration File Tab -- only when enabled */}
          {featureEnabled.value && activeTab.value === 'registration' && (
            <div>
              <div class="form-field">
                <label>Select Wallet</label>
                <select
                  value={regFileWalletId.value}
                  onChange={(e) => {
                    const wid = (e.target as HTMLSelectElement).value;
                    regFileWalletId.value = wid;
                    if (wid) loadRegistrationFile(wid);
                  }}
                >
                  <option value="">-- Select wallet --</option>
                  {evmWallets.map(w => (
                    <option key={w.id} value={w.id}>{w.name} ({w.id.slice(0, 8)}...)</option>
                  ))}
                </select>
              </div>

              {regFileWalletId.value && (
                <div style={{ marginTop: 'var(--space-3)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                    <h4 style={{ margin: 0 }}>Registration File</h4>
                    <CopyButton
                      value={`${window.location.origin}/v1/erc8004/registration-file/${regFileWalletId.value}`}
                      label="Copy URL"
                    />
                  </div>

                  {regFileLoading.value ? (
                    <p class="loading-text">Loading...</p>
                  ) : regFileData.value ? (
                    <div style={{ fontFamily: 'monospace', fontSize: 'var(--font-sm)', background: 'var(--color-bg-secondary)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', overflow: 'auto' }}>
                      <JsonTree data={regFileData.value} />
                    </div>
                  ) : (
                    <p>No registration file available for this wallet.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Reputation Tab -- only when enabled */}
          {featureEnabled.value && activeTab.value === 'reputation' && (
            <div>
              {/* My Agent Score */}
              <h3>My Agent Score</h3>
              {agents.value.filter(a => a.agentId).length === 0 ? (
                <p>No registered agents. Register an agent first.</p>
              ) : (
                <div>
                  {agents.value.filter(a => a.agentId).map(a => {
                    // Load reputation on first render
                    if (!reputationData.value || reputationData.value.agentId !== a.agentId) {
                      loadReputation(a.agentId!);
                    }
                    return (
                      <div key={a.agentId} style={{ padding: 'var(--space-3)', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-2)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          <strong>Agent #{a.agentId}</strong>
                          {reputationData.value && reputationData.value.agentId === a.agentId && (
                            <>
                              <span style={{ fontSize: 'var(--font-xl)', fontWeight: 'bold' }}>
                                {Number(reputationData.value.score) / Math.pow(10, reputationData.value.decimals)}
                              </span>
                              <Badge variant={getScoreBadgeVariant(Number(reputationData.value.score) / Math.pow(10, reputationData.value.decimals))}>
                                {reputationData.value.count} feedback(s)
                              </Badge>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Tag Filter */}
              <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                <div class="form-field">
                  <label>Tag1 Filter</label>
                  <input
                    type="text"
                    value={repTag1.value}
                    onInput={(e) => { repTag1.value = (e.target as HTMLInputElement).value; }}
                    placeholder="e.g. reliability"
                  />
                </div>
                <div class="form-field">
                  <label>Tag2 Filter</label>
                  <input
                    type="text"
                    value={repTag2.value}
                    onInput={(e) => { repTag2.value = (e.target as HTMLInputElement).value; }}
                    placeholder="e.g. speed"
                  />
                </div>
              </div>

              {/* External Agent Lookup */}
              <h3>External Agent Lookup</h3>
              <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-end' }}>
                <div class="form-field">
                  <label>Agent ID</label>
                  <input
                    type="text"
                    value={lookupAgentId.value}
                    onInput={(e) => { lookupAgentId.value = (e.target as HTMLInputElement).value; }}
                    placeholder="Enter agent ID"
                  />
                </div>
                <Button variant="primary" onClick={handleLookup} loading={lookupLoading.value}>
                  Query
                </Button>
              </div>

              {lookupResult.value && (
                <div style={{ marginTop: 'var(--space-3)', padding: 'var(--space-3)', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                  <p><strong>Agent #{lookupResult.value.agentId}</strong></p>
                  <p>Score: {Number(lookupResult.value.score) / Math.pow(10, lookupResult.value.decimals)}</p>
                  <p>Feedback count: {lookupResult.value.count}</p>
                  {lookupResult.value.tag1 && <p>Tag1: {lookupResult.value.tag1}</p>}
                  {lookupResult.value.tag2 && <p>Tag2: {lookupResult.value.tag2}</p>}
                  <Badge variant={getScoreBadgeVariant(Number(lookupResult.value.score) / Math.pow(10, lookupResult.value.decimals))}>
                    {Number(lookupResult.value.score) / Math.pow(10, lookupResult.value.decimals) >= 50 ? 'Good' : Number(lookupResult.value.score) / Math.pow(10, lookupResult.value.decimals) >= 20 ? 'Fair' : 'Low'}
                  </Badge>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {loading.value && <p class="loading-text">Loading...</p>}

      {/* Register Agent Modal */}
      <Modal
        open={showRegisterModal.value}
        title="Register Agent"
        onConfirm={handleRegister}
        onCancel={() => { showRegisterModal.value = false; }}
        confirmText="Register"
        loading={registerSaving.value}
        confirmDisabled={!registerWalletId.value || !registerName.value}
      >
        <div class="form-field">
          <label>EVM Wallet</label>
          <select
            value={registerWalletId.value}
            onChange={(e) => { registerWalletId.value = (e.target as HTMLSelectElement).value; }}
          >
            <option value="">-- Select wallet --</option>
            {evmWallets.map(w => (
              <option key={w.id} value={w.id}>{w.name} ({w.id.slice(0, 8)}...)</option>
            ))}
          </select>
        </div>
        <div class="form-field">
          <label>Name</label>
          <input
            type="text"
            value={registerName.value}
            onInput={(e) => { registerName.value = (e.target as HTMLInputElement).value; }}
            placeholder="Agent name"
          />
        </div>
        <div class="form-field">
          <label>Description (optional)</label>
          <input
            type="text"
            value={registerDescription.value}
            onInput={(e) => { registerDescription.value = (e.target as HTMLInputElement).value; }}
            placeholder="Description"
          />
        </div>
      </Modal>
    </div>
  );
}
