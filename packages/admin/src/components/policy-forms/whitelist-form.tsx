import { DynamicRowList } from '../dynamic-row-list';
import { FormField } from '../form';
import type { PolicyFormProps } from './index';

export function WhitelistForm({ rules, onChange, errors }: PolicyFormProps) {
  const addresses = (rules.allowed_addresses as string[]) || [];

  return (
    <div class="policy-form-fields">
      <DynamicRowList
        items={addresses}
        onAdd={() => onChange({ ...rules, allowed_addresses: [...addresses, ''] })}
        onRemove={(i) =>
          onChange({ ...rules, allowed_addresses: addresses.filter((_, idx) => idx !== i) })
        }
        onChange={(i, val) => {
          const next = [...addresses];
          next[i] = val;
          onChange({ ...rules, allowed_addresses: next });
        }}
        renderRow={(addr, i, onRowChange) => (
          <FormField
            label={`Address ${i + 1}`}
            name={`address-${i}`}
            value={addr}
            onChange={(v) => onRowChange(i, v as string)}
            placeholder="Wallet address"
            error={errors[`allowed_addresses.${i}`]}
            required
          />
        )}
        addLabel="+ Add Address"
        error={errors.allowed_addresses}
      />
    </div>
  );
}
