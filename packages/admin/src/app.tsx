import { isAuthenticated, daemonShutdown } from './auth/store';
import { Login } from './auth/login';

const shutdownStyles = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0, 0, 0, 0.7)',
    color: 'white',
    zIndex: 9999,
  },
  content: {
    textAlign: 'center' as const,
  },
  title: {
    fontSize: 'var(--font-size-2xl)',
    fontWeight: 'var(--font-weight-bold)',
    marginBottom: 'var(--space-2)',
  },
  message: {
    fontSize: 'var(--font-size-base)',
    color: 'var(--color-text-muted)',
  },
} as const;

function ShutdownOverlay() {
  return (
    <div style={shutdownStyles.overlay}>
      <div style={shutdownStyles.content}>
        <h1 style={shutdownStyles.title}>Daemon Shutting Down</h1>
        <p style={shutdownStyles.message}>
          The daemon is shutting down. Please wait or restart.
        </p>
      </div>
    </div>
  );
}

export function App() {
  // Priority: shutdown overlay > login > authenticated layout
  if (daemonShutdown.value) {
    return <ShutdownOverlay />;
  }
  if (!isAuthenticated.value) {
    return <Login />;
  }
  // Phase 67-02 will add Layout+Router here
  return (
    <div style={{ padding: 'var(--space-8)' }}>
      <h1>Authenticated</h1>
      <p>Layout component coming in Plan 67-02</p>
    </div>
  );
}
