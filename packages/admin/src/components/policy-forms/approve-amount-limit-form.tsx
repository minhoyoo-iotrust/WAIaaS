import { FormField } from '../form';
import type { PolicyFormProps } from './index';

export function ApproveAmountLimitForm({ rules, onChange, errors }: PolicyFormProps) {
  const handleMaxAmountChange = (v: string | number | boolean) => {
    const next = { ...rules };
    if (v === '' || v === undefined) {
      delete next.maxAmount;
    } else {
      next.maxAmount = v as string;
    }
    onChange(next);
  };

  return (
    <div class="policy-form-fields">
      <FormField
        label="Max Amount (lamports/wei, optional)"
        name="maxAmount"
        value={(rules.maxAmount as string) ?? ''}
        onChange={handleMaxAmountChange}
        error={errors.maxAmount}
        placeholder="Leave empty for no limit"
      />
      <FormField
        label="Block Unlimited Approvals"
        name="blockUnlimited"
        type="checkbox"
        value={(rules.blockUnlimited as boolean) ?? true}
        onChange={(v) => onChange({ ...rules, blockUnlimited: v as boolean })}
      />
    </div>
  );
}
