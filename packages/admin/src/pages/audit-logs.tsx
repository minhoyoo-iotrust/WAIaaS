import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { apiGet, ApiError } from '../api/client';
import { API } from '../api/endpoints';
import { Table } from '../components/table';
import type { Column } from '../components/table';
import { Badge, Button } from '../components/form';
import { FilterBar } from '../components/filter-bar';
import type { FilterField } from '../components/filter-bar';
import { Modal } from '../components/modal';
import { showToast } from '../components/toast';
import { getErrorMessage } from '../utils/error-messages';
import { formatDate } from '../utils/format';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuditLogItem {
  id: number;
  timestamp: number;
  eventType: string;
  actor: string;
  walletId: string | null;
  sessionId: string | null;
  txId: string | null;
  details: Record<string, unknown>;
  severity: string;
  ipAddress: string | null;
}

interface AuditLogResponse {
  data: AuditLogItem[];
  nextCursor: number | null;
  hasMore: boolean;
  total?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50;

const EVENT_TYPE_OPTIONS = [
  { value: 'WALLET_CREATED', label: 'Wallet Created' },
  { value: 'WALLET_SUSPENDED', label: 'Wallet Suspended' },
  { value: 'WALLET_PURGED', label: 'Wallet Purged' },
  { value: 'SESSION_CREATED', label: 'Session Created' },
  { value: 'SESSION_REVOKED', label: 'Session Revoked' },
  { value: 'SESSION_ISSUED_VIA_TELEGRAM', label: 'Session Issued via Telegram' },
  { value: 'TX_SUBMITTED', label: 'TX Submitted' },
  { value: 'TX_CONFIRMED', label: 'TX Confirmed' },
  { value: 'TX_FAILED', label: 'TX Failed' },
  { value: 'TX_APPROVED_VIA_TELEGRAM', label: 'TX Approved via Telegram' },
  { value: 'TX_REJECTED_VIA_TELEGRAM', label: 'TX Rejected via Telegram' },
  { value: 'TX_CANCELLED_VIA_TELEGRAM', label: 'TX Cancelled via Telegram' },
  { value: 'UNLISTED_TOKEN_TRANSFER', label: 'Unlisted Token Transfer' },
  { value: 'POLICY_DENIED', label: 'Policy Denied' },
  { value: 'KILL_SWITCH_ACTIVATED', label: 'Kill Switch Activated' },
  { value: 'KILL_SWITCH_ESCALATED', label: 'Kill Switch Escalated' },
  { value: 'KILL_SWITCH_RECOVERED', label: 'Kill Switch Recovered' },
  { value: 'AUTO_STOP_TRIGGERED', label: 'Auto Stop Triggered' },
  { value: 'MASTER_AUTH_FAILED', label: 'Master Auth Failed' },
  { value: 'OWNER_REGISTERED', label: 'Owner Registered' },
  { value: 'PROVIDER_UPDATED', label: 'Provider Updated' },
  { value: 'NOTIFICATION_TOTAL_FAILURE', label: 'Notification Total Failure' },
  { value: 'USEROP_BUILD', label: 'UserOp Build' },
  { value: 'USEROP_SIGNED', label: 'UserOp Signed' },
];

const SEVERITY_OPTIONS = [
  { value: 'info', label: 'Info' },
  { value: 'warning', label: 'Warning' },
  { value: 'critical', label: 'Critical' },
];

const FILTER_FIELDS: FilterField[] = [
  { key: 'event_type', label: 'Event Type', type: 'select', options: EVENT_TYPE_OPTIONS },
  { key: 'severity', label: 'Severity', type: 'select', options: SEVERITY_OPTIONS },
  { key: 'from', label: 'From', type: 'date' },
  { key: 'to', label: 'To', type: 'date' },
];

// ---------------------------------------------------------------------------
// Severity badge variant mapping
// ---------------------------------------------------------------------------

function severityVariant(severity: string): 'info' | 'warning' | 'danger' {
  if (severity === 'critical') return 'danger';
  if (severity === 'warning') return 'warning';
  return 'info';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AuditLogsPage() {
  const rows = useSignal<AuditLogItem[]>([]);
  const loading = useSignal(true);
  const filters = useSignal<Record<string, string>>({
    event_type: '',
    severity: '',
    from: '',
    to: '',
  });

  // Cursor-based pagination state
  const cursorStack = useSignal<number[]>([]); // stack of previous page cursors
  const currentCursor = useSignal<number | undefined>(undefined);
  const nextCursor = useSignal<number | null>(null);
  const hasMore = useSignal(false);
  const total = useSignal<number | undefined>(undefined);

  // Detail modal
  const detailModal = useSignal(false);
  const selectedItem = useSignal<AuditLogItem | null>(null);

  const fetchLogs = async () => {
    loading.value = true;
    try {
      const params = new URLSearchParams();
      params.set('limit', String(PAGE_SIZE));
      params.set('include_total', 'true');

      if (currentCursor.value !== undefined) {
        params.set('cursor', String(currentCursor.value));
      }

      const f = filters.value;
      if (f.event_type) params.set('event_type', f.event_type);
      if (f.severity) params.set('severity', f.severity);
      if (f.from) {
        const d = new Date(f.from);
        params.set('from', String(Math.floor(d.getTime() / 1000)));
      }
      if (f.to) {
        const d = new Date(f.to);
        // End of day
        params.set('to', String(Math.floor(d.getTime() / 1000) + 86399));
      }

      const url = `${API.ADMIN_AUDIT_LOGS}?${params.toString()}`;
      const result = await apiGet<AuditLogResponse>(url);
      rows.value = result.data;
      nextCursor.value = result.nextCursor;
      hasMore.value = result.hasMore;
      if (result.total !== undefined) {
        total.value = result.total;
      }
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      loading.value = false;
    }
  };

  // Fetch on mount and when filters/cursor change
  useEffect(() => {
    fetchLogs();
  }, [filters.value, currentCursor.value]);

  const handleFiltersChange = (newFilters: Record<string, string>) => {
    filters.value = newFilters;
    // Reset pagination when filters change
    cursorStack.value = [];
    currentCursor.value = undefined;
    nextCursor.value = null;
  };

  const handleNextPage = () => {
    if (nextCursor.value === null) return;
    // Push current cursor to stack for "Previous" navigation
    cursorStack.value = [
      ...cursorStack.value,
      currentCursor.value ?? 0,
    ];
    currentCursor.value = nextCursor.value;
  };

  const handlePrevPage = () => {
    if (cursorStack.value.length === 0) return;
    const stack = [...cursorStack.value];
    const prev = stack.pop()!;
    cursorStack.value = stack;
    currentCursor.value = prev === 0 ? undefined : prev;
  };

  const handleRowClick = (item: AuditLogItem) => {
    selectedItem.value = item;
    detailModal.value = true;
  };

  const pageNumber = cursorStack.value.length + 1;

  const columns: Column<AuditLogItem>[] = [
    {
      key: 'timestamp',
      header: 'Time',
      render: (item) => formatDate(item.timestamp),
    },
    {
      key: 'eventType',
      header: 'Event',
      render: (item) => item.eventType.replace(/_/g, ' '),
    },
    {
      key: 'severity',
      header: 'Severity',
      render: (item) => (
        <Badge variant={severityVariant(item.severity)}>
          {item.severity.toUpperCase()}
        </Badge>
      ),
    },
    {
      key: 'actor',
      header: 'Actor',
      render: (item) => item.actor,
    },
    {
      key: 'walletId',
      header: 'Wallet',
      render: (item) => item.walletId ? item.walletId.slice(0, 8) + '...' : '-',
    },
    {
      key: 'txId',
      header: 'TX',
      render: (item) => item.txId ? item.txId.slice(0, 8) + '...' : '-',
    },
    {
      key: 'ipAddress',
      header: 'IP',
      render: (item) => item.ipAddress ?? '-',
    },
  ];

  return (
    <div class="page">
      <FilterBar
        fields={FILTER_FIELDS}
        values={filters.value}
        onChange={handleFiltersChange}
      />

      {total.value !== undefined && !loading.value && (
        <div style={{ marginBottom: 'var(--space-2)', color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
          {total.value} total log{total.value !== 1 ? 's' : ''}
        </div>
      )}

      <Table<AuditLogItem>
        columns={columns}
        data={rows.value}
        loading={loading.value}
        emptyMessage="No audit logs found"
        onRowClick={handleRowClick}
      />

      {/* Cursor-based pagination controls */}
      {!loading.value && rows.value.length > 0 && (
        <div class="pagination-controls" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-3)' }}>
          <Button
            variant="secondary"
            size="sm"
            disabled={cursorStack.value.length === 0}
            onClick={handlePrevPage}
          >
            Previous
          </Button>
          <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
            Page {pageNumber}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={!hasMore.value}
            onClick={handleNextPage}
          >
            Next
          </Button>
        </div>
      )}

      {/* Detail Modal */}
      <Modal
        open={detailModal.value}
        title="Audit Log Detail"
        onCancel={() => { detailModal.value = false; }}
        cancelText="Close"
      >
        {selectedItem.value && (
          <div class="audit-detail">
            <div class="audit-detail-fields" style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
              <strong>Time</strong>
              <span>{formatDate(selectedItem.value.timestamp)}</span>
              <strong>Event</strong>
              <span>{selectedItem.value.eventType}</span>
              <strong>Severity</strong>
              <span>
                <Badge variant={severityVariant(selectedItem.value.severity)}>
                  {selectedItem.value.severity.toUpperCase()}
                </Badge>
              </span>
              <strong>Actor</strong>
              <span>{selectedItem.value.actor}</span>
              <strong>Wallet ID</strong>
              <span>{selectedItem.value.walletId ?? '-'}</span>
              <strong>Session ID</strong>
              <span>{selectedItem.value.sessionId ?? '-'}</span>
              <strong>TX ID</strong>
              <span>{selectedItem.value.txId ?? '-'}</span>
              <strong>IP Address</strong>
              <span>{selectedItem.value.ipAddress ?? '-'}</span>
            </div>
            <div>
              <strong style={{ display: 'block', marginBottom: 'var(--space-1)' }}>Details</strong>
              <pre style={{ background: 'var(--color-bg-secondary)', padding: 'var(--space-2)', borderRadius: 'var(--radius-md)', overflow: 'auto', maxHeight: '300px', fontSize: '0.8rem' }}>
                {JSON.stringify(selectedItem.value.details, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
