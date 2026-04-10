/**
 * Setup Wizard state management with first-run detection.
 *
 * IMPORTANT: This file must ONLY be loaded via dynamic import inside
 * isDesktop() guards. It is NEVER statically imported in browser code.
 */

import { signal } from '@preact/signals';
import { isDesktop } from '../../utils/platform';

const SETUP_COMPLETE_KEY = 'waiaas_setup_complete';

/** SSoT chain identifiers matching CHAIN_TYPES from packages/shared/src/networks.ts */
export type ChainId = 'solana' | 'ethereum' | 'ripple';

export interface WizardData {
  password: string;
  /** Selected chains for initial wallet creation (multi-select, issue 492) */
  chains: ChainId[];
  walletName: string;
  /** Created wallet IDs (one per selected chain, issue 492) */
  walletIds: string[];
}

/** Current wizard step (1-4) */
export const wizardStep = signal<number>(1);

/** Whether the wizard has been completed */
export const wizardComplete = signal<boolean>(false);

/** Accumulated wizard user choices */
export const wizardData = signal<WizardData>({
  password: '',
  chains: ['ethereum', 'solana', 'ripple'],
  walletName: 'My Wallet',
  walletIds: [],
});

/**
 * Returns true if this is a first-run Desktop environment
 * (isDesktop() is true AND localStorage flag is not set).
 */
export function isFirstRun(): boolean {
  if (!isDesktop()) return false;
  try {
    return localStorage.getItem(SETUP_COMPLETE_KEY) !== 'true';
  } catch {
    return false;
  }
}

/** Advance to the next step (max 3) */
export function nextStep(): void {
  if (wizardStep.value < 3) {
    wizardStep.value = wizardStep.value + 1;
  }
}

/** Go back to the previous step (min 1) */
export function prevStep(): void {
  if (wizardStep.value > 1) {
    wizardStep.value = wizardStep.value - 1;
  }
}

/** Complete the wizard: persist flag, mark done.
 *
 * Authentication is already established via the bootstrap recovery.key
 * auto-login in app.tsx (issue 491), so no login() call is needed here.
 * Just navigate to the dashboard.
 */
export function completeWizard(): void {
  try {
    localStorage.setItem(SETUP_COMPLETE_KEY, 'true');
  } catch {
    // localStorage unavailable -- wizard will re-show on next launch
  }
  wizardComplete.value = true;
  try {
    location.hash = '#/dashboard';
  } catch {
    // non-browser env (tests) -- ignore
  }
}

