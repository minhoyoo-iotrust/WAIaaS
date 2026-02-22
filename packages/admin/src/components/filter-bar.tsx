/**
 * FilterBar — generic reusable filter bar with optional URL query param sync.
 *
 * Supports select and date field types. When syncUrl is true (default),
 * filter state is read from and written to the URL hash query params,
 * enabling shareable/bookmarkable filtered views.
 */
import { useEffect } from 'preact/hooks';

export interface FilterField {
  key: string;
  label: string;
  type: 'select' | 'date';
  options?: Array<{ value: string; label: string }>; // for 'select'
  placeholder?: string;
}

export interface FilterBarProps {
  fields: FilterField[];
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  syncUrl?: boolean; // default true
}

/** Parse query params from hash-based routing (e.g., #/page?key=val) */
function parseHashParams(): Record<string, string> {
  const hash = window.location.hash;
  const qIdx = hash.indexOf('?');
  if (qIdx === -1) return {};
  const params = new URLSearchParams(hash.slice(qIdx + 1));
  const result: Record<string, string> = {};
  params.forEach((v, k) => {
    result[k] = v;
  });
  return result;
}

/** Update query params in the hash fragment without pushing a new history entry */
function updateHashParams(values: Record<string, string>): void {
  const hash = window.location.hash;
  const qIdx = hash.indexOf('?');
  const basePath = qIdx === -1 ? hash : hash.slice(0, qIdx);

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(values)) {
    if (v) params.set(k, v);
  }
  const qs = params.toString();
  const newHash = qs ? `${basePath}?${qs}` : basePath;

  // Use replaceState to avoid polluting browser history
  window.history.replaceState(null, '', newHash);
}

export function FilterBar({
  fields,
  values,
  onChange,
  syncUrl = true,
}: FilterBarProps) {
  // On mount, read initial values from URL hash params
  useEffect(() => {
    if (!syncUrl) return;
    const hashParams = parseHashParams();
    const merged: Record<string, string> = { ...values };
    let changed = false;
    for (const field of fields) {
      const hv = hashParams[field.key];
      if (hv !== undefined && hv !== merged[field.key]) {
        merged[field.key] = hv;
        changed = true;
      }
    }
    if (changed) {
      onChange(merged);
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleChange(key: string, value: string) {
    const next = { ...values, [key]: value };
    onChange(next);
    if (syncUrl) {
      updateHashParams(next);
    }
  }

  function handleClear() {
    const cleared: Record<string, string> = {};
    for (const field of fields) {
      cleared[field.key] = '';
    }
    onChange(cleared);
    if (syncUrl) {
      updateHashParams(cleared);
    }
  }

  return (
    <div class="filter-bar">
      {fields.map((field) => (
        <div key={field.key} class="filter-field">
          <label>{field.label}</label>
          {field.type === 'select' ? (
            <select
              value={values[field.key] ?? ''}
              onChange={(e) =>
                handleChange(field.key, (e.target as HTMLSelectElement).value)
              }
            >
              <option value="">All</option>
              {field.options?.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="date"
              value={values[field.key] ?? ''}
              placeholder={field.placeholder}
              onChange={(e) =>
                handleChange(field.key, (e.target as HTMLInputElement).value)
              }
            />
          )}
        </div>
      ))}
      <button class="btn btn-secondary filter-clear" type="button" onClick={handleClear}>
        Clear
      </button>
    </div>
  );
}
