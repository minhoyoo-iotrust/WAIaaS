import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { logout } from '../auth/store';
import { SettingsSearch } from './settings-search';
import { hasDirty } from '../utils/dirty-guard';
import { showUnsavedDialog, UnsavedDialog } from './unsaved-dialog';
import { loadSettingsSchema } from '../utils/settings-helpers';
import DashboardPage from '../pages/dashboard';
import WalletsPage from '../pages/wallets';
import TransactionsPage from '../pages/transactions';
import TokensPage from '../pages/tokens';
import SessionsPage from '../pages/sessions';
import PoliciesPage from '../pages/policies';
import NotificationsPage from '../pages/notifications';
import SecurityPage from '../pages/security';
import SystemPage from '../pages/system';
import ActionsPage from '../pages/actions';
import HumanWalletAppsPage from '../pages/human-wallet-apps';
import Erc8004Page from '../pages/erc8004';
import HyperliquidPage from '../pages/hyperliquid';
import PolymarketPage from '../pages/polymarket';
import AuditLogsPage from '../pages/audit-logs';
import CredentialsPage from '../pages/credentials';
import RpcProxyPage from '../pages/rpc-proxy';

function extractPath(hash: string): string {
  const raw = hash.slice(1) || '/dashboard';
  const qIdx = raw.indexOf('?');
  return qIdx >= 0 ? raw.slice(0, qIdx) : raw;
}

export const currentPath = signal(extractPath(window.location.hash));
const searchOpen = signal(false);

window.addEventListener('hashchange', () => {
  currentPath.value = extractPath(window.location.hash);
});

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/wallets': 'Wallets',
  '/transactions': 'Transactions',
  '/sessions': 'Sessions',
  '/tokens': 'Token Registry',
  '/providers': 'Providers',
  '/hyperliquid': 'Hyperliquid',
  '/polymarket': 'Polymarket',
  '/agent-identity': 'Agent Identity',
  '/credentials': 'Credentials',
  '/rpc-proxy': 'RPC Proxy',
  '/policies': 'Policies',
  '/notifications': 'Notifications',
  '/protection': 'Protection',
  '/wallet-apps': 'Wallet Apps',
  '/audit-logs': 'Audit Logs',
  '/settings': 'Settings',
};

const PAGE_SUBTITLES: Record<string, string> = {
  '/dashboard': 'System overview and key metrics',
  '/wallets': 'Manage wallets, balances, and connections',
  '/transactions': 'View all transactions and configure incoming monitoring',
  '/sessions': 'View and manage active sessions',
  '/tokens': 'Manage EVM token registry per network',
  '/providers': 'Manage DeFi action providers and API keys',
  '/hyperliquid': 'Hyperliquid perpetual trading positions, orders, and settings',
  '/polymarket': 'Polymarket prediction market positions, orders, and settings',
  '/agent-identity': 'On-chain agent identity, reputation, and wallet linking',
  '/credentials': 'Manage encryption credentials for external service authentication',
  '/rpc-proxy': 'EVM JSON-RPC proxy settings and monitoring',
  '/policies': 'Configure transaction policies and rules',
  '/notifications': 'Channel status, delivery logs, and settings',
  '/protection': 'Emergency controls and automatic protection rules',
  '/wallet-apps': 'Manage wallet apps for signing and notifications',
  '/audit-logs': 'View security and operational audit events',
  '/settings': 'API keys, display preferences, and daemon configuration',
};

function getPageTitle(path: string): string {
  if (path.startsWith('/wallets/')) return 'Wallet Detail';
  return PAGE_TITLES[path] ?? 'Dashboard';
}

export function getPageSubtitle(path: string): string | undefined {
  return PAGE_SUBTITLES[path];
}

interface NavItem { path: string; label: string; }
interface NavSection { section: string; items: NavItem[]; }

// Dashboard is an independent top-level item outside any section
const DASHBOARD_NAV: NavItem = { path: '/dashboard', label: 'Dashboard' };

const NAV_SECTIONS: NavSection[] = [
  {
    section: 'Wallets',
    items: [
      { path: '/wallets', label: 'Wallets' },
      { path: '/transactions', label: 'Transactions' },
      { path: '/sessions', label: 'Sessions' },
    ],
  },
  {
    section: 'Trading',
    items: [
      { path: '/providers', label: 'Providers' },
      { path: '/hyperliquid', label: 'Hyperliquid' },
      { path: '/polymarket', label: 'Polymarket' },
    ],
  },
  {
    section: 'Security',
    items: [
      { path: '/policies', label: 'Policies' },
      { path: '/protection', label: 'Protection' },
      { path: '/agent-identity', label: 'Agent Identity' },
      { path: '/credentials', label: 'Credentials' },
    ],
  },
  {
    section: 'Channels',
    items: [
      { path: '/notifications', label: 'Notifications' },
      { path: '/wallet-apps', label: 'Wallet Apps' },
    ],
  },
  {
    section: 'System',
    items: [
      { path: '/settings', label: 'Settings' },
      { path: '/audit-logs', label: 'Audit Logs' },
    ],
  },
];

