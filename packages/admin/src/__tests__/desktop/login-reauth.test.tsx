/**
 * Issue 498: Desktop session timeout recovery.key re-authentication.
 *
 * When the Login component mounts inside a Tauri Desktop environment,
 * it should attempt to re-authenticate using the on-disk recovery.key
 * before showing the password form.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/preact';
import { h } from 'preact';

// We need to control isDesktop() and getDesktopRecoveryKey() per test.
// The Login component imports them at module scope, so we mock the module.
vi.mock('../../utils/platform', () => ({
  isDesktop: vi.fn(() => false),
  getDesktopRecoveryKey: vi.fn(async () => null),
}));

// Mock auth/store to track login() calls without side-effects
vi.mock('../../auth/store', () => ({
  login: vi.fn(),
  masterPassword: { value: null },
  isAuthenticated: { value: false },
}));

import { isDesktop, getDesktopRecoveryKey } from '../../utils/platform';
import { login } from '../../auth/store';

// Import Login lazily after mocks are in place
const { Login } = await import('../../auth/login');

const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;

describe('Login: Desktop recovery.key re-authentication (issue 498)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('should show password form immediately in browser (non-Desktop)', () => {
    vi.mocked(isDesktop).mockReturnValue(false);

    const { container } = render(<Login />);
    const input = container.querySelector('input[type="password"]');
    expect(input).toBeTruthy();
  });

  it('should show "Reconnecting..." while auto-login is in progress on Desktop', async () => {
    vi.mocked(isDesktop).mockReturnValue(true);
    // Make getDesktopRecoveryKey hang to keep the loading state visible
    vi.mocked(getDesktopRecoveryKey).mockImplementation(
      () => new Promise(() => {}), // never resolves
    );

    const { container } = render(<Login />);
    // Should show reconnecting state, not the password form
    await waitFor(() => {
      const text = container.textContent ?? '';
      expect(text).toContain('Reconnecting');
    });
    const input = container.querySelector('input[type="password"]');
    expect(input).toBeFalsy();
  });

  it('should auto-login when recovery.key is valid on Desktop', async () => {
    vi.mocked(isDesktop).mockReturnValue(true);
    vi.mocked(getDesktopRecoveryKey).mockResolvedValue('abc123recoverykey');
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ adminTimeout: 600 }),
    } as Response);

    render(<Login />);

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith('abc123recoverykey', 600);
    });
  });

  it('should fall through to password form when recovery.key is missing', async () => {
    vi.mocked(isDesktop).mockReturnValue(true);
    vi.mocked(getDesktopRecoveryKey).mockResolvedValue(null);

    const { container } = render(<Login />);

    await waitFor(() => {
      const input = container.querySelector('input[type="password"]');
      expect(input).toBeTruthy();
    });
  });

  it('should fall through to password form when daemon rejects recovery.key (401)', async () => {
    vi.mocked(isDesktop).mockReturnValue(true);
    vi.mocked(getDesktopRecoveryKey).mockResolvedValue('stale-key');
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
    } as Response);

    const { container } = render(<Login />);

    await waitFor(() => {
      const input = container.querySelector('input[type="password"]');
      expect(input).toBeTruthy();
    });
  });

  it('should fall through to password form when daemon is unreachable', async () => {
    vi.mocked(isDesktop).mockReturnValue(true);
    vi.mocked(getDesktopRecoveryKey).mockResolvedValue('abc123');
    mockFetch.mockRejectedValue(new Error('Network error'));

    const { container } = render(<Login />);

    await waitFor(() => {
      const input = container.querySelector('input[type="password"]');
      expect(input).toBeTruthy();
    });
  });
});
