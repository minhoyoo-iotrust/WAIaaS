import { DynamicRowList } from '../dynamic-row-list';
import { FormField } from '../form';
import type { PolicyFormProps } from './index';

export function X402AllowedDomainsForm({ rules, onChange, errors }: PolicyFormProps) {
  const domains = (rules.domains as string[]) || [];

  return (
    <div class="policy-form-fields">
      <DynamicRowList<string>
        items={domains}
        onAdd={() => onChange({ ...rules, domains: [...domains, ''] })}
        onRemove={(i) =>
          onChange({ ...rules, domains: domains.filter((_, idx) => idx !== i) })
        }
        onChange={(i, val) => {
          const next = [...domains];
          next[i] = val;
          onChange({ ...rules, domains: next });
        }}
        renderRow={(domain, i, onRowChange) => (
          <FormField
            label={`Domain ${i + 1}`}
            name={`domain-${i}`}
            value={domain}
            onChange={(v) => onRowChange(i, v as string)}
            placeholder="e.g. api.example.com or *.service.io"
            error={errors[`domains.${i}`]}
            required
          />
        )}
        addLabel="+ Add Domain"
        error={errors.domains}
      />
    </div>
  );
}
