import { signal, type Signal } from '@preact/signals';
import { useSignal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { SETTINGS_SEARCH_INDEX, type SearchIndexEntry } from '../utils/settings-search-index';

// ---------------------------------------------------------------------------
// Module-level signals for cross-component communication
// ---------------------------------------------------------------------------

/** Signal for the field to highlight after navigation */
export const highlightField = signal('');

/** Signal for pending navigation from search (tab + fieldName) */
export const pendingNavigation = signal<{ tab: string; fieldName: string } | null>(null);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PAGE_LABELS: Record<string, string> = {
  '/wallets': 'Wallets',
  '/sessions': 'Sessions',
  '/policies': 'Policies',
  '/notifications': 'Notifications',
  '/security': 'Security',
  '/system': 'System',
};

function filterEntries(query: string): SearchIndexEntry[] {
  if (!query.trim()) return [];
  const lower = query.toLowerCase();
  return SETTINGS_SEARCH_INDEX.filter((entry) => {
    const haystack = [
      entry.label,
      entry.description,
      entry.keywords.join(' '),
    ].join(' ').toLowerCase();
    return haystack.includes(lower);
  }).slice(0, 10);
}

function breadcrumbPath(entry: SearchIndexEntry): string {
  const pageName = PAGE_LABELS[entry.page] ?? entry.page;
  if (entry.tab) {
    return `${pageName} > ${entry.tab}`;
  }
  return pageName;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SettingsSearchProps {
  open: Signal<boolean>;
}

export function SettingsSearch({ open }: SettingsSearchProps) {
  const query = useSignal('');
  const selectedIndex = useSignal(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = open.value ? filterEntries(query.value) : [];

  // Focus input when popover opens
  useEffect(() => {
    if (open.value) {
      query.value = '';
      selectedIndex.value = 0;
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [open.value]);

  if (!open.value) return null;

  const handleClose = () => {
    open.value = false;
    query.value = '';
    selectedIndex.value = 0;
  };

  const handleOverlayClick = (e: Event) => {
    if ((e.target as HTMLElement).classList.contains('search-overlay')) {
      handleClose();
    }
  };

  const handleNavigate = (entry: SearchIndexEntry) => {
    // Navigate to the page
    window.location.hash = '#' + entry.page;

    // Set pending navigation for tab switching + field highlight
    if (entry.tab) {
      pendingNavigation.value = { tab: entry.tab, fieldName: entry.fieldName };
    } else {
      // No tab (e.g. System page) -- just set highlight directly with a delay
      setTimeout(() => {
        highlightField.value = entry.fieldName;
      }, 100);
    }

    handleClose();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex.value = Math.min(selectedIndex.value + 1, results.length - 1);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex.value = Math.max(selectedIndex.value - 1, 0);
      return;
    }
    if (e.key === 'Enter' && results.length > 0) {
      e.preventDefault();
      handleNavigate(results[selectedIndex.value]!);
      return;
    }
  };

  return (
    <div class="search-overlay" onClick={handleOverlayClick}>
      <div class="search-popover" onKeyDown={handleKeyDown}>
        <div class="search-input-wrapper">
          <input
            ref={inputRef}
            class="search-input"
            type="text"
            placeholder="Search settings..."
            value={query.value}
            onInput={(e) => {
              query.value = (e.target as HTMLInputElement).value;
              selectedIndex.value = 0;
            }}
          />
        </div>
        <div class="search-results">
          {query.value.trim() && results.length === 0 && (
            <div class="search-empty">No settings found</div>
          )}
          {results.map((entry, i) => (
            <button
              key={entry.id}
              class={`search-result-item${i === selectedIndex.value ? ' selected' : ''}`}
              onClick={() => handleNavigate(entry)}
              onMouseEnter={() => { selectedIndex.value = i; }}
            >
              <div class="search-result-label">{entry.label}</div>
              <div class="search-result-desc">{entry.description}</div>
              <div class="search-result-path">{breadcrumbPath(entry)}</div>
            </button>
          ))}
        </div>
        <div class="search-hint">
          <span><kbd>Esc</kbd> close</span>
          <span><kbd>&uarr;</kbd><kbd>&darr;</kbd> navigate</span>
          <span><kbd>Enter</kbd> select</span>
        </div>
      </div>
    </div>
  );
}
