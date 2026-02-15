import { FormField } from '../form';
import type { PolicyFormProps } from './index';

export function RateLimitForm({ rules, onChange, errors }: PolicyFormProps) {
  const handleChange = (field: string) => (v: string | number | boolean) => {
    onChange({ ...rules, [field]: v });
  };

  return (
    <div class="policy-form-fields">
      <FormField
        label="Max Requests"
        name="max_requests"
        type="number"
        value={(rules.max_requests as number) ?? 100}
        onChange={handleChange('max_requests')}
        error={errors.max_requests}
        required
        min={1}
      />
      <FormField
        label="Window (seconds)"
        name="window_seconds"
        type="number"
        value={(rules.window_seconds as number) ?? 3600}
        onChange={handleChange('window_seconds')}
        error={errors.window_seconds}
        required
        min={1}
      />
    </div>
  );
}
