import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/preact';
import { ExplorerLink } from '../components/explorer-link';
import { FilterBar } from '../components/filter-bar';
import type { FilterField } from '../components/filter-bar';
import { SearchInput } from '../components/search-input';

afterEach(cleanup);

// ─── ExplorerLink ────────────────────────────────────────────────────────────

describe('ExplorerLink', () => {
  it('renders external link for Solana mainnet txHash', () => {
    const txHash = '5abc123def456789abcdef0123456789abcdef0123456789abcdef012345678901';
    render(<ExplorerLink network="mainnet" txHash={txHash} />);

    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toContain('solscan.io');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('renders external link for Ethereum mainnet txHash', () => {
    const txHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
    render(<ExplorerLink network="ethereum-mainnet" txHash={txHash} />);

    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toContain('etherscan.io');
  });

  it('renders external link for Base Sepolia txHash', () => {
    const txHash = '0xdeadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678';
    render(<ExplorerLink network="base-sepolia" txHash={txHash} />);

    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toContain('sepolia.basescan.org');
  });

  it('returns null when txHash is null', () => {
    const { container } = render(<ExplorerLink network="mainnet" txHash={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('returns null when txHash is empty string', () => {
    const { container } = render(<ExplorerLink network="mainnet" txHash="" />);
    expect(container.innerHTML).toBe('');
  });

  it('renders truncated plain text when network is unknown', () => {
    const txHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
    const { container } = render(
      <ExplorerLink network="unknown-chain" txHash={txHash} />,
    );

    // Should not render a link
    const link = container.querySelector('a');
    expect(link).toBeNull();

    // Should render truncated text as plain span
    const span = container.querySelector('.explorer-link-text');
    expect(span).toBeDefined();
    expect(span!.textContent).toBe('0xabcdef...567890');
  });
});

// ─── FilterBar ───────────────────────────────────────────────────────────────

describe('FilterBar', () => {
  const fields: FilterField[] = [
    {
      key: 'status',
      label: 'Status',
      type: 'select',
      options: [
        { value: 'active', label: 'Active' },
        { value: 'inactive', label: 'Inactive' },
      ],
    },
    {
      key: 'date',
      label: 'Date',
      type: 'date',
    },
  ];

  it('renders select fields with "All" option + provided options', () => {
    render(
      <FilterBar
        fields={fields}
        values={{ status: '', date: '' }}
        onChange={() => {}}
        syncUrl={false}
      />,
    );

    const select = screen.getByRole('combobox');
    const options = select.querySelectorAll('option');
    expect(options.length).toBe(3); // All + Active + Inactive
    expect(options[0].textContent).toBe('All');
    expect(options[1].textContent).toBe('Active');
    expect(options[2].textContent).toBe('Inactive');
  });

  it('calls onChange with updated values when a select is changed', () => {
    const onChange = vi.fn();
    render(
      <FilterBar
        fields={fields}
        values={{ status: '', date: '' }}
        onChange={onChange}
        syncUrl={false}
      />,
    );

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'active' } });

    expect(onChange).toHaveBeenCalledWith({ status: 'active', date: '' });
  });

  it('clears all filter values when Clear button clicked', () => {
    const onChange = vi.fn();
    render(
      <FilterBar
        fields={fields}
        values={{ status: 'active', date: '2026-01-01' }}
        onChange={onChange}
        syncUrl={false}
      />,
    );

    const clearBtn = screen.getByText('Clear');
    fireEvent.click(clearBtn);

    expect(onChange).toHaveBeenCalledWith({ status: '', date: '' });
  });

  it('renders date input for date-type fields', () => {
    const { container } = render(
      <FilterBar
        fields={fields}
        values={{ status: '', date: '' }}
        onChange={() => {}}
        syncUrl={false}
      />,
    );

    const dateInput = container.querySelector('input[type="date"]');
    expect(dateInput).toBeDefined();
    expect(dateInput).not.toBeNull();
  });

  it('reads initial values from URL hash query params on mount', () => {
    // Set up hash with query params
    window.location.hash = '#/test?status=inactive';

    const onChange = vi.fn();
    render(
      <FilterBar
        fields={fields}
        values={{ status: '', date: '' }}
        onChange={onChange}
        syncUrl={true}
      />,
    );

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'inactive' }),
    );
  });
});

// ─── SearchInput ─────────────────────────────────────────────────────────────

describe('SearchInput', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls onSearch after debounce period', () => {
    const onSearch = vi.fn();
    const { container } = render(
      <SearchInput value="" onSearch={onSearch} debounceMs={300} />,
    );

    const input = container.querySelector('input')!;
    fireEvent.input(input, { target: { value: 'hello' } });

    // Not called immediately
    expect(onSearch).not.toHaveBeenCalled();

    // Advance past debounce
    vi.advanceTimersByTime(300);
    expect(onSearch).toHaveBeenCalledWith('hello');
  });

  it('does NOT call onSearch before debounce period expires', () => {
    const onSearch = vi.fn();
    const { container } = render(
      <SearchInput value="" onSearch={onSearch} debounceMs={300} />,
    );

    const input = container.querySelector('input')!;
    fireEvent.input(input, { target: { value: 'test' } });

    vi.advanceTimersByTime(200); // Less than debounce
    expect(onSearch).not.toHaveBeenCalled();
  });

  it('clear button calls onSearch with empty string immediately', () => {
    const onSearch = vi.fn();
    render(
      <SearchInput value="existing" onSearch={onSearch} debounceMs={300} />,
    );

    const clearBtn = screen.getByText('x');
    fireEvent.click(clearBtn);

    // Should be called immediately, no debounce
    expect(onSearch).toHaveBeenCalledWith('');
  });

  it('resets debounce timer on subsequent keystrokes', () => {
    const onSearch = vi.fn();
    const { container } = render(
      <SearchInput value="" onSearch={onSearch} debounceMs={300} />,
    );

    const input = container.querySelector('input')!;

    // First keystroke
    fireEvent.input(input, { target: { value: 'a' } });
    vi.advanceTimersByTime(200);

    // Second keystroke before debounce expires
    fireEvent.input(input, { target: { value: 'ab' } });
    vi.advanceTimersByTime(200);

    // First timer should have been cancelled, so no call yet
    expect(onSearch).not.toHaveBeenCalled();

    // Advance past second debounce
    vi.advanceTimersByTime(100);
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith('ab');
  });
});
