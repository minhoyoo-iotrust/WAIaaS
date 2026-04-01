/**
 * Tests for desktop/update-checker.ts -- Tauri updater integration.
 *
 * Mocks isDesktop() and @tauri-apps/plugin-updater.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock isDesktop
const mockIsDesktop = vi.fn<() => boolean>();
vi.mock('../../utils/platform', () => ({
  isDesktop: () => mockIsDesktop(),
}));

// Mock the Tauri updater plugin
const mockCheck = vi.fn();
vi.mock('@tauri-apps/plugin-updater', () => ({
  check: () => mockCheck(),
}));

// Must import after mocks
import { checkForUpdate, installUpdate } from '../../desktop/update-checker';

describe('update-checker', () => {
  beforeEach(() => {
    mockIsDesktop.mockReset();
    mockCheck.mockReset();
  });

  // installUpdate tests FIRST -- before any checkForUpdate test sets cachedUpdate
  describe('installUpdate', () => {
    it('should throw when no update cached', async () => {
      // Module just loaded, cachedUpdate is null
      await expect(installUpdate()).rejects.toThrow('No update available');
    });

    it('should download and install with progress', async () => {
      mockIsDesktop.mockReturnValue(true);
      const mockDownloadAndInstall = vi.fn().mockImplementation(async (callback: any) => {
        callback({ event: 'Started', data: { contentLength: 1000 } });
        callback({ event: 'Progress', data: { chunkLength: 500 } });
        callback({ event: 'Progress', data: { chunkLength: 500 } });
        callback({ event: 'Finished', data: {} });
      });
      mockCheck.mockResolvedValue({
        version: '2.0.0',
        date: '2026-03-15',
        body: 'New features',
        downloadAndInstall: mockDownloadAndInstall,
      });

      // Cache the update
      await checkForUpdate();

      const progressValues: number[] = [];
      await installUpdate((p) => progressValues.push(p));

      expect(mockDownloadAndInstall).toHaveBeenCalled();
      expect(progressValues).toContain(50); // 500/1000
      expect(progressValues).toContain(100); // Finished
    });

    it('should handle Started event with no contentLength', async () => {
      mockIsDesktop.mockReturnValue(true);
      const mockDownloadAndInstall = vi.fn().mockImplementation(async (callback: any) => {
        callback({ event: 'Started', data: {} }); // no contentLength
        callback({ event: 'Progress', data: { chunkLength: 500 } });
        callback({ event: 'Finished', data: {} });
      });
      mockCheck.mockResolvedValue({
        version: '2.0.0',
        downloadAndInstall: mockDownloadAndInstall,
      });

      await checkForUpdate();

      const progressValues: number[] = [];
      await installUpdate((p) => progressValues.push(p));

      // contentLength is 0, so Progress won't call onProgress (denominator is 0)
      // Only Finished calls onProgress(100)
      expect(progressValues).toContain(100);
    });

    it('should work without onProgress callback', async () => {
      mockIsDesktop.mockReturnValue(true);
      const mockDownloadAndInstall = vi.fn().mockImplementation(async (callback: any) => {
        callback({ event: 'Started', data: { contentLength: 100 } });
        callback({ event: 'Progress', data: { chunkLength: 100 } });
        callback({ event: 'Finished', data: {} });
      });
      mockCheck.mockResolvedValue({
        version: '2.0.0',
        downloadAndInstall: mockDownloadAndInstall,
      });

      await checkForUpdate();

      // Should not throw when onProgress is undefined
      await expect(installUpdate()).resolves.toBeUndefined();
    });
  });

  describe('checkForUpdate', () => {
    it('should return null when not desktop', async () => {
      mockIsDesktop.mockReturnValue(false);
      const result = await checkForUpdate();
      expect(result).toBeNull();
      expect(mockCheck).not.toHaveBeenCalled();
    });

    it('should return update info when update available', async () => {
      mockIsDesktop.mockReturnValue(true);
      mockCheck.mockResolvedValue({
        version: '2.0.0',
        date: '2026-03-15',
        body: 'New features',
      });

      const result = await checkForUpdate();
      expect(result).toEqual({
        version: '2.0.0',
        date: '2026-03-15',
        body: 'New features',
      });
    });

    it('should return null when no update available', async () => {
      mockIsDesktop.mockReturnValue(true);
      mockCheck.mockResolvedValue(null);

      const result = await checkForUpdate();
      expect(result).toBeNull();
    });

    it('should return null and log error when check fails', async () => {
      mockIsDesktop.mockReturnValue(true);
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockCheck.mockRejectedValue(new Error('Network error'));

      const result = await checkForUpdate();
      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        '[updater] check failed:',
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });
  });
});
