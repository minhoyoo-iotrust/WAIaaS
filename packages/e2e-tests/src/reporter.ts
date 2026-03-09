/**
 * E2E Test Reporter
 *
 * Records scenario results and generates text/markdown summaries
 * for console output and GitHub Actions.
 */

import type { ScenarioResult } from './types.js';

/**
 * E2EReporter collects scenario results and generates summary reports.
 */
export class E2EReporter {
  private results: ScenarioResult[] = [];

  /** Record a scenario result. */
  record(result: ScenarioResult): void {
    this.results.push(result);
  }

  /** Number of passed scenarios. */
  get passed(): number {
    return this.results.filter((r) => r.status === 'passed').length;
  }

  /** Number of failed scenarios. */
  get failed(): number {
    return this.results.filter((r) => r.status === 'failed').length;
  }

  /** Number of skipped scenarios. */
  get skipped(): number {
    return this.results.filter((r) => r.status === 'skipped').length;
  }

  /** Total number of recorded results. */
  get total(): number {
    return this.results.length;
  }

  /** All recorded results. */
  get allResults(): ScenarioResult[] {
    return [...this.results];
  }

  /**
   * Generate a text summary.
   *
   * Format:
   * ```
   * === E2E Test Report ===
   * Total: 10 | Passed: 8 | Failed: 1 | Skipped: 1
   *
   * [PASS] auth-session-crud (1.2s)
   * [FAIL] wallet-create (0.8s) - Error: ...
   * [SKIP] onchain-transfer (0.0s) - Reason: insufficient balance
   * ```
   */
  summary(): string {
    const lines: string[] = [];
    lines.push('=== E2E Test Report ===');
    lines.push(
      `Total: ${this.total} | Passed: ${this.passed} | Failed: ${this.failed} | Skipped: ${this.skipped}`,
    );
    lines.push('');

    for (const r of this.results) {
      const duration = (r.durationMs / 1000).toFixed(1);
      const tag = r.status === 'passed' ? 'PASS' : r.status === 'failed' ? 'FAIL' : 'SKIP';
      let line = `[${tag}] ${r.scenario.id} (${duration}s)`;
      if (r.status === 'failed' && r.error) {
        line += ` - Error: ${r.error}`;
      }
      if (r.status === 'skipped' && r.skipReason) {
        line += ` - Reason: ${r.skipReason}`;
      }
      lines.push(line);
    }

    return lines.join('\n');
  }

  /**
   * Generate a markdown summary table for GitHub Actions.
   *
   * Format:
   * ```
   * | Status | Scenario | Duration | Details |
   * |--------|----------|----------|---------|
   * | PASS | auth-session-crud | 1.2s | |
   * | FAIL | wallet-create | 0.8s | Error: ... |
   * ```
   */
  markdownSummary(): string {
    const lines: string[] = [];
    lines.push('| Status | Scenario | Duration | Details |');
    lines.push('|--------|----------|----------|---------|');

    for (const r of this.results) {
      const duration = (r.durationMs / 1000).toFixed(1);
      const status = r.status.toUpperCase();
      let details = '';
      if (r.status === 'failed' && r.error) {
        details = `Error: ${r.error}`;
      }
      if (r.status === 'skipped' && r.skipReason) {
        details = `Skip: ${r.skipReason}`;
      }
      lines.push(`| ${status} | ${r.scenario.id} | ${duration}s | ${details} |`);
    }

    return lines.join('\n');
  }
}
