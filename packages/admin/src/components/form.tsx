import type { ComponentChildren } from 'preact';

export interface FormFieldProps {
  label: string;
  name: string;
  type?: 'text' | 'number' | 'select' | 'textarea' | 'checkbox' | 'password';
  value: string | number | boolean;
  onChange: (value: string | number | boolean) => void;
  options?: { label: string; value: string }[];
  error?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  min?: number;
  max?: number;
}

export function FormField({
  label,
  name,
  type = 'text',
  value,
  onChange,
  options,
  error,
  required,
  disabled,
  placeholder,
  min,
  max,
}: FormFieldProps) {
  if (type === 'checkbox') {
    return (
      <div class="form-field">
        <label>
          <input
            type="checkbox"
            name={name}
            checked={!!value}
            onChange={(e) => onChange((e.target as HTMLInputElement).checked)}
            disabled={disabled}
          />
          {label}
          {required && <span> *</span>}
        </label>
        {error && <span class="form-error">{error}</span>}
      </div>
    );
  }

  const inputId = `field-${name}`;

  return (
    <div class="form-field">
      <label for={inputId}>
        {label}
        {required && <span> *</span>}
      </label>
      {type === 'select' ? (
        <select
          id={inputId}
          name={name}
          value={value as string}
          onChange={(e) => onChange((e.target as HTMLSelectElement).value)}
          disabled={disabled}
        >
          {options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : type === 'textarea' ? (
        <textarea
          id={inputId}
          name={name}
          value={value as string}
          onInput={(e) => onChange((e.target as HTMLTextAreaElement).value)}
          disabled={disabled}
          placeholder={placeholder}
        />
      ) : (
        <input
          id={inputId}
          type={type}
          name={name}
          value={type === 'number' ? (value as number) : (value as string)}
          onInput={(e) => {
            const target = e.target as HTMLInputElement;
            onChange(type === 'number' ? Number(target.value) : target.value);
          }}
          disabled={disabled}
          placeholder={placeholder}
          min={min}
          max={max}
          required={required}
        />
      )}
      {error && <span class="form-error">{error}</span>}
    </div>
  );
}

export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
  loading?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ComponentChildren;
  type?: 'button' | 'submit';
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  onClick,
  children,
  type = 'button',
}: ButtonProps) {
  const classes = [
    'btn',
    `btn-${variant}`,
    size === 'sm' ? 'btn-sm' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type={type}
      class={classes}
      disabled={disabled || loading}
      onClick={onClick}
    >
      {loading ? '...' : children}
    </button>
  );
}

export interface BadgeProps {
  variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  children: ComponentChildren;
}

export function Badge({ variant, children }: BadgeProps) {
  return <span class={`badge badge-${variant}`}>{children}</span>;
}
