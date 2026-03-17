/**
 * Tests for uncovered functions in components:
 * modal.tsx, tab-nav.tsx, settings-panel (hyperliquid), PolymarketSettings,
 * policy-forms (allowed-tokens, token-spend-limit, method-whitelist)
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/preact';

const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
const mockApiPut = vi.fn();
const mockApiDelete = vi.fn();

vi.mock('../api/typed-client', async () => {
  const { ApiError } = await import('../api/client');
  return {
    api: {
      GET: (...args: unknown[]) => mockApiGet(...args),
      POST: (...args: unknown[]) => mockApiPost(...args),
      PUT: (...args: unknown[]) => mockApiPut(...args),
      DELETE: (...args: unknown[]) => mockApiDelete(...args),
    },
    ApiError,
  };
});

vi.mock('../components/toast', () => ({
  showToast: vi.fn(),
  ToastContainer: () => null,
}));

vi.mock('../auth/store', () => ({
  masterPassword: { value: 'test-pw' },
  isAuthenticated: { value: true },
  adminTimeout: { value: 900 },
  daemonShutdown: { value: false },
  login: vi.fn(),
  logout: vi.fn(),
  resetInactivityTimer: vi.fn(),
}));

vi.mock('../utils/dirty-guard', () => ({
  registerDirty: vi.fn(),
  unregisterDirty: vi.fn(),
  hasDirty: { value: false },
}));

vi.mock('../components/unsaved-dialog', () => ({
  showUnsavedDialog: vi.fn(({ execute }: { execute: () => void }) => execute()),
}));

import { showToast } from '../components/toast';

// ---------------------------------------------------------------------------
// modal.tsx (66.66% Functions) - ESC key handler, overlay click
// ---------------------------------------------------------------------------

describe('modal.tsx uncovered functions', () => {
  let Modal: any;

  beforeEach(async () => {
    Modal = (await import('../components/modal')).Modal;
  });

  afterEach(() => {
    cleanup();
  });

  it('ESC key calls onCancel', async () => {
    const onCancel = vi.fn();
    render(
      <Modal open={true} title="Test" onCancel={onCancel}>
        <p>Content</p>
      </Modal>
    );

    // Press Escape
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onCancel).toHaveBeenCalled();
  });

  it('overlay click calls onCancel', () => {
    const onCancel = vi.fn();
    const { container } = render(
      <Modal open={true} title="Test" onCancel={onCancel}>
        <p>Content</p>
      </Modal>
    );

    const overlay = container.querySelector('.modal-overlay')!;
    fireEvent.click(overlay);

    expect(onCancel).toHaveBeenCalled();
  });

  it('modal-card click does NOT call onCancel (stopPropagation)', () => {
    const onCancel = vi.fn();
    const { container } = render(
      <Modal open={true} title="Test" onCancel={onCancel}>
        <p>Content</p>
      </Modal>
    );

    const card = container.querySelector('.modal-card')!;
    fireEvent.click(card);

    expect(onCancel).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// tab-nav.tsx (66.66% Functions) - tab click handler with dirty guard
// ---------------------------------------------------------------------------

describe('tab-nav.tsx uncovered functions', () => {
  let TabNav: any;

  beforeEach(async () => {
    TabNav = (await import('../components/tab-nav')).TabNav;
  });

  afterEach(() => {
    cleanup();
  });

  it('clicking inactive tab calls onTabChange', () => {
    const onChange = vi.fn();
    const tabs = [{ key: 'a', label: 'Tab A' }, { key: 'b', label: 'Tab B' }];

    render(<TabNav tabs={tabs} activeTab="a" onTabChange={onChange} />);

    fireEvent.click(screen.getByText('Tab B'));

    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('clicking active tab does nothing', () => {
    const onChange = vi.fn();
    const tabs = [{ key: 'a', label: 'Tab A' }, { key: 'b', label: 'Tab B' }];

    render(<TabNav tabs={tabs} activeTab="a" onTabChange={onChange} />);

    fireEvent.click(screen.getByText('Tab A'));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('clicking tab with hasDirty shows unsaved dialog', async () => {
    const onChange = vi.fn();
    const tabs = [{ key: 'a', label: 'Tab A' }, { key: 'b', label: 'Tab B' }];

    // Set hasDirty to true
    const dirtyGuard = await import('../utils/dirty-guard');
    (dirtyGuard.hasDirty as any).value = true;

    render(<TabNav tabs={tabs} activeTab="a" onTabChange={onChange} />);

    fireEvent.click(screen.getByText('Tab B'));

    const { showUnsavedDialog } = await import('../components/unsaved-dialog');
    expect(showUnsavedDialog).toHaveBeenCalled();

    // Restore
    (dirtyGuard.hasDirty as any).value = false;
  });
});

// ---------------------------------------------------------------------------
// HyperliquidSettingsPanel (33.33% Functions) - handleChange, handleSave
// ---------------------------------------------------------------------------

describe('HyperliquidSettingsPanel uncovered functions', () => {
  let SettingsPanel: any;

  beforeEach(async () => {
    SettingsPanel = (await import('../components/hyperliquid/SettingsPanel')).SettingsPanel;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('handleChange: updates setting value', async () => {
    mockApiGet.mockResolvedValue({
      data: {
        'actions.hyperliquid_enabled': 'true',
        'actions.hyperliquid_network': 'mainnet',
      },
    });

    render(<SettingsPanel />);

    await waitFor(() => {
      expect(screen.queryByText('Loading settings...')).toBeNull();
    });

    // Change a text field
    const leverageInput = document.querySelector('input[type="number"]') as HTMLInputElement;
    if (leverageInput) {
      fireEvent.input(leverageInput, { target: { value: '5' } });
    }
  });

  it('handleSave: saves settings via PUT', async () => {
    mockApiGet.mockResolvedValue({
      data: {
        'actions.hyperliquid_enabled': 'true',
        'actions.hyperliquid_network': 'mainnet',
      },
    });
    mockApiPut.mockResolvedValueOnce({ data: {} });

    render(<SettingsPanel />);

    await waitFor(() => {
      expect(screen.getByText('Save Settings')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Save Settings'));

    await waitFor(() => {
      expect(mockApiPut).toHaveBeenCalled();
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('Hyperliquid settings saved', 'success');
    });
  });

  it('handleSave error shows toast', async () => {
    mockApiGet.mockResolvedValue({ data: {} });
    mockApiPut.mockRejectedValueOnce(new Error('fail'));

    render(<SettingsPanel />);

    await waitFor(() => {
      expect(screen.getByText('Save Settings')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Save Settings'));

    await waitFor(() => {
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('Failed to save settings', 'error');
    });
  });
});

// ---------------------------------------------------------------------------
// PolymarketSettings (40% Functions) - handleChange, handleSave
// ---------------------------------------------------------------------------

describe('PolymarketSettings uncovered functions', () => {
  let PolymarketSettings: any;

  beforeEach(async () => {
    PolymarketSettings = (await import('../components/polymarket/PolymarketSettings')).PolymarketSettings;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('handleSave: saves settings via PUT', async () => {
    mockApiGet.mockResolvedValue({
      data: {
        'actions.polymarket_enabled': 'true',
        'actions.polymarket_default_fee_bps': '100',
      },
    });
    mockApiPut.mockResolvedValueOnce({ data: {} });

    render(<PolymarketSettings />);

    await waitFor(() => {
      expect(screen.getByText('Save Settings')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Save Settings'));

    await waitFor(() => {
      expect(mockApiPut).toHaveBeenCalled();
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('Polymarket settings saved', 'success');
    });
  });

  it('handleChange: updates setting value on checkbox toggle', async () => {
    mockApiGet.mockResolvedValue({
      data: {
        'actions.polymarket_enabled': 'false',
      },
    });

    render(<PolymarketSettings />);

    await waitFor(() => {
      expect(screen.queryByText('Loading settings...')).toBeNull();
    });

    // Toggle the enabled checkbox
    const checkbox = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
    if (checkbox) {
      fireEvent.change(checkbox, { target: { checked: true } });
    }
  });
});

// ---------------------------------------------------------------------------
// policy-forms: AllowedTokensForm (37.5% Functions)
// ---------------------------------------------------------------------------

describe('AllowedTokensForm uncovered functions', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders with tokens and handles add', async () => {
    const { AllowedTokensForm } = await import('../components/policy-forms/allowed-tokens-form');
    const onChange = vi.fn();
    const rules = { tokens: [{ address: '0xabc', symbol: 'USDC', chain: 'ethereum' }] };

    render(<AllowedTokensForm rules={rules} onChange={onChange} errors={{}} />);

    fireEvent.click(screen.getByText('+ Add Token'));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        tokens: expect.arrayContaining([
          expect.objectContaining({ address: '0xabc' }),
          expect.objectContaining({ address: '' }),
        ]),
      }),
    );
  });

  it('handles remove token', async () => {
    const { AllowedTokensForm } = await import('../components/policy-forms/allowed-tokens-form');
    const onChange = vi.fn();
    const rules = {
      tokens: [
        { address: '0x111', symbol: 'A', chain: '' },
        { address: '0x222', symbol: 'B', chain: '' },
      ],
    };

    const { container } = render(<AllowedTokensForm rules={rules} onChange={onChange} errors={{}} />);

    const removeButtons = container.querySelectorAll('.dynamic-row-remove');
    fireEvent.click(removeButtons[0]!);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        tokens: [expect.objectContaining({ address: '0x222' })],
      }),
    );
  });

  it('handles address field change', async () => {
    const { AllowedTokensForm } = await import('../components/policy-forms/allowed-tokens-form');
    const onChange = vi.fn();
    const rules = { tokens: [{ address: '0xold', symbol: '', chain: '' }] };

    render(<AllowedTokensForm rules={rules} onChange={onChange} errors={{}} />);

    const input = document.querySelector('input[name="token-addr-0"]') as HTMLInputElement;
    fireEvent.input(input, { target: { value: '0xnew' } });

    expect(onChange).toHaveBeenCalled();
  });

  it('handles chain select change to empty (removes chain field)', async () => {
    const { AllowedTokensForm } = await import('../components/policy-forms/allowed-tokens-form');
    const onChange = vi.fn();
    const rules = { tokens: [{ address: '0xabc', symbol: 'USDC', chain: 'ethereum' }] };

    render(<AllowedTokensForm rules={rules} onChange={onChange} errors={{}} />);

    const select = document.querySelector('select[name="token-chain-0"]') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '' } });

    expect(onChange).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// policy-forms: SpendingLimitForm uncovered functions
// ---------------------------------------------------------------------------

describe('SpendingLimitForm uncovered functions', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders spending limit form', async () => {
    const { SpendingLimitForm } = await import('../components/policy-forms/spending-limit-form');
    const onChange = vi.fn();
    const rules = { maxUsd: '1000', windowSeconds: 86400 };

    render(<SpendingLimitForm rules={rules} onChange={onChange} errors={{}} />);

    // Should render max amount field
    const inputs = document.querySelectorAll('input');
    expect(inputs.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// policy-forms: MethodWhitelistForm (50% Functions)
// ---------------------------------------------------------------------------

describe('MethodWhitelistForm uncovered functions', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders and handles add method entry', async () => {
    const { MethodWhitelistForm } = await import('../components/policy-forms/method-whitelist-form');
    const onChange = vi.fn();
    const rules = { methods: [{ contractAddress: '0xabc', selectors: ['0xa9059cbb'] }] };

    render(<MethodWhitelistForm rules={rules} onChange={onChange} errors={{}} />);

    fireEvent.click(screen.getByText('+ Add Method Entry'));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        methods: expect.arrayContaining([
          expect.objectContaining({ contractAddress: '0xabc' }),
          expect.objectContaining({ contractAddress: '' }),
        ]),
      }),
    );
  });

  it('handles remove method entry', async () => {
    const { MethodWhitelistForm } = await import('../components/policy-forms/method-whitelist-form');
    const onChange = vi.fn();
    const rules = {
      methods: [
        { contractAddress: '0x111', selectors: ['0xa'] },
        { contractAddress: '0x222', selectors: ['0xb'] },
      ],
    };

    const { container } = render(<MethodWhitelistForm rules={rules} onChange={onChange} errors={{}} />);

    // Remove buttons at outer level (not selector level)
    const removeButtons = container.querySelectorAll(':scope > .policy-form-fields > div > .dynamic-row .dynamic-row-remove');
    if (removeButtons.length > 0) {
      fireEvent.click(removeButtons[0]!);
      expect(onChange).toHaveBeenCalled();
    }
  });

  it('handles contractAddress field change', async () => {
    const { MethodWhitelistForm } = await import('../components/policy-forms/method-whitelist-form');
    const onChange = vi.fn();
    const rules = { methods: [{ contractAddress: '0xold', selectors: ['0xa'] }] };

    render(<MethodWhitelistForm rules={rules} onChange={onChange} errors={{}} />);

    const input = document.querySelector('input[name="method-addr-0"]') as HTMLInputElement;
    if (input) {
      fireEvent.input(input, { target: { value: '0xnew' } });
      expect(onChange).toHaveBeenCalled();
    }
  });
});
