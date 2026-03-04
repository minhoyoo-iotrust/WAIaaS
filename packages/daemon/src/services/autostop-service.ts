/**
 * Backward-compatible re-export barrel for AutoStopService.
 *
 * The actual implementation has been moved to:
 *   - services/autostop/autostop-service.ts
 *
 * @deprecated Import from './autostop/autostop-service.js' directly.
 */

export { AutoStopService, DEFAULT_AUTOSTOP_CONFIG } from './autostop/autostop-service.js';
export type { AutoStopConfig } from './autostop/autostop-service.js';
