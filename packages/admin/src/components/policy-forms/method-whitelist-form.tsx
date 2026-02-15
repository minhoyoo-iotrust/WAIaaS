import { DynamicRowList } from '../dynamic-row-list';
import { FormField } from '../form';
import type { PolicyFormProps } from './index';

interface MethodEntry {
  contractAddress: string;
  selectors: string[];
}

export function MethodWhitelistForm({ rules, onChange, errors }: PolicyFormProps) {
  const methods = (rules.methods as MethodEntry[]) || [];

  const updateMethods = (next: MethodEntry[]) => {
    onChange({ ...rules, methods: next });
  };

  return (
    <div class="policy-form-fields">
      <DynamicRowList<MethodEntry>
        items={methods}
        onAdd={() =>
          updateMethods([...methods, { contractAddress: '', selectors: [''] }])
        }
        onRemove={(i) =>
          updateMethods(methods.filter((_, idx) => idx !== i))
        }
        onChange={(i, val) => {
          const next = [...methods];
          next[i] = val;
          updateMethods(next);
        }}
        renderRow={(entry, i, onRowChange) => (
          <div style={{ flex: 1 }}>
            <FormField
              label={`Contract Address ${i + 1}`}
              name={`method-addr-${i}`}
              value={entry.contractAddress}
              onChange={(v) =>
                onRowChange(i, { ...entry, contractAddress: v as string })
              }
              placeholder="Contract address"
              error={errors[`methods.${i}.contractAddress`]}
              required
            />
            <div style={{ marginTop: '0.5rem', marginLeft: '1rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500 }}>Selectors</label>
              <DynamicRowList<string>
                items={entry.selectors}
                onAdd={() =>
                  onRowChange(i, { ...entry, selectors: [...entry.selectors, ''] })
                }
                onRemove={(j) =>
                  onRowChange(i, {
                    ...entry,
                    selectors: entry.selectors.filter((_, jdx) => jdx !== j),
                  })
                }
                onChange={(j, val) => {
                  const nextSel = [...entry.selectors];
                  nextSel[j] = val;
                  onRowChange(i, { ...entry, selectors: nextSel });
                }}
                renderRow={(sel, j, onSelChange) => (
                  <FormField
                    label={`Selector ${j + 1}`}
                    name={`method-sel-${i}-${j}`}
                    value={sel}
                    onChange={(v) => onSelChange(j, v as string)}
                    placeholder="e.g. 0xa9059cbb or transfer(address,uint256)"
                    error={errors[`methods.${i}.selectors.${j}`]}
                    required
                  />
                )}
                addLabel="+ Add Selector"
                error={errors[`methods.${i}.selectors`]}
              />
            </div>
          </div>
        )}
        addLabel="+ Add Method Entry"
        error={errors.methods}
      />
    </div>
  );
}
