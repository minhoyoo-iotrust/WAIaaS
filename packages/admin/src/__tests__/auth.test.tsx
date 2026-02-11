import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/preact';
import { login, logout, masterPassword, isAuthenticated, adminTimeout } from '../auth/store';
import { Login } from '../auth/login';

// Reset auth state between tests
beforeEach(() => {
  masterPassword.value = null;
  adminTimeout.value = 900;
  window.location.hash = '#/login';
});

afterEach(() => {
  // Ensure clean state -- logout clears timer and signals
  if (masterPassword.value !== null) {
    logout();
  }
});

describe('Auth store: login', () => {
  it('should set masterPassword, isAuthenticated, adminTimeout, and navigate to dashboard', () => {
    login('test-password', 600);

    expect(masterPassword.value).toBe('test-password');
    expect(isAuthenticated.value).toBe(true);
    expect(adminTimeout.value).toBe(600);
    expect(window.location.hash).toBe('#/dashboard');
  });
});

describe('Auth store: login failure (Login component)', () => {
  it('should show error message on 401 and not authenticate', async () => {
    // Mock fetch to return 401
    const mockFetch = vi.fn().mockResolvedValue({
      status: 401,
      ok: false,
    });
    globalThis.fetch = mockFetch;

    render(<Login />);

    const input = screen.getByPlaceholderText('Master password');
    const button = screen.getByRole('button', { name: /sign in/i });

    // Type password
    fireEvent.input(input, { target: { value: 'wrong-password' } });

    // Submit form
    fireEvent.click(button);

    // Wait for error message
    await waitFor(() => {
      expect(screen.getByText('Invalid master password')).toBeTruthy();
    });

    // Should NOT be authenticated
    expect(masterPassword.value).toBeNull();
    expect(isAuthenticated.value).toBe(false);
  });
});

describe('Auth store: inactivity timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should logout after adminTimeout seconds of inactivity', () => {
    login('test-pw', 5); // 5 second timeout

    expect(isAuthenticated.value).toBe(true);

    // Advance timers by 5 seconds (5000ms)
    vi.advanceTimersByTime(5000);

    // Should be logged out
    expect(masterPassword.value).toBeNull();
    expect(isAuthenticated.value).toBe(false);
    expect(window.location.hash).toBe('#/login');
  });
});

describe('Auth store: logout', () => {
  it('should clear masterPassword, isAuthenticated, and redirect to login', () => {
    login('test-pw');

    expect(isAuthenticated.value).toBe(true);

    logout();

    expect(masterPassword.value).toBeNull();
    expect(isAuthenticated.value).toBe(false);
    expect(window.location.hash).toBe('#/login');
  });
});
