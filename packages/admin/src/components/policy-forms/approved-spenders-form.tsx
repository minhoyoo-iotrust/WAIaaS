import { DynamicRowList } from '../dynamic-row-list';
import { FormField } from '../form';
import type { PolicyFormProps } from './index';

interface SpenderRow {
  address: string;
  name: string;
  maxAmount: string;
}

export function ApprovedSpendersForm({ rules, onChange, errors }: PolicyFormProps) {
  const spenders = (rules.spenders as SpenderRow[]) || [];

  return (
    <div class="policy-form-fields">
      <DynamicRowList<SpenderRow>
        items={spenders}
        onAdd={() =>
          onChange({ ...rules, spenders: [...spenders, { address: '', name: '', maxAmount: '' }] })
        }
        onRemove={(i) =>
          onChange({ ...rules, spenders: spenders.filter((_, idx) => idx !== i) })
        }
        onChange={(i, val) => {
          const next = [...spenders];
          next[i] = val;
          // Remove maxAmount from object if empty (Zod optional)
          if (!val.maxAmount) {
            delete (next[i] as Record<string, unknown>).maxAmount;
          }
          onChange({ ...rules, spenders: next });
        }}
        renderRow={(spender, i, onRowChange) => (
          <div class="dynamic-row-fields" style={{ display: 'flex', gap: '0.5rem', flex: 1 }}>
            <FormField
              label={`Address ${i + 1}`}
              name={`spender-addr-${i}`}
              value={spender.address}
              onChange={(v) => onRowChange(i, { ...spender, address: v as string })}
              placeholder="Spender address"
              error={errors[`spenders.${i}.address`]}
              required
            />
            <FormField
              label="Name"
              name={`spender-name-${i}`}
              value={spender.name}
              onChange={(v) => onRowChange(i, { ...spender, name: v as string })}
              placeholder="e.g. Uniswap"
            />
            <FormField
              label="Max Amount"
              name={`spender-max-${i}`}
              value={spender.maxAmount || ''}
              onChange={(v) => onRowChange(i, { ...spender, maxAmount: v as string })}
              placeholder="Leave empty for unlimited"
              error={errors[`spenders.${i}.maxAmount`]}
            />
          </div>
        )}
        addLabel="+ Add Spender"
        error={errors.spenders}
      />
    </div>
  );
}
