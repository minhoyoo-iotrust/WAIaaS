import { useSignal, useComputed } from '@preact/signals';
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
import { SearchInput } from '../components/search-input';
import { FilterBar } from '../components/filter-bar';
import type { FilterField } from '../components/filter-bar';
import { ExplorerLink } from '../components/explorer-link';
import { fetchDisplayCurrency, formatWithDisplay } from '../utils/display-currency';
import {
  type SettingsData,
  type RpcTestResult,
  type RpcPoolStatus,
  type RpcEndpointStatusEntry,
  keyToLabel,
  getEffectiveValue,
  getEffectiveBoolValue,
} from '../utils/settings-helpers';


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
  accountType?: string;
  signerKey?: string | null;
  deployed?: boolean;
  provider?: { name: string; supportedChains: string[]; paymasterEnabled: boolean } | null;
}

interface WalletDetail extends Wallet {
  ownerAddress: string | null;
  ownerVerified: boolean | null;
  ownerState: 'NONE' | 'GRACE' | 'LOCKED';
  approvalMethod: string | null;
  walletType?: string | null;
  suspendedAt: number | null;
  suspensionReason: string | null;
  updatedAt: number | null;
  accountType?: string;
  signerKey?: string | null;
  deployed?: boolean;
}

interface NetworkInfo {
  network: string;
  name?: string;
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
  native: { balance: string; symbol: string; usd?: number | null } | null;
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
  formattedAmount: string | null;
  amountUsd: string | null;
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

interface StakingPosition {
  protocol: 'lido' | 'jito';
  chain: 'ethereum' | 'solana';
  asset: string;
  balance: string;
  balanceUsd: string | null;
  apy: string | null;
  pendingUnstake: { amount: string; status: 'PENDING' | 'COMPLETED' | 'TIMEOUT'; requestedAt: number | null } | null;
}

interface StakingPositionsResponse {
  walletId: string;
  positions: StakingPosition[];
}

/** Builtin wallet presets — mirrored from @waiaas/core BUILTIN_PRESETS.
 *  When core adds a new preset, this list must be updated manually. */
const WALLET_PRESETS = [
  { value: 'dcent', label: "D'CENT Wallet", description: "D'CENT hardware wallet with push notification signing" },
] as const;

/** Maps preset value to the human-readable approval method it auto-configures. */
const PRESET_APPROVAL_PREVIEW: Record<string, string> = {
  dcent: 'Wallet App (ntfy)',
};

/** Maps preset value to its default approval method value (for change warnings). */
const PRESET_APPROVAL_DEFAULTS: Record<string, string> = {
  dcent: 'sdk_ntfy',
};

/** AA provider options for Smart Account wallet create/edit forms. */
const AA_PROVIDER_OPTIONS = [
  { value: 'pimlico', label: 'Pimlico' },
  { value: 'alchemy', label: 'Alchemy' },
  { value: 'custom', label: 'Custom' },
] as const;

/** Dashboard URLs for AA provider API key acquisition (mirrored from @waiaas/core). */
const AA_PROVIDER_DASHBOARD_URLS: Record<string, string> = {
  pimlico: 'https://dashboard.pimlico.io',
  alchemy: 'https://dashboard.alchemy.com',
};

export function chainNetworkOptions(chain: string): { label: string; value: string }[] {
  if (chain === 'solana') {
    return [
      { label: 'Solana Devnet', value: 'solana-devnet' },
      { label: 'Solana Testnet', value: 'solana-testnet' },
      { label: 'Solana Mainnet', value: 'solana-mainnet' },
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
  return [{ label: 'Solana Devnet', value: 'solana-devnet' }];
}

// walletColumns moved inside WalletListContent to reference balances signal

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

interface ApprovalSettingsInfo {
  signingEnabled: boolean;
  telegramBotConfigured: boolean;
  wcConfigured: boolean;
}

const APPROVAL_OPTIONS: Array<{
  value: string | null;
  label: string;
  description: string;
  warning?: string;
  warningCondition?: (settings: ApprovalSettingsInfo | null) => boolean;
}> = [
  {
    value: null,
    label: 'Auto (Global Fallback)',
    description: 'System decides based on configured channels: Wallet App (ntfy) > Wallet App (Telegram) > WalletConnect > Telegram Bot > REST',
  },
  {
    value: 'sdk_ntfy',
    label: 'Wallet App (ntfy)',
    description: 'Push sign request to wallet app via ntfy server',
    warning: 'Signing SDK is not enabled. Go to Wallets > Human Wallet Apps settings.',
    warningCondition: (s) => !s?.signingEnabled,
  },
  {
    value: 'sdk_telegram',
    label: 'Wallet App (Telegram)',
    description: 'Push sign request to wallet app via Telegram with universal link',
    warning: 'Signing SDK or Telegram bot is not configured. Check Wallets > Human Wallet Apps and Notifications > Settings > Telegram.',
    warningCondition: (s) => !s?.signingEnabled || !s?.telegramBotConfigured,
  },
  {
    value: 'walletconnect',
    label: 'WalletConnect',
    description: "Approve via connected WalletConnect wallet (D'CENT, MetaMask, etc.)",
    warning: 'WalletConnect project ID is not configured. Go to Wallets > WalletConnect tab.',
    warningCondition: (s) => !s?.wcConfigured,
  },
  {
    value: 'telegram_bot',
    label: 'Telegram Bot',
    description: 'Approve/reject via Telegram bot /approve and /reject commands',
    warning: 'Telegram bot token is not configured. Go to Notifications > Settings > Telegram.',
    warningCondition: (s) => !s?.telegramBotConfigured,
  },
  {
    value: 'rest',
    label: 'REST API',
    description: 'Manual approval via REST API endpoints (POST /approve, /reject)',
  },
];

const DETAIL_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'owner', label: 'Owner' },
  { key: 'staking', label: 'Staking' },
  { key: 'mcp', label: 'MCP' },
];

const TX_PAGE_SIZE = 20;

const TX_STATUS_OPTIONS = [
  { value: 'PENDING', label: 'PENDING' },
  { value: 'APPROVED', label: 'APPROVED' },
  { value: 'SUBMITTED', label: 'SUBMITTED' },
  { value: 'CONFIRMED', label: 'CONFIRMED' },
  { value: 'FAILED', label: 'FAILED' },
];

const TX_TYPE_OPTIONS = [
  { value: 'TRANSFER', label: 'TRANSFER' },
  { value: 'TOKEN_TRANSFER', label: 'TOKEN_TRANSFER' },
  { value: 'CONTRACT_CALL', label: 'CONTRACT_CALL' },
  { value: 'APPROVE', label: 'APPROVE' },
  { value: 'BATCH', label: 'BATCH' },
];

const TX_FILTER_FIELDS: FilterField[] = [
  { key: 'status', label: 'Status', type: 'select', options: TX_STATUS_OPTIONS },
  { key: 'type', label: 'Type', type: 'select', options: TX_TYPE_OPTIONS },
];

const TX_COLUMNS = ['Time', 'Type', 'To', 'Amount', 'Network', 'Status', 'Tx Hash'];

function txStatusVariant(status: string): 'success' | 'danger' | 'warning' {
  if (status === 'CONFIRMED') return 'success';
  if (status === 'FAILED') return 'danger';
  return 'warning';
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
  const balance = useSignal<WalletBalance | null>(null);
  const balanceLoading = useSignal(true);
  const txs = useSignal<WalletTransaction[]>([]);
  const txsLoading = useSignal(true);
  const txTotal = useSignal(0);
  const txPage = useSignal(0);
  const txFilters = useSignal<Record<string, string>>({ status: '', type: '' });
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
  const walletTypeSelect = useSignal<string>('');
  const walletTypeChanging = useSignal(false);
  const approvalSettings = useSignal<ApprovalSettingsInfo | null>(null);
  const suspendModal = useSignal(false);
  const suspendLoading = useSignal(false);
  const suspendReason = useSignal('');
  const resumeLoading = useSignal(false);
  const activeDetailTab = useSignal('overview');
  const displayCurrency = useSignal<string>('USD');
  const displayRate = useSignal<number | null>(1);
  const stakingPositions = useSignal<StakingPosition[]>([]);
  const stakingLoading = useSignal(true);

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

  const handleSuspend = async () => {
    suspendLoading.value = true;
    try {
      await apiPost(API.WALLET_SUSPEND(id), {
        reason: suspendReason.value.trim() || undefined,
      });
      showToast('success', 'Wallet suspended');
      suspendModal.value = false;
      suspendReason.value = '';
      await fetchWallet();
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      suspendLoading.value = false;
    }
  };

  const handleResume = async () => {
    resumeLoading.value = true;
    try {
      await apiPost(API.WALLET_RESUME(id));
      showToast('success', 'Wallet resumed');
      await fetchWallet();
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      resumeLoading.value = false;
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

  const fetchTransactions = async (pageNum?: number) => {
    txsLoading.value = true;
    try {
      const p = pageNum ?? txPage.value;
      const offset = p * TX_PAGE_SIZE;
      const r = await apiGet<{ items: WalletTransaction[]; total: number }>(
        `${API.ADMIN_WALLET_TRANSACTIONS(id)}?offset=${offset}&limit=${TX_PAGE_SIZE}`,
      );
      txs.value = r.items;
      txTotal.value = r.total;
    } catch {
      txs.value = [];
      txTotal.value = 0;
    } finally {
      txsLoading.value = false;
    }
  };

  // Filtered transactions (client-side status/type filtering)
  const filteredTxs = useComputed(() => {
    let list = txs.value;
    const f = txFilters.value;
    if (f.status) list = list.filter((tx) => tx.status === f.status);
    if (f.type) list = list.filter((tx) => tx.type === f.type);
    return list;
  });

  const fetchStaking = async () => {
    stakingLoading.value = true;
    try {
      const result = await apiGet<StakingPositionsResponse>(API.ADMIN_WALLET_STAKING(id));
      stakingPositions.value = result.positions ?? [];
    } catch {
      stakingPositions.value = [];
    } finally {
      stakingLoading.value = false;
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
    walletTypeSelect.value = wallet.value?.walletType ?? '';
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
      const body: Record<string, unknown> = {
        owner_address: editOwnerAddress.value.trim(),
      };
      if (walletTypeSelect.value) {
        body.wallet_type = walletTypeSelect.value;
      }
      await apiPut(API.WALLET_OWNER(id), body);
      await fetchWallet();
      ownerEditing.value = false;
      const presetInfo = WALLET_PRESETS.find(p => p.value === walletTypeSelect.value);
      if (presetInfo) {
        showToast('success', `Owner set with ${presetInfo.label} auto-setup`);
      } else {
        showToast('success', 'Owner address updated');
      }
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code, e.serverMessage));
    } finally {
      ownerEditLoading.value = false;
    }
  };

  const handleWalletTypeChange = async (newType: string) => {
    if (!wallet.value?.ownerAddress) return;
    ownerEditLoading.value = true;
    try {
      const body: Record<string, unknown> = {
        owner_address: wallet.value.ownerAddress,
      };
      if (newType) {
        body.wallet_type = newType;
      }
      await apiPut(API.WALLET_OWNER(id), body);
      await fetchWallet();
      walletTypeChanging.value = false;
      const presetInfo = WALLET_PRESETS.find(p => p.value === newType);
      if (presetInfo) {
        showToast('success', `Wallet Type changed to ${presetInfo.label}`);
      } else {
        showToast('success', 'Wallet Type cleared');
      }
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code, e.serverMessage));
    } finally {
      ownerEditLoading.value = false;
    }
  };

  const fetchApprovalSettings = async () => {
    try {
      const result = await apiGet<SettingsData>(API.ADMIN_SETTINGS);
      const signingEnabled = result['signing_sdk']?.['enabled'] === 'true';
      const telegramBotConfigured =
        result['telegram']?.['bot_token'] === true ||
        result['notifications']?.['telegram_bot_token'] === true;
      const wcConfigured = !!result['walletconnect']?.['project_id'] && result['walletconnect']['project_id'] !== '';
      approvalSettings.value = { signingEnabled, telegramBotConfigured, wcConfigured };
    } catch {
      // Settings fetch failure is non-critical; warnings won't show
    }
  };

  const handleApprovalMethodChange = async (method: string | null) => {
    // Warn when changing away from preset default
    const wt = wallet.value?.walletType;
    if (wt) {
      const preset = WALLET_PRESETS.find(p => p.value === wt);
      const presetDefault = preset ? PRESET_APPROVAL_DEFAULTS[wt] : undefined;
      if (presetDefault && method !== presetDefault) {
        const presetLabel = preset!.label;
        const defaultLabel = APPROVAL_OPTIONS.find(o => o.value === presetDefault)?.label ?? presetDefault;
        const confirmed = confirm(
          `${presetLabel} preset default is "${defaultLabel}". Changing the approval method may prevent sign requests from being delivered correctly.\n\nProceed with change?`,
        );
        if (!confirmed) return;
      }
    }
    try {
      await apiPut(API.WALLET_OWNER(id), {
        owner_address: wallet.value!.ownerAddress!,
        approval_method: method ?? null,
      });
      await fetchWallet();
      showToast('success', 'Approval method updated');
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code, e.serverMessage));
    }
  };

  useEffect(() => {
    fetchWallet();
    fetchNetworks();
    fetchBalance();
    fetchTransactions();
    fetchWcSession();
    fetchStaking();
    fetchApprovalSettings();
    fetchDisplayCurrency()
      .then(({ currency, rate }) => {
        displayCurrency.value = currency;
        displayRate.value = rate;
      })
      .catch(() => { /* fallback to USD */ });
  }, [id]);

  useEffect(() => {
    return () => {
      if (pollRef.value) clearInterval(pollRef.value);
    };
  }, []);

  // Re-fetch transactions when page changes
  useEffect(() => {
    fetchTransactions();
  }, [txPage.value]);

  // Pagination handlers
  const txOffset = txPage.value * TX_PAGE_SIZE;
  const txShowFrom = txTotal.value > 0 ? txOffset + 1 : 0;
  const txShowTo = Math.min(txOffset + TX_PAGE_SIZE, txTotal.value);
  const txHasPrev = txPage.value > 0;
  const txHasNext = (txPage.value + 1) * TX_PAGE_SIZE < txTotal.value;

  // -------------------------------------------------------------------------
  // Overview Tab
  // -------------------------------------------------------------------------
  function OverviewTab() {
    if (!wallet.value) return null;
    return (
      <>
        <div class="detail-grid">
          <DetailRow label="ID" value={wallet.value.id} copy />
          <DetailRow label="Public Key" value={wallet.value.publicKey} copy />
          <DetailRow label="Chain" value={wallet.value.chain} />
          <DetailRow label="Environment">
            <Badge variant={wallet.value.environment === 'mainnet' ? 'warning' : 'info'}>
              {wallet.value.environment}
            </Badge>
          </DetailRow>
          <DetailRow label="Status">
            <Badge variant={wallet.value.status === 'ACTIVE' ? 'success' : wallet.value.status === 'SUSPENDED' ? 'warning' : 'danger'}>
              {wallet.value.status}
            </Badge>
          </DetailRow>
          <DetailRow label="Account Type">
            <Badge variant={wallet.value.accountType === 'smart' ? 'info' : 'default'}>
              {wallet.value.accountType === 'smart' ? 'Smart Account' : 'EOA'}
            </Badge>
          </DetailRow>
          {wallet.value.accountType === 'smart' && (
            <>
              <DetailRow label="Signer Key" value={wallet.value.signerKey ?? '--'} copy />
              <DetailRow label="Deployed">
                <Badge variant={wallet.value.deployed ? 'success' : 'warning'}>
                  {wallet.value.deployed ? 'Yes' : 'Not yet'}
                </Badge>
              </DetailRow>
            </>
          )}
          {wallet.value.status === 'SUSPENDED' && (
            <>
              <DetailRow label="Suspended At" value={wallet.value.suspendedAt ? formatDate(wallet.value.suspendedAt) : '--'} />
              <DetailRow label="Suspension Reason" value={wallet.value.suspensionReason ?? '--'} />
            </>
          )}
          <DetailRow label="Created" value={formatDate(wallet.value.createdAt)} />
          <DetailRow
            label="Updated"
            value={wallet.value.updatedAt ? formatDate(wallet.value.updatedAt) : 'Never'}
          />
        </div>

        <div class="balance-section" style={{ marginTop: 'var(--space-6)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
            <h3 style={{ margin: 0 }}>Balances</h3>
            <Button variant="secondary" size="sm" onClick={fetchBalance} loading={balanceLoading.value}>
              Refresh
            </Button>
          </div>
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
                    background: 'transparent',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                    <strong>{nb.network}</strong>
                  </div>
                  {nb.error ? (
                    <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>{nb.error}</p>
                  ) : nb.native ? (
                    <div>
                      <DetailRow label="Native">
                        <span>
                          {nb.native.balance} {nb.native.symbol}
                          {nb.native.usd != null && (
                            <span style={{ color: 'var(--color-text-secondary)', marginLeft: 'var(--space-2)', fontSize: '0.85rem' }}>
                              ({formatWithDisplay(nb.native.usd, displayCurrency.value, displayRate.value)})
                            </span>
                          )}
                        </span>
                      </DetailRow>
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
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </>
    );
  }

  // -------------------------------------------------------------------------
  // Transactions Tab
  // -------------------------------------------------------------------------
  function TransactionsTab() {
    return (
      <>
        <FilterBar
          fields={TX_FILTER_FIELDS}
          values={txFilters.value}
          onChange={(v) => { txFilters.value = v; }}
          syncUrl={false}
        />

        <div class="table-container" style={{ marginTop: 'var(--space-3)' }}>
          <table>
            <thead>
              <tr>
                {TX_COLUMNS.map((col) => (
                  <th key={col}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {txsLoading.value && filteredTxs.value.length === 0 ? (
                <tr>
                  <td colSpan={TX_COLUMNS.length} class="table-loading">
                    Loading...
                  </td>
                </tr>
              ) : filteredTxs.value.length === 0 ? (
                <tr>
                  <td colSpan={TX_COLUMNS.length} class="table-empty">
                    No transactions yet
                  </td>
                </tr>
              ) : (
                filteredTxs.value.map((tx) => (
                  <tr key={tx.id}>
                    <td>{tx.createdAt ? formatDate(tx.createdAt) : '\u2014'}</td>
                    <td><Badge variant="info">{tx.type}</Badge></td>
                    <td>{tx.toAddress ? formatAddress(tx.toAddress) : '\u2014'}</td>
                    <td>{tx.amount ? (tx.formattedAmount ?? tx.amount) : '\u2014'}</td>
                    <td>{tx.network ?? '\u2014'}</td>
                    <td><Badge variant={txStatusVariant(tx.status)}>{tx.status}</Badge></td>
                    <td>
                      <ExplorerLink network={tx.network ?? ''} txHash={tx.txHash} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div class="pagination" style={{ marginTop: 'var(--space-3)' }}>
          <span class="pagination-info">
            Showing {txShowFrom}-{txShowTo} of {txTotal.value}
          </span>
          <div class="pagination-buttons">
            <Button
              variant="secondary"
              size="sm"
              disabled={!txHasPrev}
              onClick={() => { txPage.value = txPage.value - 1; }}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={!txHasNext}
              onClick={() => { txPage.value = txPage.value + 1; }}
            >
              Next
            </Button>
          </div>
        </div>
      </>
    );
  }

  // -------------------------------------------------------------------------
  // Owner Tab
  // -------------------------------------------------------------------------
  function OwnerTab() {
    if (!wallet.value) return null;
    return (
      <div class="owner-section">
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

        {ownerEditing.value && wallet.value.ownerState === 'NONE' && (
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <label style={{ display: 'block', marginBottom: 'var(--space-1)', fontSize: '0.85rem', fontWeight: 500 }}>
              Wallet Type
            </label>
            <select
              value={walletTypeSelect.value}
              onChange={(e) => { walletTypeSelect.value = (e.target as HTMLSelectElement).value; }}
              style={{
                width: '100%',
                padding: 'var(--space-2) var(--space-3)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-bg)',
                color: 'var(--color-text)',
                fontSize: '0.9rem',
              }}
            >
              <option value="">Custom (manual setup)</option>
              {WALLET_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            {walletTypeSelect.value && (
              <p style={{ marginTop: 'var(--space-1)', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                {WALLET_PRESETS.find(p => p.value === walletTypeSelect.value)?.description}
              </p>
            )}
            {walletTypeSelect.value && PRESET_APPROVAL_PREVIEW[walletTypeSelect.value] && (
              <p style={{ marginTop: 'var(--space-1)', fontSize: '0.8rem', color: 'var(--color-primary)' }}>
                Approval: {PRESET_APPROVAL_PREVIEW[walletTypeSelect.value]}
              </p>
            )}
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
          {wallet.value.walletType && (
            <Badge variant="info" style={{ marginLeft: 'var(--space-2)' }}>
              {WALLET_PRESETS.find(p => p.value === wallet.value!.walletType)?.label ?? wallet.value.walletType}
            </Badge>
          )}
        </DetailRow>
        {wallet.value.ownerState === 'GRACE' && (
          <div style={{ marginTop: 'var(--space-3)' }}>
            <DetailRow label="Wallet Type">
              {walletTypeChanging.value ? (
                <div class="inline-edit">
                  <select
                    value={walletTypeSelect.value}
                    onChange={(e) => { walletTypeSelect.value = (e.target as HTMLSelectElement).value; }}
                    style={{
                      padding: 'var(--space-1) var(--space-2)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--color-bg)',
                      color: 'var(--color-text)',
                      fontSize: '0.85rem',
                    }}
                  >
                    <option value="">Custom (manual setup)</option>
                    {WALLET_PRESETS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                  <Button size="sm" onClick={() => handleWalletTypeChange(walletTypeSelect.value)} loading={ownerEditLoading.value}>
                    Save
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => { walletTypeChanging.value = false; }}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <span>
                  {WALLET_PRESETS.find(p => p.value === wallet.value!.walletType)?.label ?? wallet.value!.walletType ?? 'Custom'}
                  <button class="btn btn-ghost btn-sm" onClick={() => {
                    walletTypeSelect.value = wallet.value?.walletType ?? '';
                    walletTypeChanging.value = true;
                  }} title="Change wallet type">
                    &#9998;
                  </button>
                </span>
              )}
            </DetailRow>
            {walletTypeChanging.value && walletTypeSelect.value && PRESET_APPROVAL_PREVIEW[walletTypeSelect.value] && (
              <p style={{ fontSize: '0.8rem', color: 'var(--color-primary)', marginTop: 'var(--space-1)' }}>
                Approval: {PRESET_APPROVAL_PREVIEW[walletTypeSelect.value]}
              </p>
            )}
          </div>
        )}
        {wallet.value.ownerState === 'LOCKED' && wallet.value.walletType && (
          <DetailRow label="Wallet Type">
            <span>{WALLET_PRESETS.find(p => p.value === wallet.value!.walletType)?.label ?? wallet.value!.walletType}</span>
          </DetailRow>
        )}
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

        {wallet.value.ownerState !== 'NONE' && (
          <div style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--color-border)' }}>
            <h4 style={{ marginBottom: 'var(--space-2)', fontSize: '0.9rem' }}>Approval Method</h4>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem', marginBottom: 'var(--space-3)' }}>
              Choose how transaction approvals are delivered to the owner.
              Leave as "Auto (Global Fallback)" to use the system-wide priority.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {APPROVAL_OPTIONS.map(opt => (
                <label key={opt.value ?? 'auto'} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)',
                  padding: 'var(--space-2) var(--space-3)',
                  background: wallet.value?.approvalMethod === opt.value ? 'var(--color-bg-secondary)' : 'transparent',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                }}>
                  <input
                    type="radio"
                    name="approval_method"
                    value={opt.value ?? ''}
                    checked={wallet.value?.approvalMethod === opt.value}
                    onChange={() => handleApprovalMethodChange(opt.value)}
                    style={{ marginTop: '2px' }}
                    disabled={wallet.value?.ownerState === 'LOCKED'}
                  />
                  <div>
                    <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{opt.label}</div>
                    <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.8rem' }}>{opt.description}</div>
                    {opt.warning && opt.warningCondition?.(approvalSettings.value) && (
                      <div style={{
                        marginTop: 'var(--space-1)',
                        padding: 'var(--space-1) var(--space-2)',
                        background: 'var(--color-warning-bg, #fff3cd)',
                        border: '1px solid var(--color-warning-border, #ffc107)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.75rem',
                        color: 'var(--color-warning-text, #856404)',
                      }}>
                        {opt.warning}
                      </div>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {wallet.value?.approvalMethod === 'walletconnect' && (
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
        )}
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Staking Tab
  // -------------------------------------------------------------------------
  function StakingTab() {
    function protocolBadgeVariant(protocol: string): 'info' | 'neutral' {
      if (protocol === 'lido') return 'info';
      return 'neutral';
    }

    function unstakeStatusVariant(status: string): 'warning' | 'success' | 'danger' {
      if (status === 'COMPLETED') return 'success';
      if (status === 'TIMEOUT') return 'danger';
      return 'warning';
    }

    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
          <h3 style={{ margin: 0 }}>Staking Positions</h3>
          <Button variant="secondary" size="sm" onClick={fetchStaking} loading={stakingLoading.value}>
            Refresh
          </Button>
        </div>

        {stakingLoading.value ? (
          <div class="stat-skeleton" style={{ height: '80px' }} />
        ) : stakingPositions.value.length === 0 ? (
          <EmptyState title="No staking positions" description="Stake ETH (Lido) or SOL (Jito) to see positions here." />
        ) : (
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Protocol</th>
                  <th>Asset</th>
                  <th>Balance</th>
                  <th>Balance (USD)</th>
                  <th>APY</th>
                  <th>Pending Unstake</th>
                </tr>
              </thead>
              <tbody>
                {stakingPositions.value.map((pos) => (
                  <tr key={`${pos.protocol}-${pos.chain}`}>
                    <td>
                      <Badge variant={protocolBadgeVariant(pos.protocol)}>
                        {pos.protocol === 'lido' ? 'Lido' : 'Jito'}
                      </Badge>
                    </td>
                    <td>{pos.asset}</td>
                    <td>
                      {pos.chain === 'ethereum'
                        ? `${(Number(pos.balance) / 1e18).toFixed(6)} stETH`
                        : `${(Number(pos.balance) / 1e9).toFixed(6)} JitoSOL`}
                    </td>
                    <td>
                      {pos.balanceUsd
                        ? formatWithDisplay(Number(pos.balanceUsd), displayCurrency.value, displayRate.value)
                        : '\u2014'}
                    </td>
                    <td>{pos.apy ?? '\u2014'}</td>
                    <td>
                      {pos.pendingUnstake ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          <Badge variant={unstakeStatusVariant(pos.pendingUnstake.status)}>
                            {pos.pendingUnstake.status}
                          </Badge>
                          <span style={{ fontSize: '0.85em', color: 'var(--color-text-secondary)' }}>
                            {pos.chain === 'ethereum'
                              ? `${(Number(pos.pendingUnstake.amount) / 1e18).toFixed(4)} stETH`
                              : `${(Number(pos.pendingUnstake.amount) / 1e9).toFixed(4)} JitoSOL`}
                          </span>
                        </span>
                      ) : (
                        '\u2014'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // MCP Tab
  // -------------------------------------------------------------------------
  function McpTab() {
    return (
      <div class="mcp-setup-section">
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
    );
  }

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
              {wallet.value.status === 'ACTIVE' && (
                <Button variant="secondary" onClick={() => { suspendModal.value = true; }}>
                  Suspend Wallet
                </Button>
              )}
              {wallet.value.status === 'SUSPENDED' && (
                <Button variant="primary" onClick={handleResume} loading={resumeLoading.value}>
                  Resume Wallet
                </Button>
              )}
              {wallet.value.status !== 'TERMINATED' && (
                <Button variant="danger" onClick={() => { deleteModal.value = true; }}>
                  Terminate Wallet
                </Button>
              )}
            </div>
          </div>

          <TabNav tabs={DETAIL_TABS} activeTab={activeDetailTab.value} onTabChange={(k) => { activeDetailTab.value = k; }} />
          {activeDetailTab.value === 'overview' && <OverviewTab />}
          {activeDetailTab.value === 'transactions' && <TransactionsTab />}
          {activeDetailTab.value === 'owner' && <OwnerTab />}
          {activeDetailTab.value === 'staking' && <StakingTab />}
          {activeDetailTab.value === 'mcp' && <McpTab />}

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

          <Modal
            open={suspendModal.value}
            title="Suspend Wallet"
            onCancel={() => { suspendModal.value = false; suspendReason.value = ''; }}
            onConfirm={handleSuspend}
            confirmText="Suspend"
            confirmVariant="danger"
            loading={suspendLoading.value}
          >
            <p style={{ marginBottom: 'var(--space-3)' }}>
              Are you sure you want to suspend wallet <strong>{wallet.value.name}</strong>?
              Suspended wallets cannot process transactions until resumed.
            </p>
            <FormField
              label="Reason (optional)"
              name="suspend-reason"
              value={suspendReason.value}
              onChange={(v) => { suspendReason.value = v as string; }}
              placeholder="e.g. suspicious activity"
            />
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

const NETWORK_DISPLAY_NAMES: Record<string, string> = {
  'solana-mainnet': 'Solana Mainnet',
  'solana-devnet': 'Solana Devnet',
  'solana-testnet': 'Solana Testnet',
  'ethereum-mainnet': 'Ethereum Mainnet',
  'ethereum-sepolia': 'Ethereum Sepolia',
  'polygon-mainnet': 'Polygon Mainnet',
  'polygon-amoy': 'Polygon Amoy',
  'arbitrum-mainnet': 'Arbitrum Mainnet',
  'arbitrum-sepolia': 'Arbitrum Sepolia',
  'optimism-mainnet': 'Optimism Mainnet',
  'optimism-sepolia': 'Optimism Sepolia',
  'base-mainnet': 'Base Mainnet',
  'base-sepolia': 'Base Sepolia',
};

const SOLANA_NETWORKS = ['solana-mainnet', 'solana-devnet', 'solana-testnet'];
const EVM_NETWORKS = [
  'ethereum-mainnet', 'ethereum-sepolia',
  'polygon-mainnet', 'polygon-amoy',
  'arbitrum-mainnet', 'arbitrum-sepolia',
  'optimism-mainnet', 'optimism-sepolia',
  'base-mainnet', 'base-sepolia',
];

interface UrlEntry {
  url: string;
  isBuiltin: boolean;
  enabled: boolean; // built-in URLs can be disabled
}

/** Format cooldown remaining time for display */
function formatCooldown(ms: number): string {
  if (ms <= 0) return '';
  const sec = Math.ceil(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  return remSec > 0 ? `${min}m ${remSec}s` : `${min}m`;
}

/** Determine chain from network key for test-rpc API */
function networkToChain(network: string): 'solana' | 'evm' {
  return SOLANA_NETWORKS.includes(network) ? 'solana' : 'evm';
}

function RpcEndpointsTab() {
  const settings = useSignal<SettingsData>({});
  // Dirty state: network -> user URL list (JSON array string to save)
  const dirtyUrls = useSignal<Record<string, UrlEntry[]>>({});
  const originalUrls = useSignal<Record<string, UrlEntry[]>>({});
  const saving = useSignal(false);
  const loading = useSignal(true);
  const expanded = useSignal<Record<string, boolean>>({});
  const newUrlInputs = useSignal<Record<string, string>>({});
  // Live pool status from GET /admin/rpc-status
  const rpcPoolStatus = useSignal<RpcPoolStatus>({});
  // Built-in RPC URLs fetched from API (#197 — replaces hardcoded BUILT_IN_RPC_URLS)
  const builtinRpcUrls = useSignal<Record<string, string[]>>({});
  // Per-URL test state
  const rpcTesting = useSignal<Record<string, boolean>>({});
  const rpcTestResults = useSignal<Record<string, RpcTestResult>>({});

  // Build URL entries from settings data + API-provided built-in defaults (#197)
  const buildUrlEntries = (settingsData: SettingsData, builtinDefaults: Record<string, string[]>): Record<string, UrlEntry[]> => {
    const result: Record<string, UrlEntry[]> = {};
    const allNetworks = [...SOLANA_NETWORKS, ...EVM_NETWORKS];

    for (const network of allNetworks) {
      const userUrls: string[] = [];
      const poolData = settingsData['rpc_pool'];
      if (poolData) {
        const raw = poolData[network];
        if (typeof raw === 'string' && raw !== '[]') {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              userUrls.push(...parsed.filter((u: unknown) => typeof u === 'string' && u.length > 0));
            }
          } catch { /* ignore parse errors */ }
        }
      }

      const builtinUrls = builtinDefaults[network] ?? [];
      const userSet = new Set(userUrls);

      const entries: UrlEntry[] = [];
      // User URLs first (highest priority)
      for (const url of userUrls) {
        entries.push({ url, isBuiltin: builtinUrls.includes(url), enabled: true });
      }
      // Built-in URLs that are NOT in user list (appended at bottom)
      for (const url of builtinUrls) {
        if (!userSet.has(url)) {
          entries.push({ url, isBuiltin: true, enabled: true });
        }
      }

      result[network] = entries;
    }
    return result;
  };

  const fetchSettings = async () => {
    try {
      // Fetch built-in URL defaults from API before building entries (#197)
      try {
        const rpcResult = await apiGet<{ networks: RpcPoolStatus; builtinUrls: Record<string, string[]> }>(API.ADMIN_RPC_STATUS);
        if (rpcResult.builtinUrls) {
          builtinRpcUrls.value = rpcResult.builtinUrls;
        }
        rpcPoolStatus.value = rpcResult.networks ?? {};
      } catch { /* non-fatal: buildUrlEntries will use empty defaults */ }

      const result = await apiGet<SettingsData>(API.ADMIN_SETTINGS);
      settings.value = result;
      const entries = buildUrlEntries(result, builtinRpcUrls.value);
      originalUrls.value = entries;
      dirtyUrls.value = JSON.parse(JSON.stringify(entries));
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

  // Periodic pool status polling (every 15s)
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const result = await apiGet<{ networks: RpcPoolStatus; builtinUrls?: Record<string, string[]> }>(API.ADMIN_RPC_STATUS);
        rpcPoolStatus.value = result.networks ?? {};
        if (result.builtinUrls) {
          builtinRpcUrls.value = result.builtinUrls;
        }
      } catch {
        // Silent failure on polling errors -- don't show toast
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 15_000);
    return () => clearInterval(interval);
  }, []);

  // Per-URL test handler
  const handleTestUrl = async (network: string, url: string) => {
    const key = `${network}:${url}`;
    rpcTesting.value = { ...rpcTesting.value, [key]: true };
    try {
      const result = await apiPost<RpcTestResult>(API.ADMIN_SETTINGS_TEST_RPC, {
        url,
        chain: networkToChain(network),
      });
      rpcTestResults.value = { ...rpcTestResults.value, [key]: result };
    } catch {
      rpcTestResults.value = {
        ...rpcTestResults.value,
        [key]: { success: false, latencyMs: 0, error: 'Request failed' },
      };
    } finally {
      rpcTesting.value = { ...rpcTesting.value, [key]: false };
    }
  };

  // Check if URL lists have changed from original
  const isDirty = (): boolean => {
    for (const network of [...SOLANA_NETWORKS, ...EVM_NETWORKS]) {
      const orig = originalUrls.value[network] ?? [];
      const curr = dirtyUrls.value[network] ?? [];
      if (orig.length !== curr.length) return true;
      for (let i = 0; i < orig.length; i++) {
        if (orig[i].url !== curr[i].url || orig[i].enabled !== curr[i].enabled) return true;
      }
    }
    return false;
  };

  const dirtyCount = useComputed(() => {
    let count = 0;
    for (const network of [...SOLANA_NETWORKS, ...EVM_NETWORKS]) {
      const orig = originalUrls.value[network] ?? [];
      const curr = dirtyUrls.value[network] ?? [];
      if (orig.length !== curr.length) { count++; continue; }
      for (let i = 0; i < orig.length; i++) {
        if (orig[i].url !== curr[i].url || orig[i].enabled !== curr[i].enabled) { count++; break; }
      }
    }
    return count;
  });

  const handleSave = async () => {
    saving.value = true;
    try {
      const entries: { key: string; value: string }[] = [];

      // Collect rpc_pool.* entries (user-managed URLs only, excluding built-in-only entries)
      for (const network of [...SOLANA_NETWORKS, ...EVM_NETWORKS]) {
        const urls = dirtyUrls.value[network] ?? [];
        // Save only user URLs (non-builtin) as JSON array
        const userOnlyUrls = urls
          .filter(e => !e.isBuiltin && e.enabled)
          .map(e => e.url);
        entries.push({ key: `rpc_pool.${network}`, value: JSON.stringify(userOnlyUrls) });
      }

      const result = await apiPut<{ updated: number; settings: SettingsData }>(API.ADMIN_SETTINGS, { settings: entries });
      settings.value = result.settings;
      const newEntries = buildUrlEntries(result.settings);
      originalUrls.value = newEntries;
      dirtyUrls.value = JSON.parse(JSON.stringify(newEntries));
      showToast('success', 'RPC settings saved and applied');
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      saving.value = false;
    }
  };

  const handleDiscard = () => {
    dirtyUrls.value = JSON.parse(JSON.stringify(originalUrls.value));
  };

  useEffect(() => {
    registerDirty({
      id: 'wallets-rpc',
      isDirty,
      save: handleSave,
      discard: handleDiscard,
    });
    return () => unregisterDirty('wallets-rpc');
  }, []);

  const toggleExpand = (network: string) => {
    expanded.value = { ...expanded.value, [network]: !expanded.value[network] };
  };

  const addUrl = (network: string) => {
    const url = (newUrlInputs.value[network] ?? '').trim();
    if (!url) return;
    // Validate https://
    if (!url.startsWith('https://')) {
      showToast('warning', 'URL must start with https://');
      return;
    }
    // Check duplicate
    const current = dirtyUrls.value[network] ?? [];
    if (current.some(e => e.url === url)) {
      showToast('warning', 'URL already exists in this network');
      return;
    }
    // Insert user URLs before built-in-only entries (at the end of user section)
    const newEntries = [...current];
    // Find first built-in-only entry that isn't in user list
    const insertIdx = newEntries.findIndex(e => e.isBuiltin && !current.slice(0, current.indexOf(e)).some(u => !u.isBuiltin));
    // Simpler: append as last user URL (before any built-in-only URLs)
    const lastUserIdx = newEntries.reduce((acc, e, i) => (!e.isBuiltin ? i + 1 : acc), 0);
    newEntries.splice(lastUserIdx, 0, { url, isBuiltin: false, enabled: true });
    dirtyUrls.value = { ...dirtyUrls.value, [network]: newEntries };
    newUrlInputs.value = { ...newUrlInputs.value, [network]: '' };
  };

  const removeUrl = (network: string, index: number) => {
    const current = [...(dirtyUrls.value[network] ?? [])];
    if (current[index]?.isBuiltin) return; // cannot delete built-in
    current.splice(index, 1);
    dirtyUrls.value = { ...dirtyUrls.value, [network]: current };
  };

  const moveUrl = (network: string, index: number, direction: 'up' | 'down') => {
    const current = [...(dirtyUrls.value[network] ?? [])];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= current.length) return;
    // Only allow reorder within user URLs section
    const entry = current[index];
    const target = current[targetIdx];
    if (!entry || !target) return;
    // Swap
    [current[index], current[targetIdx]] = [current[targetIdx], current[index]];
    dirtyUrls.value = { ...dirtyUrls.value, [network]: current };
  };

  const toggleBuiltin = (network: string, index: number) => {
    const current = [...(dirtyUrls.value[network] ?? [])];
    const entry = current[index];
    if (!entry?.isBuiltin) return;
    current[index] = { ...entry, enabled: !entry.enabled };
    dirtyUrls.value = { ...dirtyUrls.value, [network]: current };
  };

  function NetworkSection({ network }: { network: string }) {
    const urls = dirtyUrls.value[network] ?? [];
    const isExpanded = expanded.value[network] ?? false;
    const urlCount = urls.filter(e => e.enabled).length;
    const networkStatuses = rpcPoolStatus.value[network] ?? [];

    /** Look up pool status for a given URL */
    const getUrlStatus = (url: string): RpcEndpointStatusEntry | undefined =>
      networkStatuses.find(s => s.url === url);

    return (
      <details class="rpc-pool-network" open={isExpanded} data-testid={`rpc-network-${network}`}>
        <summary
          class="rpc-pool-network-header"
          onClick={(e) => { e.preventDefault(); toggleExpand(network); }}
        >
          <span>{NETWORK_DISPLAY_NAMES[network] ?? network}</span>
          <span class="rpc-pool-url-count">{urlCount} URL{urlCount !== 1 ? 's' : ''}</span>
        </summary>
        {isExpanded && (
          <div class="rpc-url-list">
            {urls.map((entry, idx) => {
              const status = getUrlStatus(entry.url);
              const testKey = `${network}:${entry.url}`;
              const isTesting = rpcTesting.value[testKey] ?? false;
              const testResult = rpcTestResults.value[testKey];

              return (
                <div
                  key={`${network}-${idx}`}
                  class={`rpc-url-item${entry.isBuiltin ? ' rpc-url-item--builtin' : ''}${!entry.enabled ? ' rpc-url-disabled' : ''}`}
                  data-testid={`rpc-url-${network}-${idx}`}
                >
                  <span class="rpc-url-priority">#{idx + 1}</span>
                  <span class="rpc-url-item-url" title={entry.url}>{entry.url}</span>
                  {entry.isBuiltin && <span class="badge-builtin">(built-in)</span>}
                  {/* Live pool status indicator */}
                  <span class="rpc-url-status" data-testid={`rpc-status-${network}-${idx}`}>
                    {status ? (
                      status.status === 'available' ? (
                        <>
                          <span class="rpc-url-status-dot rpc-url-status-dot--available" />
                          <span>Available</span>
                        </>
                      ) : (
                        <>
                          <span class="rpc-url-status-dot rpc-url-status-dot--cooldown" />
                          <span>Cooldown</span>
                          <span class="rpc-url-cooldown-info">
                            {formatCooldown(status.cooldownRemainingMs)} remaining
                          </span>
                          <Badge variant="warning">{status.failureCount} fail{status.failureCount !== 1 ? 's' : ''}</Badge>
                        </>
                      )
                    ) : (
                      <>
                        <span class="rpc-url-status-dot rpc-url-status-dot--unknown" />
                        <span>Unknown</span>
                      </>
                    )}
                  </span>
                  {/* Per-URL test button */}
                  <span class="rpc-url-test-inline">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleTestUrl(network, entry.url)}
                      loading={isTesting}
                    >
                      Test
                    </Button>
                    {testResult && (
                      <span class={`rpc-test-result ${testResult.success ? 'rpc-test-result--success' : 'rpc-test-result--failure'}`}>
                        <Badge variant={testResult.success ? 'success' : 'danger'}>
                          {testResult.success ? 'OK' : 'FAIL'}
                        </Badge>
                        {testResult.success && (
                          <>
                            {' '}{testResult.latencyMs}ms
                            {testResult.blockNumber !== undefined && ` (block #${testResult.blockNumber.toLocaleString()})`}
                          </>
                        )}
                        {testResult.error && ` - ${testResult.error}`}
                      </span>
                    )}
                  </span>
                  <span class="rpc-url-actions">
                    <button
                      class="btn btn-ghost btn-sm rpc-action-btn"
                      onClick={() => moveUrl(network, idx, 'up')}
                      disabled={idx === 0}
                      title="Move up"
                      aria-label="Move up"
                    >
                      &uarr;
                    </button>
                    <button
                      class="btn btn-ghost btn-sm rpc-action-btn"
                      onClick={() => moveUrl(network, idx, 'down')}
                      disabled={idx === urls.length - 1}
                      title="Move down"
                      aria-label="Move down"
                    >
                      &darr;
                    </button>
                    {entry.isBuiltin ? (
                      <button
                        class={`btn btn-ghost btn-sm rpc-action-btn${entry.enabled ? '' : ' rpc-toggle-off'}`}
                        onClick={() => toggleBuiltin(network, idx)}
                        title={entry.enabled ? 'Disable' : 'Enable'}
                        aria-label={entry.enabled ? 'Disable' : 'Enable'}
                      >
                        {entry.enabled ? 'On' : 'Off'}
                      </button>
                    ) : (
                      <button
                        class="btn btn-ghost btn-sm rpc-action-btn rpc-delete-btn"
                        onClick={() => removeUrl(network, idx)}
                        title="Remove"
                        aria-label="Remove"
                      >
                        &times;
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
            <div class="rpc-add-url">
              <input
                type="text"
                class="rpc-add-url-input"
                placeholder="https://your-rpc-url.com"
                value={newUrlInputs.value[network] ?? ''}
                onInput={(e) => {
                  newUrlInputs.value = { ...newUrlInputs.value, [network]: (e.target as HTMLInputElement).value };
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') addUrl(network); }}
              />
              <Button variant="secondary" size="sm" onClick={() => addUrl(network)}>
                Add
              </Button>
            </div>
          </div>
        )}
      </details>
    );
  }

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
      {dirtyCount.value > 0 && (
        <div class="settings-save-bar">
          <span>{dirtyCount.value} unsaved change{dirtyCount.value > 1 ? 's' : ''}</span>
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
          <p class="settings-description">Manage prioritized RPC URL lists per network. User URLs have highest priority; built-in defaults are appended automatically.</p>
        </div>
        <div class="settings-category-body">
          <div class="settings-subgroup">
            <div class="settings-subgroup-title">Solana</div>
            {SOLANA_NETWORKS.map(n => <NetworkSection key={n} network={n} />)}
          </div>

          <div class="settings-subgroup">
            <div class="settings-subgroup-title">EVM</div>
            {EVM_NETWORKS.map(n => <NetworkSection key={n} network={n} />)}
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
      const result = await apiPut<{ updated: number; settings: SettingsData }>(API.ADMIN_SETTINGS, { settings: entries });
      settings.value = result.settings;
      dirty.value = {};
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

const WALLET_FILTER_FIELDS: FilterField[] = [
  {
    key: 'chain',
    label: 'Chain',
    type: 'select',
    options: [
      { value: 'solana', label: 'Solana' },
      { value: 'ethereum', label: 'Ethereum' },
    ],
  },
  {
    key: 'environment',
    label: 'Environment',
    type: 'select',
    options: [
      { value: 'testnet', label: 'Testnet' },
      { value: 'mainnet', label: 'Mainnet' },
    ],
  },
  {
    key: 'status',
    label: 'Status',
    type: 'select',
    options: [
      { value: 'ACTIVE', label: 'ACTIVE' },
      { value: 'SUSPENDED', label: 'SUSPENDED' },
      { value: 'TERMINATED', label: 'TERMINATED' },
    ],
  },
];


function WalletListContent() {
  const wallets = useSignal<Wallet[]>([]);
  const loading = useSignal(true);
  const showForm = useSignal(false);
  const formName = useSignal('');
  const formChain = useSignal('solana');
  const formEnvironment = useSignal('testnet');
  const formAccountType = useSignal('eoa');
  const formProvider = useSignal('pimlico');
  const formApiKey = useSignal('');
  const formBundlerUrl = useSignal('');
  const formPaymasterUrl = useSignal('');
  const formError = useSignal<string | null>(null);
  const formLoading = useSignal(false);
  const createdSessionToken = useSignal<string | null>(null);

  // Search + filter state
  const search = useSignal('');
  const filters = useSignal<Record<string, string>>({ chain: '', environment: '', status: '' });

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


  const filteredWallets = useComputed(() => {
    let list = wallets.value;
    const q = search.value.toLowerCase();
    if (q) {
      list = list.filter(
        (w) => w.name.toLowerCase().includes(q) || w.publicKey.toLowerCase().includes(q),
      );
    }
    const f = filters.value;
    if (f.chain) list = list.filter((w) => w.chain === f.chain);
    if (f.environment) list = list.filter((w) => w.environment === f.environment);
    if (f.status) list = list.filter((w) => w.status === f.status);
    return list;
  });

  // Build walletColumns inside the function so we can reference `balances`
  const listColumns: Column<Wallet>[] = [
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
        <Badge
          variant={
            a.status === 'ACTIVE' ? 'success' : a.status === 'SUSPENDED' ? 'warning' : 'danger'
          }
        >
          {a.status}
        </Badge>
      ),
    },
    {
      key: 'ownerState',
      header: 'Owner',
      render: (a) => <Badge variant={ownerStateBadge(a.ownerState)}>{a.ownerState}</Badge>,
    },
    { key: 'createdAt', header: 'Created', render: (a) => formatDate(a.createdAt) },
  ];

  const handleCreate = async () => {
    if (!formName.value.trim()) {
      formError.value = 'Name is required';
      return;
    }
    formError.value = null;
    formLoading.value = true;
    try {
      const createBody: Record<string, unknown> = {
        name: formName.value.trim(),
        chain: formChain.value,
        environment: formEnvironment.value,
      };
      if (formAccountType.value === 'smart') {
        createBody.accountType = 'smart';
        if (formProvider.value === 'custom') {
          createBody.provider = 'custom';
          createBody.bundlerUrl = formBundlerUrl.value;
          if (formPaymasterUrl.value) createBody.paymasterUrl = formPaymasterUrl.value;
        } else {
          createBody.provider = formProvider.value;
          createBody.apiKey = formApiKey.value;
        }
      }
      const result = await apiPost<Wallet & { session?: { id: string; token: string; expiresAt: number } | null }>(API.WALLETS, createBody);
      if (result.session?.token) {
        createdSessionToken.value = result.session.token;
        showToast('success', 'Wallet created with session');
      } else {
        showToast('success', 'Wallet created');
      }
      formName.value = '';
      formChain.value = 'solana';
      formEnvironment.value = 'testnet';
      formAccountType.value = 'eoa';
      formProvider.value = 'pimlico';
      formApiKey.value = '';
      formBundlerUrl.value = '';
      formPaymasterUrl.value = '';
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
    if (value === 'solana') {
      formAccountType.value = 'eoa';
      formProvider.value = 'pimlico';
      formApiKey.value = '';
      formBundlerUrl.value = '';
      formPaymasterUrl.value = '';
    }
  };

  useEffect(() => {
    void fetchWallets();
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
          {formChain.value === 'ethereum' && (
            <FormField
              label="Account Type"
              name="accountType"
              type="select"
              value={formAccountType.value}
              onChange={(v) => { formAccountType.value = v as string; }}
              options={[
                { label: 'EOA (Standard)', value: 'eoa' },
                { label: 'Smart Account (ERC-4337)', value: 'smart' },
              ]}
            />
          )}
          {formAccountType.value === 'smart' && formChain.value === 'ethereum' && (
            <>
              <FormField
                label="Provider"
                name="provider"
                type="select"
                value={formProvider.value}
                onChange={(v) => { formProvider.value = v as string; }}
                options={AA_PROVIDER_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
              />
              {formProvider.value !== 'custom' ? (
                <>
                  <FormField
                    label="API Key"
                    name="apiKey"
                    value={formApiKey.value}
                    onChange={(v) => { formApiKey.value = v as string; }}
                    placeholder="Paste your provider API key"
                  />
                  {AA_PROVIDER_DASHBOARD_URLS[formProvider.value] && (
                    <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', margin: '0 0 0.5rem 0' }}>
                      Get your API key at:{' '}
                      <a href={AA_PROVIDER_DASHBOARD_URLS[formProvider.value]} target="_blank" rel="noopener noreferrer">
                        {AA_PROVIDER_OPTIONS.find((o) => o.value === formProvider.value)?.label} Dashboard
                      </a>
                    </p>
                  )}
                </>
              ) : (
                <>
                  <FormField
                    label="Bundler URL"
                    name="bundlerUrl"
                    value={formBundlerUrl.value}
                    onChange={(v) => { formBundlerUrl.value = v as string; }}
                    placeholder="https://..."
                  />
                  <FormField
                    label="Paymaster URL (optional)"
                    name="paymasterUrl"
                    value={formPaymasterUrl.value}
                    onChange={(v) => { formPaymasterUrl.value = v as string; }}
                    placeholder="https://..."
                  />
                </>
              )}
            </>
          )}
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

      <FilterBar
        fields={WALLET_FILTER_FIELDS}
        values={filters.value}
        onChange={(v) => { filters.value = v; }}
        syncUrl={false}
      />
      <SearchInput
        value={search.value}
        onSearch={(q) => { search.value = q; }}
        placeholder="Search by name or public key..."
      />

      <Table<Wallet>
        columns={listColumns}
        data={filteredWallets.value}
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
