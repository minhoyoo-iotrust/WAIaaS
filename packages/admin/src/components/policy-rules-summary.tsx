import { Badge } from './form';

function formatNumber(value: string | number): string {
  const num = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(num)) return String(value);
  return num.toLocaleString('en-US');
}

function humanWindow(seconds: number): string {
  if (seconds === 86400) return '1d';
  if (seconds % 86400 === 0) return `${seconds / 86400}d`;
  if (seconds === 3600) return '1h';
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds === 60) return '1m';
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatDays(days: number[]): string {
  if (!days || days.length === 0) return '';
  const sorted = [...days].sort((a, b) => a - b);

  // Check for consecutive range
  let isConsecutive = true;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] !== sorted[i - 1] + 1) {
      isConsecutive = false;
      break;
    }
  }

  if (isConsecutive && sorted.length > 2) {
    return `${DAY_NAMES[sorted[0]]}-${DAY_NAMES[sorted[sorted.length - 1]]}`;
  }
  return sorted.map((d) => DAY_NAMES[d] ?? String(d)).join(', ');
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function TierVisualization({ rules }: { rules: Record<string, unknown> }) {
  const instantMax = Number(rules.instant_max ?? 0);
  const notifyMax = Number(rules.notify_max ?? 0);
  const delayMax = Number(rules.delay_max ?? 0);
  const maxValue = Math.max(instantMax, notifyMax, delayMax, 1);

  const tiers = [
    { label: 'Instant', value: rules.instant_max as string, width: (instantMax / maxValue) * 100, cls: 'instant' },
    { label: 'Notify', value: rules.notify_max as string, width: (notifyMax / maxValue) * 100, cls: 'notify' },
    { label: 'Delay', value: rules.delay_max as string, width: (delayMax / maxValue) * 100, cls: 'delay' },
    { label: 'Approval', value: '', width: 100, cls: 'approval' },
  ];

  return (
    <div class="tier-bars">
      {tiers.map((tier) => (
        <div class="tier-bar" key={tier.cls}>
          <span class="tier-bar-label">{tier.label}</span>
          <div class="tier-bar-track">
            <div
              class={`tier-bar-fill tier-bar-fill--${tier.cls}`}
              style={{ width: `${tier.width}%` }}
            />
          </div>
          <span class="tier-bar-value">
            {tier.value ? formatNumber(tier.value) : ''}
          </span>
        </div>
      ))}
    </div>
  );
}

