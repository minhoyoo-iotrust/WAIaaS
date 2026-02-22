/**
 * SearchInput — debounced text search input with clear button.
 *
 * Controlled component: parent manages `value` state.
 * Calls `onSearch` callback after the user stops typing for `debounceMs` (default 300ms).
 */
import { useRef } from 'preact/hooks';

export interface SearchInputProps {
  value: string;
  onSearch: (query: string) => void;
  placeholder?: string;
  debounceMs?: number;
}

export function SearchInput({
  value,
  onSearch,
  placeholder = 'Search...',
  debounceMs = 300,
}: SearchInputProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleInput(e: Event) {
    const newValue = (e.target as HTMLInputElement).value;

    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      onSearch(newValue);
      timerRef.current = null;
    }, debounceMs);
  }

  function handleClear() {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    onSearch('');
  }

  return (
    <div class="search-input">
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onInput={handleInput}
      />
      {value && (
        <button class="search-clear" type="button" onClick={handleClear}>
          x
        </button>
      )}
    </div>
  );
}
