/**
 * ERC-8004 Agents page.
 *
 * Three tabs:
 * 1. Identity - Agent registration table, register modal, wallet linking
 * 2. Registration File - JSON tree viewer + URL copy
 * 3. Reputation - Score dashboard, tag filter, external lookup
 */

import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { apiGet, apiPost, ApiError } from '../api/client';
import { API } from '../api/endpoints';
import { FormField, Button, Badge } from '../components/form';
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

interface Wallet {
  id: string;
  name: string;
  chain: string;
  network: string;
  publicKey: string;
  status: string;
}

interface AgentEntry {
  walletId: string;
  walletName: string;
  agentId: string | null;
  status: 'REGISTERED' | 'NOT_REGISTERED' | 'WALLET_LINKED';
  registryAddress: string;
}

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

const TABS = [
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

export default function Erc8004Page() {
  const activeTab = useSignal('identity');
  const loading = useSignal(true);
  const featureEnabled = useSignal(false);
  const wallets = useSignal<Wallet[]>([]);
  const agents = useSignal<AgentEntry[]>([]);

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
      // Check feature gate
      const settings = await apiGet<SettingsData>(API.ADMIN_SETTINGS);
      const enabledSetting = settings['actions.erc8004_agent_enabled'];
      featureEnabled.value = enabledSetting?.value === 'true';

      if (!featureEnabled.value) {
        loading.value = false;
        return;
      }

      // Load wallets
      const walletList = await apiGet<Wallet[]>(API.WALLETS);
      wallets.value = walletList;

      // Build agent entries for EVM wallets
      const evmWallets = walletList.filter(w => w.chain === 'ethereum');
      const entries: AgentEntry[] = [];

      for (const w of evmWallets) {
        try {
          const regFile = await apiGet<Record<string, unknown>>(API.ERC8004_REGISTRATION_FILE(w.id));
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
  // Register agent
  // -----------------------------------------------------------------------

  async function handleRegister() {
    if (!registerWalletId.value || !registerName.value) return;
    registerSaving.value = true;
    try {
      await apiPost(`${API.ACTIONS_PROVIDERS}/erc8004_agent/register_agent`, {
        params: {
          name: registerName.value,
          ...(registerDescription.value ? { description: registerDescription.value } : {}),
        },
        walletId: registerWalletId.value,
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
      const pairResult = await apiPost<{ uri: string }>(API.WALLET_WC_PAIR(walletId), {});
      linkingUri.value = pairResult.uri;

      // Poll for connection
      const poll = setInterval(async () => {
        try {
          const status = await apiGet<{ connected: boolean }>(API.WALLET_WC_PAIR_STATUS(walletId));
          if (status.connected) {
            clearInterval(poll);
            linkingConnected.value = true;

            // Trigger set_agent_wallet
            await apiPost(`${API.ACTIONS_PROVIDERS}/erc8004_agent/set_agent_wallet`, {
              params: { agentId },
              walletId,
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
      await apiPost(`${API.ACTIONS_PROVIDERS}/erc8004_agent/unset_agent_wallet`, {
        params: { agentId },
        walletId,
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
      const data = await apiGet<unknown>(API.ERC8004_REGISTRATION_FILE(walletId));
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
      const data = await apiGet<ReputationData>(`${API.ERC8004_REPUTATION(agentId)}${qs ? `?${qs}` : ''}`);
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
      const data = await apiGet<ReputationData>(`${API.ERC8004_REPUTATION(lookupAgentId.value)}${qs ? `?${qs}` : ''}`);
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
  // Feature gate
  // -----------------------------------------------------------------------

  if (!loading.value && !featureEnabled.value) {
    return (
      <EmptyState
        title="ERC-8004 Agent feature is disabled"
        description="Enable it in Settings > Actions > erc8004_agent_enabled"
        actionLabel="Go to System Settings"
        onAction={() => { window.location.hash = '#/system'; }}
      />
    );
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
      <TabNav tabs={TABS} activeTab={activeTab.value} onTabChange={(k) => { activeTab.value = k; }} />

      {loading.value && <p class="loading-text">Loading...</p>}

      {/* Identity Tab */}
      {!loading.value && activeTab.value === 'identity' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
            <h3 style={{ margin: 0 }}>Registered Agents</h3>
            <Button variant="primary" onClick={() => { showRegisterModal.value = true; }}>
              Register Agent
            </Button>
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
                  <th>Actions</th>
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
        </div>
      )}

      {/* Registration File Tab */}
      {!loading.value && activeTab.value === 'registration' && (
        <div>
          <FormField label="Select Wallet">
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
          </FormField>

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

      {/* Reputation Tab */}
      {!loading.value && activeTab.value === 'reputation' && (
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
            <FormField label="Tag1 Filter">
              <input
                type="text"
                value={repTag1.value}
                onInput={(e) => { repTag1.value = (e.target as HTMLInputElement).value; }}
                placeholder="e.g. reliability"
              />
            </FormField>
            <FormField label="Tag2 Filter">
              <input
                type="text"
                value={repTag2.value}
                onInput={(e) => { repTag2.value = (e.target as HTMLInputElement).value; }}
                placeholder="e.g. speed"
              />
            </FormField>
          </div>

          {/* External Agent Lookup */}
          <h3>External Agent Lookup</h3>
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-end' }}>
            <FormField label="Agent ID">
              <input
                type="text"
                value={lookupAgentId.value}
                onInput={(e) => { lookupAgentId.value = (e.target as HTMLInputElement).value; }}
                placeholder="Enter agent ID"
              />
            </FormField>
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
        <FormField label="EVM Wallet">
          <select
            value={registerWalletId.value}
            onChange={(e) => { registerWalletId.value = (e.target as HTMLSelectElement).value; }}
          >
            <option value="">-- Select wallet --</option>
            {evmWallets.map(w => (
              <option key={w.id} value={w.id}>{w.name} ({w.id.slice(0, 8)}...)</option>
            ))}
          </select>
        </FormField>
        <FormField label="Name">
          <input
            type="text"
            value={registerName.value}
            onInput={(e) => { registerName.value = (e.target as HTMLInputElement).value; }}
            placeholder="Agent name"
          />
        </FormField>
        <FormField label="Description (optional)">
          <input
            type="text"
            value={registerDescription.value}
            onInput={(e) => { registerDescription.value = (e.target as HTMLInputElement).value; }}
            placeholder="Description"
          />
        </FormField>
      </Modal>
    </div>
  );
}
