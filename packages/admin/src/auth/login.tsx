import { signal } from '@preact/signals';
import { login } from './store';
import { API } from '../api/endpoints';

const password = signal('');
const error = signal<string | null>(null);
const loading = signal(false);

const styles = {
  wrapper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    background: 'var(--color-bg-secondary)',
  },
  card: {
    background: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-lg)',
    padding: 'var(--space-8)',
    width: '100%',
    maxWidth: '360px',
    boxShadow: 'var(--shadow-md)',
  },
  title: {
    fontSize: 'var(--font-size-2xl)',
    fontWeight: 'var(--font-weight-bold)',
    textAlign: 'center' as const,
    marginBottom: 'var(--space-1)',
  },
  subtitle: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-text-secondary)',
    textAlign: 'center' as const,
    marginBottom: 'var(--space-6)',
  },
  input: {
    width: '100%',
    padding: 'var(--space-2) var(--space-3)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-size-base)',
    outline: 'none',
  },
  button: {
    width: '100%',
    padding: 'var(--space-2) var(--space-4)',
    background: 'var(--color-primary)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-medium)',
    marginTop: 'var(--space-4)',
  },
  buttonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  error: {
    color: 'var(--color-danger)',
    fontSize: 'var(--font-size-sm)',
    textAlign: 'center' as const,
    marginTop: 'var(--space-3)',
  },
} as const;

const handleSubmit = async (e: Event) => {
  e.preventDefault();
  if (!password.value.trim()) return;
  loading.value = true;
  error.value = null;
  try {
    const res = await fetch(API.ADMIN_STATUS, {
      headers: { 'X-Master-Password': password.value },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 401) {
      error.value = 'Invalid master password';
      return;
    }
    if (!res.ok) {
      error.value = 'Cannot connect to daemon';
      return;
    }
    const data = await res.json();
    login(password.value, data.adminTimeout);
  } catch {
    error.value = 'Cannot connect to daemon';
  } finally {
    loading.value = false;
  }
};

export function Login() {
  return (
    <div style={styles.wrapper}>
      <form style={styles.card} onSubmit={handleSubmit}>
        <h1 style={styles.title}>WAIaaS Admin</h1>
        <p style={styles.subtitle}>Enter master password to continue</p>
        <input
          type="password"
          placeholder="Master password"
          autoFocus
          value={password.value}
          onInput={(e) => { password.value = (e.target as HTMLInputElement).value; }}
          style={styles.input}
        />
        <button
          type="submit"
          disabled={loading.value}
          style={{
            ...styles.button,
            ...(loading.value ? styles.buttonDisabled : {}),
          }}
        >
          {loading.value ? 'Signing in...' : 'Sign in'}
        </button>
        {error.value && <p style={styles.error}>{error.value}</p>}
      </form>
    </div>
  );
}
