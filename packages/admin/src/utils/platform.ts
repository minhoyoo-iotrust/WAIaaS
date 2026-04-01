/**
 * Desktop environment detection utility.
 *
 * Uses Tauri's injected __TAURI_INTERNALS__ global to determine
 * if the app is running inside a Tauri WebView (Desktop) vs browser.
 *
 * Result is cached after first check for performance.
 */

let _isDesktop: boolean | null = null;

export function isDesktop(): boolean {
  if (_isDesktop === null) {
    _isDesktop =
      typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  }
  return _isDesktop;
}
