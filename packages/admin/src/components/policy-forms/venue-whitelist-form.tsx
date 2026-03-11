import { DynamicRowList } from '../dynamic-row-list';
import { FormField } from '../form';
import type { PolicyFormProps } from './index';

interface VenueRow {
  id: string;
  name: string;
}

export function VenueWhitelistForm({ rules, onChange, errors }: PolicyFormProps) {
  const venues = (rules.venues as VenueRow[]) || [];

  return (
    <div class="policy-form-fields">
      <DynamicRowList<VenueRow>
        items={venues}
        onAdd={() =>
          onChange({ ...rules, venues: [...venues, { id: '', name: '' }] })
        }
        onRemove={(i) =>
          onChange({ ...rules, venues: venues.filter((_, idx) => idx !== i) })
        }
        onChange={(i, val) => {
          const next = [...venues];
          next[i] = val;
          onChange({ ...rules, venues: next });
        }}
        renderRow={(venue, i, onRowChange) => (
          <div class="dynamic-row-fields" style={{ display: 'flex', gap: '0.5rem', flex: 1 }}>
            <FormField
              label={`Venue ID ${i + 1}`}
              name={`venue-id-${i}`}
              value={venue.id}
              onChange={(v) => onRowChange(i, { ...venue, id: v as string })}
              placeholder="e.g. polymarket, hyperliquid"
              error={errors[`venues.${i}.id`]}
              required
            />
            <FormField
              label="Display Name"
              name={`venue-name-${i}`}
              value={venue.name}
              onChange={(v) => onRowChange(i, { ...venue, name: v as string })}
              placeholder="Optional display name"
            />
          </div>
        )}
        addLabel="+ Add Venue"
        error={errors.venues}
      />
    </div>
  );
}
