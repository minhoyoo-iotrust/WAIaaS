/**
 * Custom vitest reporter for CI environments.
 *
 * Generates e2e-report.md with test results as a markdown table,
 * suitable for GitHub Actions Summary display.
 * Only writes the file when CI=true environment variable is set.
 */

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Reporter, File, Task } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface TestStats {
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  results: Array<{
    name: string;
    status: 'PASSED' | 'FAILED' | 'SKIPPED';
    duration: string;
    details: string;
  }>;
}

function collectStats(files: File[]): TestStats {
  const stats: TestStats = {
    passed: 0,
    failed: 0,
    skipped: 0,
    total: 0,
    results: [],
  };

  function processTask(task: Task): void {
    if (task.type === 'suite') {
      for (const child of task.tasks) {
        processTask(child);
      }
      return;
    }

    stats.total++;
    const duration = task.result?.duration
      ? (task.result.duration / 1000).toFixed(1) + 's'
      : '0.0s';

    if (task.result?.state === 'pass') {
      stats.passed++;
      stats.results.push({
        name: task.name,
        status: 'PASSED',
        duration,
        details: '',
      });
    } else if (task.result?.state === 'fail') {
      stats.failed++;
      const errorMsg = task.result.errors?.[0]?.message || 'Unknown error';
      stats.results.push({
        name: task.name,
        status: 'FAILED',
        duration,
        details: `Error: ${errorMsg.slice(0, 200)}`,
      });
    } else {
      stats.skipped++;
      stats.results.push({
        name: task.name,
        status: 'SKIPPED',
        duration,
        details: task.mode === 'skip' ? 'Skipped' : '',
      });
    }
  }

  for (const file of files) {
    for (const task of file.tasks) {
      processTask(task);
    }
  }

  return stats;
}

function generateMarkdown(stats: TestStats): string {
  const lines: string[] = [];

  lines.push(
    `Total: ${stats.total} | Passed: ${stats.passed} | Failed: ${stats.failed} | Skipped: ${stats.skipped}`,
  );
  lines.push('');
  lines.push('| Status | Test | Duration | Details |');
  lines.push('|--------|------|----------|---------|');

  for (const r of stats.results) {
    const escapedDetails = r.details.replace(/\|/g, '\\|');
    lines.push(`| ${r.status} | ${r.name} | ${r.duration} | ${escapedDetails} |`);
  }

  return lines.join('\n');
}

export default class CIReporter implements Reporter {
  onFinished(files?: File[]): void {
    if (process.env.CI !== 'true' || !files) {
      return;
    }

    const stats = collectStats(files);
    const markdown = generateMarkdown(stats);

    // Write to packages/e2e-tests/e2e-report.md
    const outputPath = join(__dirname, '..', '..', 'e2e-report.md');
    writeFileSync(outputPath, markdown, 'utf-8');
  }
}
