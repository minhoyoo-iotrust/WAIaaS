import { useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';
import type { ComponentType } from 'preact';
import { isAuthenticated, daemonShutdown, login } from './auth/store';
import { Login } from './auth/login';
import { Layout } from './components/layout';
import { ToastContainer } from './components/toast';
import { isDesktop, getDesktopRecoveryKey } from './utils/platform';
import { API } from './api/endpoints';

/** Desktop wizard active flag -- set true when isDesktop() && isFirstRun() */
const desktopWizardActive = signal(false);

/** Lazily loaded wizard complete signal */
const wizardCompleteValue = signal(false);

/** Lazily loaded SetupWizard component */
const WizardComponent = signal<ComponentType | null>(null);

/** Lazily loaded UpdateBanner component (Desktop auto-update) */
const UpdateBannerComponent = signal<ComponentType | null>(null);

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
  // Dynamic import of wizard + update banner -- only fires in Desktop environment
  useEffect(() => {
    if (!isDesktop()) return;

    (async () => {
      // Issue 491: Desktop bootstrap auto-login.
      //
      // sidecar.rs generates a random recovery.key on first launch and the
      // daemon initializes its master_password_hash from it. The user never
      // sees this value, so we can't ask them for it via the Login page.
      // Instead, pull the key via Tauri IPC and hand it to the auth store so
      // every subsequent API call gets the X-Master-Password header for free.
      //
      // If the user later changes their master password via the Security
      // page, that handler calls clearDesktopRecoveryKey() which deletes the
      // file; the IPC returns null here and we fall through to the normal
      // Login page.
      const recoveryKey = await getDesktopRecoveryKey();
      if (recoveryKey) {
        try {
          const res = await fetch(API.ADMIN_STATUS, {
            headers: { 'X-Master-Password': recoveryKey },
            signal: AbortSignal.timeout(10_000),
          });
          if (res.ok) {
            const data = await res.json().catch(() => ({})) as {
              adminTimeout?: number;
              walletCount?: number;
            };
            login(recoveryKey, data.adminTimeout);

            // Issue 497: auto-provision mainnet wallets on first Desktop boot.
            // If the daemon has no wallets yet, create one for each supported
            // chain (EVM, Solana, XRPL) so the user has a ready-to-use setup.
            if (data.walletCount === 0) {
              const CHAINS = [
                { chain: 'ethereum', name: 'EVM Wallet' },
                { chain: 'solana', name: 'Solana Wallet' },
                { chain: 'ripple', name: 'XRP Wallet' },
              ];
              for (const { chain, name } of CHAINS) {
                try {
                  await fetch(API.WALLETS, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'X-Master-Password': recoveryKey,
                    },
                    body: JSON.stringify({ name, chain, environment: 'mainnet' }),
                  });
                } catch {
                  // Best-effort: continue with remaining chains
                }
              }
            }
          }
          // On 401 we silently fall through to the Login page. The most
          // likely cause is a stale recovery.key after a password change we
          // failed to mop up; the user can log in with their chosen password.
        } catch {
          // Daemon unreachable -- let the Login page handle retries.
        }
      }

      // Load UpdateBanner for auto-update notifications
      const { UpdateBanner } = await import('./desktop/UpdateBanner');
      UpdateBannerComponent.value = UpdateBanner;
    })();
  }, []);

  // Priority: shutdown overlay > wizard (Desktop first-run) > login > authenticated layout
  if (daemonShutdown.value) {
    return <ShutdownOverlay />;
  }

  if (desktopWizardActive.value && !wizardCompleteValue.value) {
    const Wizard = WizardComponent.value;
    if (Wizard) {
      return <Wizard />;
    }
    // Wizard module still loading -- show nothing briefly
    return null;
  }

  if (!isAuthenticated.value) {
    return <Login />;
  }

  const Banner = UpdateBannerComponent.value;
  return (
    <>
      {Banner && <Banner />}
      <Layout />
      <ToastContainer />
    </>
  );
}
