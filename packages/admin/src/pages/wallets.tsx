import { useSignal, useComputed } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { currentPath } from '../components/layout';
import { pendingNavigation, highlightField } from '../components/settings-search';
import { registerDirty, unregisterDirty } from '../utils/dirty-guard';
import { api, ApiError } from '../api/typed-client';
import type { components, paths } from '../api/types.generated';
import { Table } from '../components/table';
import type { Column } from '../components/table';
import { FormField, Button, Badge } from '../components/form';
import { Modal } from '../components/modal';
import { CopyButton } from '../components/copy-button';
import { EmptyState } from '../components/empty-state';
import { showToast } from '../components/toast';
import { CREDENTIAL_TYPE_LABELS } from '@waiaas/shared';
import { getErrorMessage } from '../utils/error-messages';
import { formatDate, formatAddress } from '../utils/format';
import { TabNav } from '../components/tab-nav';
import { Breadcrumb } from '../components/breadcrumb';
import { SearchInput } from '../components/search-input';
import { FilterBar } from '../components/filter-bar';
import type { FilterField } from '../components/filter-bar';
import { ExplorerLink } from '../components/explorer-link';
import { TokensContent } from './tokens';
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


type Wallet = components['schemas']['WalletCrudResponse'];
type WalletDetail = components['schemas']['WalletDetailResponse'];

/** Solady factory address — Smart Accounts using this factory are deprecated (v31.3+). */
const SOLADY_FACTORY_ADDRESS = '0x5d82735936c6Cd5DE57cC3c1A799f6B2E6F933Df';

// Path-level type aliases from generated OpenAPI types
type NetworkInfo = components['schemas']['WalletNetworksResponse']['availableNetworks'][number];
type McpTokenResult = components['schemas']['McpTokenCreateResponse'];
type WalletBalance = paths['/v1/admin/wallets/{id}/balance']['get']['responses']['200']['content']['application/json'];
type NetworkBalance = WalletBalance['balances'][number];
type WalletTransaction = paths['/v1/admin/wallets/{id}/transactions']['get']['responses']['200']['content']['application/json']['items'][number];
type WcSession = components['schemas']['WcSessionResponse'];
type WcPairingResult = components['schemas']['WcPairingResponse'];
type WcPairingStatus = components['schemas']['WcPairingStatusResponse'];
type NftItem = components['schemas']['NftListResponse']['items'][number];
type NftMetadata = components['schemas']['NftMetadataResponse'];
type StakingPosition = components['schemas']['StakingPosition'];
type StakingPositionsResponse = components['schemas']['StakingPositionsResponse'];

/** Builtin wallet presets — mirrored from @waiaas/core BUILTIN_PRESETS.
 *  When core adds a new preset, this list must be updated manually. */
const WALLET_PRESETS = [
  { value: 'dcent', label: "D'CENT Wallet", description: "D'CENT hardware wallet with push notification signing" },
] as const;

/** Maps preset value to the human-readable approval method it auto-configures. */
const PRESET_APPROVAL_PREVIEW: Record<string, string> = {
  dcent: 'Wallet App (Push)',
};

/** Maps preset value to its default approval method value (for change warnings). */
const PRESET_APPROVAL_DEFAULTS: Record<string, string> = {
  dcent: 'sdk_push',
};

