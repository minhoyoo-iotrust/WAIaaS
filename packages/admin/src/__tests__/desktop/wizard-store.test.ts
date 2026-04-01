/**
 * Tests for desktop/wizard/wizard-store.ts -- setup wizard state management.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock isDesktop
const mockIsDesktop = vi.fn<() => boolean>();
vi.mock('../../utils/platform', () => ({
  isDesktop: () => mockIsDesktop(),
}));

// Mock login from auth store
const mockLogin = vi.fn();
vi.mock('../../auth/store', () => ({
  login: (...args: any[]) => mockLogin(...args),
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
    mockLogin.mockReset();
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

    it('should advance step up to 5', () => {
      wizardStep.value = 4;
      nextStep();
      expect(wizardStep.value).toBe(5);
    });

    it('should not advance past step 5', () => {
      wizardStep.value = 5;
      nextStep();
      expect(wizardStep.value).toBe(5);
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
    it('should persist setup flag, mark complete, and login', () => {
      wizardData.value = { ...wizardData.value, password: 'test-pass' };
      completeWizard();

      expect(localStorage.getItem('waiaas_setup_complete')).toBe('true');
      expect(wizardComplete.value).toBe(true);
      expect(mockLogin).toHaveBeenCalledWith('test-pass');
    });

    it('should still complete even when localStorage throws', () => {
      wizardData.value = { ...wizardData.value, password: 'test-pass' };
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceeded');
      });

      completeWizard();
      expect(wizardComplete.value).toBe(true);
      expect(mockLogin).toHaveBeenCalledWith('test-pass');

      vi.restoreAllMocks();
    });
  });

  describe('skipOwnerStep', () => {
    it('should set skipOwner to true and advance step', () => {
      wizardStep.value = 4;
      skipOwnerStep();
      expect(wizardData.value.skipOwner).toBe(true);
      expect(wizardStep.value).toBe(5);
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
