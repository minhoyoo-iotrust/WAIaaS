/**
 * Tests for desktop/wizard/wizard-store.ts -- setup wizard state management.
 *
 * Issue 491: the wizard no longer owns authentication. Desktop first-run
 * auto-logs in via the bootstrap recovery.key (in app.tsx), so the wizard
 * only covers Chain/Wallet/Owner/Complete. completeWizard() no longer calls
 * login().
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock isDesktop
const mockIsDesktop = vi.fn<() => boolean>();
vi.mock('../../utils/platform', () => ({
  isDesktop: () => mockIsDesktop(),
}));

import {
  wizardStep,
  wizardComplete,
  wizardData,
  isFirstRun,
  nextStep,
  prevStep,
  completeWizard,
  skipOwnerStep,
} from '../../desktop/wizard/wizard-store';

describe('wizard-store', () => {
  beforeEach(() => {
    // Reset signals
    wizardStep.value = 1;
    wizardComplete.value = false;
    wizardData.value = {
      password: '',
      chain: 'ethereum',
      walletName: 'My Wallet',
      walletId: null,
      skipOwner: false,
    };
    mockIsDesktop.mockReset();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('isFirstRun', () => {
    it('should return false when not desktop', () => {
      mockIsDesktop.mockReturnValue(false);
      expect(isFirstRun()).toBe(false);
    });

    it('should return true on desktop when setup not complete', () => {
      mockIsDesktop.mockReturnValue(true);
      expect(isFirstRun()).toBe(true);
    });

    it('should return false on desktop when setup is complete', () => {
      mockIsDesktop.mockReturnValue(true);
      localStorage.setItem('waiaas_setup_complete', 'true');
      expect(isFirstRun()).toBe(false);
    });

    it('should return false when localStorage throws', () => {
      mockIsDesktop.mockReturnValue(true);
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });
      expect(isFirstRun()).toBe(false);
      vi.restoreAllMocks();
    });
  });

  describe('nextStep', () => {
    it('should advance step from 1 to 2', () => {
      wizardStep.value = 1;
      nextStep();
      expect(wizardStep.value).toBe(2);
    });

    it('should advance step up to 4', () => {
      wizardStep.value = 3;
      nextStep();
      expect(wizardStep.value).toBe(4);
    });

    it('should not advance past step 4', () => {
      wizardStep.value = 4;
      nextStep();
      expect(wizardStep.value).toBe(4);
    });
  });

  describe('prevStep', () => {
    it('should go back from 3 to 2', () => {
      wizardStep.value = 3;
      prevStep();
      expect(wizardStep.value).toBe(2);
    });

    it('should not go below step 1', () => {
      wizardStep.value = 1;
      prevStep();
      expect(wizardStep.value).toBe(1);
    });
  });

  describe('completeWizard', () => {
    it('should persist setup flag and mark complete', () => {
      completeWizard();

      expect(localStorage.getItem('waiaas_setup_complete')).toBe('true');
      expect(wizardComplete.value).toBe(true);
    });

    it('should still complete even when localStorage throws', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceeded');
      });

      completeWizard();
      expect(wizardComplete.value).toBe(true);

      vi.restoreAllMocks();
    });
  });

  describe('skipOwnerStep', () => {
    it('should set skipOwner to true and advance step', () => {
      wizardStep.value = 3;
      skipOwnerStep();
      expect(wizardData.value.skipOwner).toBe(true);
      expect(wizardStep.value).toBe(4);
    });
  });

  describe('wizardData defaults', () => {
    it('should have correct initial values', () => {
      expect(wizardData.value.password).toBe('');
      expect(wizardData.value.chain).toBe('ethereum');
      expect(wizardData.value.walletName).toBe('My Wallet');
      expect(wizardData.value.walletId).toBeNull();
      expect(wizardData.value.skipOwner).toBe(false);
    });
  });
});
