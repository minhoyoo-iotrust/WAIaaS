/**
 * Setup Wizard Step 1: Set Master Password
 */

import { signal } from '@preact/signals';
import { wizardData, nextStep } from '../wizard-store';
import { API } from '../../../api/endpoints';

const password = signal('');
const confirmPassword = signal('');
const error = signal<string | null>(null);
const loading = signal(false);

const styles = {
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 'var(--space-4)',
  },
  input: {
    width: '100%',
    padding: 'var(--space-2) var(--space-3)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-size-base)',
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  label: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-medium)' as const,
    marginBottom: 'var(--space-1)',
    display: 'block',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
  },
  button: {
    width: '100%',
    padding: 'var(--space-2) var(--space-4)',
    background: 'var(--color-primary)',
    color: '#0c0c0c',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-medium)',
    cursor: 'pointer',
  },
  buttonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  error: {
    color: 'var(--color-danger)',
    fontSize: 'var(--font-size-sm)',
    textAlign: 'center' as const,
  },
  description: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-text-secondary)',
    marginBottom: 'var(--space-2)',
  },
} as const;

async function handleSubmit(e: Event) {
  e.preventDefault();
  error.value = null;

  if (password.value.length < 8) {
    error.value = 'Password must be at least 8 characters';
    return;
  }
  if (password.value !== confirmPassword.value) {
    error.value = 'Passwords do not match';
    return;
  }

  loading.value = true;
  try {
    const res = await fetch(API.ADMIN_MASTER_PASSWORD, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Password': password.value,
      },
      body: JSON.stringify({ password: password.value }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      error.value = (body as { message?: string }).message || 'Failed to set password';
      return;
    }

    wizardData.value = { ...wizardData.value, password: password.value };
    nextStep();
  } catch {
    error.value = 'Cannot connect to daemon';
  } finally {
    loading.value = false;
  }
}

export function PasswordStep() {
  return (
    <form style={styles.form} onSubmit={handleSubmit}>
      <p style={styles.description}>
        Choose a master password to secure your WAIaaS daemon.
        This password is required every time you access the admin interface.
      </p>

      <div style={styles.fieldGroup}>
        <label style={styles.label}>Master Password</label>
        <input
          type="password"
          placeholder="Enter password (min 8 chars)"
          value={password.value}
          onInput={(e) => { password.value = (e.target as HTMLInputElement).value; }}
          style={styles.input}
          autoFocus
        />
      </div>

      <div style={styles.fieldGroup}>
        <label style={styles.label}>Confirm Password</label>
        <input
          type="password"
          placeholder="Re-enter password"
          value={confirmPassword.value}
          onInput={(e) => { confirmPassword.value = (e.target as HTMLInputElement).value; }}
          style={styles.input}
        />
      </div>

      <button
        type="submit"
        disabled={loading.value}
        style={{
          ...styles.button,
          ...(loading.value ? styles.buttonDisabled : {}),
        }}
      >
        {loading.value ? 'Setting password...' : 'Set Password & Continue'}
      </button>

      {error.value && <p style={styles.error}>{error.value}</p>}
    </form>
  );
}
