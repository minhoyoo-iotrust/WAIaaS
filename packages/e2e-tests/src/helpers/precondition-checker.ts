/**
 * PreconditionChecker — Verify onchain E2E prerequisites.
 *
 * Checks daemon connectivity, wallet existence by chain, and
 * network-specific native balances before running onchain tests.
 * Supports network/protocol filtering via NetworkFilter.
 */

import { E2EHttpClient } from './http-client.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Individual check result. */
export interface CheckResult {
  name: string;
  passed: boolean;
  required: string;
  actual: string;
  message: string;
}

/** Aggregated precondition report. */
export interface PreconditionReport {
  allPassed: boolean;
  checks: CheckResult[];
  summary: string;
}

/** Filter options for network/protocol selection. */
export interface NetworkFilter {
  networks?: string[];
  protocols?: string[];
}

/** Minimum balance requirement for a network. */
interface OnchainRequirement {
  network: string;
  chain: string;
  minBalance: string;
  symbol: string;
  decimals: number;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** Default minimum balance requirements per network. */
const DEFAULT_REQUIREMENTS: OnchainRequirement[] = [
  { network: 'ethereum-sepolia', chain: 'ethereum', minBalance: '10000000000000000', symbol: 'ETH', decimals: 18 },
  { network: 'solana-devnet', chain: 'solana', minBalance: '500000000', symbol: 'SOL', decimals: 9 },
  { network: 'polygon-amoy', chain: 'ethereum', minBalance: '10000000000000000', symbol: 'POL', decimals: 18 },
  { network: 'arbitrum-sepolia', chain: 'ethereum', minBalance: '10000000000000000', symbol: 'ETH', decimals: 18 },
  { network: 'optimism-sepolia', chain: 'ethereum', minBalance: '10000000000000000', symbol: 'ETH', decimals: 18 },
  { network: 'base-sepolia', chain: 'ethereum', minBalance: '10000000000000000', symbol: 'ETH', decimals: 18 },
  { network: 'hyperevm-testnet', chain: 'ethereum', minBalance: '10000000000000000', symbol: 'HYPE', decimals: 18 },
];

/** Protocol -> required networks mapping. */
const PROTOCOL_NETWORK_MAP: Record<string, string[]> = {
  transfer: ['ethereum-sepolia', 'solana-devnet', 'polygon-amoy', 'arbitrum-sepolia', 'optimism-sepolia', 'base-sepolia', 'hyperevm-testnet'],
  swap: ['ethereum-sepolia'],
  bridge: ['ethereum-sepolia'],
  staking: ['ethereum-sepolia'],
  lending: ['ethereum-sepolia'],
  nft: ['ethereum-sepolia', 'solana-devnet'],
  perp: ['ethereum-sepolia'],
  yield: ['ethereum-sepolia'],
};

/* ------------------------------------------------------------------ */
/*  PreconditionChecker                                                */
/* ------------------------------------------------------------------ */

export class PreconditionChecker {
  private http: E2EHttpClient;
  private masterPassword: string;
  private baseUrl: string;

  constructor(baseUrl: string, masterPassword: string) {
    this.baseUrl = baseUrl;
    this.http = new E2EHttpClient(baseUrl);
    this.masterPassword = masterPassword;
  }

  /**
   * Check daemon connectivity via /health.
   */
  async checkDaemon(): Promise<CheckResult> {
    try {
      const { status } = await this.http.get('/health');
      if (status === 200) {
        return {
          name: 'daemon-health',
          passed: true,
          required: 'running',
          actual: 'running',
          message: 'Daemon is running',
        };
      }
      return {
        name: 'daemon-health',
        passed: false,
        required: 'running',
        actual: `HTTP ${status}`,
        message: `Daemon returned HTTP ${status}`,
      };
    } catch (err) {
      return {
        name: 'daemon-health',
        passed: false,
        required: 'running',
        actual: 'unreachable',
        message: `Daemon unreachable: ${(err as Error).message}`,
      };
    }
  }

