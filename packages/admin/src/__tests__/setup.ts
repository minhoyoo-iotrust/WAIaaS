import { vi, afterEach } from 'vitest';

// Mock location.hash for router tests
Object.defineProperty(window, 'location', {
  value: {
    ...window.location,
    hash: '#/login',
    assign: vi.fn(),
    replace: vi.fn(),
    reload: vi.fn(),
  },
  writable: true,
  configurable: true,
});

// Mock global fetch
globalThis.fetch = vi.fn();

// Clean up after each test
afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});
