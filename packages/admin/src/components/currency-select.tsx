/**
 * CurrencySelect: searchable currency dropdown with rate preview.
 *
 * Renders a button showing current selection, opens a dropdown with
 * search input filtering 43 supported fiat currencies. On selection,
 * fetches the current exchange rate from GET /admin/forex/rates and
 * displays a preview string (e.g. "1 USD = 1,450").
 *
 * Pure Preact + @preact/signals implementation (no external libs).
 * CSP-safe: no inline styles except those matching global.css patterns.
 */

import { useSignal, useComputed } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { apiGet } from '../api/client';
import { API } from '../api/endpoints';

// ---------------------------------------------------------------------------
// 43 currency metadata (synced with daemon forex-currencies.ts)
// Admin runs under CSP (default-src 'none') so cannot import from daemon.
// ---------------------------------------------------------------------------

interface CurrencyInfo {
  code: string;
  name: string;
  symbol: string;
}

const CURRENCIES: readonly CurrencyInfo[] = [
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'KRW', name: 'Korean Won', symbol: '\u20A9' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '\u00A5' },
  { code: 'EUR', name: 'Euro', symbol: '\u20AC' },
  { code: 'GBP', name: 'British Pound', symbol: '\u00A3' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '\u00A5' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$' },
  { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$' },
  { code: 'INR', name: 'Indian Rupee', symbol: '\u20B9' },
  { code: 'TWD', name: 'Taiwan Dollar', symbol: 'NT$' },
  { code: 'THB', name: 'Thai Baht', symbol: '\u0E3F' },
  { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM' },
  { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp' },
  { code: 'PHP', name: 'Philippine Peso', symbol: '\u20B1' },
  { code: 'VND', name: 'Vietnamese Dong', symbol: '\u20AB' },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$' },
  { code: 'MXN', name: 'Mexican Peso', symbol: 'MX$' },
  { code: 'CLP', name: 'Chilean Peso', symbol: 'CL$' },
  { code: 'TRY', name: 'Turkish Lira', symbol: '\u20BA' },
  { code: 'PLN', name: 'Polish Zloty', symbol: 'z\u0142' },
  { code: 'CZK', name: 'Czech Koruna', symbol: 'K\u010D' },
  { code: 'HUF', name: 'Hungarian Forint', symbol: 'Ft' },
  { code: 'SEK', name: 'Swedish Krona', symbol: 'kr' },
  { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr' },
  { code: 'DKK', name: 'Danish Krone', symbol: 'kr' },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$' },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R' },
  { code: 'ILS', name: 'Israeli Shekel', symbol: '\u20AA' },
  { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'AED' },
  { code: 'KWD', name: 'Kuwaiti Dinar', symbol: 'KD' },
  { code: 'BHD', name: 'Bahraini Dinar', symbol: 'BD' },
  { code: 'NGN', name: 'Nigerian Naira', symbol: '\u20A6' },
  { code: 'RUB', name: 'Russian Ruble', symbol: '\u20BD' },
  { code: 'UAH', name: 'Ukrainian Hryvnia', symbol: '\u20B4' },
  { code: 'PKR', name: 'Pakistani Rupee', symbol: 'Rs' },
  { code: 'BDT', name: 'Bangladeshi Taka', symbol: '\u09F3' },
  { code: 'LKR', name: 'Sri Lankan Rupee', symbol: 'Rs' },
  { code: 'MMK', name: 'Myanmar Kyat', symbol: 'K' },
  { code: 'GEL', name: 'Georgian Lari', symbol: '\u20BE' },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface CurrencySelectProps {
  /** Currently selected currency code (e.g. 'USD') */
  value: string;
  /** Called when user selects a different currency */
  onChange: (code: string) => void;
}

export function CurrencySelect({ value, onChange }: CurrencySelectProps) {
  const search = useSignal('');
  const isOpen = useSignal(false);
  const ratePreview = useSignal<string | null>(null);
  const rateLoading = useSignal(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Search filter
  const filtered = useComputed(() => {
    const q = search.value.toLowerCase();
    if (!q) return CURRENCIES;
    return CURRENCIES.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.symbol.includes(q),
    );
  });

  // Fetch rate preview when value changes
  useEffect(() => {
    if (value === 'USD') {
      ratePreview.value = '1 USD = $1.00';
      return;
    }
    rateLoading.value = true;
    apiGet<{ rates: Record<string, { rate: number; preview: string }> }>(
      `${API.ADMIN_FOREX_RATES}?currencies=${value}`,
    )
      .then((data) => {
        const info = data.rates[value];
        ratePreview.value = info?.preview ?? null;
      })
      .catch(() => {
        ratePreview.value = null;
      })
      .finally(() => {
        rateLoading.value = false;
      });
  }, [value]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        isOpen.value = false;
        search.value = '';
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Current selection metadata
  const selected = CURRENCIES.find((c) => c.code === value) ?? CURRENCIES[0];

  return (
    <div class="currency-select" ref={containerRef}>
      {/* Trigger button */}
      <button
        type="button"
        class="currency-select-trigger"
        onClick={() => {
          isOpen.value = !isOpen.value;
        }}
      >
        <span class="currency-select-value">
          {selected.code} - {selected.name} ({selected.symbol})
        </span>
        <span class="currency-select-chevron">{isOpen.value ? '\u25B2' : '\u25BC'}</span>
      </button>

      {/* Rate preview */}
      {ratePreview.value && (
        <div class="currency-rate-preview">
          {rateLoading.value ? '...' : ratePreview.value}
        </div>
      )}

      {/* Dropdown */}
      {isOpen.value && (
        <div class="currency-select-dropdown">
          <input
            type="text"
            class="currency-select-search"
            placeholder="Search currency..."
            value={search.value}
            onInput={(e) => {
              search.value = (e.target as HTMLInputElement).value;
            }}
            autoFocus
          />
          <div class="currency-select-list">
            {filtered.value.map((c) => (
              <button
                key={c.code}
                type="button"
                class={`currency-select-option ${c.code === value ? 'currency-select-option--active' : ''}`}
                onClick={() => {
                  onChange(c.code);
                  isOpen.value = false;
                  search.value = '';
                }}
              >
                <span class="currency-option-code">{c.code}</span>
                <span class="currency-option-name">{c.name}</span>
                <span class="currency-option-symbol">{c.symbol}</span>
              </button>
            ))}
            {filtered.value.length === 0 && (
              <div class="currency-select-empty">No currencies found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
