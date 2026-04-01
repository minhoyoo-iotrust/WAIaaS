import { useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';
import type { ComponentType } from 'preact';
import { isAuthenticated, daemonShutdown } from './auth/store';
import { Login } from './auth/login';
import { Layout } from './components/layout';
import { ToastContainer } from './components/toast';
import { isDesktop } from './utils/platform';

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
      // Dynamic import to avoid bundling wizard code in browser builds
      const { isFirstRun, wizardComplete } = await import('./desktop/wizard/wizard-store');

      if (isFirstRun()) {
        const { SetupWizard } = await import('./desktop/wizard/setup-wizard');
        WizardComponent.value = SetupWizard;
        desktopWizardActive.value = true;

        // Subscribe to wizardComplete changes
        const dispose = wizardComplete.subscribe((complete) => {
          wizardCompleteValue.value = complete;
          if (complete) dispose();
        });
      }

      // Load UpdateBanner for auto-update notifications (independent of wizard)
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
