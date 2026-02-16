import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { apiGet, apiPost, ApiError } from '../api/client';
import { API } from '../api/endpoints';
import { Table } from '../components/table';
import type { Column } from '../components/table';
import { Button, Badge } from '../components/form';
import { showToast } from '../components/toast';
import { getErrorMessage } from '../utils/error-messages';
import { formatDate } from '../utils/format';
import { TelegramUsersContent } from './telegram-users';

interface ChannelStatus {
  name: string;
  enabled: boolean;
}

interface NotificationStatus {
  enabled: boolean;
  channels: ChannelStatus[];
}

interface TestResult {
  channel: string;
  success: boolean;
  error?: string;
}

interface NotificationLogEntry {
  id: string;
  eventType: string;
  walletId: string | null;
  channel: string;
  status: string;
  error: string | null;
  message: string | null;
  createdAt: number;
}

interface NotificationLogResponse {
  logs: NotificationLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

const PAGE_SIZE = 20;

type NotifTab = 'channels' | 'telegram';

export default function NotificationsPage() {
  const activeTab = useSignal<NotifTab>('channels');
  const status = useSignal<NotificationStatus | null>(null);
  const statusLoading = useSignal(true);
  const testLoading = useSignal(false);
  const testChannelLoading = useSignal<string | null>(null);
  const testResults = useSignal<TestResult[] | null>(null);
  const logs = useSignal<NotificationLogResponse | null>(null);
  const logsLoading = useSignal(true);
  const currentPage = useSignal(1);
  const selectedLog = useSignal<NotificationLogEntry | null>(null);

  const fetchStatus = async () => {
    try {
      const result = await apiGet<NotificationStatus>(API.ADMIN_NOTIFICATIONS_STATUS);
      status.value = result;
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      statusLoading.value = false;
    }
  };

  const fetchLogs = async (page: number) => {
    logsLoading.value = true;
    try {
      const result = await apiGet<NotificationLogResponse>(
        `${API.ADMIN_NOTIFICATIONS_LOG}?page=${page}&pageSize=${PAGE_SIZE}`,
      );
      logs.value = result;
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      logsLoading.value = false;
    }
  };

  const handleTestSend = async () => {
    testLoading.value = true;
    testResults.value = null;
    try {
      const body = await apiPost<{ results: TestResult[] }>(API.ADMIN_NOTIFICATIONS_TEST, {});
      const results = body.results;
      testResults.value = results;
      const allSuccess = results.every((r) => r.success);
      if (allSuccess) {
        showToast('success', 'Test sent successfully');
      } else {
        showToast('warning', 'Some channels failed');
      }
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      testLoading.value = false;
    }
  };

  const handleTestChannel = async (channelName: string) => {
    testChannelLoading.value = channelName;
    testResults.value = null;
    try {
      const body = await apiPost<{ results: TestResult[] }>(API.ADMIN_NOTIFICATIONS_TEST, { channel: channelName });
      const results = body.results;
      testResults.value = results;
      const allSuccess = results.every((r) => r.success);
      if (allSuccess) {
        showToast('success', `Test sent to ${channelName}`);
      } else {
        showToast('warning', `${channelName} test failed`);
      }
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      testChannelLoading.value = null;
    }
  };

  const handlePrevPage = () => {
    if (currentPage.value > 1) {
      currentPage.value -= 1;
      fetchLogs(currentPage.value);
    }
  };

  const handleNextPage = () => {
    const totalPages = logs.value ? Math.ceil(logs.value.total / PAGE_SIZE) : 1;
    if (currentPage.value < totalPages) {
      currentPage.value += 1;
      fetchLogs(currentPage.value);
    }
  };

  const handleRowClick = (log: NotificationLogEntry) => {
    selectedLog.value = selectedLog.value?.id === log.id ? null : log;
  };

  useEffect(() => {
    fetchStatus();
    fetchLogs(1);
    const interval = setInterval(() => fetchLogs(currentPage.value), 30_000);
    return () => clearInterval(interval);
  }, []);

  const isInitialLoad = statusLoading.value && !status.value;
  const hasEnabledChannels = status.value?.channels.some((c) => c.enabled) ?? false;
  const totalPages = logs.value ? Math.max(1, Math.ceil(logs.value.total / PAGE_SIZE)) : 1;

  const logColumns: Column<NotificationLogEntry>[] = [
    { key: 'eventType', header: 'Event Type' },
    {
      key: 'walletId',
      header: 'Wallet ID',
      render: (entry) => entry.walletId ? entry.walletId.slice(0, 8) + '...' : '\u2014',
    },
    {
      key: 'channel',
      header: 'Channel',
      render: (entry) => <span style={{ textTransform: 'capitalize' }}>{entry.channel}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (entry) => (
        <Badge variant={entry.status === 'sent' ? 'success' : 'danger'}>
          {entry.status}
        </Badge>
      ),
    },
    {
      key: 'createdAt',
      header: 'Time',
      render: (entry) => formatDate(entry.createdAt),
    },
  ];

  return (
    <div class="page">
      {/* Tab Navigation */}
      <div class="tab-nav" style={{ marginBottom: 'var(--space-4)' }}>
        <button
          class={`tab-btn ${activeTab.value === 'channels' ? 'active' : ''}`}
          onClick={() => { activeTab.value = 'channels'; }}
        >
          Channels & Logs
        </button>
        <button
          class={`tab-btn ${activeTab.value === 'telegram' ? 'active' : ''}`}
          onClick={() => { activeTab.value = 'telegram'; }}
        >
          Telegram Users
        </button>
      </div>

      {activeTab.value === 'telegram' ? (
        <TelegramUsersContent />
      ) : (
      <>
      {/* Section 1: Channel Status Cards */}
      <h2>Channel Status</h2>

      {status.value && !status.value.enabled && (
        <div class="notif-disabled-banner">
          Notifications are disabled. Set <code>notifications.enabled = true</code> in config.toml
        </div>
      )}

      {isInitialLoad ? (
        <div class="channel-grid">
          {[1, 2, 3].map((i) => (
            <div key={i} class="channel-card">
              <div class="stat-skeleton" />
            </div>
          ))}
        </div>
      ) : (
        <div class="channel-grid">
          {status.value?.channels.map((ch) => (
            <div key={ch.name} class="channel-card">
              <div class="channel-card-header">
                <span class="channel-card-name">{ch.name}</span>
                <div class="channel-card-actions">
                  <Badge variant={ch.enabled ? 'success' : 'neutral'}>
                    {ch.enabled ? 'Connected' : 'Not Configured'}
                  </Badge>
                  {ch.enabled && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleTestChannel(ch.name)}
                      loading={testChannelLoading.value === ch.name}
                    >
                      Test
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Test All + Results (below Channel Status) */}
      <div style={{ marginTop: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
        <Button
          onClick={handleTestSend}
          loading={testLoading.value}
          disabled={!hasEnabledChannels}
        >
          Test All Channels
        </Button>

        {testResults.value && (
          <div class="test-results">
            {testResults.value.map((result) => (
              <div key={result.channel} class="test-result-item">
                <span class={result.success ? 'test-result-success' : 'test-result-failure'}>
                  {result.success ? '\u2713' : '\u2717'}
                </span>
                <span style={{ textTransform: 'capitalize' }}>{result.channel}</span>
                {!result.success && result.error && (
                  <span class="test-result-failure"> - {result.error}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 2: Delivery Log Table */}
      <h2>Delivery Log</h2>
      <Table<NotificationLogEntry>
        columns={logColumns}
        data={logs.value?.logs ?? []}
        loading={logsLoading.value}
        emptyMessage="No notification logs"
        onRowClick={handleRowClick}
      />

      {/* Expanded log message detail */}
      {selectedLog.value && (
        <div class="log-message-detail">
          <div class="log-message-detail-header">
            <strong>{selectedLog.value.eventType}</strong> via <span style={{ textTransform: 'capitalize' }}>{selectedLog.value.channel}</span>
            <Button variant="ghost" size="sm" onClick={() => { selectedLog.value = null; }}>
              Close
            </Button>
          </div>
          <div class="log-message-detail-body">
            {selectedLog.value.message ? (
              <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 'var(--font-size-sm)' }}>{selectedLog.value.message}</pre>
            ) : (
              <span class="text-muted">(No message recorded)</span>
            )}
          </div>
        </div>
      )}

      <div class="pagination">
        <span class="pagination-info">
          Page {currentPage.value} of {totalPages}
          {logs.value ? ` (${logs.value.total} total)` : ''}
        </span>
        <div class="pagination-buttons">
          <Button
            variant="secondary"
            size="sm"
            onClick={handlePrevPage}
            disabled={currentPage.value <= 1}
          >
            Previous
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleNextPage}
            disabled={currentPage.value >= totalPages}
          >
            Next
          </Button>
        </div>
      </div>

      {/* Section 3: Configuration Guidance */}
      <div class="config-guidance">
        <p>Configure notification channels in Settings &rarr; Notifications section. Changes are applied immediately via hot-reload.</p>
      </div>
      </>
      )}
    </div>
  );
}
