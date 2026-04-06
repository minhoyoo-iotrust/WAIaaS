import { useSignal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { EVM_NETWORK_TYPES, RIPPLE_NETWORK_TYPES, NETWORK_DISPLAY_NAMES } from '@waiaas/shared';
import { api, ApiError } from '../api/typed-client';
import type { TokenRegistryItem } from '../api/types.aliases';
import { Badge, Button } from '../components/form';
import { showToast } from '../components/toast';
import { getErrorMessage } from '../utils/error-messages';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TokenItem = TokenRegistryItem;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOKEN_NETWORKS: readonly string[] = [...EVM_NETWORK_TYPES, ...RIPPLE_NETWORK_TYPES];

const COLUMNS = ['Symbol', 'Name', 'Address', 'Decimals', 'Source', 'Actions'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncateAddress(addr: string): string {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TokensContent() {
  const network = useSignal('ethereum-mainnet');
  const tokens = useSignal<TokenItem[]>([]);
  const loading = useSignal(true);
  const error = useSignal<string | null>(null);

  const showAddForm = useSignal(false);
  const address = useSignal('');
  const symbol = useSignal('');
  const name = useSignal('');
  const decimals = useSignal('18');
  const adding = useSignal(false);
  const resolving = useSignal(false);
  const deleting = useSignal<string | null>(null);
  const resolveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // -------------------------------------------------------------------------
  // Fetch
  // -------------------------------------------------------------------------

  const fetchTokens = async () => {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.GET('/v1/tokens', {
        params: { query: { network: network.value } },
      });
      tokens.value = data!.tokens;
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        error.value = getErrorMessage(err.code);
      } else {
        error.value = 'An unexpected error occurred.';
      }
      tokens.value = [];
    } finally {
      loading.value = false;
    }
  };

  // On mount and network change
  useEffect(() => {
    fetchTokens();
  }, [network.value]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  function handleNetworkChange(e: Event) {
    network.value = (e.target as HTMLSelectElement).value;
  }

  function resetForm() {
    address.value = '';
    symbol.value = '';
    name.value = '';
    decimals.value = '18';
    resolving.value = false;
    showAddForm.value = false;
    if (resolveTimerRef.current) clearTimeout(resolveTimerRef.current);
  }

  async function resolveTokenMetadata(contractAddress: string) {
    resolving.value = true;
    try {
      const { data: result } = await api.GET('/v1/tokens/resolve', {
        params: { query: { network: network.value, address: contractAddress } },
      });
      symbol.value = result!.symbol;
      name.value = result!.name;
      decimals.value = String(result!.decimals);
      showToast('success', `Resolved: ${result!.symbol} (${result!.name})`);
    } catch {
      // Auto-resolve failed — user can still enter manually
    } finally {
      resolving.value = false;
    }
  }

  function handleAddressInput(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    address.value = val;
    // Auto-resolve when address looks like a valid EVM address (0x + 40 hex chars)
    if (resolveTimerRef.current) clearTimeout(resolveTimerRef.current);
    if (/^0x[a-fA-F0-9]{40}$/.test(val)) {
      resolveTimerRef.current = setTimeout(() => resolveTokenMetadata(val), 500);
    }
  }

  async function handleAddToken() {
    if (!address.value || !symbol.value || !name.value) {
      showToast('error', 'Please fill in all required fields.');
      return;
    }

    adding.value = true;
    try {
      await api.POST('/v1/tokens', {
        body: {
          network: network.value,
          address: address.value,
          symbol: symbol.value,
          name: name.value,
          decimals: Number(decimals.value),
        },
      });
      showToast('success', `Token ${symbol.value} added successfully.`);
      resetForm();
      await fetchTokens();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        showToast('error', getErrorMessage(err.code));
      } else {
        showToast('error', 'Failed to add token.');
      }
    } finally {
      adding.value = false;
    }
  }

  async function handleDeleteToken(tokenAddress: string) {
    deleting.value = tokenAddress;
    try {
      await api.DELETE('/v1/tokens', {
        body: {
          network: network.value,
          address: tokenAddress,
        },
      });
      showToast('success', 'Token removed successfully.');
      await fetchTokens();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        showToast('error', getErrorMessage(err.code));
      } else {
        showToast('error', 'Failed to remove token.');
      }
    } finally {
      deleting.value = null;
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <>
      {error.value && (
        <div class="dashboard-error">
          <span>{error.value}</span>
          <Button variant="secondary" size="sm" onClick={fetchTokens}>
            Retry
          </Button>
        </div>
      )}

      <div class="filter-bar">
        <div class="filter-field">
          <label>Network</label>
          <select value={network.value} onChange={handleNetworkChange}>
            {TOKEN_NETWORKS.map((n) => (
              <option key={n} value={n}>
                {NETWORK_DISPLAY_NAMES[n as keyof typeof NETWORK_DISPLAY_NAMES] ?? n}
              </option>
            ))}
          </select>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              showAddForm.value = !showAddForm.value;
            }}
          >
            {showAddForm.value ? 'Cancel' : 'Add Token'}
          </Button>
        </div>
      </div>

      {showAddForm.value && (
        <div class="card" style={{ marginTop: 'var(--space-3)', padding: 'var(--space-4)' }}>
          <h3 style={{ marginBottom: 'var(--space-3)' }}>Add Custom Token</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <div class="form-field">
              <label for="token-address">Contract Address {resolving.value && <span style={{ color: 'var(--warning)', fontSize: '0.85em' }}>(resolving...)</span>}</label>
              <input
                id="token-address"
                type="text"
                value={address.value}
                onInput={handleAddressInput}
                placeholder="0x... (metadata auto-fetched)"
              />
            </div>
            <div class="form-field">
              <label for="token-symbol">Symbol</label>
              <input
                id="token-symbol"
                type="text"
                value={symbol.value}
                onInput={(e) => {
                  symbol.value = (e.target as HTMLInputElement).value;
                }}
                placeholder="e.g. USDC"
              />
            </div>
            <div class="form-field">
              <label for="token-name">Name</label>
              <input
                id="token-name"
                type="text"
                value={name.value}
                onInput={(e) => {
                  name.value = (e.target as HTMLInputElement).value;
                }}
                placeholder="e.g. USD Coin"
              />
            </div>
            <div class="form-field">
              <label for="token-decimals">Decimals</label>
              <input
                id="token-decimals"
                type="number"
                value={decimals.value}
                onInput={(e) => {
                  decimals.value = (e.target as HTMLInputElement).value;
                }}
                placeholder="18"
              />
            </div>
          </div>
          <div style={{ marginTop: 'var(--space-3)', display: 'flex', gap: 'var(--space-2)' }}>
            <Button variant="primary" size="sm" loading={adding.value} onClick={handleAddToken}>
              Submit
            </Button>
            <Button variant="secondary" size="sm" onClick={resetForm}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div class="table-container" style={{ marginTop: 'var(--space-3)' }}>
        <table>
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th key={col}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading.value && tokens.value.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} class="table-loading">
                  Loading...
                </td>
              </tr>
            ) : tokens.value.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} class="table-empty">
                  No tokens found for this network
                </td>
              </tr>
            ) : (
              tokens.value.map((token) => (
                <tr key={token.address}>
                  <td>{token.symbol}</td>
                  <td>{token.name}</td>
                  <td title={token.address}>{truncateAddress(token.address)}</td>
                  <td>{token.decimals}</td>
                  <td>
                    <Badge variant={token.source === 'builtin' ? 'neutral' : 'info'}>
                      {token.source === 'builtin' ? 'Built-in' : 'Custom'}
                    </Badge>
                  </td>
                  <td>
                    {token.source === 'custom' ? (
                      <Button
                        variant="danger"
                        size="sm"
                        loading={deleting.value === token.address}
                        onClick={() => handleDeleteToken(token.address)}
                      >
                        Delete
                      </Button>
                    ) : (
                      '\u2014'
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
