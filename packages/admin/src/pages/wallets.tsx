import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { currentPath } from '../components/layout';
import { pendingNavigation, highlightField } from '../components/settings-search';
import { registerDirty, unregisterDirty } from '../utils/dirty-guard';
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
import { TabNav } from '../components/tab-nav';
import { Breadcrumb } from '../components/breadcrumb';
import {
  type SettingsData,
  type RpcTestResult,
  keyToLabel,
  getEffectiveValue,
  getEffectiveBoolValue,
} from '../utils/settings-helpers';
import { buildSingleWalletPrompt } from '../utils/agent-prompt';

interface Wallet {
  id: string;
  name: string;
  chain: string;
  network: string;
  environment: string;
  publicKey: string;
  status: string;
  ownerAddress: string | null;
  ownerState: 'NONE' | 'GRACE' | 'LOCKED';
  createdAt: number;
}

interface WalletDetail extends Wallet {
  defaultNetwork: string;
  ownerAddress: string | null;
  ownerVerified: boolean | null;
  ownerState: 'NONE' | 'GRACE' | 'LOCKED';
  updatedAt: number | null;
}

interface NetworkInfo {
  network: string;
  name?: string;
  isDefault: boolean;
}

interface McpTokenResult {
  walletId: string;
  walletName: string | null;
  tokenPath: string;
  expiresAt: number;
  claudeDesktopConfig: Record<string, unknown>;
}

interface NetworkBalance {
  network: string;
  isDefault: boolean;
  native: { balance: string; symbol: string } | null;
  tokens: Array<{ symbol: string; balance: string; address: string }>;
  error?: string;
}

interface WalletBalance {
  balances: NetworkBalance[];
}