  /**
   * Check wallet existence by chain type.
   * Uses GET /v1/wallets with X-Master-Password.
   */
  async checkWallets(requiredChains: string[]): Promise<CheckResult[]> {
    const results: CheckResult[] = [];

    try {
      const { status, body } = await this.http.get<{ items: Array<{ id: string; chain: string }> }>(
        '/v1/wallets',
        { headers: { 'X-Master-Password': this.masterPassword } },
      );

      if (status !== 200) {
        return requiredChains.map((chain) => ({
          name: `wallet-${chain}`,
          passed: false,
          required: `${chain} wallet`,
          actual: `API error ${status}`,
          message: `Failed to list wallets: HTTP ${status}`,
        }));
      }

      const walletsByChain = new Map<string, string>();
      for (const w of body.items) {
        if (!walletsByChain.has(w.chain)) {
          walletsByChain.set(w.chain, w.id);
        }
      }

      for (const chain of requiredChains) {
        const walletId = walletsByChain.get(chain);
        results.push({
          name: `wallet-${chain}`,
          passed: !!walletId,
          required: `${chain} wallet`,
          actual: walletId ? `found (${walletId.slice(0, 8)}...)` : 'not found',
          message: walletId
            ? `${chain} wallet exists`
            : `No ${chain} wallet found. Create one with POST /v1/wallets`,
        });
      }
    } catch (err) {
      return requiredChains.map((chain) => ({
        name: `wallet-${chain}`,
        passed: false,
        required: `${chain} wallet`,
        actual: 'error',
        message: `Failed to check wallets: ${(err as Error).message}`,
      }));
    }

    return results;
  }

  /**
   * Check native balance for a wallet on a specific network.
   * Creates a temporary session for the wallet to call the balance API.
   * The balance endpoint uses session-resolved walletId (no query param needed).
   */
  async checkBalance(walletId: string, minBalance: string, network: string): Promise<CheckResult> {
    try {
      // Balance endpoint requires session auth — create a temporary session
      const sessionRes = await this.http.post<{ id: string; token: string }>(
        '/v1/sessions',
        { walletId },
        { headers: { 'X-Master-Password': this.masterPassword } },
      );

      if (sessionRes.status !== 201) {
        return {
          name: `balance-${network}`,
          passed: false,
          required: minBalance,
          actual: 'no session',
          message: `Failed to create session for balance check: HTTP ${sessionRes.status}`,
        };
      }

      const sessionClient = new E2EHttpClient(this.baseUrl, sessionRes.body.token);

      const { status, body } = await sessionClient.get<{
        balance: string;
        decimals: number;
        symbol: string;
      }>(`/v1/wallet/balance?network=${encodeURIComponent(network)}`);

      // Clean up: delete the temporary session
      await this.http.delete(`/v1/sessions/${sessionRes.body.id}`, {
        headers: { 'X-Master-Password': this.masterPassword },
      }).catch(() => {});

      if (status !== 200) {
        return {
          name: `balance-${network}`,
          passed: false,
          required: minBalance,
          actual: 'unknown',
          message: `Failed to get balance: HTTP ${status}`,
        };
      }

      const actualBigInt = BigInt(body.balance);
      const requiredBigInt = BigInt(minBalance);
      const passed = actualBigInt >= requiredBigInt;
      const symbol = body.symbol ?? network.toUpperCase();
      const decimals = body.decimals ?? 18;
      const actualFormatted = formatBalance(body.balance, decimals, symbol);
      const requiredFormatted = formatBalance(minBalance, decimals, symbol);

      return {
        name: `balance-${network}`,
        passed,
        required: requiredFormatted,
        actual: actualFormatted,
        message: passed
          ? `Sufficient balance on ${network}`
          : `Insufficient balance on ${network}: have ${actualFormatted}, need ${requiredFormatted}`,
      };
    } catch (err) {
      return {
        name: `balance-${network}`,
        passed: false,
        required: minBalance,
        actual: 'error',
        message: `Failed to check balance on ${network}: ${(err as Error).message}`,
      };
    }
  }

