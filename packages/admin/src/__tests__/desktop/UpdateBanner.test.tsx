/**
 * Tests for desktop/UpdateBanner.tsx -- auto-update UI component.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/preact';

// Mock update-checker module
const mockCheckForUpdate = vi.fn();
const mockInstallUpdate = vi.fn();
vi.mock('../../desktop/update-checker', () => ({
  checkForUpdate: () => mockCheckForUpdate(),
  installUpdate: (cb: any) => mockInstallUpdate(cb),
}));

import { UpdateBanner } from '../../desktop/UpdateBanner';

describe('UpdateBanner', () => {
  beforeEach(() => {
    mockCheckForUpdate.mockReset();
    mockInstallUpdate.mockReset();
  });

  it('should render nothing when no update is available', async () => {
    mockCheckForUpdate.mockResolvedValue(null);

    const { container } = render(<UpdateBanner />);
    // Wait for effect
    await waitFor(() => {
      expect(container.innerHTML).toBe('');
    });
  });

  it('should show banner when update is available', async () => {
    mockCheckForUpdate.mockResolvedValue({ version: '2.0.0' });

    render(<UpdateBanner />);

    await waitFor(() => {
      expect(screen.getByText(/New version 2\.0\.0 is available/)).toBeTruthy();
    });
    expect(screen.getByText('Update now')).toBeTruthy();
    expect(screen.getByText('Later')).toBeTruthy();
  });

  it('should dismiss banner when Later is clicked', async () => {
    mockCheckForUpdate.mockResolvedValue({ version: '2.0.0' });

    const { container } = render(<UpdateBanner />);

    await waitFor(() => {
      expect(screen.getByText('Later')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Later'));

    await waitFor(() => {
      expect(container.innerHTML).toBe('');
    });
  });

  it('should show downloading state with progress', async () => {
    mockCheckForUpdate.mockResolvedValue({ version: '2.0.0' });
    // installUpdate calls onProgress callback
    mockInstallUpdate.mockImplementation(async (onProgress: any) => {
      onProgress(50);
    });

    render(<UpdateBanner />);

    await waitFor(() => {
      expect(screen.getByText('Update now')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Update now'));
    });

    // After installUpdate resolves with status 'done'
    await waitFor(() => {
      expect(screen.getByText(/Update installed/)).toBeTruthy();
    });
  });

  it('should show downloading percentage during download', async () => {
    mockCheckForUpdate.mockResolvedValue({ version: '2.0.0' });
    let resolveInstall: () => void;
    mockInstallUpdate.mockImplementation(async (onProgress: any) => {
      onProgress(42);
      // Keep the promise pending to observe downloading state
      await new Promise<void>((r) => {
        resolveInstall = r;
      });
    });

    render(<UpdateBanner />);

    await waitFor(() => {
      expect(screen.getByText('Update now')).toBeTruthy();
    });

    // Click update -- don't await, we want to observe intermediate state
    act(() => {
      fireEvent.click(screen.getByText('Update now'));
    });

    await waitFor(() => {
      expect(screen.getByText(/Downloading update.*42%/)).toBeTruthy();
    });

    // Clean up
    resolveInstall!();
  });

  it('should revert to available state on install failure', async () => {
    mockCheckForUpdate.mockResolvedValue({ version: '2.0.0' });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockInstallUpdate.mockRejectedValue(new Error('Install failed'));

    render(<UpdateBanner />);

    await waitFor(() => {
      expect(screen.getByText('Update now')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Update now'));
    });

    await waitFor(() => {
      // Should revert to available state
      expect(screen.getByText(/New version 2\.0\.0/)).toBeTruthy();
      expect(screen.getByText('Update now')).toBeTruthy();
    });

    consoleSpy.mockRestore();
  });
});
