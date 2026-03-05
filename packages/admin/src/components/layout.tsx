import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { logout } from '../auth/store';
import { SettingsSearch } from './settings-search';
import { hasDirty } from '../utils/dirty-guard';
import { showUnsavedDialog, UnsavedDialog } from './unsaved-dialog';
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
  '/defi': 'DeFi',
  '/agent-identity': 'Agent Identity',
  '/policies': 'Policies',
  '/notifications': 'Notifications',
  '/security': 'Security',
  '/wallet-apps': 'Human Wallet Apps',
  '/system': 'System',
};

const PAGE_SUBTITLES: Record<string, string> = {
  '/dashboard': 'System overview and key metrics',
  '/wallets': 'Manage wallets, balances, and connections',
  '/transactions': 'View all transactions and configure incoming monitoring',
  '/sessions': 'View and manage active sessions',
  '/tokens': 'Manage EVM token registry per network',
  '/defi': 'Manage DeFi action providers and API keys',
  '/agent-identity': 'On-chain agent identity, reputation, and wallet linking',
  '/policies': 'Configure transaction policies and rules',
  '/notifications': 'Channel status, delivery logs, and settings',
  '/security': 'Emergency controls and automatic protection rules',
  '/wallet-apps': 'Manage wallet apps for signing and notifications',
  '/system': 'API keys, display preferences, and daemon configuration',
};

function getPageTitle(path: string): string {
  if (path.startsWith('/wallets/')) return 'Wallet Detail';
  return PAGE_TITLES[path] ?? 'Dashboard';
}

export function getPageSubtitle(path: string): string | undefined {
  return PAGE_SUBTITLES[path];
}

const NAV_ITEMS = [
  { path: '/dashboard', label: 'Dashboard' },
  { path: '/wallets', label: 'Wallets' },
  { path: '/transactions', label: 'Transactions' },
  { path: '/sessions', label: 'Sessions' },
  { path: '/tokens', label: 'Tokens' },
  { path: '/defi', label: 'DeFi' },
  { path: '/agent-identity', label: 'Agent Identity' },
  { path: '/policies', label: 'Policies' },
  { path: '/notifications', label: 'Notifications' },
  { path: '/wallet-apps', label: 'Human Wallet Apps' },
  { path: '/security', label: 'Security' },
  { path: '/system', label: 'System' },
];

function PageRouter() {
  const path = currentPath.value;
  if (path === '/transactions') return <TransactionsPage />;
  if (path === '/incoming') {
    window.location.hash = '#/transactions';
    return <TransactionsPage />;
  }
  if (path === '/tokens') return <TokensPage />;
  if (path === '/defi') return <ActionsPage />;
  if (path === '/actions') {
    // Redirect legacy route to DeFi
    window.location.hash = '#/defi';
    return <ActionsPage />;
  }
  if (path === '/sessions') return <SessionsPage />;
  if (path === '/policies') return <PoliciesPage />;
  if (path === '/notifications') return <NotificationsPage />;
  if (path === '/telegram-users') {
    // Redirect legacy route to Notifications > Telegram Users tab
    window.location.hash = '#/notifications';
    return <NotificationsPage />;
  }
  if (path === '/settings') {
    window.location.hash = '#/dashboard';
    return <DashboardPage />;
  }
  if (path === '/walletconnect') {
    window.location.hash = '#/wallets';
    return <WalletsPage />;
  }
  if (path === '/security') return <SecurityPage />;
  if (path === '/wallet-apps') return <HumanWalletAppsPage />;
  if (path === '/agent-identity') return <Erc8004Page />;
  if (path === '/erc8004') {
    // Redirect legacy route to Agent Identity
    window.location.hash = '#/agent-identity';
    return <Erc8004Page />;
  }
  if (path === '/system') return <SystemPage />;
  if (path.startsWith('/wallets')) return <WalletsPage />;
  return <DashboardPage />;
}

export { highlightField, pendingNavigation } from './settings-search';

export function Layout() {
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
          {NAV_ITEMS.map((item) => {
            const isActive = item.path === '/wallets'
              ? currentPath.value.startsWith('/wallets')
              : currentPath.value === item.path;
            return (
              <a
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
          })}
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
