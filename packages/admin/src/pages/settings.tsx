import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { apiGet, apiPost, ApiError } from '../api/client';
import { API } from '../api/endpoints';
import { Button, Badge } from '../components/form';
import { Modal } from '../components/modal';
import { showToast } from '../components/toast';
import { getErrorMessage } from '../utils/error-messages';
import { formatDate } from '../utils/format';

interface KillSwitchState {
  state: string;
  activatedAt: number | null;
  activatedBy: string | null;
}

export default function SettingsPage() {
  const killSwitchState = useSignal<KillSwitchState | null>(null);
  const ksLoading = useSignal(true);
  const ksActionLoading = useSignal(false);
  const rotateModal = useSignal(false);
  const rotateLoading = useSignal(false);
  const shutdownModal = useSignal(false);
  const shutdownLoading = useSignal(false);
  const shutdownConfirmText = useSignal('');
  const isShutdown = useSignal(false);

  const fetchKillSwitchState = async () => {
    try {
      const result = await apiGet<KillSwitchState>(API.ADMIN_KILL_SWITCH);
      killSwitchState.value = result;
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      ksLoading.value = false;
    }
  };

  const handleKillSwitchToggle = async () => {
    ksActionLoading.value = true;
    const isActivated = killSwitchState.value?.state === 'ACTIVATED';
    try {
      if (isActivated) {
        await apiPost(API.ADMIN_RECOVER);
        showToast('success', 'Kill switch recovered');
      } else {
        await apiPost(API.ADMIN_KILL_SWITCH);
        showToast('success', 'Kill switch activated');
      }
      await fetchKillSwitchState();
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      ksActionLoading.value = false;
    }
  };

  const handleRotate = async () => {
    rotateLoading.value = true;
    try {
      await apiPost<{ rotatedAt: number; message: string }>(API.ADMIN_ROTATE_SECRET);
      rotateModal.value = false;
      showToast('success', 'JWT secret rotated. Old tokens valid for 5 minutes.');
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      rotateLoading.value = false;
    }
  };

  const handleShutdown = async () => {
    shutdownLoading.value = true;
    try {
      await apiPost<{ message: string }>(API.ADMIN_SHUTDOWN);
      shutdownModal.value = false;
      shutdownConfirmText.value = '';
      showToast('info', 'Shutdown initiated');
      isShutdown.value = true;
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
      showToast('error', getErrorMessage(e.code));
    } finally {
      shutdownLoading.value = false;
    }
  };

  useEffect(() => {
    fetchKillSwitchState();
  }, []);

  const ksState = killSwitchState.value;
  const isActivated = ksState?.state === 'ACTIVATED';

  return (
    <div class="page">
      {isShutdown.value && (
        <div class="shutdown-overlay">
          <h2>Daemon is shutting down...</h2>
          <p>You can close this tab.</p>
        </div>
      )}

      <div class="settings-section">
        <div class="settings-section-header">
          <h3>Kill Switch</h3>
          <p class="settings-description">Emergency stop — suspends all agent operations immediately.</p>
        </div>
        <div class="settings-section-body">
          {ksLoading.value ? (
            <span>Loading...</span>
          ) : ksState ? (
            <div class="ks-state-card">
              <Badge variant={isActivated ? 'danger' : 'success'}>
                {ksState.state}
              </Badge>
              {isActivated && ksState.activatedAt && (
                <span class="ks-state-info">
                  Activated {formatDate(ksState.activatedAt)}
                  {ksState.activatedBy ? ` by ${ksState.activatedBy}` : ''}
                </span>
              )}
            </div>
          ) : null}
          <Button
            variant={isActivated ? 'primary' : 'danger'}
            onClick={handleKillSwitchToggle}
            loading={ksActionLoading.value}
            disabled={ksLoading.value}
          >
            {isActivated ? 'Recover' : 'Activate Kill Switch'}
          </Button>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-section-header">
          <h3>JWT Secret Rotation</h3>
          <p class="settings-description">Invalidate all existing JWT tokens. Old tokens remain valid for 5 minutes.</p>
        </div>
        <div class="settings-section-body">
          <Button variant="secondary" onClick={() => { rotateModal.value = true; }}>
            Rotate JWT Secret
          </Button>
        </div>
      </div>

      <div class="settings-section settings-section--danger">
        <div class="settings-section-header">
          <h3>Danger Zone</h3>
          <p class="settings-description">Irreversible actions. Proceed with caution.</p>
        </div>
        <div class="settings-section-body">
          <Button variant="danger" onClick={() => { shutdownModal.value = true; }}>
            Shutdown Daemon
          </Button>
        </div>
      </div>

      {/* JWT Rotation Confirmation Modal */}
      <Modal
        open={rotateModal.value}
        title="Rotate JWT Secret"
        onCancel={() => { rotateModal.value = false; }}
        onConfirm={handleRotate}
        confirmText="Rotate"
        confirmVariant="primary"
        loading={rotateLoading.value}
      >
        <p>
          Are you sure you want to rotate the JWT secret? All existing session
          tokens will remain valid for 5 more minutes, then expire. Agents will
          need new sessions.
        </p>
      </Modal>

      {/* Shutdown Double-Confirmation Modal */}
      <Modal
        open={shutdownModal.value}
        title="Shutdown Daemon"
        onCancel={() => {
          shutdownModal.value = false;
          shutdownConfirmText.value = '';
        }}
        onConfirm={handleShutdown}
        confirmText="Shutdown"
        confirmVariant="danger"
        confirmDisabled={shutdownConfirmText.value !== 'SHUTDOWN'}
        loading={shutdownLoading.value}
      >
        <p>
          This will gracefully stop the daemon process. All active connections
          will be terminated.
        </p>
        <div class="shutdown-confirm-input">
          <label>Type <strong>SHUTDOWN</strong> to confirm</label>
          <input
            type="text"
            value={shutdownConfirmText.value}
            onInput={(e) => {
              shutdownConfirmText.value = (e.target as HTMLInputElement).value;
            }}
            placeholder="SHUTDOWN"
          />
        </div>
      </Modal>
    </div>
  );
}