function PageRouter() {
  const path = currentPath.value;
  const routeKey = path.startsWith('/wallets/') ? '/wallets/detail' : path;

  let page;
  if (path === '/transactions') page = <TransactionsPage />;
  else if (path === '/incoming') {
    window.location.hash = '#/transactions';
    page = <TransactionsPage />;
  }
  else if (path === '/tokens') page = <TokensPage />;
  else if (path === '/providers') page = <ActionsPage />;
  else if (path === '/defi' || path === '/actions') {
    // Redirect legacy routes to Providers
    window.location.hash = '#/providers';
    page = <ActionsPage />;
  }
  else if (path === '/hyperliquid') page = <HyperliquidPage />;
  else if (path === '/polymarket') page = <PolymarketPage />;
  else if (path === '/sessions') page = <SessionsPage />;
  else if (path === '/credentials') page = <CredentialsPage />;
  else if (path === '/rpc-proxy') page = <RpcProxyPage />;
  else if (path === '/policies') page = <PoliciesPage />;
  else if (path === '/notifications') page = <NotificationsPage />;
  else if (path === '/telegram-users') {
    // Redirect legacy route to Notifications > Telegram Users tab
    window.location.hash = '#/notifications';
    page = <NotificationsPage />;
  }
  else if (path === '/settings') page = <SystemPage />;
  else if (path === '/system') {
    // Redirect legacy route to Settings
    window.location.hash = '#/settings';
    page = <SystemPage />;
  }
  else if (path === '/walletconnect') {
    window.location.hash = '#/wallets';
    page = <WalletsPage />;
  }
  else if (path === '/protection') page = <SecurityPage />;
  else if (path === '/security') {
    // Redirect legacy route to Protection
    window.location.hash = '#/protection';
    page = <SecurityPage />;
  }
  else if (path === '/wallet-apps') page = <HumanWalletAppsPage />;
  else if (path === '/agent-identity') page = <Erc8004Page />;
  else if (path === '/erc8004') {
    // Redirect legacy route to Agent Identity
    window.location.hash = '#/agent-identity';
    page = <Erc8004Page />;
  }
  else if (path === '/audit-logs') page = <AuditLogsPage />;
  else if (path.startsWith('/wallets')) page = <WalletsPage />;
  else page = <DashboardPage />;

  return <div key={routeKey}>{page}</div>;
}

export { highlightField, pendingNavigation } from './settings-search';

function renderNavLink(item: NavItem) {
  const isActive = item.path === '/wallets'
    ? currentPath.value.startsWith('/wallets')
    : currentPath.value === item.path;
  return (
    <a
      key={item.path}
      href={`#${item.path}`}
      class={`sidebar-link ${isActive ? 'active' : ''}`}
      onClick={(e) => {
        if (hasDirty.value) {
          e.preventDefault();
          showUnsavedDialog({
            type: 'nav',
            execute: () => {
              window.location.hash = `#${item.path}`;
            },
          });
        }
      }}
    >
      {item.label}
    </a>
  );
}

export function Layout() {
  // Eagerly load settings schema labels from API (singleton, fire-and-forget).
  // This populates the keyToLabel() cache so settings pages show API-driven labels.
  useEffect(() => {
    loadSettingsSchema();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchOpen.value = !searchOpen.value;
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div class="layout">
      <aside class="sidebar">
        <div class="sidebar-brand">WAIaaS</div>
        <nav class="sidebar-nav">
          {renderNavLink(DASHBOARD_NAV)}
          {NAV_SECTIONS.map((section) => (
            <div key={section.section}>
              <div style={{
                fontSize: 'var(--font-size-xs)',
                fontWeight: 'var(--font-weight-semibold)',
                color: 'var(--color-text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                padding: 'var(--space-3) var(--space-4) var(--space-1)',
                marginTop: 'var(--space-2)',
              }}>
                {section.section}
              </div>
              {section.items.map((item) => renderNavLink(item))}
            </div>
          ))}
        </nav>
      </aside>
      <main class="main">
        <header class="header">
          <div class="header-left">
            <h1 class="header-title">
              {getPageTitle(currentPath.value)}
            </h1>
            {getPageSubtitle(currentPath.value) && (
              <p class="header-subtitle">{getPageSubtitle(currentPath.value)}</p>
            )}
          </div>
          <div class="header-actions">
            <button
              class="btn-search"
              onClick={() => { searchOpen.value = true; }}
              title="Search settings (Ctrl+K)"
            >
              &#x1F50D;
            </button>
            <button class="btn-logout" onClick={() => logout()}>
              Logout
            </button>
          </div>
        </header>
        <div class="content">
          <PageRouter />
        </div>
      </main>
      <SettingsSearch open={searchOpen} />
      <UnsavedDialog />
    </div>
  );
}
