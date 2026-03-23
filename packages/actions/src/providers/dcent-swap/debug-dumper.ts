/**
 * DCent API debug dumper for UAT failure analysis.
 *
 * Collects HTTP request/response pairs from DCent Swap API calls
 * and writes them as timestamped JSON files to a dump directory.
 * Designed for sharing with the DCent team when UAT scenarios fail.
 *
 * Activation: WAIAAS_ACTIONS_DCENT_SWAP_DEBUG_DUMP_DIR env var
 * or DcentSwapConfig.debugDumpDir setting.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface DcentApiCallRecord {
  seq: number;
  timestamp: string;
  method: string;
  url: string;
  request: unknown;
  response?: unknown;
  status?: number;
  error?: string;
  duration_ms: number;
}

export interface DcentDebugDumpFile {
  timestamp: string;
  daemon_version: string;
  api_base_url: string;
  calls: DcentApiCallRecord[];
}

/**
 * Mask sensitive headers (API keys, authorization tokens).
 */
function maskHeaders(headers: Record<string, string>): Record<string, string> {
  const masked: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    const lower = k.toLowerCase();
    if (lower.includes('key') || lower.includes('auth') || lower.includes('token') || lower.includes('secret')) {
      masked[k] = v.length > 8 ? `${v.slice(0, 4)}...${v.slice(-4)}` : '****';
    } else {
      masked[k] = v;
    }
  }
  return masked;
}

export class DcentDebugDumper {
  private calls: DcentApiCallRecord[] = [];
  private seq = 0;
  private readonly sessionFile: string;

  constructor(
    dumpDir: string,
    private readonly apiBaseUrl: string,
  ) {
    mkdirSync(dumpDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    this.sessionFile = join(dumpDir, `dcent-session-${ts}.json`);
  }

  /**
   * Record an API call (success or failure).
   */
  record(entry: Omit<DcentApiCallRecord, 'seq' | 'timestamp'>): void {
    this.calls.push({
      seq: ++this.seq,
      timestamp: new Date().toISOString(),
      ...entry,
    });
    // Auto-flush on every call to prevent data loss on crash
    this.flush();
  }

  /**
   * Write all collected calls to the session JSON file.
   */
  flush(): void {
    if (this.calls.length === 0) return;
    const dump: DcentDebugDumpFile = {
      timestamp: new Date().toISOString(),
      daemon_version: process.env.npm_package_version ?? 'unknown',
      api_base_url: this.apiBaseUrl,
      calls: this.calls,
    };
    writeFileSync(this.sessionFile, JSON.stringify(dump, null, 2));
  }

  /** Mask sensitive values in headers for safe sharing. */
  static maskHeaders = maskHeaders;

  get callCount(): number {
    return this.calls.length;
  }

  get filePath(): string {
    return this.sessionFile;
  }
}
