vi.mock('../utils/settings-search-index', () => ({
  SETTINGS_SEARCH_INDEX: [
    {
      id: 'wallets.rpc.solana_mainnet',
      label: 'Solana Mainnet',
      description: 'RPC endpoint for Solana mainnet',
      page: '/wallets',
      tab: 'rpc',
      fieldName: 'rpc.solana_mainnet',
      keywords: ['blockchain', 'rpc', 'solana'],
    },
    {
      id: 'sessions.settings.default_ttl',
      label: 'Default TTL',
      description: 'Session default time-to-live',
      page: '/sessions',
      tab: 'settings',
      fieldName: 'settings.default_ttl',
      keywords: ['session', 'ttl', 'timeout'],
    },
    {
      id: 'system..oracle_provider',
      label: 'Oracle Provider',
      description: 'Price oracle data source',
      page: '/system',
      tab: '',
      fieldName: 'oracle.provider',
      keywords: ['oracle', 'price'],
    },
  ],
}));

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/preact';
import { signal } from '@preact/signals';
import {
  SettingsSearch,
  pendingNavigation,
  highlightField,
} from '../components/settings-search';

const openSignal = signal(false);

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  openSignal.value = false;
  pendingNavigation.value = null;
  highlightField.value = '';
  window.location.hash = '#/login';
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('SettingsSearch', () => {
  it('renders nothing when open is false', () => {
    const { container } = render(<SettingsSearch open={openSignal} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders search input when open is true', () => {
    openSignal.value = true;
    render(<SettingsSearch open={openSignal} />);
    expect(screen.getByPlaceholderText('Search settings...')).toBeDefined();
  });

  it('shows no results text for non-matching query', () => {
    openSignal.value = true;
    render(<SettingsSearch open={openSignal} />);

    const input = screen.getByPlaceholderText('Search settings...');
    fireEvent.input(input, { target: { value: 'zzzznonexistent' } });

    expect(screen.getByText('No settings found')).toBeDefined();
  });

  it('filters results by label match', () => {
    openSignal.value = true;
    render(<SettingsSearch open={openSignal} />);

    const input = screen.getByPlaceholderText('Search settings...');
    fireEvent.input(input, { target: { value: 'Solana' } });

    expect(screen.getByText('Solana Mainnet')).toBeDefined();
    expect(screen.queryByText('Default TTL')).toBeNull();
  });

  it('filters results by keyword match', () => {
    openSignal.value = true;
    render(<SettingsSearch open={openSignal} />);

    const input = screen.getByPlaceholderText('Search settings...');
    fireEvent.input(input, { target: { value: 'ttl' } });

    expect(screen.getByText('Default TTL')).toBeDefined();
  });

  it('filters results by description match', () => {
    openSignal.value = true;
    render(<SettingsSearch open={openSignal} />);

    const input = screen.getByPlaceholderText('Search settings...');
    fireEvent.input(input, { target: { value: 'Price oracle' } });

    expect(screen.getByText('Oracle Provider')).toBeDefined();
  });

  it('Escape key closes the dialog', () => {
    openSignal.value = true;
    const { container } = render(<SettingsSearch open={openSignal} />);

    const popover = container.querySelector('.search-popover')!;
    fireEvent.keyDown(popover, { key: 'Escape' });

    expect(openSignal.value).toBe(false);
  });

  it('ArrowDown moves selection down', () => {
    openSignal.value = true;
    const { container } = render(<SettingsSearch open={openSignal} />);

    // Search for 'a' which matches 'Solana Mainnet' and 'Oracle Provider' (2 results)
    const input = screen.getByPlaceholderText('Search settings...');
    fireEvent.input(input, { target: { value: 'a' } });

    const items = container.querySelectorAll('.search-result-item');
    expect(items.length).toBeGreaterThanOrEqual(2);

    // First item should be selected by default
    expect(items[0]!.className).toContain('selected');

    // ArrowDown moves selection to second item
    const popover = container.querySelector('.search-popover')!;
    fireEvent.keyDown(popover, { key: 'ArrowDown' });

    const updatedItems = container.querySelectorAll('.search-result-item');
    expect(updatedItems[1]!.className).toContain('selected');
    expect(updatedItems[0]!.className).not.toContain('selected');
  });

  it('ArrowUp moves selection up', () => {
    openSignal.value = true;
    const { container } = render(<SettingsSearch open={openSignal} />);

    const input = screen.getByPlaceholderText('Search settings...');
    fireEvent.input(input, { target: { value: 'a' } });

    const popover = container.querySelector('.search-popover')!;

    // Move down first
    fireEvent.keyDown(popover, { key: 'ArrowDown' });

    let items = container.querySelectorAll('.search-result-item');
    expect(items[1]!.className).toContain('selected');

    // Move back up
    fireEvent.keyDown(popover, { key: 'ArrowUp' });

    items = container.querySelectorAll('.search-result-item');
    expect(items[0]!.className).toContain('selected');
  });

  it('Enter navigates to selected result with tab', () => {
    openSignal.value = true;
    const { container } = render(<SettingsSearch open={openSignal} />);

    const input = screen.getByPlaceholderText('Search settings...');
    fireEvent.input(input, { target: { value: 'Solana' } });

    const popover = container.querySelector('.search-popover')!;
    fireEvent.keyDown(popover, { key: 'Enter' });

    expect(window.location.hash).toBe('#/wallets');
    expect(pendingNavigation.value).toEqual({
      tab: 'rpc',
      fieldName: 'rpc.solana_mainnet',
    });
    expect(openSignal.value).toBe(false);
  });

  it('Enter navigates to result without tab (sets highlightField via setTimeout)', () => {
    openSignal.value = true;
    const { container } = render(<SettingsSearch open={openSignal} />);

    const input = screen.getByPlaceholderText('Search settings...');
    fireEvent.input(input, { target: { value: 'Oracle' } });

    const popover = container.querySelector('.search-popover')!;
    fireEvent.keyDown(popover, { key: 'Enter' });

    expect(window.location.hash).toBe('#/system');
    expect(pendingNavigation.value).toBeNull();

    // Advance past the 100ms setTimeout
    vi.advanceTimersByTime(150);
    expect(highlightField.value).toBe('oracle.provider');
  });

  it('clicking overlay closes dialog', () => {
    openSignal.value = true;
    const { container } = render(<SettingsSearch open={openSignal} />);

    const overlay = container.querySelector('.search-overlay')!;
    fireEvent.click(overlay);

    expect(openSignal.value).toBe(false);
  });

  it('clicking result item navigates', () => {
    openSignal.value = true;
    render(<SettingsSearch open={openSignal} />);

    const input = screen.getByPlaceholderText('Search settings...');
    fireEvent.input(input, { target: { value: 'Default TTL' } });

    const resultBtn = screen.getByText('Default TTL').closest('button')!;
    fireEvent.click(resultBtn);

    expect(window.location.hash).toBe('#/sessions');
    expect(pendingNavigation.value).toEqual({
      tab: 'settings',
      fieldName: 'settings.default_ttl',
    });
  });

  it('shows breadcrumb with page > tab format', () => {
    openSignal.value = true;
    const { container } = render(<SettingsSearch open={openSignal} />);

    const input = screen.getByPlaceholderText('Search settings...');
    fireEvent.input(input, { target: { value: 'Solana' } });

    const path = container.querySelector('.search-result-path');
    expect(path).toBeDefined();
    expect(path!.textContent).toContain('Wallets');
    expect(path!.textContent).toContain('rpc');
  });

  it('shows breadcrumb with page only when no tab', () => {
    openSignal.value = true;
    const { container } = render(<SettingsSearch open={openSignal} />);

    const input = screen.getByPlaceholderText('Search settings...');
    fireEvent.input(input, { target: { value: 'Oracle' } });

    const path = container.querySelector('.search-result-path');
    expect(path).toBeDefined();
    expect(path!.textContent).toBe('System');
  });
});
