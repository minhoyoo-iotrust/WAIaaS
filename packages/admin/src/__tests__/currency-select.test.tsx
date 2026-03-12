import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/preact';

vi.mock('../api/client', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
}));

import { apiGet } from '../api/client';
import { CurrencySelect } from '../components/currency-select';

const mockedApiGet = apiGet as unknown as ReturnType<typeof vi.fn>;

describe('CurrencySelect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders trigger button with selected currency', () => {
    render(<CurrencySelect value="USD" onChange={vi.fn()} />);
    expect(screen.getByText(/USD - US Dollar/)).toBeTruthy();
  });

  it('shows rate preview for USD without API call', async () => {
    render(<CurrencySelect value="USD" onChange={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('1 USD = $1.00')).toBeTruthy();
    });
    expect(mockedApiGet).not.toHaveBeenCalled();
  });

  it('fetches rate preview for non-USD currency', async () => {
    mockedApiGet.mockResolvedValue({
      rates: { KRW: { rate: 1450, preview: '1 USD = \u20A91,450' } },
    });
    render(<CurrencySelect value="KRW" onChange={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('1 USD = \u20A91,450')).toBeTruthy();
    });
  });

  it('handles rate fetch error gracefully', async () => {
    mockedApiGet.mockRejectedValue(new Error('Network error'));
    const { container } = render(<CurrencySelect value="EUR" onChange={vi.fn()} />);
    await waitFor(() => {
      expect(container.querySelector('.currency-rate-preview')).toBeNull();
    });
  });

  it('handles missing rate info in response', async () => {
    mockedApiGet.mockResolvedValue({ rates: {} });
    const { container } = render(<CurrencySelect value="GBP" onChange={vi.fn()} />);
    await waitFor(() => {
      expect(container.querySelector('.currency-rate-preview')).toBeNull();
    });
  });

  it('opens dropdown on trigger click', () => {
    render(<CurrencySelect value="USD" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /USD/ }));
    expect(screen.getByPlaceholderText('Search currency...')).toBeTruthy();
  });

  it('closes dropdown on second trigger click', () => {
    render(<CurrencySelect value="USD" onChange={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: /USD/ });
    fireEvent.click(trigger);
    expect(screen.getByPlaceholderText('Search currency...')).toBeTruthy();
    fireEvent.click(trigger);
    expect(screen.queryByPlaceholderText('Search currency...')).toBeNull();
  });

  it('filters currencies by search text', () => {
    render(<CurrencySelect value="USD" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /USD/ }));
    const searchInput = screen.getByPlaceholderText('Search currency...');
    fireEvent.input(searchInput, { target: { value: 'Korean' } });
    expect(screen.getByText('KRW')).toBeTruthy();
    // Other currencies should be filtered out
    expect(screen.queryByText('JPY')).toBeNull();
  });

  it('shows empty message when no currencies match', () => {
    render(<CurrencySelect value="USD" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /USD/ }));
    const searchInput = screen.getByPlaceholderText('Search currency...');
    fireEvent.input(searchInput, { target: { value: 'zzzzzzz' } });
    expect(screen.getByText('No currencies found')).toBeTruthy();
  });

  it('calls onChange and closes dropdown when selecting a currency', () => {
    const onChange = vi.fn();
    mockedApiGet.mockResolvedValue({ rates: {} });
    render(<CurrencySelect value="USD" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /USD/ }));
    // Click on KRW option
    const krwButton = screen.getByText('KRW').closest('button')!;
    fireEvent.click(krwButton);
    expect(onChange).toHaveBeenCalledWith('KRW');
    // Dropdown should close
    expect(screen.queryByPlaceholderText('Search currency...')).toBeNull();
  });

  it('closes dropdown on outside click', () => {
    render(
      <div>
        <span data-testid="outside">outside</span>
        <CurrencySelect value="USD" onChange={vi.fn()} />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: /USD/ }));
    expect(screen.getByPlaceholderText('Search currency...')).toBeTruthy();
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByPlaceholderText('Search currency...')).toBeNull();
  });

  it('renders hidden input when name prop is provided', () => {
    const { container } = render(
      <CurrencySelect value="USD" onChange={vi.fn()} name="display_currency" />,
    );
    const hiddenInput = container.querySelector('input[type="hidden"][name="display_currency"]') as HTMLInputElement;
    expect(hiddenInput).toBeTruthy();
    expect(hiddenInput.value).toBe('USD');
  });

  it('does not render hidden input when name prop is absent', () => {
    const { container } = render(<CurrencySelect value="USD" onChange={vi.fn()} />);
    expect(container.querySelector('input[type="hidden"]')).toBeNull();
  });

  it('shows active class on currently selected option', () => {
    mockedApiGet.mockResolvedValue({ rates: {} });
    render(<CurrencySelect value="EUR" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /EUR/ }));
    const eurButton = screen.getByText('EUR').closest('button')!;
    expect(eurButton.className).toContain('currency-select-option--active');
  });

  it('shows chevron direction based on open state', () => {
    render(<CurrencySelect value="USD" onChange={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: /USD/ });
    // Closed: down chevron
    expect(trigger.textContent).toContain('\u25BC');
    fireEvent.click(trigger);
    // Open: up chevron
    expect(trigger.textContent).toContain('\u25B2');
  });

  it('defaults to first currency when value not found', () => {
    mockedApiGet.mockResolvedValue({ rates: {} });
    render(<CurrencySelect value="INVALID" onChange={vi.fn()} />);
    expect(screen.getByText(/USD - US Dollar/)).toBeTruthy();
  });

  it('filters by symbol', () => {
    render(<CurrencySelect value="USD" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /USD/ }));
    const searchInput = screen.getByPlaceholderText('Search currency...');
    fireEvent.input(searchInput, { target: { value: '\u20AC' } });
    expect(screen.getByText('EUR')).toBeTruthy();
  });
});