function formatUsd(value: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function CumulativeLimitSummary({ rules }: { rules: Record<string, unknown> }) {
  const dailyLimit = rules.daily_limit_usd as number | undefined;
  const monthlyLimit = rules.monthly_limit_usd as number | undefined;

  if (!dailyLimit && !monthlyLimit) return null;

  return (
    <div class="cumulative-limits">
      <div class="cumulative-limits-label">Cumulative Limits</div>
      {dailyLimit && (
        <div class="cumulative-limit-row">
          <span class="cumulative-limit-type">Daily (24h)</span>
          <span class="cumulative-limit-value">${formatUsd(dailyLimit)}</span>
        </div>
      )}
      {monthlyLimit && (
        <div class="cumulative-limit-row">
          <span class="cumulative-limit-type">Monthly (30d)</span>
          <span class="cumulative-limit-value">${formatUsd(monthlyLimit)}</span>
        </div>
      )}
    </div>
  );
}

const TIER_COLORS: Record<string, 'success' | 'info' | 'warning' | 'danger'> = {
  INSTANT: 'success',
  NOTIFY: 'info',
  DELAY: 'warning',
  APPROVAL: 'danger',
};

export function PolicyRulesSummary({ type, rules }: { type: string; rules: Record<string, unknown> }) {
  switch (type) {
    // 1. SPENDING_LIMIT: tier bars + cumulative limits
    case 'SPENDING_LIMIT':
      return (
        <div class="spending-limit-summary">
          <TierVisualization rules={rules} />
          <CumulativeLimitSummary rules={rules} />
        </div>
      );

    // 2. ALLOWED_TOKENS: symbol badges (VIS-01)
    case 'ALLOWED_TOKENS': {
      const tokens = (rules.tokens as Array<{ address?: string; symbol?: string }>) || [];
      if (tokens.length === 0) return <span class="rules-vis-text">No tokens</span>;
      return (
        <div class="rules-vis-badges">
          {tokens.map((t, i) => (
            <Badge key={i} variant="info">
              {t.symbol || (t.address ? t.address.slice(0, 8) + '...' : '?')}
            </Badge>
          ))}
        </div>
      );
    }

    // 3. RATE_LIMIT: "N req / Xh" format (VIS-02)
    case 'RATE_LIMIT': {
      const maxReq = rules.max_requests as number;
      const windowSec = rules.window_seconds as number;
      return (
        <span class="rules-vis-text">
          {maxReq} req / {humanWindow(windowSec)}
        </span>
      );
    }

    // 4. WHITELIST: address count badge
    case 'WHITELIST': {
      const addrs = (rules.allowed_addresses as string[]) || [];
      return <Badge variant="neutral">{addrs.length} addresses</Badge>;
    }

    // 5. TIME_RESTRICTION: days + hours
    case 'TIME_RESTRICTION': {
      const days = (rules.allowed_days as number[]) || [];
      const hours = rules.allowed_hours as { start: number; end: number } | undefined;
      const dayStr = formatDays(days);
      const hourStr = hours ? `${pad2(hours.start)}:00-${pad2(hours.end)}:00` : '';
      return (
        <span class="rules-vis-text">
          {dayStr} {hourStr}
        </span>
      );
    }

    // 6. CONTRACT_WHITELIST: contract names/addresses, max 3
    case 'CONTRACT_WHITELIST': {
      const contracts = (rules.contracts as Array<{ address?: string; name?: string }>) || [];
      if (contracts.length === 0) return <span class="rules-vis-text">No contracts</span>;
      const show = contracts.slice(0, 3);
      const extra = contracts.length - 3;
      return (
        <div class="rules-vis-badges">
          {show.map((c, i) => (
            <Badge key={i} variant="neutral">
              {c.name || (c.address ? c.address.slice(0, 8) + '...' : '?')}
            </Badge>
          ))}
          {extra > 0 && <Badge variant="neutral">+{extra} more</Badge>}
        </div>
      );
    }

    // 7. METHOD_WHITELIST: contract/method count
    case 'METHOD_WHITELIST': {
      const methods = (rules.methods as Array<{ contractAddress: string; selectors: string[] }>) || [];
      const contractCount = methods.length;
      const selectorCount = methods.reduce((sum, m) => sum + (m.selectors?.length || 0), 0);
      return (
        <Badge variant="neutral">
          {contractCount} contracts, {selectorCount} methods
        </Badge>
      );
    }

    // 8. APPROVED_SPENDERS: spender count badge
    case 'APPROVED_SPENDERS': {
      const spenders = (rules.spenders as Array<{ address: string }>) || [];
      return <Badge variant="neutral">{spenders.length} spenders</Badge>;
    }

    // 9. APPROVE_AMOUNT_LIMIT: max amount + block unlimited
    case 'APPROVE_AMOUNT_LIMIT': {
      const maxAmount = rules.maxAmount as string | undefined;
      const blockUnlimited = rules.blockUnlimited as boolean | undefined;
      if (maxAmount && blockUnlimited) {
        return (
          <span class="rules-vis-text">
            Max: {formatNumber(maxAmount)} + Block unlimited
          </span>
        );
      }
      if (maxAmount) {
        return <span class="rules-vis-text">Max: {formatNumber(maxAmount)}</span>;
      }
      if (blockUnlimited) {
        return <span class="rules-vis-text">Block unlimited only</span>;
      }
      return <span class="rules-vis-text">No limits</span>;
    }

    // 10. APPROVE_TIER_OVERRIDE: tier badge with color
    case 'APPROVE_TIER_OVERRIDE': {
      const tier = (rules.tier as string) || 'DELAY';
      const color = TIER_COLORS[tier] || 'neutral';
      return <Badge variant={color}>{tier}</Badge>;
    }

    // 11. ALLOWED_NETWORKS: network badges, max 3
    case 'ALLOWED_NETWORKS': {
      const networks = (rules.networks as Array<{ network: string; name?: string }>) || [];
      if (networks.length === 0) return <span class="rules-vis-text">No networks</span>;
      const show = networks.slice(0, 3);
      const extra = networks.length - 3;
      return (
        <div class="rules-vis-badges">
          {show.map((n, i) => (
            <Badge key={i} variant="info">{n.network}</Badge>
          ))}
          {extra > 0 && <Badge variant="info">+{extra} more</Badge>}
        </div>
      );
    }

    // 12. X402_ALLOWED_DOMAINS: domain badges, max 3
    case 'X402_ALLOWED_DOMAINS': {
      const domains = (rules.domains as string[]) || [];
      if (domains.length === 0) return <span class="rules-vis-text">No domains</span>;
      const show = domains.slice(0, 3);
      const extra = domains.length - 3;
      return (
        <div class="rules-vis-badges">
          {show.map((d, i) => (
            <Badge key={i} variant="neutral">{d}</Badge>
          ))}
          {extra > 0 && <Badge variant="neutral">+{extra} more</Badge>}
        </div>
      );
    }

    // default: JSON fallback
    default: {
      const json = JSON.stringify(rules);
      return (
        <span class="rules-summary">
          {json.length > 60 ? json.slice(0, 60) + '...' : json}
        </span>
      );
    }
  }
}
