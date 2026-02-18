import { signal } from '@preact/signals';
import { logout } from '../auth/store';
import DashboardPage from '../pages/dashboard';
import WalletsPage from '../pages/wallets';
import SessionsPage from '../pages/sessions';
import PoliciesPage from '../pages/policies';
import NotificationsPage from '../pages/notifications';

export const currentPath = signal(window.location.hash.slice(1) || '/dashboard');

window.addEventListener('hashchange', () => {
  currentPath.value = window.location.hash.slice(1) || '/dashboard';
});

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/wallets': 'Wallets',
  '/sessions': 'Sessions',
  '/policies': 'Policies',
  '/notifications': 'Notifications',
  '/security': 'Security',
  '/system': 'System',
};

const PAGE_SUBTITLES: Record<string, string> = {
  '/dashboard': 'System overview and key metrics',
  '/wallets': 'Manage wallets, balances, and connections',
  '/sessions': 'View and manage active sessions',
  '/policies': 'Configure transaction policies and rules',
  '/notifications': 'Channel status, delivery logs, and settings',
  '/security': 'Emergency controls and automatic protection rules',
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
  { path: '/sessions', label: 'Sessions' },
  { path: '/policies', label: 'Policies' },
  { path: '/notifications', label: 'Notifications' },
  { path: '/security', label: 'Security' },
  { path: '/system', label: 'System' },
];

// Placeholder until security.tsx is created by plan 183-02
function SecurityPagePlaceholder() {
  return <div class="page"><p>Loading Security...</p></div>;
}

// Placeholder until system.tsx is created by plan 183-03
function SystemPagePlaceholder() {
  return <div class="page"><p>Loading System...</p></div>;
}

function PageRouter() {
  const path = currentPath.value;
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
  if (path === '/security') return <SecurityPagePlaceholder />;
  if (path === '/system') return <SystemPagePlaceholder />;
  if (path.startsWith('/wallets')) return <WalletsPage />;
  return <DashboardPage />;
}

export function Layout() {
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
          <button class="btn-logout" onClick={() => logout()}>
            Logout
          </button>
        </header>
        <div class="content">
          <PageRouter />
        </div>
      </main>
    </div>
  );
}
