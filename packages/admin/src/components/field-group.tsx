import type { ComponentChildren } from 'preact';

export interface FieldGroupProps {
  legend: string;
  children: ComponentChildren;
  description?: string;
}

export function FieldGroup({ legend, children, description }: FieldGroupProps) {
  return (
    <fieldset class="field-group">
      <legend class="field-group-legend">{legend}</legend>
      {description && <p class="field-group-description">{description}</p>}
      <div class="field-group-body">{children}</div>
    </fieldset>
  );
}
