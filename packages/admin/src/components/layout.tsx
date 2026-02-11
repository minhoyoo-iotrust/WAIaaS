import { signal } from '@preact/signals';
import { logout } from '../auth/store';
import DashboardPage from '../pages/dashboard';
import AgentsPage from '../pages/agents';
import SessionsPage from '../pages/sessions';
import PoliciesPage from '../pages/policies';
import SettingsPage from '../pages/settings';

const currentPath = signal(window.location.hash.slice(1) || '/dashboard');

window.addEventListener('hashchange', () => {
  currentPath.value = window.location.hash.slice(1) || '/dashboard';
});

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/agents': 'Agents',
  '/sessions': 'Sessions',
  '/policies': 'Policies',
  '/settings': 'Settings',
};

const NAV_ITEMS = [
  { path: '/dashboard', label: 'Dashboard' },
  { path: '/agents', label: 'Agents' },
  { path: '/sessions', label: 'Sessions' },
  { path: '/policies', label: 'Policies' },
  { path: '/settings', label: 'Settings' },
];

function PageRouter() {
  switch (currentPath.value) {
    case '/agents':
      return <AgentsPage />;
    case '/sessions':
      return <SessionsPage />;
    case '/policies':
      return <PoliciesPage />;
    case '/settings':
      return <SettingsPage />;
    default:
      return <DashboardPage />;
  }
}

export function Layout() {
  return (
    <div class="layout">
      <aside class="sidebar">
        <div class="sidebar-brand">WAIaaS</div>
        <nav class="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <a
              href={`#${item.path}`}
              class={`sidebar-link ${currentPath.value === item.path ? 'active' : ''}`}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </aside>
      <main class="main">
        <header class="header">
          <h1 class="header-title">
            {PAGE_TITLES[currentPath.value] ?? 'Dashboard'}
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
