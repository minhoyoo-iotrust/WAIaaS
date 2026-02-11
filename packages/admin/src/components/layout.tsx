import { signal } from '@preact/signals';
import { logout } from '../auth/store';
import DashboardPage from '../pages/dashboard';
import AgentsPage from '../pages/agents';
import SessionsPage from '../pages/sessions';
import PoliciesPage from '../pages/policies';
import NotificationsPage from '../pages/notifications';
import SettingsPage from '../pages/settings';

export const currentPath = signal(window.location.hash.slice(1) || '/dashboard');

window.addEventListener('hashchange', () => {
  currentPath.value = window.location.hash.slice(1) || '/dashboard';
});

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/agents': 'Agents',
  '/sessions': 'Sessions',
  '/policies': 'Policies',
  '/notifications': 'Notifications',
  '/settings': 'Settings',
};

function getPageTitle(path: string): string {
  if (path.startsWith('/agents/')) return 'Agent Detail';
  return PAGE_TITLES[path] ?? 'Dashboard';
}

const NAV_ITEMS = [
  { path: '/dashboard', label: 'Dashboard' },
  { path: '/agents', label: 'Agents' },
  { path: '/sessions', label: 'Sessions' },
  { path: '/policies', label: 'Policies' },
  { path: '/notifications', label: 'Notifications' },
  { path: '/settings', label: 'Settings' },
];

function PageRouter() {
  const path = currentPath.value;
  if (path === '/sessions') return <SessionsPage />;
  if (path === '/policies') return <PoliciesPage />;
  if (path === '/notifications') return <NotificationsPage />;
  if (path === '/settings') return <SettingsPage />;
  if (path.startsWith('/agents')) return <AgentsPage />;
  return <DashboardPage />;
}

export function Layout() {
  return (
    <div class="layout">
      <aside class="sidebar">
        <div class="sidebar-brand">WAIaaS</div>
        <nav class="sidebar-nav">
          {NAV_ITEMS.map((item) => {
            const isActive = item.path === '/agents'
              ? currentPath.value.startsWith('/agents')
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
          <h1 class="header-title">
            {getPageTitle(currentPath.value)}
          </h1>
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
