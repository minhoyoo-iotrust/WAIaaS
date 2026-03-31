/**
 * Setup Wizard state management with first-run detection.
 *
 * IMPORTANT: This file must ONLY be loaded via dynamic import inside
 * isDesktop() guards. It is NEVER statically imported in browser code.
 */

import { signal } from '@preact/signals';
import { isDesktop } from '../../utils/platform';
import { login } from '../../auth/store';

const SETUP_COMPLETE_KEY = 'waiaas_setup_complete';

export interface WizardData {
  password: string;
  chain: 'solana' | 'ethereum' | 'base' | 'polygon' | 'arbitrum';
  walletName: string;
  walletId: string | null;
  skipOwner: boolean;
}

/** Current wizard step (1-5) */
export const wizardStep = signal<number>(1);

/** Whether the wizard has been completed */
export const wizardComplete = signal<boolean>(false);

/** Accumulated wizard user choices */
export const wizardData = signal<WizardData>({
  password: '',
  chain: 'ethereum',
  walletName: 'My Wallet',
  walletId: null,
  skipOwner: false,
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

/** Advance to the next step (max 5) */
export function nextStep(): void {
  if (wizardStep.value < 5) {
    wizardStep.value = wizardStep.value + 1;
  }
}

/** Go back to the previous step (min 1) */
export function prevStep(): void {
  if (wizardStep.value > 1) {
    wizardStep.value = wizardStep.value - 1;
  }
}

/** Complete the wizard: persist flag, auto-login, mark done */
export function completeWizard(): void {
  try {
    localStorage.setItem(SETUP_COMPLETE_KEY, 'true');
  } catch {
    // localStorage unavailable -- wizard will re-show on next launch
  }
  wizardComplete.value = true;
  login(wizardData.value.password);
}

/** Skip the Owner connection step (Step 4) */
export function skipOwnerStep(): void {
  wizardData.value = { ...wizardData.value, skipOwner: true };
  nextStep();
}
