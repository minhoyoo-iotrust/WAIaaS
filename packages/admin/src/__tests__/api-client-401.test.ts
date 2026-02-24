/**
 * api-client-401.test.ts
 *
 * Tests for #171: apiCall global 401 handler should only trigger logout
 * for /v1/admin/* endpoints, not for non-admin endpoints.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockLogout = vi.fn();
const mockResetInactivityTimer = vi.fn();

vi.mock('../auth/store', () => ({
  masterPassword: { value: 'test-pw' },
  logout: mockLogout,
  resetInactivityTimer: mockResetInactivityTimer,
}));

// Must import after mocks are set up
const { apiCall, ApiError } = await import('../api/client');

describe('apiCall 401 handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls logout() on 401 from /v1/admin/* endpoint', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 401 }),
    );

    await expect(apiCall('/v1/admin/settings')).rejects.toThrow(ApiError);
    expect(mockLogout).toHaveBeenCalledOnce();
  });

  it('calls logout() on 401 from /v1/admin/status endpoint', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 401 }),
    );

    await expect(apiCall('/v1/admin/status')).rejects.toThrow(ApiError);
    expect(mockLogout).toHaveBeenCalledOnce();
  });

  it('does NOT call logout() on 401 from /v1/actions/* endpoint', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 401 }),
    );

    await expect(apiCall('/v1/actions/providers')).rejects.toThrow(ApiError);
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('does NOT call logout() on 401 from /v1/wallets/* endpoint', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 401 }),
    );

    await expect(apiCall('/v1/wallets/abc')).rejects.toThrow(ApiError);
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('does NOT call logout() on 401 from /v1/sessions/* endpoint', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 401 }),
    );

    await expect(apiCall('/v1/sessions/abc')).rejects.toThrow(ApiError);
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('throws ApiError with UNAUTHORIZED code on any 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 401 }),
    );

    try {
      await apiCall('/v1/actions/providers');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as InstanceType<typeof ApiError>;
      expect(apiErr.status).toBe(401);
      expect(apiErr.code).toBe('UNAUTHORIZED');
    }
  });
});