interface WalletTransaction {
  id: string;
  type: string;
  status: string;
  toAddress: string | null;
  amount: string | null;
  network: string | null;
  txHash: string | null;
  createdAt: number | null;
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

export function chainNetworkOptions(chain: string): { label: string; value: string }[] {
  if (chain === 'solana') {
    return [
      { label: 'Devnet', value: 'devnet' },
      { label: 'Testnet', value: 'testnet' },
      { label: 'Mainnet', value: 'mainnet' },
    ];
  }
  if (chain === 'ethereum') {
    return [
      { label: 'Ethereum Sepolia', value: 'ethereum-sepolia' },
      { label: 'Ethereum Mainnet', value: 'ethereum-mainnet' },
      { label: 'Polygon Amoy', value: 'polygon-amoy' },
      { label: 'Polygon Mainnet', value: 'polygon-mainnet' },
      { label: 'Arbitrum Sepolia', value: 'arbitrum-sepolia' },
      { label: 'Arbitrum Mainnet', value: 'arbitrum-mainnet' },
      { label: 'Optimism Sepolia', value: 'optimism-sepolia' },
      { label: 'Optimism Mainnet', value: 'optimism-mainnet' },
      { label: 'Base Sepolia', value: 'base-sepolia' },
      { label: 'Base Mainnet', value: 'base-mainnet' },
    ];
  }
  return [{ label: 'Devnet', value: 'devnet' }];
}

const walletColumns: Column<Wallet>[] = [
  { key: 'name', header: 'Name' },
  { key: 'chain', header: 'Chain' },
  {
    key: 'environment',
    header: 'Environment',
    render: (a) => (
      <Badge variant={a.environment === 'mainnet' ? 'warning' : 'info'}>{a.environment}</Badge>
    ),
  },
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
  {
    key: 'ownerState',
    header: 'Owner',
    render: (a) => (
      <Badge variant={ownerStateBadge(a.ownerState)}>{a.ownerState}</Badge>
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

function WalletDetailView({ id }: { id: string }) {
  const wallet = useSignal<WalletDetail | null>(null);
  const loading = useSignal(true);
  const editing = useSignal(false);
  const editName = useSignal('');
  const editLoading = useSignal(false);
  const deleteModal = useSignal(false);
  const deleteLoading = useSignal(false);
  const mcpLoading = useSignal(false);
  const mcpResult = useSignal<McpTokenResult | null>(null);
  const networks = useSignal<NetworkInfo[]>([]);
  const networksLoading = useSignal(true);
  const defaultNetworkLoading = useSignal(false);
  const balance = useSignal<WalletBalance | null>(null);
  const balanceLoading = useSignal(true);
  const txs = useSignal<WalletTransaction[]>([]);
  const txsLoading = useSignal(true);
  const wcQrModal = useSignal(false);
  const wcQrData = useSignal<WcPairingResult | null>(null);
  const wcPairingLoading = useSignal(false);
  const wcSession = useSignal<WcSession | null>(null);
  const wcSessionLoading = useSignal(true);
  const wcDisconnectLoading = useSignal(false);
  const pollRef = useSignal<ReturnType<typeof setInterval> | null>(null);
  const ownerEditing = useSignal(false);
  const editOwnerAddress = useSignal('');
  const ownerEditLoading = useSignal(false);
  const promptLoading = useSignal(false);

  const fetchWallet = async () => {
    try {
      const result = await apiGet<WalletDetail>(API.WALLET(id));
      wallet.value = result;
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
      const result = await apiPut<WalletDetail>(API.WALLET(id), { name: editName.value });
      wallet.value = result;
      editing.value = false;
      showToast('success', 'Wallet name updated');
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
      await apiDelete(API.WALLET(id));
      showToast('success', 'Wallet terminated');
      window.location.hash = '#/wallets';
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      deleteLoading.value = false;
    }
  };

  const startEdit = () => {
    editName.value = wallet.value!.name;
    editing.value = true;
  };

  const cancelEdit = () => {
    editing.value = false;
  };

  const handleMcpSetup = async () => {
    mcpLoading.value = true;
    try {
      const result = await apiPost<McpTokenResult>(API.MCP_TOKENS, { walletId: id });
      mcpResult.value = result;
      showToast('success', 'MCP token provisioned successfully');
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      mcpLoading.value = false;
    }
  };

  const fetchNetworks = async () => {
    networksLoading.value = true;
    try {
      const result = await apiGet<{ availableNetworks: NetworkInfo[] }>(API.WALLET_NETWORKS(id));
      networks.value = result.availableNetworks ?? [];
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
      networks.value = [];
    } finally {
      networksLoading.value = false;
    }
  };

  const fetchBalance = async () => {
    balanceLoading.value = true;
    try {
      balance.value = await apiGet<WalletBalance>(API.ADMIN_WALLET_BALANCE(id));
    } catch {
      balance.value = null;
    } finally {
      balanceLoading.value = false;
    }
  };

  const fetchTransactions = async () => {
    txsLoading.value = true;
    try {
      const r = await apiGet<{ items: WalletTransaction[]; total: number }>(
        API.ADMIN_WALLET_TRANSACTIONS(id),
      );
      txs.value = r.items;
    } catch {
      txs.value = [];
    } finally {
      txsLoading.value = false;
    }
  };

  const fetchWcSession = async () => {
    wcSessionLoading.value = true;
    try {
      wcSession.value = await apiGet<WcSession>(API.WALLET_WC_SESSION(id));
    } catch {
      wcSession.value = null;
    } finally {
      wcSessionLoading.value = false;
    }
  };

  const startPairingPoll = () => {
    if (pollRef.value) clearInterval(pollRef.value);
    pollRef.value = setInterval(async () => {
      try {
        const status = await apiGet<WcPairingStatus>(API.WALLET_WC_PAIR_STATUS(id));
        if (status.status === 'connected') {
          if (pollRef.value) clearInterval(pollRef.value);
          pollRef.value = null;
          wcQrModal.value = false;
          wcQrData.value = null;
          wcSession.value = status.session ?? null;
          showToast('success', 'Wallet connected via WalletConnect');
        } else if (status.status === 'expired' || status.status === 'none') {
          if (pollRef.value) clearInterval(pollRef.value);
          pollRef.value = null;
          wcQrModal.value = false;
          wcQrData.value = null;
          showToast('error', 'Pairing expired. Try again.');
        }
      } catch {
        // Network error -- keep polling
      }
    }, 3000);
  };

  const handleWcConnect = async () => {
    wcPairingLoading.value = true;
    try {
      const result = await apiPost<WcPairingResult>(API.WALLET_WC_PAIR(id));
      wcQrData.value = result;
      wcQrModal.value = true;
      startPairingPoll();
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      if (e.code === 'WC_NOT_CONFIGURED') {
        showToast('error', 'WalletConnect is not configured. Redirecting to settings...');
        pendingNavigation.value = { tab: 'walletconnect', fieldName: 'walletconnect.project_id' };
        window.location.hash = '#/wallets';
      } else {
        showToast('error', getErrorMessage(e.code));
      }
    } finally {
      wcPairingLoading.value = false;
    }
  };

  const handleWcDisconnect = async () => {
    wcDisconnectLoading.value = true;
    try {
      await apiDelete(API.WALLET_WC_SESSION(id));
      wcSession.value = null;
      showToast('success', 'WalletConnect session disconnected');
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      wcDisconnectLoading.value = false;
    }
  };

  const startEditOwner = () => {
    editOwnerAddress.value = wallet.value?.ownerAddress ?? '';
    ownerEditing.value = true;
  };

  const cancelEditOwner = () => {
    ownerEditing.value = false;
  };

  const handleSaveOwner = async () => {
    if (!editOwnerAddress.value.trim()) {
      showToast('error', 'Owner address is required');
      return;
    }
    ownerEditLoading.value = true;
    try {
      await apiPut(API.WALLET_OWNER(id), {
        owner_address: editOwnerAddress.value.trim(),
      });
      await fetchWallet();
      ownerEditing.value = false;
      showToast('success', 'Owner address updated');
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code, e.serverMessage));
    } finally {
      ownerEditLoading.value = false;
    }
  };

  const handleChangeDefaultNetwork = async (network: string) => {
    defaultNetworkLoading.value = true;
    try {
      await apiPut(API.WALLET_DEFAULT_NETWORK(id), { network });
      showToast('success', `Default network changed to ${network}`);
      await fetchWallet();
      await fetchNetworks();
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      defaultNetworkLoading.value = false;
    }
  };

  const handleCopyAgentPrompt = async () => {
    if (!wallet.value) return;
    promptLoading.value = true;
    try {
      const session = await apiPost<{ id: string; token: string; expiresAt: number; walletId: string }>(
        API.SESSIONS,
        { walletId: id, ttl: 86400 },
      );
      const baseUrl = window.location.origin || 'http://localhost:3100';
      const text = buildSingleWalletPrompt(baseUrl, {
        id: wallet.value.id,
        name: wallet.value.name,
        chain: wallet.value.chain,
        defaultNetwork: wallet.value.defaultNetwork ?? wallet.value.network,
        sessionToken: session.token,
      });
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      showToast('success', 'Agent prompt copied!');
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        showToast('error', getErrorMessage(err.code));
      } else {
        showToast('error', 'Failed to generate agent prompt');
      }
    } finally {
      promptLoading.value = false;
    }
  };

  useEffect(() => {
    fetchWallet();
    fetchNetworks();
    fetchBalance();
    fetchTransactions();
    fetchWcSession();
  }, [id]);

  useEffect(() => {
    return () => {
      if (pollRef.value) clearInterval(pollRef.value);
    };
  }, []);

  return (
    <div class="page">
      <a href="#/wallets" class="back-link">&larr; Back to Wallets</a>

      {loading.value ? (
        <div class="stat-skeleton" style={{ height: '200px', marginTop: 'var(--space-4)' }} />
      ) : wallet.value ? (
        <div class="wallet-detail">
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
                  {wallet.value.name}
                  <button class="btn btn-ghost btn-sm" onClick={startEdit} title="Edit name">
                    &#9998;
                  </button>
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleCopyAgentPrompt}
                loading={promptLoading.value}
              >
                Copy Agent Prompt
              </Button>
              <Button variant="danger" onClick={() => { deleteModal.value = true; }}>
                Terminate Wallet
              </Button>
            </div>
          </div>

          <div class="detail-grid">
            <DetailRow label="ID" value={wallet.value.id} copy />
            <DetailRow label="Public Key" value={wallet.value.publicKey} copy />
            <DetailRow label="Chain" value={wallet.value.chain} />
            <DetailRow label="Environment">
              <Badge variant={wallet.value.environment === 'mainnet' ? 'warning' : 'info'}>
                {wallet.value.environment}
              </Badge>
            </DetailRow>
            <DetailRow label="Default Network" value={wallet.value.defaultNetwork ?? wallet.value.network} />
            <DetailRow label="Status">
              <Badge variant={wallet.value.status === 'ACTIVE' ? 'success' : 'danger'}>
                {wallet.value.status}
              </Badge>
            </DetailRow>
            <DetailRow label="Created" value={formatDate(wallet.value.createdAt)} />
            <DetailRow
              label="Updated"
              value={wallet.value.updatedAt ? formatDate(wallet.value.updatedAt) : 'Never'}
            />
          </div>

          <div class="balance-section" style={{ marginTop: 'var(--space-6)' }}>
            <h3 style={{ marginBottom: 'var(--space-3)' }}>Balances</h3>
            {balanceLoading.value ? (
              <div class="stat-skeleton" style={{ height: '60px' }} />
            ) : balance.value?.balances?.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {balance.value.balances.map((nb) => (
                  <div
                    key={nb.network}
                    style={{
                      padding: 'var(--space-3)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)',
                      background: nb.isDefault ? 'var(--color-bg-secondary)' : 'transparent',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                      <strong>{nb.network}</strong>
                      {nb.isDefault && (
                        <span class="badge badge-info" style={{ fontSize: '0.7rem' }}>Default</span>
                      )}
                    </div>
                    {nb.error ? (
                      <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>{nb.error}</p>
                    ) : nb.native ? (
                      <div>
                        <DetailRow label="Native" value={`${nb.native.balance} ${nb.native.symbol}`} />
                        {nb.tokens.length > 0 ? (
                          nb.tokens.map((t) => (
                            <DetailRow key={t.address} label={t.symbol} value={t.balance} />
                          ))
                        ) : null}
                      </div>
                    ) : (
                      <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>Balance unavailable</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--color-text-secondary)' }}>No balance data available</p>
            )}
          </div>

          <div class="networks-section" style={{ marginTop: 'var(--space-6)' }}>
            <h3 style={{ marginBottom: 'var(--space-3)' }}>Available Networks</h3>
            {networksLoading.value ? (
              <div class="stat-skeleton" style={{ height: '80px' }} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {(networks.value ?? []).map((n) => (
                  <div key={n.network} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: 'var(--space-2) var(--space-3)',
                    background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)',
                  }}>
                    <span>
                      {n.name ?? n.network}
                      {n.isDefault && <Badge variant="success" style={{ marginLeft: 'var(--space-2)' }}>Default</Badge>}
                    </span>
                    {!n.isDefault && wallet.value?.status === 'ACTIVE' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleChangeDefaultNetwork(n.network)}
                        loading={defaultNetworkLoading.value}
                      >
                        Set Default
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div class="transactions-section" style={{ marginTop: 'var(--space-6)' }}>
            <h3 style={{ marginBottom: 'var(--space-3)' }}>Recent Transactions</h3>
            <Table<WalletTransaction>
              columns={[
                {
                  key: 'createdAt',
                  header: 'Time',
                  render: (t) => (t.createdAt ? formatDate(t.createdAt) : '--'),
                },
                { key: 'type', header: 'Type', render: (t) => t.type },
                {
                  key: 'toAddress',
                  header: 'To',
                  render: (t) => (t.toAddress ? formatAddress(t.toAddress) : '--'),
                },
                { key: 'amount', header: 'Amount', render: (t) => t.amount ?? '--' },
                {
                  key: 'status',
                  header: 'Status',
                  render: (t) => (
                    <Badge
                      variant={
                        t.status === 'CONFIRMED'
                          ? 'success'
                          : t.status === 'FAILED'
                            ? 'danger'
                            : 'warning'
                      }
                    >
                      {t.status}
                    </Badge>
                  ),
                },
                { key: 'network', header: 'Network', render: (t) => t.network ?? '--' },
              ]}
              data={txs.value}
              loading={txsLoading.value}
              emptyMessage="No transactions yet"
            />
          </div>

          <div class="owner-section" style={{ marginTop: 'var(--space-6)' }}>
            <h3 style={{ marginBottom: 'var(--space-3)' }}>Owner Wallet</h3>

            {wallet.value.ownerState === 'NONE' && wallet.value.status !== 'TERMINATED' && (
              <div style={{
                background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-3) var(--space-4)',
                marginBottom: 'var(--space-4)',
              }}>
                <p style={{ marginBottom: 'var(--space-2)', fontWeight: 500 }}>
                  What is an Owner Wallet?
                </p>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem', marginBottom: 'var(--space-3)' }}>
                  Register an Owner wallet to enable transaction approval (APPROVAL policy) for high-value transfers.
                  Connect D'CENT, MetaMask, or other WalletConnect-compatible wallets to approve transactions directly.
                </p>
                <Button size="sm" onClick={startEditOwner}>
                  Set Owner Address
                </Button>
              </div>
            )}

            <DetailRow label="Address">
              {ownerEditing.value ? (
                <div class="inline-edit">
                  <input
                    value={editOwnerAddress.value}
                    onInput={(e) => {
                      editOwnerAddress.value = (e.target as HTMLInputElement).value;
                    }}
                    class="inline-edit-input"
                    placeholder="Enter owner wallet address"
                  />
                  <Button size="sm" onClick={handleSaveOwner} loading={ownerEditLoading.value}>
                    Save
                  </Button>
                  <Button size="sm" variant="secondary" onClick={cancelEditOwner}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <span>
                  {wallet.value.ownerAddress ? (
                    <>
                      {formatAddress(wallet.value.ownerAddress)}
                      <CopyButton value={wallet.value.ownerAddress} />
                    </>
                  ) : (
                    'Not set'
                  )}
                  {wallet.value.ownerState !== 'LOCKED' && wallet.value.status === 'ACTIVE' && (
                    <button class="btn btn-ghost btn-sm" onClick={startEditOwner} title="Set owner address">
                      &#9998;
                    </button>
                  )}
                </span>
              )}
            </DetailRow>
            <DetailRow label="State">
              <Badge variant={ownerStateBadge(wallet.value.ownerState)}>
                {wallet.value.ownerState}
              </Badge>
            </DetailRow>
            {wallet.value.ownerState === 'GRACE' && (
              <div style={{
                background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-3) var(--space-4)',
                marginTop: 'var(--space-3)',
              }}>
                <p style={{ marginBottom: 'var(--space-2)', fontWeight: 500, fontSize: '0.85rem' }}>
                  Verify Owner
                </p>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
                  Sign a verification message with the Owner wallet to transition from GRACE to LOCKED.
                  Connect via WalletConnect first, then trigger an APPROVAL-tier transaction or use the CLI/SDK to call the verify endpoint.
                </p>
              </div>
            )}

            <div style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--color-border)' }}>
              <h4 style={{ marginBottom: 'var(--space-2)', fontSize: '0.9rem' }}>WalletConnect</h4>
              {wcSessionLoading.value ? (
                <div class="stat-skeleton" style={{ height: '60px' }} />
              ) : wcSession.value ? (
                <div>
                  <DetailRow label="Status">
                    <Badge variant="success">Connected</Badge>
                  </DetailRow>
                  <DetailRow label="Peer" value={wcSession.value.peerName ?? 'Unknown'} />
                  <DetailRow label="Chain ID" value={wcSession.value.chainId} />
                  <DetailRow label="Expires" value={formatDate(wcSession.value.expiry)} />
                  <div style={{ marginTop: 'var(--space-3)' }}>
                    <Button variant="danger" onClick={handleWcDisconnect} loading={wcDisconnectLoading.value}>
                      Disconnect
                    </Button>
                  </div>
                </div>
              ) : (
                <div>
                  <p style={{ marginBottom: 'var(--space-3)', color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
                    Connect an external wallet (D'CENT, MetaMask, Phantom) via WalletConnect for transaction approval.
                  </p>
                  {wallet.value?.ownerAddress ? (
                    <Button onClick={handleWcConnect} loading={wcPairingLoading.value}>
                      Connect Wallet
                    </Button>
                  ) : (
                    <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
                      Set an Owner address first to enable WalletConnect.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div class="mcp-setup-section" style={{ marginTop: 'var(--space-6)' }}>
            <h3 style={{ marginBottom: 'var(--space-3)' }}>MCP Setup</h3>
            {mcpResult.value ? (
              <div>
                <div class="detail-grid" style={{ marginBottom: 'var(--space-4)' }}>
                  <DetailRow label="Token Path" value={mcpResult.value.tokenPath} />
                  <DetailRow label="Expires At" value={formatDate(mcpResult.value.expiresAt)} />
                </div>
                <div style={{ marginBottom: 'var(--space-2)' }}>
                  <strong>Claude Desktop Config</strong>
                </div>
                <div style={{ position: 'relative' }}>
                  <pre><code style={{
                    display: 'block',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    background: 'var(--color-bg-secondary)',
                    padding: 'var(--space-3)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.85rem',
                    maxHeight: '300px',
                    overflow: 'auto',
                  }}>
                    {JSON.stringify({ mcpServers: mcpResult.value.claudeDesktopConfig }, null, 2)}
                  </code></pre>
                  <div style={{ marginTop: 'var(--space-2)' }}>
                    <CopyButton
                      value={JSON.stringify({ mcpServers: mcpResult.value.claudeDesktopConfig }, null, 2)}
                      label="Copy Config"
                    />
                  </div>
                </div>
                <div style={{ marginTop: 'var(--space-3)' }}>
                  <Button variant="secondary" onClick={handleMcpSetup} loading={mcpLoading.value}>
                    Re-provision
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <p style={{ marginBottom: 'var(--space-3)', color: 'var(--color-text-secondary)' }}>
                  Provision an MCP token for Claude Desktop integration.
                </p>
                <Button onClick={handleMcpSetup} loading={mcpLoading.value}>
                  Setup MCP
                </Button>
              </div>
            )}
          </div>

          <Modal
            open={deleteModal.value}
            title="Terminate Wallet"
            onCancel={() => { deleteModal.value = false; }}
            onConfirm={handleDelete}
            confirmText="Terminate"
            confirmVariant="danger"
            loading={deleteLoading.value}
          >
            <p>
              Are you sure you want to terminate wallet <strong>{wallet.value.name}</strong>? This
              action cannot be undone.
            </p>
          </Modal>

          <Modal
            open={wcQrModal.value}
            title="Scan QR Code"
            onCancel={() => {
              wcQrModal.value = false;
              if (pollRef.value) clearInterval(pollRef.value);
              pollRef.value = null;
            }}
          >
            {wcQrData.value && (
              <div style={{ textAlign: 'center' }}>
                <img
                  src={wcQrData.value.qrCode}
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
      ) : (
        <EmptyState title="Wallet not found" description="The wallet may have been deleted." />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// RPC Endpoints Tab
// ---------------------------------------------------------------------------

const solanaRpcKeys = ['solana_mainnet', 'solana_devnet', 'solana_testnet'];
const evmRpcKeys = [
  'evm_ethereum_mainnet', 'evm_ethereum_sepolia',
  'evm_polygon_mainnet', 'evm_polygon_amoy',
  'evm_arbitrum_mainnet', 'evm_arbitrum_sepolia',
  'evm_optimism_mainnet', 'evm_optimism_sepolia',
  'evm_base_mainnet', 'evm_base_sepolia',
];

const RPC_DESCRIPTIONS: Record<string, string> = {
  solana_mainnet: 'RPC endpoint URL for Solana mainnet',
  solana_devnet: 'RPC endpoint URL for Solana devnet',
  solana_testnet: 'RPC endpoint URL for Solana testnet',
  evm_ethereum_mainnet: 'RPC endpoint URL for Ethereum mainnet',
  evm_ethereum_sepolia: 'RPC endpoint URL for Ethereum Sepolia testnet',
  evm_polygon_mainnet: 'RPC endpoint URL for Polygon mainnet',
  evm_polygon_amoy: 'RPC endpoint URL for Polygon Amoy testnet',
  evm_arbitrum_mainnet: 'RPC endpoint URL for Arbitrum mainnet',
  evm_arbitrum_sepolia: 'RPC endpoint URL for Arbitrum Sepolia testnet',
  evm_optimism_mainnet: 'RPC endpoint URL for Optimism mainnet',
  evm_optimism_sepolia: 'RPC endpoint URL for Optimism Sepolia testnet',
  evm_base_mainnet: 'RPC endpoint URL for Base mainnet',
  evm_base_sepolia: 'RPC endpoint URL for Base Sepolia testnet',
};

const MONITORING_DESCRIPTIONS: Record<string, string> = {
  enabled: 'Enable or disable balance monitoring',
  check_interval_sec: 'How often to check wallet balances',
  low_balance_threshold_sol: 'Alert when SOL balance drops below this amount',
  low_balance_threshold_eth: 'Alert when ETH balance drops below this amount',
  cooldown_hours: 'Suppress duplicate alerts for this many hours',
};

const evmNetworkOptions = [
  { label: 'Ethereum Mainnet', value: 'ethereum-mainnet' },
  { label: 'Ethereum Sepolia', value: 'ethereum-sepolia' },
  { label: 'Polygon Mainnet', value: 'polygon-mainnet' },
  { label: 'Polygon Amoy', value: 'polygon-amoy' },
  { label: 'Arbitrum Mainnet', value: 'arbitrum-mainnet' },
  { label: 'Arbitrum Sepolia', value: 'arbitrum-sepolia' },
  { label: 'Optimism Mainnet', value: 'optimism-mainnet' },
  { label: 'Optimism Sepolia', value: 'optimism-sepolia' },
  { label: 'Base Mainnet', value: 'base-mainnet' },
  { label: 'Base Sepolia', value: 'base-sepolia' },
];

function RpcEndpointsTab() {
  const settings = useSignal<SettingsData>({});
  const dirty = useSignal<Record<string, string>>({});
  const saving = useSignal(false);
  const loading = useSignal(true);
  const rpcTestResults = useSignal<Record<string, RpcTestResult>>({});
  const rpcTesting = useSignal<Record<string, boolean>>({});

  const fetchSettings = async () => {
    try {
      const result = await apiGet<SettingsData>(API.ADMIN_SETTINGS);
      settings.value = result;
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      loading.value = false;
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleFieldChange = (fullKey: string, value: string | number | boolean) => {
    const strValue = typeof value === 'boolean' ? String(value) : String(value);
    dirty.value = { ...dirty.value, [fullKey]: strValue };
  };

  const handleSave = async () => {
    saving.value = true;
    try {
      const entries = Object.entries(dirty.value)
        .filter(([key]) => key.startsWith('rpc.'))
        .map(([key, value]) => ({ key, value }));
      await apiPut(API.ADMIN_SETTINGS, { settings: entries });
      dirty.value = {};
      await fetchSettings();
      showToast('success', 'Settings saved and applied');
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      saving.value = false;
    }
  };

  const handleDiscard = () => {
    dirty.value = {};
  };

  useEffect(() => {
    registerDirty({
      id: 'wallets-rpc',
      isDirty: () => Object.keys(dirty.value).filter(k => k.startsWith('rpc.')).length > 0,
      save: handleSave,
      discard: handleDiscard,
    });
    return () => unregisterDirty('wallets-rpc');
  }, []);

  const handleRpcTest = async (settingKey: string) => {
    const shortKey = settingKey.split('.')[1] ?? '';
    const effectiveUrl = getEffectiveValue(settings.value, dirty.value, 'rpc', shortKey);
    if (!effectiveUrl) {
      showToast('warning', 'Enter a URL before testing');
      return;
    }

    const chain = shortKey.startsWith('solana') ? 'solana' : 'evm';

    rpcTesting.value = { ...rpcTesting.value, [settingKey]: true };
    try {
      const result = await apiPost<RpcTestResult>(API.ADMIN_SETTINGS_TEST_RPC, { url: effectiveUrl, chain });
      rpcTestResults.value = { ...rpcTestResults.value, [settingKey]: result };
    } catch {
      rpcTestResults.value = {
        ...rpcTestResults.value,
        [settingKey]: { success: false, latencyMs: 0, error: 'Request failed' },
      };
    } finally {
      rpcTesting.value = { ...rpcTesting.value, [settingKey]: false };
    }
  };

  function RpcField({ shortKey }: { shortKey: string }) {
    const fullKey = `rpc.${shortKey}`;
    const testResult = rpcTestResults.value[fullKey];
    const isTesting = rpcTesting.value[fullKey];

    return (
      <div class="settings-field-full">
        <div class="rpc-field-row">
          <FormField
            label={keyToLabel(shortKey)}
            name={fullKey}
            type="text"
            value={getEffectiveValue(settings.value, dirty.value, 'rpc', shortKey)}
            onChange={(v) => handleFieldChange(fullKey, v)}
            placeholder="https://..."
            description={RPC_DESCRIPTIONS[shortKey]}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleRpcTest(fullKey)}
            loading={!!isTesting}
          >
            Test
          </Button>
        </div>
        {testResult && (
          <div class={`rpc-test-result ${testResult.success ? 'rpc-test-result--success' : 'rpc-test-result--failure'}`}>
            <Badge variant={testResult.success ? 'success' : 'danger'}>
              {testResult.success ? 'OK' : 'FAIL'}
            </Badge>
            <span>{testResult.latencyMs}ms</span>
            {testResult.blockNumber !== undefined && <span> (block #{testResult.blockNumber.toLocaleString()})</span>}
            {testResult.error && <span> - {testResult.error}</span>}
          </div>
        )}
      </div>
    );
  }

  const dirtyCount = Object.keys(dirty.value).filter((k) => k.startsWith('rpc.')).length;

  if (loading.value) {
    return (
      <div class="empty-state">
        <p>Loading settings...</p>
      </div>
    );
  }

  return (
    <>
      {/* Save bar -- sticky when dirty */}
      {dirtyCount > 0 && (
        <div class="settings-save-bar">
          <span>{dirtyCount} unsaved change{dirtyCount > 1 ? 's' : ''}</span>
          <div class="settings-save-bar-actions">
            <Button variant="ghost" size="sm" onClick={handleDiscard}>
              Discard
            </Button>
            <Button variant="primary" size="sm" onClick={handleSave} loading={saving.value}>
              Save
            </Button>
          </div>
        </div>
      )}

      <div class="settings-category">
        <div class="settings-category-header">
          <h3>RPC Endpoints</h3>
          <p class="settings-description">Configure blockchain RPC URLs for Solana and EVM networks</p>
        </div>
        <div class="settings-category-body">
          <div class="settings-subgroup">
            <div class="settings-subgroup-title">Solana</div>
            <div class="settings-fields-grid">
              {solanaRpcKeys.map((k) => (
                <RpcField key={k} shortKey={k} />
              ))}
            </div>
          </div>

          <div class="settings-subgroup">
            <div class="settings-subgroup-title">EVM</div>
            <div class="settings-fields-grid">
              {evmRpcKeys.map((k) => (
                <RpcField key={k} shortKey={k} />
              ))}
              <div class="settings-field-full">
                <FormField
                  label={keyToLabel('evm_default_network')}
                  name="rpc.evm_default_network"
                  type="select"
                  value={getEffectiveValue(settings.value, dirty.value, 'rpc', 'evm_default_network') || 'ethereum-sepolia'}
                  onChange={(v) => handleFieldChange('rpc.evm_default_network', v)}
                  options={evmNetworkOptions}
                  description="Default EVM network for new wallets"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Balance Monitoring Tab
// ---------------------------------------------------------------------------

function BalanceMonitoringTab() {
  const settings = useSignal<SettingsData>({});
  const dirty = useSignal<Record<string, string>>({});
  const saving = useSignal(false);
  const loading = useSignal(true);

  const fetchSettings = async () => {
    try {
      const result = await apiGet<SettingsData>(API.ADMIN_SETTINGS);
      settings.value = result;
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      loading.value = false;
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleFieldChange = (fullKey: string, value: string | number | boolean) => {
    const strValue = typeof value === 'boolean' ? String(value) : String(value);
    dirty.value = { ...dirty.value, [fullKey]: strValue };
  };

  const handleSave = async () => {
    saving.value = true;
    try {
      const entries = Object.entries(dirty.value)
        .filter(([key]) => key.startsWith('monitoring.'))
        .map(([key, value]) => ({ key, value }));
      await apiPut(API.ADMIN_SETTINGS, { settings: entries });
      dirty.value = {};
      await fetchSettings();
      showToast('success', 'Settings saved and applied');
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      saving.value = false;
    }
  };

  const handleDiscard = () => {
    dirty.value = {};
  };

  useEffect(() => {
    registerDirty({
      id: 'wallets-monitoring',
      isDirty: () => Object.keys(dirty.value).filter(k => k.startsWith('monitoring.')).length > 0,
      save: handleSave,
      discard: handleDiscard,
    });
    return () => unregisterDirty('wallets-monitoring');
  }, []);

  const fields: { key: string; type: 'number' | 'checkbox'; min?: number; max?: number }[] = [
    { key: 'enabled', type: 'checkbox' },
    { key: 'check_interval_sec', type: 'number', min: 60, max: 86400 },
    { key: 'low_balance_threshold_sol', type: 'number', min: 0 },
    { key: 'low_balance_threshold_eth', type: 'number', min: 0 },
    { key: 'cooldown_hours', type: 'number', min: 1, max: 168 },
  ];

  const dirtyCount = Object.keys(dirty.value).filter((k) => k.startsWith('monitoring.')).length;

  if (loading.value) {
    return (
      <div class="empty-state">
        <p>Loading settings...</p>
      </div>
    );
  }

  return (
    <>
      {/* Save bar -- sticky when dirty */}
      {dirtyCount > 0 && (
        <div class="settings-save-bar">
          <span>{dirtyCount} unsaved change{dirtyCount > 1 ? 's' : ''}</span>
          <div class="settings-save-bar-actions">
            <Button variant="ghost" size="sm" onClick={handleDiscard}>
              Discard
            </Button>
            <Button variant="primary" size="sm" onClick={handleSave} loading={saving.value}>
              Save
            </Button>
          </div>
        </div>
      )}

      <div class="settings-category">
        <div class="settings-category-header">
          <h3>Balance Monitoring</h3>
          <p class="settings-description">
            Periodic balance checks for all active wallets. Sends LOW_BALANCE alerts when
            native token balance drops below thresholds. Changes apply immediately.
          </p>
        </div>
        <div class="settings-category-body">
          <div class="settings-fields-grid">
            {fields.map((f) =>
              f.type === 'checkbox' ? (
                <div class="settings-field-full" key={f.key}>
                  <FormField
                    label={keyToLabel(f.key)}
                    name={`monitoring.${f.key}`}
                    type="checkbox"
                    value={getEffectiveBoolValue(settings.value, dirty.value, 'monitoring', f.key)}
                    onChange={(v) => handleFieldChange(`monitoring.${f.key}`, v)}
                    description={MONITORING_DESCRIPTIONS[f.key]}
                  />
                </div>
              ) : (
                <FormField
                  key={f.key}
                  label={keyToLabel(f.key)}
                  name={`monitoring.${f.key}`}
                  type="number"
                  value={Number(getEffectiveValue(settings.value, dirty.value, 'monitoring', f.key)) || 0}
                  onChange={(v) => handleFieldChange(`monitoring.${f.key}`, v)}
                  min={f.min}
                  max={f.max}
                  description={MONITORING_DESCRIPTIONS[f.key]}
                />
              ),
            )}
          </div>
          <div class="settings-info-box">
            Monitors all active wallet native token balances (SOL, ETH) at the configured interval.
            When balance drops below threshold, a LOW_BALANCE notification is sent.
            Duplicate alerts are suppressed for the cooldown period (per wallet).
          </div>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// WalletConnect Tab
// ---------------------------------------------------------------------------

function WalletConnectTab() {
  const settings = useSignal<SettingsData>({});
  const dirty = useSignal<Record<string, string>>({});
  const saving = useSignal(false);
  const loading = useSignal(true);

  const fetchSettings = async () => {
    try {
      const result = await apiGet<SettingsData>(API.ADMIN_SETTINGS);
      settings.value = result;
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      loading.value = false;
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleFieldChange = (fullKey: string, value: string | number | boolean) => {
    const strValue = typeof value === 'boolean' ? String(value) : String(value);
    dirty.value = { ...dirty.value, [fullKey]: strValue };
  };

  const handleSave = async () => {
    saving.value = true;
    try {
      const entries = Object.entries(dirty.value)
        .filter(([key]) => key.startsWith('walletconnect.'))
        .map(([key, value]) => ({ key, value }));
      await apiPut(API.ADMIN_SETTINGS, { settings: entries });
      dirty.value = {};
      await fetchSettings();
      showToast('success', 'Settings saved and applied');
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      saving.value = false;
    }
  };

  const handleDiscard = () => {
    dirty.value = {};
  };

  useEffect(() => {
    registerDirty({
      id: 'wallets-walletconnect',
      isDirty: () => Object.keys(dirty.value).filter(k => k.startsWith('walletconnect.')).length > 0,
      save: handleSave,
      discard: handleDiscard,
    });
    return () => unregisterDirty('wallets-walletconnect');
  }, []);

  const dirtyCount = Object.keys(dirty.value).filter((k) => k.startsWith('walletconnect.')).length;

  if (loading.value) {
    return (
      <div class="empty-state">
        <p>Loading settings...</p>
      </div>
    );
  }

  return (
    <>
      {/* Save bar -- sticky when dirty */}
      {dirtyCount > 0 && (
        <div class="settings-save-bar">
          <span>{dirtyCount} unsaved change{dirtyCount > 1 ? 's' : ''}</span>
          <div class="settings-save-bar-actions">
            <Button variant="ghost" size="sm" onClick={handleDiscard}>
              Discard
            </Button>
            <Button variant="primary" size="sm" onClick={handleSave} loading={saving.value}>
              Save
            </Button>
          </div>
        </div>
      )}

      <div class="settings-category">
        <div class="settings-category-header">
          <h3>WalletConnect</h3>
          <p class="settings-description">WalletConnect integration for dApp connections</p>
        </div>
        <div class="settings-category-body">
          <div class="settings-fields-grid">
            <div class="settings-field-full">
              <FormField
                label={keyToLabel('project_id')}
                name="walletconnect.project_id"
                type="text"
                value={getEffectiveValue(settings.value, dirty.value, 'walletconnect', 'project_id')}
                onChange={(v) => handleFieldChange('walletconnect.project_id', v)}
                description="WalletConnect Cloud project identifier"
              />
            </div>
            <div class="settings-field-full">
              <FormField
                label={keyToLabel('relay_url')}
                name="walletconnect.relay_url"
                type="text"
                value={getEffectiveValue(settings.value, dirty.value, 'walletconnect', 'relay_url')}
                onChange={(v) => handleFieldChange('walletconnect.relay_url', v)}
                placeholder="wss://relay.walletconnect.com"
                description="WalletConnect relay server URL"
              />
            </div>
          </div>
          <div class="settings-info-box">
            Get your project ID from{' '}
            <a href="https://cloud.walletconnect.com" target="_blank" rel="noopener noreferrer">
              https://cloud.walletconnect.com
            </a>
            {' '}&mdash; Create a free account and project to obtain your project ID.
          </div>
          <div class="settings-info-box">
            Relay URL defaults to wss://relay.walletconnect.com if not set.
          </div>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Wallet List Content
// ---------------------------------------------------------------------------

function WalletListContent() {
  const wallets = useSignal<Wallet[]>([]);
  const loading = useSignal(true);
  const showForm = useSignal(false);
  const formName = useSignal('');
  const formChain = useSignal('solana');
  const formEnvironment = useSignal('testnet');
  const formError = useSignal<string | null>(null);
  const formLoading = useSignal(false);
  const createdSessionToken = useSignal<string | null>(null);

  const fetchWallets = async () => {
    try {
      const result = await apiGet<{ items: Wallet[] }>(API.WALLETS);
      wallets.value = result.items;
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
      const result = await apiPost<Wallet & { session?: { id: string; token: string; expiresAt: number } | null }>(API.WALLETS, {
        name: formName.value.trim(),
        chain: formChain.value,
        environment: formEnvironment.value,
      });
      if (result.session?.token) {
        createdSessionToken.value = result.session.token;
        showToast('success', 'Wallet created with session');
      } else {
        showToast('success', 'Wallet created');
      }
      formName.value = '';
      formChain.value = 'solana';
      formEnvironment.value = 'testnet';
      showForm.value = false;
      loading.value = true;
      await fetchWallets();
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      formError.value = getErrorMessage(e.code);
    } finally {
      formLoading.value = false;
    }
  };

  const navigateToDetail = (wallet: Wallet) => {
    window.location.hash = '#/wallets/' + wallet.id;
  };

  const handleChainChange = (value: string | number | boolean) => {
    formChain.value = value as string;
  };

  useEffect(() => {
    fetchWallets();
  }, []);

  return (
    <>
      <div class="page-actions">
        {!showForm.value && (
          <Button onClick={() => { showForm.value = true; }}>Create Wallet</Button>
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
            label="Environment"
            name="environment"
            type="select"
            value={formEnvironment.value}
            onChange={(v) => { formEnvironment.value = v as string; }}
            options={[
              { label: 'Testnet', value: 'testnet' },
              { label: 'Mainnet', value: 'mainnet' },
            ]}
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

      {createdSessionToken.value && (
        <div class="inline-form" style={{ marginBottom: '1rem' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>Session Token (copy now — shown only once)</div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              type="text"
              readOnly
              value={createdSessionToken.value}
              style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.85rem', padding: '0.5rem' }}
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <Button
              variant="secondary"
              onClick={() => {
                void navigator.clipboard.writeText(createdSessionToken.value!);
                showToast('success', 'Token copied');
              }}
            >
              Copy
            </Button>
            <Button
              variant="secondary"
              onClick={() => { createdSessionToken.value = null; }}
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}

      <Table<Wallet>
        columns={walletColumns}
        data={wallets.value}
        loading={loading.value}
        onRowClick={navigateToDetail}
        emptyMessage="No wallets yet"
      />
    </>
  );
}

const WALLETS_TABS = [
  { key: 'wallets', label: 'Wallets' },
  { key: 'rpc', label: 'RPC Endpoints' },
  { key: 'monitoring', label: 'Balance Monitoring' },
  { key: 'walletconnect', label: 'WalletConnect' },
];

function WalletListWithTabs() {
  const activeTab = useSignal('wallets');

  useEffect(() => {
    const nav = pendingNavigation.value;
    if (nav && nav.tab) {
      activeTab.value = nav.tab;
      setTimeout(() => {
        highlightField.value = nav.fieldName;
      }, 100);
      pendingNavigation.value = null;
    }
  }, [pendingNavigation.value]);

  return (
    <div class="page">
      <Breadcrumb
        pageName="Wallets"
        tabName={WALLETS_TABS.find(t => t.key === activeTab.value)?.label ?? ''}
        onPageClick={() => { activeTab.value = 'wallets'; }}
      />
      <TabNav tabs={WALLETS_TABS} activeTab={activeTab.value} onTabChange={(k) => { activeTab.value = k; }} />
      {activeTab.value === 'wallets' && <WalletListContent />}
      {activeTab.value === 'rpc' && <RpcEndpointsTab />}
      {activeTab.value === 'monitoring' && <BalanceMonitoringTab />}
      {activeTab.value === 'walletconnect' && <WalletConnectTab />}
    </div>
  );
}

export default function WalletsPage() {
  const path = currentPath.value;
  const walletId = path.startsWith('/wallets/') ? path.slice('/wallets/'.length) : null;

  if (walletId) {
    return <WalletDetailView id={walletId} />;
  }
  return <WalletListWithTabs />;
}
