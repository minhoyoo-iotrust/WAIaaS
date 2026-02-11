import { signal, computed } from '@preact/signals';

/** Stores the plaintext master password for X-Master-Password header injection */
export const masterPassword = signal<string | null>(null);

/** Derived boolean indicating whether the user is authenticated */
export const isAuthenticated = computed(() => masterPassword.value !== null);

/** Inactivity timeout in seconds, updated from server on login success */
export const adminTimeout = signal<number>(900);

/** When true, renders shutdown overlay with highest priority */
export const daemonShutdown = signal<boolean>(false);

let inactivityTimer: ReturnType<typeof setTimeout> | null = null;

const activityHandler = () => {
  resetInactivityTimer();
};

function startInactivityTracking(): void {
  document.addEventListener('mousemove', activityHandler, { passive: true });
  document.addEventListener('keydown', activityHandler, { passive: true });
  document.addEventListener('click', activityHandler, { passive: true });
  resetInactivityTimer();
}

function stopInactivityTracking(): void {
  document.removeEventListener('mousemove', activityHandler);
  document.removeEventListener('keydown', activityHandler);
  document.removeEventListener('click', activityHandler);
  if (inactivityTimer !== null) {
    clearTimeout(inactivityTimer);
    inactivityTimer = null;
  }
}

/** Reset the inactivity timer. Called on every successful API request and user activity. */
export function resetInactivityTimer(): void {
  if (inactivityTimer !== null) {
    clearTimeout(inactivityTimer);
  }
  inactivityTimer = setTimeout(() => {
    logout();
  }, adminTimeout.value * 1000);
}

/** Authenticate with the given password. Optionally set server-provided timeout. */
export function login(password: string, serverTimeout?: number): void {
  masterPassword.value = password;
  if (serverTimeout !== undefined) {
    adminTimeout.value = serverTimeout;
  }
  startInactivityTracking();
  location.hash = '#/dashboard';
}

/** Clear authentication state and redirect to login. */
export function logout(): void {
  masterPassword.value = null;
  stopInactivityTracking();
  location.hash = '#/login';
}
