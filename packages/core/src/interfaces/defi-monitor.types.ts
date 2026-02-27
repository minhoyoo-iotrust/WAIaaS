/**
 * DeFi Monitor types and interfaces.
 *
 * IDeFiMonitor defines the contract for pluggable monitors (health factor, margin, etc.)
 * that the DeFiMonitorService orchestrator manages.
 *
 * Design source: m29-00 design doc section 9.1.
 * @see LEND-04
 */

// ---------------------------------------------------------------------------
// Severity levels
// ---------------------------------------------------------------------------

export type MonitorSeverity = 'SAFE' | 'WARNING' | 'DANGER' | 'CRITICAL';

// ---------------------------------------------------------------------------
// Monitor evaluation result (one per position)
// ---------------------------------------------------------------------------

export interface MonitorEvaluation {
  walletId: string;
  positionId: string;
  severity: MonitorSeverity;
  value: number; // e.g., health factor numeric value
  threshold: number; // threshold that triggered this severity
  provider: string; // lending provider name
}

// ---------------------------------------------------------------------------
// IDeFiMonitor interface
// ---------------------------------------------------------------------------

/**
 * Pluggable DeFi monitor contract.
 *
 * Each monitor implementation (HealthFactorMonitor, MarginMonitor, etc.)
 * is registered with DeFiMonitorService and started/stopped as a unit.
 */
export interface IDeFiMonitor {
  readonly name: string;
  start(): void;
  stop(): void;
  updateConfig?(config: Record<string, unknown>): void;
}
