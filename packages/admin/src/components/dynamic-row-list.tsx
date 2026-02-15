import type { ComponentChildren } from 'preact';

export interface DynamicRowListProps<T> {
  items: T[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  renderRow: (item: T, index: number, onChange: (index: number, updated: T) => void) => ComponentChildren;
  onChange: (index: number, updated: T) => void;
  addLabel?: string;
  minItems?: number;
  error?: string;
}

export function DynamicRowList<T>({
  items,
  onAdd,
  onRemove,
  renderRow,
  onChange,
  addLabel = '+ Add',
  minItems = 0,
  error,
}: DynamicRowListProps<T>) {
  return (
    <div class="dynamic-row-list">
      {items.map((item, i) => (
        <div class="dynamic-row" key={i}>
          <div class="dynamic-row-fields">
            {renderRow(item, i, onChange)}
          </div>
          <button
            class="btn btn-ghost btn-sm dynamic-row-remove"
            onClick={() => onRemove(i)}
            disabled={items.length <= minItems}
            title="Remove"
          >
            x
          </button>
        </div>
      ))}
      <button class="btn btn-secondary btn-sm" onClick={onAdd}>
        {addLabel}
      </button>
      {error && <span class="form-error">{error}</span>}
    </div>
  );
}