/** AA provider options for Smart Account wallet create/edit forms. */
const AA_PROVIDER_OPTIONS = [
  { value: 'none', label: 'None (Lite mode)' },
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
  if (chain === 'ripple') {
    return [
      { label: 'XRPL Testnet', value: 'xrpl-testnet' },
      { label: 'XRPL Devnet', value: 'xrpl-devnet' },
      { label: 'XRPL Mainnet', value: 'xrpl-mainnet' },
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

// UI-only: derived from settings, not a direct API response
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
    description: 'System decides based on configured channels: Wallet App (Push) > Wallet App (Telegram) > WalletConnect > Telegram Bot > REST',
  },
  {
    value: 'sdk_push',
    label: 'Wallet App (Push)',
    description: 'Push sign request to wallet app via Push Relay server',
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
  { key: 'activity', label: 'Activity' },
  { key: 'assets', label: 'Assets' },
  { key: 'setup', label: 'Setup' },
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
  { value: 'NFT_TRANSFER', label: 'NFT_TRANSFER' },
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
  const purgeModal = useSignal(false);
  const purgeLoading = useSignal(false);
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
  const showOwnerManage = useSignal(false);
  const activityView = useSignal<'transactions' | 'external-actions'>('transactions');
  const displayCurrency = useSignal<string>('USD');
  const displayRate = useSignal<number | null>(1);
  const stakingPositions = useSignal<StakingPosition[]>([]);
  const stakingLoading = useSignal(true);
  // NFT state
  const nfts = useSignal<NftItem[]>([]);
  const nftsLoading = useSignal(false);
  const nftsError = useSignal<string | null>(null);
  const nftViewMode = useSignal<'grid' | 'list'>('grid');
  const selectedNft = useSignal<(NftItem & Partial<Pick<NftMetadata, 'attributes' | 'rawMetadata' | 'tokenUri'>>) | null>(null);
  const nftDetailLoading = useSignal(false);
  const nftNetwork = useSignal('');
  const nftCursor = useSignal<string | null>(null);
  const nftHasMore = useSignal(false);
  const providerEditing = useSignal(false);
  const editProvider = useSignal('pimlico');
  const editApiKey = useSignal('');
  const editBundlerUrl = useSignal('');
  const editPaymasterUrl = useSignal('');
  const editPolicyId = useSignal('');
  const providerEditLoading = useSignal(false);

  const fetchWallet = async () => {
    try {
      const { data: result } = await api.GET('/v1/wallets/{id}', { params: { path: { id } } });
      wallet.value = result ?? null;
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
      await api.PUT('/v1/wallets/{id}', { params: { path: { id } }, body: { name: editName.value } });
      await fetchWallet();
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
      await api.DELETE('/v1/wallets/{id}', { params: { path: { id } } });
      showToast('success', 'Wallet terminated');
      window.location.hash = '#/wallets';
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      deleteLoading.value = false;
    }
  };

  const handlePurge = async () => {
    purgeLoading.value = true;
    try {
      await api.DELETE('/v1/wallets/{id}/purge', { params: { path: { id } } });
      showToast('success', 'Wallet permanently deleted');
      window.location.hash = '#/wallets';
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      purgeLoading.value = false;
    }
  };

  const handleSuspend = async () => {
    suspendLoading.value = true;
    try {
      await api.POST('/v1/wallets/{id}/suspend', {
        params: { path: { id } },
        body: { reason: suspendReason.value.trim() || undefined },
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
      await api.POST('/v1/wallets/{id}/resume', { params: { path: { id } } });
      showToast('success', 'Wallet resumed');
      await fetchWallet();
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      resumeLoading.value = false;
    }
  };

  const handleProviderUpdate = async () => {
    providerEditLoading.value = true;
    try {
      const body = editProvider.value === 'custom'
        ? { provider: 'custom' as const, bundlerUrl: editBundlerUrl.value, paymasterUrl: editPaymasterUrl.value || undefined }
        : { provider: editProvider.value as 'pimlico' | 'alchemy', apiKey: editApiKey.value || undefined, policyId: editPolicyId.value || undefined };
      await api.PUT('/v1/wallets/{id}/provider', { params: { path: { id } }, body });
      showToast('success', 'Provider updated');
      providerEditing.value = false;
      editApiKey.value = '';
      editBundlerUrl.value = '';
      editPaymasterUrl.value = '';
      editPolicyId.value = '';
      await fetchWallet();
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      providerEditLoading.value = false;
    }
  };

  const startProviderEdit = () => {
    if (wallet.value?.provider) {
      editProvider.value = wallet.value.provider.name;
    }
    providerEditing.value = true;
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
      const { data: result } = await api.POST('/v1/mcp/tokens', { body: { walletId: id } });
      mcpResult.value = result ?? null;
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
      const { data: result } = await api.GET('/v1/wallets/{id}/networks', { params: { path: { id } } });
      networks.value = result?.availableNetworks ?? [];
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
      const { data: balData } = await api.GET('/v1/admin/wallets/{id}/balance', { params: { path: { id } } });
      balance.value = balData ?? null;
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
      const { data: r } = await api.GET('/v1/admin/wallets/{id}/transactions', {
        params: { path: { id }, query: { offset, limit: TX_PAGE_SIZE } },
      });
      txs.value = r?.items ?? [];
      txTotal.value = r?.total ?? 0;
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
      const { data: result } = await api.GET('/v1/admin/wallets/{id}/staking', { params: { path: { id } } });
      stakingPositions.value = result?.positions ?? [];
    } catch {
      stakingPositions.value = [];
    } finally {
      stakingLoading.value = false;
    }
  };

  const fetchNfts = async (network?: string, cursor?: string) => {
    const net = network ?? nftNetwork.value;
    if (!net) return;
    nftsLoading.value = true;
    nftsError.value = null;
    try {
      const { data: result } = await api.GET('/v1/wallets/{id}/nfts', {
        params: { path: { id }, query: { network: net, pageSize: 20, ...(cursor ? { pageKey: cursor } : {}) } },
      });
      const items = (result as components['schemas']['NftListResponse'] | undefined)?.items ?? [];
      const pageKey = (result as components['schemas']['NftListResponse'] | undefined)?.pageKey;
      if (cursor) {
        nfts.value = [...nfts.value, ...items];
      } else {
        nfts.value = items;
      }
      nftCursor.value = pageKey ?? null;
      nftHasMore.value = !!pageKey;
    } catch (e) {
      if (e instanceof ApiError && e.code === 'INDEXER_NOT_CONFIGURED') {
        nftsError.value = 'INDEXER_NOT_CONFIGURED';
      } else {
        nftsError.value = 'FETCH_ERROR';
      }
      nfts.value = [];
    } finally {
      nftsLoading.value = false;
    }
  };

  const fetchNftMetadata = async (tokenIdentifier: string) => {
    if (!nftNetwork.value) return;
    nftDetailLoading.value = true;
    try {
      const { data: result } = await api.GET('/v1/wallets/{id}/nfts/{tokenIdentifier}', {
        params: { path: { id, tokenIdentifier }, query: { network: nftNetwork.value } },
      });
      selectedNft.value = result ?? null;
    } catch {
      // Silently fail -- modal will show what we have
    } finally {
      nftDetailLoading.value = false;
    }
  };

  const fetchWcSession = async () => {
    wcSessionLoading.value = true;
    try {
      const { data: wcData } = await api.GET('/v1/wallets/{id}/wc/session', { params: { path: { id } } });
      wcSession.value = wcData ?? null;
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
        const { data: status } = await api.GET('/v1/wallets/{id}/wc/pair/status', { params: { path: { id } } });
        if (!status) return;
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
      const { data: result } = await api.POST('/v1/wallets/{id}/wc/pair', { params: { path: { id } } });
      wcQrData.value = result ?? null;
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
      await api.DELETE('/v1/wallets/{id}/wc/session', { params: { path: { id } } });
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
      await api.PUT('/v1/wallets/{id}/owner', {
        params: { path: { id } },
        body: {
          owner_address: editOwnerAddress.value.trim(),
          ...(walletTypeSelect.value ? { wallet_type: walletTypeSelect.value as 'dcent' } : {}),
        },
      });
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
      await api.PUT('/v1/wallets/{id}/owner', {
        params: { path: { id } },
        body: {
          owner_address: wallet.value.ownerAddress!,
          ...(newType ? { wallet_type: newType as 'dcent' } : {}),
        },
      });
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
      const { data: result } = await api.GET('/v1/admin/settings');
      const s = result as unknown as SettingsData;
      const signingEnabled = s['signing_sdk']?.['enabled'] === 'true';
      const telegramBotConfigured =
        s['telegram']?.['bot_token'] === true ||
        s['notifications']?.['telegram_bot_token'] === true;
      const wcConfigured = !!s['walletconnect']?.['project_id'] && s['walletconnect']['project_id'] !== '';
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
      await api.PUT('/v1/wallets/{id}/owner', {
        params: { path: { id } },
        body: {
          owner_address: wallet.value!.ownerAddress!,
          approval_method: (method ?? null) as 'sdk_push' | 'sdk_telegram' | 'walletconnect' | 'telegram_bot' | 'rest' | null,
        },
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
          {wallet.value.accountType === 'smart' && wallet.value.factoryAddress?.toLowerCase() === SOLADY_FACTORY_ADDRESS.toLowerCase() && (
            <div style={{ background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger)', borderRadius: 'var(--radius)', padding: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
              <strong style={{ color: 'var(--color-danger)' }}>Deprecated Smart Account</strong>
              <p style={{ margin: '0.25rem 0 0', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
                This Smart Account uses a deprecated factory (Solady). Transactions and UserOp operations will be rejected. Please create a new Smart Account wallet to continue.
              </p>
            </div>
          )}
          {wallet.value.accountType === 'smart' && (
            <>
              {wallet.value.factoryAddress && (
                <DetailRow label="Factory Address" value={wallet.value.factoryAddress} copy />
              )}
              {wallet.value.factorySupportedNetworks && wallet.value.factorySupportedNetworks.length > 0 && (
                <DetailRow label="Factory Networks">
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                    {wallet.value.factorySupportedNetworks.map((n: string) => (
                      <Badge key={n} variant="default">{n}</Badge>
                    ))}
                  </div>
                </DetailRow>
              )}
              {wallet.value.factoryVerifiedOnNetwork !== null && wallet.value.factoryVerifiedOnNetwork !== undefined && (
                <DetailRow label="Verified on Network">
                  <Badge variant={wallet.value.factoryVerifiedOnNetwork ? 'success' : 'danger'}>
                    {wallet.value.factoryVerifiedOnNetwork ? 'Verified' : 'Not Verified'}
                  </Badge>
                  {!wallet.value.factoryVerifiedOnNetwork && (
                    <span style={{ marginLeft: '0.5rem', fontSize: '0.85rem', color: 'var(--color-danger)' }}>
                      Factory may not be deployed on this network
                    </span>
                  )}
                </DetailRow>
              )}
              <DetailRow label="Signer Key" value={wallet.value.signerKey ?? '--'} copy />
              <DetailRow label="Deployed">
                <Badge variant={wallet.value.deployed ? 'success' : 'warning'}>
                  {wallet.value.deployed ? 'Yes' : 'Not yet'}
                </Badge>
              </DetailRow>
              <DetailRow label="Mode">
                <Badge variant={wallet.value.provider ? 'success' : 'warning'}>
                  {wallet.value.provider ? 'Full' : 'Lite'}
                </Badge>
                {!wallet.value.provider && (
                  <span style={{ marginLeft: '0.5rem', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                    Use UserOp API for gas-sponsored transactions
                  </span>
                )}
              </DetailRow>
              {wallet.value.provider ? (
                <>
                  <DetailRow label="Provider">
                    <Badge variant="info">{wallet.value.provider.name}</Badge>
                  </DetailRow>
                  <DetailRow label="Supported Chains" value={wallet.value.provider.supportedChains.join(', ') || '--'} />
                  <DetailRow label="Paymaster">
                    <Badge variant={wallet.value.provider.paymasterEnabled ? 'success' : 'neutral'}>
                      {wallet.value.provider.paymasterEnabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </DetailRow>
                </>
              ) : (
                <DetailRow label="Provider" value="Not configured" />
              )}
              {!providerEditing.value ? (
                <div style={{ marginTop: 'var(--space-2)' }}>
                  <Button variant="secondary" size="sm" onClick={startProviderEdit}>
                    Change Provider
                  </Button>
                </div>
              ) : (
                <div class="inline-form" style={{ marginTop: 'var(--space-3)', padding: 'var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                  <FormField
                    label="Provider"
                    name="editProvider"
                    type="select"
                    value={editProvider.value}
                    onChange={(v) => { editProvider.value = v as string; }}
                    options={AA_PROVIDER_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
                  />
                  {editProvider.value !== 'custom' && editProvider.value !== 'none' ? (
                    <>
                      <FormField
                        label="API Key"
                        name="editApiKey"
                        value={editApiKey.value}
                        onChange={(v) => { editApiKey.value = v as string; }}
                        placeholder="Leave empty to use global default"
                      />
                      <FormField
                        label="Paymaster Policy ID"
                        name="editPolicyId"
                        value={editPolicyId.value}
                        onChange={(v) => { editPolicyId.value = v as string; }}
                        placeholder="Leave empty to use global default"
                      />
                      <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', margin: '0 0 0.5rem 0' }}>
                        Global defaults can be configured in{' '}
                        <a href="/settings" style={{ color: 'var(--color-primary)' }}>Settings &gt; Smart Account</a>.
                        {AA_PROVIDER_DASHBOARD_URLS[editProvider.value] && (
                          <>
                            {' '}Get API key at{' '}
                            <a href={AA_PROVIDER_DASHBOARD_URLS[editProvider.value]} target="_blank" rel="noopener noreferrer">
                              {AA_PROVIDER_OPTIONS.find((o) => o.value === editProvider.value)?.label} Dashboard
                            </a>.
                          </>
                        )}
                      </p>
                    </>
                  ) : editProvider.value === 'custom' ? (
                    <>
                      <FormField
                        label="Bundler URL"
                        name="editBundlerUrl"
                        value={editBundlerUrl.value}
                        onChange={(v) => { editBundlerUrl.value = v as string; }}
                        placeholder="https://..."
                      />
                      <FormField
                        label="Paymaster URL (optional)"
                        name="editPaymasterUrl"
                        value={editPaymasterUrl.value}
                        onChange={(v) => { editPaymasterUrl.value = v as string; }}
                        placeholder="https://..."
                      />
                    </>
                  ) : null}
                  <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                    <Button onClick={handleProviderUpdate} loading={providerEditLoading.value}>Save</Button>
                    <Button variant="secondary" onClick={() => { providerEditing.value = false; }}>Cancel</Button>
                  </div>
                </div>
              )}
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

        {/* Owner Protection */}
        <div style={{
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-4)',
          marginTop: 'var(--space-4)',
        }}>
          <h3 style={{ margin: '0 0 var(--space-3) 0', fontSize: '1rem' }}>Owner Protection</h3>

          {wallet.value.ownerState === 'NONE' ? (
            <div>
              <div style={{
                background: 'var(--color-warning-bg, #fff3cd)',
                border: '1px solid var(--color-warning-border, #ffc107)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-2) var(--space-3)',
                marginBottom: 'var(--space-3)',
                fontSize: '0.85rem',
                color: 'var(--color-warning-text, #856404)',
              }}>
                No owner registered. High-value transactions cannot use APPROVAL policy.
              </div>
              <Button size="sm" onClick={() => { showOwnerManage.value = !showOwnerManage.value; }}>
                {showOwnerManage.value ? 'Hide Registration' : 'Register Owner'}
              </Button>
            </div>
          ) : (
            <div>
              <div class="detail-grid" style={{ marginBottom: 'var(--space-3)' }}>
                <DetailRow label="State">
                  <Badge variant={ownerStateBadge(wallet.value.ownerState)}>
                    {wallet.value.ownerState}
                  </Badge>
                </DetailRow>
                <DetailRow label="Approval Method">
                  {wallet.value.approvalMethod
                    ? APPROVAL_OPTIONS.find(o => o.value === wallet.value!.approvalMethod)?.label ?? wallet.value.approvalMethod
                    : 'Auto (Global Fallback)'}
                </DetailRow>
                <DetailRow label="Address">
                  {wallet.value.ownerAddress ? formatAddress(wallet.value.ownerAddress) : 'Not set'}
                  {wallet.value.ownerAddress && <CopyButton value={wallet.value.ownerAddress} />}
                </DetailRow>
              </div>
              <Button size="sm" variant="secondary" onClick={() => { showOwnerManage.value = !showOwnerManage.value; }}>
                {showOwnerManage.value ? 'Hide Details' : 'Manage'}
              </Button>
            </div>
          )}

          {showOwnerManage.value && (
            <div style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--color-border)' }}>
              <OwnerTab />
            </div>
          )}
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
                    {n.network}
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
                    <td>
                      {tx.contractName ? (
                        <span>
                          <strong>{tx.contractName}</strong>
                          {tx.toAddress ? <span style={{ marginLeft: '4px', fontSize: '0.8em', color: 'var(--color-text-secondary)' }}>({formatAddress(tx.toAddress)})</span> : null}
                        </span>
                      ) : tx.toAddress ? formatAddress(tx.toAddress) : '\u2014'}
                    </td>
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
                    disabled={wallet.value?.ownerState === 'LOCKED' || !!PRESET_APPROVAL_DEFAULTS[wallet.value?.walletType ?? '']}
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
              {PRESET_APPROVAL_DEFAULTS[wallet.value?.walletType ?? ''] && (
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: 'var(--space-2)', fontStyle: 'italic' }}>
                  This wallet uses a preset type. The approval method is automatically managed by the preset.
                </p>
              )}
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
  // NFT Tab
  // -------------------------------------------------------------------------
  function NftTab() {
    const walletNetworks: string[] = networks.value.map((n) => n.network);

    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
          <h3 style={{ margin: 0 }}>NFTs</h3>
          <FormField
            label=""
            name="nft-network"
            type="select"
            value={nftNetwork.value}
            onChange={(v) => {
              nftNetwork.value = String(v);
              nftCursor.value = null;
              fetchNfts(String(v));
            }}
            options={[
              { value: '', label: 'Select network...' },
              ...walletNetworks.map((n) => ({ value: n, label: n })),
            ]}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { nftViewMode.value = nftViewMode.value === 'grid' ? 'list' : 'grid'; }}
            title={nftViewMode.value === 'grid' ? 'Switch to list view' : 'Switch to grid view'}
          >
            {nftViewMode.value === 'grid' ? '\u2630' : '\u25A6'}
          </Button>
          {nftNetwork.value && (
            <Button variant="secondary" size="sm" onClick={() => fetchNfts()} loading={nftsLoading.value}>
              Refresh
            </Button>
          )}
        </div>

        {!nftNetwork.value ? (
          <EmptyState title="Select a network" description="Choose a network to view NFTs." />
        ) : nftsLoading.value && nfts.value.length === 0 ? (
          <div class="stat-skeleton" style={{ height: '120px' }} />
        ) : nftsError.value === 'INDEXER_NOT_CONFIGURED' ? (
          <EmptyState
            title="NFT indexer not configured"
            description="Set up an Alchemy (EVM) or Helius (Solana) API key in Settings > API Keys to view NFTs."
          />
        ) : nftsError.value ? (
          <EmptyState title="Failed to load NFTs" description="An error occurred while fetching NFTs." />
        ) : nfts.value.length === 0 ? (
          <EmptyState title="No NFTs found" description="This wallet has no NFTs on the selected network." />
        ) : nftViewMode.value === 'grid' ? (
          <div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: 'var(--space-3)',
            }}>
              {nfts.value.map((nft) => (
                <div
                  key={`${nft.contractAddress}-${nft.tokenId}`}
                  class="nft-card"
                  style={{
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-lg)',
                    padding: 'var(--space-2)',
                    cursor: 'pointer',
                    textAlign: 'center',
                  }}
                  onClick={() => {
                    selectedNft.value = nft;
                    const tokenIdentifier = nft.contractAddress.includes(':')
                      ? nft.contractAddress
                      : `${nft.contractAddress}:${nft.tokenId}`;
                    fetchNftMetadata(tokenIdentifier);
                  }}
                >
                  {nft.image ? (
                    <img
                      src={nft.image}
                      alt={nft.name ?? 'NFT'}
                      style={{
                        width: '96px',
                        height: '96px',
                        objectFit: 'cover',
                        borderRadius: 'var(--radius-md)',
                        margin: '0 auto var(--space-2)',
                        display: 'block',
                      }}
                    />
                  ) : (
                    <div style={{
                      width: '96px',
                      height: '96px',
                      background: 'var(--color-bg-secondary)',
                      borderRadius: 'var(--radius-md)',
                      margin: '0 auto var(--space-2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--color-text-secondary)',
                      fontSize: '0.8em',
                    }}>
                      No image
                    </div>
                  )}
                  <div style={{ fontSize: '0.85em', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {nft.name ?? `#${nft.tokenId}`}
                  </div>
                  <Badge variant="neutral">{nft.standard.toUpperCase()}</Badge>
                </div>
              ))}
            </div>
            {nftHasMore.value && (
              <div style={{ textAlign: 'center', marginTop: 'var(--space-3)' }}>
                <Button variant="secondary" onClick={() => fetchNfts(undefined, nftCursor.value ?? undefined)} loading={nftsLoading.value}>
                  Load more
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div>
            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Image</th>
                    <th>Name</th>
                    <th>Token ID</th>
                    <th>Standard</th>
                    <th>Collection</th>
                  </tr>
                </thead>
                <tbody>
                  {nfts.value.map((nft) => (
                    <tr
                      key={`${nft.contractAddress}-${nft.tokenId}`}
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        selectedNft.value = nft;
                        const tokenIdentifier = nft.contractAddress.includes(':')
                          ? nft.contractAddress
                          : `${nft.contractAddress}:${nft.tokenId}`;
                        fetchNftMetadata(tokenIdentifier);
                      }}
                    >
                      <td>
                        {nft.image ? (
                          <img
                            src={nft.image}
                            alt={nft.name ?? 'NFT'}
                            style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: 'var(--radius-sm)' }}
                          />
                        ) : (
                          <div style={{
                            width: '48px',
                            height: '48px',
                            background: 'var(--color-bg-secondary)',
                            borderRadius: 'var(--radius-sm)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.7em',
                            color: 'var(--color-text-secondary)',
                          }}>-</div>
                        )}
                      </td>
                      <td>{nft.name ?? '-'}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.85em' }}>{nft.tokenId}</td>
                      <td><Badge variant="neutral">{nft.standard.toUpperCase()}</Badge></td>
                      <td>{nft.collection?.name ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {nftHasMore.value && (
              <div style={{ textAlign: 'center', marginTop: 'var(--space-3)' }}>
                <Button variant="secondary" onClick={() => fetchNfts(undefined, nftCursor.value ?? undefined)} loading={nftsLoading.value}>
                  Load more
                </Button>
              </div>
            )}
          </div>
        )}

        {/* NFT Detail Modal */}
        <Modal
          open={!!selectedNft.value}
          title={selectedNft.value?.name ?? 'NFT Details'}
          onCancel={() => { selectedNft.value = null; }}
          onConfirm={() => { selectedNft.value = null; }}
          confirmText="Close"
        >
          {selectedNft.value && (
            <div>
              {selectedNft.value.image && (
                <div style={{ textAlign: 'center', marginBottom: 'var(--space-3)' }}>
                  <img
                    src={selectedNft.value.image}
                    alt={selectedNft.value.name ?? 'NFT'}
                    style={{ maxWidth: '300px', maxHeight: '300px', borderRadius: 'var(--radius-lg)' }}
                  />
                </div>
              )}
              {selectedNft.value.description && (
                <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-3)' }}>
                  {selectedNft.value.description}
                </p>
              )}
              <div class="detail-grid" style={{ marginBottom: 'var(--space-3)' }}>
                <DetailRow label="Token ID" value={selectedNft.value.tokenId} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <DetailRow label="Contract" value={formatAddress(selectedNft.value.contractAddress ?? '')} />
                  <CopyButton value={selectedNft.value.contractAddress ?? ''} />
                </div>
                <DetailRow label="Standard" value={(selectedNft.value.standard ?? '').toUpperCase()} />
                {selectedNft.value.collection?.name && (
                  <DetailRow label="Collection" value={selectedNft.value.collection.name} />
                )}
                {selectedNft.value.assetId && (
                  <DetailRow label="CAIP-19" value={selectedNft.value.assetId} />
                )}
              </div>
              {selectedNft.value.attributes && selectedNft.value.attributes.length > 0 && (
                <div style={{ marginBottom: 'var(--space-3)' }}>
                  <strong>Attributes</strong>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                    {selectedNft.value.attributes.map((attr, i) => (
                      <Badge key={i} variant="info">{attr.trait_type}: {attr.value}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {selectedNft.value.rawMetadata && (
                <details style={{ marginTop: 'var(--space-2)' }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Raw Metadata</summary>
                  <pre style={{
                    background: 'var(--color-bg-secondary)',
                    padding: 'var(--space-2)',
                    borderRadius: 'var(--radius-md)',
                    overflow: 'auto',
                    maxHeight: '200px',
                    fontSize: '0.8em',
                    marginTop: 'var(--space-2)',
                  }}>
                    {JSON.stringify(selectedNft.value.rawMetadata, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          )}
        </Modal>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // MCP Tab
  // -------------------------------------------------------------------------
  // -------------------------------------------------------------------------
  // Credentials Tab
  // -------------------------------------------------------------------------

  type CredentialMetadata = paths['/v1/wallets/{walletId}/credentials']['get']['responses']['200']['content']['application/json']['credentials'][number];

  const walletCredentials = useSignal<CredentialMetadata[]>([]);
  const credentialsLoading = useSignal(false);
  const showCredAddModal = useSignal(false);
  const credAddType = useSignal('api-key');
  const credAddName = useSignal('');
  const credAddValue = useSignal('');
  const credAddLoading = useSignal(false);
  const credDeleteModal = useSignal(false);
  const credDeleteRef = useSignal<string | null>(null);
  const credDeleteName = useSignal('');
  const credDeleteLoading = useSignal(false);
  const credRotateModal = useSignal(false);
  const credRotateRef = useSignal<string | null>(null);
  const credRotateName = useSignal('');
  const credRotateValue = useSignal('');
  const credRotateLoading = useSignal(false);

  const CRED_TYPES = Object.entries(CREDENTIAL_TYPE_LABELS).map(([value, label]) => ({ label, value }));

  const fetchWalletCredentials = async () => {
    credentialsLoading.value = true;
    try {
      const { data: result } = await api.GET('/v1/wallets/{walletId}/credentials', { params: { path: { walletId: id } } });
      walletCredentials.value = result?.credentials ?? [];
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      credentialsLoading.value = false;
    }
  };

  function CredentialsTab() {
    useEffect(() => { fetchWalletCredentials(); }, []);

    const handleCredAdd = async () => {
      if (!credAddName.value.trim() || !credAddValue.value.trim()) {
        showToast('error', 'Name and value are required');
        return;
      }
      credAddLoading.value = true;
      try {
        await api.POST('/v1/wallets/{walletId}/credentials', {
          params: { path: { walletId: id } },
          body: {
            type: credAddType.value as 'api-key' | 'hmac-secret' | 'rsa-private-key' | 'session-token' | 'custom',
            name: credAddName.value.trim(),
            value: credAddValue.value,
          },
        });
        showToast('success', 'Credential created');
        showCredAddModal.value = false;
        credAddType.value = 'api-key';
        credAddName.value = '';
        credAddValue.value = '';
        await fetchWalletCredentials();
      } catch (err) {
        const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
        showToast('error', getErrorMessage(e.code));
      } finally {
        credAddLoading.value = false;
      }
    };

    const handleCredDelete = async () => {
      if (!credDeleteRef.value) return;
      credDeleteLoading.value = true;
      try {
        await api.DELETE('/v1/wallets/{walletId}/credentials/{ref}', { params: { path: { walletId: id, ref: credDeleteRef.value } } });
        showToast('success', 'Credential deleted');
        credDeleteModal.value = false;
        await fetchWalletCredentials();
      } catch (err) {
        const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
        showToast('error', getErrorMessage(e.code));
      } finally {
        credDeleteLoading.value = false;
      }
    };

    const handleCredRotate = async () => {
      if (!credRotateRef.value || !credRotateValue.value.trim()) return;
      credRotateLoading.value = true;
      try {
        await api.PUT('/v1/wallets/{walletId}/credentials/{ref}/rotate', {
          params: { path: { walletId: id, ref: credRotateRef.value } },
          body: { value: credRotateValue.value },
        });
        showToast('success', 'Credential rotated');
        credRotateModal.value = false;
        credRotateValue.value = '';
        await fetchWalletCredentials();
      } catch (err) {
        const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
        showToast('error', getErrorMessage(e.code));
      } finally {
        credRotateLoading.value = false;
      }
    };

    if (!credentialsLoading.value && walletCredentials.value.length === 0) {
      return (
        <div>
          <EmptyState
            title="No Credentials"
            description="Add credentials for external service authentication."
            actionLabel="Add Credential"
            onAction={() => { showCredAddModal.value = true; }}
          />
          <Modal open={showCredAddModal.value} title="Add Credential" onCancel={() => { showCredAddModal.value = false; }} onConfirm={handleCredAdd} confirmText="Create" loading={credAddLoading.value}>
            <FormField label="Type" name="wcred-type" type="select" value={credAddType.value} onChange={(v) => { credAddType.value = v as string; }} options={CRED_TYPES} />
            <FormField label="Name" name="wcred-name" value={credAddName.value} onChange={(v) => { credAddName.value = v as string; }} placeholder="e.g. exchange-api-key" required />
            <FormField label="Value" name="wcred-value" type="password" value={credAddValue.value} onChange={(v) => { credAddValue.value = v as string; }} placeholder="Secret value" required />
          </Modal>
        </div>
      );
    }

    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
          <Button onClick={() => { showCredAddModal.value = true; }}>Add Credential</Button>
        </div>
        <table class="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Expires</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {walletCredentials.value.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td><Badge variant="info">{c.type}</Badge></td>
                <td>{c.expiresAt ? formatDate(c.expiresAt) : 'Never'}</td>
                <td>{formatDate(c.createdAt)}</td>
                <td>
                  <span style={{ display: 'flex', gap: '0.25rem' }}>
                    <Button size="sm" variant="ghost" onClick={() => { credRotateRef.value = c.name; credRotateName.value = c.name; credRotateValue.value = ''; credRotateModal.value = true; }}>Rotate</Button>
                    <Button size="sm" variant="danger" onClick={() => { credDeleteRef.value = c.name; credDeleteName.value = c.name; credDeleteModal.value = true; }}>Delete</Button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <Modal open={showCredAddModal.value} title="Add Credential" onCancel={() => { showCredAddModal.value = false; }} onConfirm={handleCredAdd} confirmText="Create" loading={credAddLoading.value}>
          <FormField label="Type" name="wcred-type" type="select" value={credAddType.value} onChange={(v) => { credAddType.value = v as string; }} options={CRED_TYPES} />
          <FormField label="Name" name="wcred-name" value={credAddName.value} onChange={(v) => { credAddName.value = v as string; }} placeholder="e.g. exchange-api-key" required />
          <FormField label="Value" name="wcred-value" type="password" value={credAddValue.value} onChange={(v) => { credAddValue.value = v as string; }} placeholder="Secret value" required />
        </Modal>

        <Modal open={credDeleteModal.value} title="Delete Credential" onCancel={() => { credDeleteModal.value = false; }} onConfirm={handleCredDelete} confirmText="Delete" confirmVariant="danger" loading={credDeleteLoading.value}>
          <p>Are you sure you want to delete credential <strong>{credDeleteName.value}</strong>?</p>
        </Modal>

        <Modal open={credRotateModal.value} title="Rotate Credential" onCancel={() => { credRotateModal.value = false; }} onConfirm={handleCredRotate} confirmText="Rotate" loading={credRotateLoading.value}>
          <p>Enter a new value for credential <strong>{credRotateName.value}</strong>:</p>
          <FormField label="New Value" name="wcred-rotate-value" type="password" value={credRotateValue.value} onChange={(v) => { credRotateValue.value = v as string; }} placeholder="New secret value" required />
        </Modal>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // External Actions Tab
  // -------------------------------------------------------------------------

  type ExternalActionItem = paths['/v1/wallets/{walletId}/actions']['get']['responses']['200']['content']['application/json']['actions'][number];

  const externalActions = useSignal<ExternalActionItem[]>([]);
  const actionsLoading = useSignal(false);
  const actionsStatusFilter = useSignal('all');
  const actionsVenueFilter = useSignal('');
  const selectedAction = useSignal<ExternalActionItem | null>(null);

  function getStatusVariant(status: string): 'info' | 'success' | 'warning' | 'danger' {
    switch (status.toLowerCase()) {
      case 'submitted': return 'info';
      case 'signed': case 'completed': case 'filled': case 'settled': return 'success';
      case 'pending': case 'partially_filled': return 'warning';
      case 'failed': case 'canceled': case 'expired': return 'danger';
      default: return 'info';
    }
  }

  const fetchExternalActions = async () => {
    actionsLoading.value = true;
    try {
      const query: Record<string, unknown> = { limit: 50 };
      if (actionsStatusFilter.value !== 'all') query.status = actionsStatusFilter.value;
      if (actionsVenueFilter.value.trim()) query.venue = actionsVenueFilter.value.trim();
      const { data: result } = await api.GET('/v1/wallets/{walletId}/actions', {
        params: { path: { walletId: id }, query: query as { limit?: number; status?: string; venue?: string } },
      });
      externalActions.value = result?.actions ?? [];
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      actionsLoading.value = false;
    }
  };

  function ExternalActionsTab() {
    useEffect(() => { fetchExternalActions(); }, []);

    return (
      <div>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'flex-end' }}>
          <div class="form-field" style={{ flex: '0 0 auto' }}>
            <label for="action-status-filter">Status</label>
            <select
              id="action-status-filter"
              value={actionsStatusFilter.value}
              onChange={(e) => { actionsStatusFilter.value = (e.target as HTMLSelectElement).value; fetchExternalActions(); }}
            >
              <option value="all">All</option>
              <option value="submitted">Submitted</option>
              <option value="signed">Signed</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
              <option value="completed">Completed</option>
              <option value="filled">Filled</option>
              <option value="settled">Settled</option>
            </select>
          </div>
          <div class="form-field" style={{ flex: '0 0 auto' }}>
            <label for="action-venue-filter">Venue</label>
            <input
              id="action-venue-filter"
              value={actionsVenueFilter.value}
              onInput={(e) => { actionsVenueFilter.value = (e.target as HTMLInputElement).value; }}
              onKeyDown={(e) => { if (e.key === 'Enter') fetchExternalActions(); }}
              placeholder="Filter by venue"
            />
          </div>
          <Button variant="secondary" size="sm" onClick={() => fetchExternalActions()}>
            Refresh
          </Button>
        </div>

        {!actionsLoading.value && externalActions.value.length === 0 ? (
          <EmptyState
            title="No External Actions"
            description="No external actions recorded for this wallet."
          />
        ) : (
          <table class="table">
            <thead>
              <tr>
                <th>Venue</th>
                <th>Operation</th>
                <th>Status</th>
                <th>Provider</th>
                <th>Action</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {externalActions.value.map((a) => (
                <tr
                  key={a.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => { selectedAction.value = a; }}
                >
                  <td>{a.venue ? <Badge variant="info">{a.venue}</Badge> : '-'}</td>
                  <td>{a.operation ?? '-'}</td>
                  <td><Badge variant={getStatusVariant(a.status)}>{a.status}</Badge></td>
                  <td>{a.provider ?? '-'}</td>
                  <td>{a.actionName ?? '-'}</td>
                  <td>{formatDate(a.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {actionsLoading.value && (
          <div class="empty-state"><p>Loading...</p></div>
        )}

        <Modal
          open={!!selectedAction.value}
          title="External Action Details"
          onCancel={() => { selectedAction.value = null; }}
          onConfirm={() => { selectedAction.value = null; }}
          confirmText="Close"
        >
          {selectedAction.value && (
            <div class="detail-grid">
              <DetailRow label="ID" value={selectedAction.value.id} />
              <DetailRow label="Kind" value={selectedAction.value.actionKind} />
              <DetailRow label="Venue" value={selectedAction.value.venue ?? '-'} />
              <DetailRow label="Operation" value={selectedAction.value.operation ?? '-'} />
              <DetailRow label="Status" value={selectedAction.value.status} />
              <DetailRow label="Provider" value={selectedAction.value.provider ?? '-'} />
              <DetailRow label="Action" value={selectedAction.value.actionName ?? '-'} />
              <DetailRow label="Created" value={formatDate(selectedAction.value.createdAt)} />
            </div>
          )}
        </Modal>
      </div>
    );
  }

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

  // -------------------------------------------------------------------------
  // Activity Tab (Transactions + External Actions)
  // -------------------------------------------------------------------------
  function ActivityTab() {
    return (
      <div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
          <Button
            variant={activityView.value === 'transactions' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => { activityView.value = 'transactions'; }}
          >
            Transactions
          </Button>
          <Button
            variant={activityView.value === 'external-actions' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => { activityView.value = 'external-actions'; }}
          >
            External Actions
          </Button>
        </div>

        {activityView.value === 'transactions' && <TransactionsTab />}
        {activityView.value === 'external-actions' && <ExternalActionsTab />}
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Assets Tab (Staking + NFTs)
  // -------------------------------------------------------------------------
  function AssetsTab() {
    return (
      <div>
        <StakingTab />

        <div style={{ marginTop: 'var(--space-6)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--color-border)' }}>
          <NftTab />
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Setup Tab (Credentials + MCP)
  // -------------------------------------------------------------------------
  function SetupTab() {
    return (
      <div>
        <CredentialsTab />

        <div style={{ marginTop: 'var(--space-6)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--color-border)' }}>
          <McpTab />
        </div>
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
              {wallet.value.status === 'TERMINATED' && (
                <Button variant="danger" onClick={() => { purgeModal.value = true; }}>
                  Permanently Delete
                </Button>
              )}
            </div>
          </div>

          <TabNav tabs={DETAIL_TABS} activeTab={activeDetailTab.value} onTabChange={(k) => { activeDetailTab.value = k; }} />
          {activeDetailTab.value === 'overview' && <OverviewTab />}
          {activeDetailTab.value === 'activity' && <ActivityTab />}
          {activeDetailTab.value === 'assets' && <AssetsTab />}
          {activeDetailTab.value === 'setup' && <SetupTab />}

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
            open={purgeModal.value}
            title="Permanently Delete Wallet"
            onCancel={() => { purgeModal.value = false; }}
            onConfirm={handlePurge}
            confirmText="Delete Forever"
            confirmVariant="danger"
            loading={purgeLoading.value}
          >
            <p>
              Are you sure you want to <strong>permanently delete</strong> wallet{' '}
              <strong>{wallet.value.name}</strong>? All associated data (transactions, sessions,
              policies, keys, audit logs) will be irreversibly removed. This cannot be undone.
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

import {
  EVM_NETWORK_OPTIONS as evmNetworkOptions,
  NETWORK_DISPLAY_NAMES,
  SOLANA_NETWORK_TYPES,
  EVM_NETWORK_TYPES,
  RIPPLE_NETWORK_TYPES,
} from '@waiaas/shared';

const SOLANA_NETWORKS: readonly string[] = SOLANA_NETWORK_TYPES;
const EVM_NETWORKS: readonly string[] = EVM_NETWORK_TYPES;
const RIPPLE_NETWORKS: readonly string[] = RIPPLE_NETWORK_TYPES;

// UI-only: not a direct API response shape
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
function networkToChain(network: string): 'solana' | 'ethereum' | 'ripple' {
  if (SOLANA_NETWORKS.includes(network)) return 'solana';
  if (network.startsWith('xrpl-')) return 'ripple';
  return 'ethereum';
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
  const buildUrlEntries = (settingsData: SettingsData, builtinDefaults: Record<string, string[]> = {}): Record<string, UrlEntry[]> => {
    const result: Record<string, UrlEntry[]> = {};
    const allNetworks = [...SOLANA_NETWORKS, ...EVM_NETWORKS, ...RIPPLE_NETWORKS];

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
        const { data: rpcResult } = await api.GET('/v1/admin/rpc-status');
        if (rpcResult) {
          if ((rpcResult as Record<string, unknown>).builtinUrls) {
            builtinRpcUrls.value = (rpcResult as Record<string, unknown>).builtinUrls as Record<string, string[]>;
          }
          rpcPoolStatus.value = ((rpcResult as Record<string, unknown>).networks ?? {}) as RpcPoolStatus;
        }
      } catch { /* non-fatal: buildUrlEntries will use empty defaults */ }

      const { data: settingsResult } = await api.GET('/v1/admin/settings');
      const result = settingsResult as unknown as SettingsData;
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
        const { data: result } = await api.GET('/v1/admin/rpc-status');
        if (result) {
          rpcPoolStatus.value = ((result as Record<string, unknown>).networks ?? {}) as RpcPoolStatus;
          if ((result as Record<string, unknown>).builtinUrls) {
            builtinRpcUrls.value = (result as Record<string, unknown>).builtinUrls as Record<string, string[]>;
          }
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
      const { data: result } = await api.POST('/v1/admin/settings/test-rpc', {
        body: { url, chain: networkToChain(network) },
      });
      rpcTestResults.value = { ...rpcTestResults.value, [key]: result as unknown as RpcTestResult };
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
    for (const network of [...SOLANA_NETWORKS, ...EVM_NETWORKS, ...RIPPLE_NETWORKS]) {
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
    for (const network of [...SOLANA_NETWORKS, ...EVM_NETWORKS, ...RIPPLE_NETWORKS]) {
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
      for (const network of [...SOLANA_NETWORKS, ...EVM_NETWORKS, ...RIPPLE_NETWORKS]) {
        const urls = dirtyUrls.value[network] ?? [];
        // Save only user URLs (non-builtin) as JSON array
        const userOnlyUrls = urls
          .filter(e => !e.isBuiltin && e.enabled)
          .map(e => e.url);
        entries.push({ key: `rpc_pool.${network}`, value: JSON.stringify(userOnlyUrls) });
      }

      const { data: putResult } = await api.PUT('/v1/admin/settings', { body: { settings: entries } });
      const resultSettings = (putResult as unknown as { settings: SettingsData })?.settings ?? {};
      settings.value = resultSettings;
      const newEntries = buildUrlEntries(resultSettings, builtinRpcUrls.value);
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

          <div class="settings-subgroup">
            <div class="settings-subgroup-title">XRPL</div>
            {RIPPLE_NETWORKS.map(n => <NetworkSection key={n} network={n} />)}
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
      const { data: result } = await api.GET('/v1/admin/settings');
      settings.value = result as unknown as SettingsData;
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
      const { data: putResult } = await api.PUT('/v1/admin/settings', { body: { settings: entries } });
      settings.value = (putResult as unknown as { settings: SettingsData })?.settings ?? {};
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
  const formProvider = useSignal('none');
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
      const { data: result } = await api.GET('/v1/wallets');
      wallets.value = result?.items ?? [];
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
      key: 'accountType',
      header: 'Type',
      render: (a: any) => {
        if (a.accountType !== 'smart') return <Badge variant="default">EOA</Badge>;
        const isDeprecated = a.factoryAddress?.toLowerCase() === SOLADY_FACTORY_ADDRESS.toLowerCase();
        if (isDeprecated) {
          return <Badge variant="danger">Deprecated</Badge>;
        }
        return (
          <Badge variant={a.provider ? 'info' : 'warning'}>
            {a.provider ? 'Smart (Full)' : 'Smart (Lite)'}
          </Badge>
        );
      },
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
        if (formProvider.value !== 'none') {
          if (formProvider.value === 'custom') {
            createBody.aaProvider = 'custom';
            createBody.aaBundlerUrl = formBundlerUrl.value;
            if (formPaymasterUrl.value) createBody.aaPaymasterUrl = formPaymasterUrl.value;
          } else {
            createBody.aaProvider = formProvider.value;
            createBody.aaProviderApiKey = formApiKey.value;
          }
        }
        // 'none' -> aaProvider not set = Lite mode
      }
      const { data: result } = await api.POST('/v1/wallets', { body: createBody as components['schemas']['CreateWalletRequest'] });
      if (result?.session?.token) {
        createdSessionToken.value = result.session.token;
        showToast('success', 'Wallet created with session');
      } else {
        showToast('success', 'Wallet created');
      }
      formName.value = '';
      formChain.value = 'solana';
      formEnvironment.value = 'testnet';
      formAccountType.value = 'eoa';
      formProvider.value = 'none';
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
    if (value === 'solana' || value === 'ripple') {
      formAccountType.value = 'eoa';
      formProvider.value = 'none';
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
              { label: 'Ripple', value: 'ripple' },
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
              {formProvider.value === 'none' ? null : formProvider.value !== 'custom' ? (
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
  { key: 'tokens', label: 'Tokens' },
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
      {activeTab.value === 'tokens' && <TokensContent />}
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
