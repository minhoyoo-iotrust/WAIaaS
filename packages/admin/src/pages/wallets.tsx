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

interface Wallet {
  id: string;
  name: string;
  chain: string;
  network: string;
  environment: string;
  publicKey: string;
  status: string;
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

interface WalletBalance {
  native: { balance: string; symbol: string; network: string } | null;
  tokens: Array<{ symbol: string; balance: string; address: string }>;
  error?: string;
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
      showToast('error', getErrorMessage(e.code));
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
            <Button variant="danger" onClick={() => { deleteModal.value = true; }}>
              Terminate Wallet
            </Button>
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
            <DetailRow
              label="Owner Address"
              value={wallet.value.ownerAddress ?? 'None'}
              copy={!!wallet.value.ownerAddress}
            />
            <DetailRow label="Owner State">
              <Badge variant={ownerStateBadge(wallet.value.ownerState)}>
                {wallet.value.ownerState}
              </Badge>
            </DetailRow>
            <DetailRow label="Created" value={formatDate(wallet.value.createdAt)} />
            <DetailRow
              label="Updated"
              value={wallet.value.updatedAt ? formatDate(wallet.value.updatedAt) : 'Never'}
            />
          </div>

          <div class="balance-section" style={{ marginTop: 'var(--space-6)' }}>
            <h3 style={{ marginBottom: 'var(--space-3)' }}>Balance</h3>
            {balanceLoading.value ? (
              <div class="stat-skeleton" style={{ height: '60px' }} />
            ) : balance.value?.native ? (
              <div>
                <DetailRow
                  label="Native"
                  value={`${balance.value.native.balance} ${balance.value.native.symbol} (${balance.value.native.network})`}
                />
                {balance.value.tokens.length > 0 ? (
                  balance.value.tokens.map((t) => (
                    <DetailRow key={t.address} label={t.symbol} value={t.balance} />
                  ))
                ) : (
                  <p style={{ color: 'var(--color-text-secondary)', marginTop: 'var(--space-2)' }}>
                    No tokens registered
                  </p>
                )}
              </div>
            ) : (
              <p style={{ color: 'var(--color-text-secondary)' }}>
                {balance.value?.error ?? 'Balance unavailable'}
              </p>
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

          <div class="wc-section" style={{ marginTop: 'var(--space-6)' }}>
            <h3 style={{ marginBottom: 'var(--space-3)' }}>WalletConnect</h3>
            {wcSessionLoading.value ? (
              <div class="stat-skeleton" style={{ height: '60px' }} />
            ) : wcSession.value ? (
              <div>
                <DetailRow label="Status">
                  <Badge variant="success">Connected</Badge>
                </DetailRow>
                <DetailRow label="Peer" value={wcSession.value.peerName ?? 'Unknown'} />
                <DetailRow label="Owner Address" value={wcSession.value.ownerAddress} copy />
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
                <p style={{ marginBottom: 'var(--space-3)', color: 'var(--color-text-secondary)' }}>
                  Connect an external wallet (MetaMask, Phantom) via WalletConnect for transaction approval.
                </p>
                <Button onClick={handleWcConnect} loading={wcPairingLoading.value}>
                  Connect Wallet
                </Button>
              </div>
            )}
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
                  Scan with MetaMask, Phantom, or any WalletConnect-compatible wallet
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

function WalletListView() {
  const wallets = useSignal<Wallet[]>([]);
  const loading = useSignal(true);
  const showForm = useSignal(false);
  const formName = useSignal('');
  const formChain = useSignal('solana');
  const formEnvironment = useSignal('testnet');
  const formError = useSignal<string | null>(null);
  const formLoading = useSignal(false);

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
      await apiPost<Wallet>(API.WALLETS, {
        name: formName.value.trim(),
        chain: formChain.value,
        environment: formEnvironment.value,
      });
      showToast('success', 'Wallet created');
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
    <div class="page">
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

      <Table<Wallet>
        columns={walletColumns}
        data={wallets.value}
        loading={loading.value}
        onRowClick={navigateToDetail}
        emptyMessage="No wallets yet"
      />
    </div>
  );
}

export default function WalletsPage() {
  const path = currentPath.value;
  const walletId = path.startsWith('/wallets/') ? path.slice('/wallets/'.length) : null;

  if (walletId) {
    return <WalletDetailView id={walletId} />;
  }
  return <WalletListView />;
}
