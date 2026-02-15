import { FormField } from '../form';
import type { PolicyFormProps } from './index';

const HOUR_START_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
  label: `${String(i).padStart(2, '0')}:00`,
  value: String(i),
}));

const HOUR_END_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
  label: `${String(i + 1).padStart(2, '0')}:00`,
  value: String(i + 1),
}));

const DAYS = [
  { label: 'Sun', value: 0 },
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
];

export function TimeRestrictionForm({ rules, onChange, errors }: PolicyFormProps) {
  const hours = (rules.allowed_hours as { start: number; end: number }) || { start: 0, end: 24 };
  const days = (rules.allowed_days as number[]) || [];

  const handleHourChange = (field: 'start' | 'end') => (v: string | number | boolean) => {
    const next = { ...hours, [field]: Number(v) };
    onChange({ ...rules, allowed_hours: next });
  };

  const handleDayToggle = (day: number) => {
    const nextDays = days.includes(day)
      ? days.filter((d) => d !== day)
      : [...days, day].sort((a, b) => a - b);
    onChange({ ...rules, allowed_days: nextDays });
  };

  return (
    <div class="policy-form-fields">
      <h4>Allowed Hours</h4>
      <div class="policy-form-grid">
        <FormField
          label="Start Hour"
          name="allowed_hours_start"
          type="select"
          value={String(hours.start)}
          onChange={handleHourChange('start')}
          options={HOUR_START_OPTIONS}
          error={errors.allowed_hours}
        />
        <FormField
          label="End Hour"
          name="allowed_hours_end"
          type="select"
          value={String(hours.end)}
          onChange={handleHourChange('end')}
          options={HOUR_END_OPTIONS}
        />
      </div>
      <h4>Allowed Days</h4>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        {DAYS.map((day) => (
          <label key={day.value} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={days.includes(day.value)}
              onChange={() => handleDayToggle(day.value)}
            />
            {day.label}
          </label>
        ))}
      </div>
      {errors.allowed_days && <span class="form-error">{errors.allowed_days}</span>}
    </div>
  );
}
