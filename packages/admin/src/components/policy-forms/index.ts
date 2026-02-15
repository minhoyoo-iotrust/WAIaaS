import { h } from 'preact';
import type { ComponentChildren } from 'preact';

export interface PolicyFormProps {
  rules: Record<string, unknown>;
  onChange: (rules: Record<string, unknown>) => void;
  errors: Record<string, string>;
}

/**
 * PolicyFormRouter - routes to type-specific policy form components.
 *
 * Currently all types render a placeholder. Plan 02 will add
 * dedicated forms for the 5 main types (SPENDING_LIMIT, ALLOWED_TOKENS,
 * CONTRACT_WHITELIST, METHOD_WHITELIST, APPROVED_SPENDERS).
 */
export function PolicyFormRouter({
  type,
  rules,
  onChange,
  errors,
}: { type: string } & PolicyFormProps): ComponentChildren {
  // Plan 02 will add switch/case for specific type forms here.
  // For now, all types show a placeholder directing to JSON mode.
  return h('p', { class: 'policy-form-placeholder' },
    'This policy type uses JSON editor. Toggle to JSON mode.');
}
