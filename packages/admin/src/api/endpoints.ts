export const API = {
  ADMIN_STATUS: '/v1/admin/status',
  ADMIN_KILL_SWITCH: '/v1/admin/kill-switch',
  ADMIN_RECOVER: '/v1/admin/recover',
  ADMIN_SHUTDOWN: '/v1/admin/shutdown',
  ADMIN_ROTATE_SECRET: '/v1/admin/rotate-secret',
  AGENTS: '/v1/agents',
  AGENT: (id: string) => `/v1/agents/${id}`,
  SESSIONS: '/v1/sessions',
  SESSION: (id: string) => `/v1/sessions/${id}`,
  POLICIES: '/v1/policies',
  POLICY: (id: string) => `/v1/policies/${id}`,
} as const;