  /**
   * Run all precondition checks in sequence: daemon -> wallets -> balances.
   * Skips wallet/balance checks if daemon is unreachable.
   */
  async runAll(filter?: NetworkFilter): Promise<PreconditionReport> {
    const checks: CheckResult[] = [];

    // 1. Daemon health
    const daemonResult = await this.checkDaemon();
    checks.push(daemonResult);

    if (!daemonResult.passed) {
      return {
        allPassed: false,
        checks,
        summary: 'Daemon is not reachable. Skipped wallet and balance checks.',
      };
    }

    // 2. Determine which requirements to check based on filter
    let requirements = [...DEFAULT_REQUIREMENTS];

    if (filter?.protocols && filter.protocols.length > 0) {
      const requiredNetworks = new Set<string>();
      for (const proto of filter.protocols) {
        const nets = PROTOCOL_NETWORK_MAP[proto];
        if (nets) nets.forEach((n) => requiredNetworks.add(n));
      }
      requirements = requirements.filter((r) => requiredNetworks.has(r.network));
    }

    if (filter?.networks && filter.networks.length > 0) {
      const networkSet = new Set(filter.networks);
      requirements = requirements.filter((r) => networkSet.has(r.network));
    }

    // 3. Check wallets by chain
    const requiredChains = [...new Set(requirements.map((r) => r.chain))];
    const walletResults = await this.checkWallets(requiredChains);
    checks.push(...walletResults);

    // Build chain -> walletId map for balance checks
    const { body: walletListBody } = await this.http.get<{
      items: Array<{ id: string; chain: string }>;
    }>('/v1/wallets', { headers: { 'X-Master-Password': this.masterPassword } });

    const walletByChain = new Map<string, string>();
    for (const w of walletListBody.items) {
      if (!walletByChain.has(w.chain)) {
        walletByChain.set(w.chain, w.id);
      }
    }

    // 4. Check balances (only for chains that have wallets)
    for (const req of requirements) {
      const walletId = walletByChain.get(req.chain);
      if (!walletId) continue; // wallet check already failed above
      const balanceResult = await this.checkBalance(walletId, req.minBalance, req.network);
      checks.push(balanceResult);
    }

    const passed = checks.filter((c) => c.passed).length;
    const total = checks.length;
    const allPassed = checks.every((c) => c.passed);

    return {
      allPassed,
      checks,
      summary: `${passed}/${total} checks passed`,
    };
  }

  /**
   * Generate a human-readable text report from precondition results.
   */
  generateReport(report: PreconditionReport): string {
    const lines: string[] = [];
    lines.push('=== Onchain E2E Precondition Report ===');
    lines.push('');

    for (const check of report.checks) {
      const marker = check.passed ? '[PASS]' : '[FAIL]';
      lines.push(`${marker} ${check.name}`);
      if (!check.passed) {
        lines.push(`       Required: ${check.required}`);
        lines.push(`       Actual:   ${check.actual}`);
        lines.push(`       ${check.message}`);
      }
    }

    lines.push('');
    lines.push(`Summary: ${report.summary}`);

    if (!report.allPassed) {
      lines.push('');
      lines.push('Some preconditions are not met. Fund the wallets or create missing wallets before running onchain tests.');
    }

    return lines.join('\n');
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Format a raw balance string (wei/lamports) to human-readable. */
function formatBalance(raw: string, decimals: number, symbol: string): string {
  const bigVal = BigInt(raw);
  const divisor = BigInt(10 ** decimals);
  const whole = bigVal / divisor;
  const frac = bigVal % divisor;
  const fracStr = frac.toString().padStart(decimals, '0').slice(0, 4);
  return `${whole}.${fracStr} ${symbol}`;
}
