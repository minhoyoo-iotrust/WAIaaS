import { signal } from '@preact/signals';
import { Button } from './form';
import { saveAllDirty, discardAllDirty } from '../utils/dirty-guard';

export interface PendingAction {
  type: 'tab' | 'nav';
  execute: () => void;    // the navigation/tab switch to perform after resolution
}

export const pendingAction = signal<PendingAction | null>(null);
const dialogSaving = signal(false);

export function showUnsavedDialog(action: PendingAction): void {
  pendingAction.value = action;
}

export function UnsavedDialog() {
  const action = pendingAction.value;
  if (!action) return null;

  const handleSaveAndNavigate = async () => {
    dialogSaving.value = true;
    const ok = await saveAllDirty();
    dialogSaving.value = false;
    if (ok) {
      pendingAction.value = null;
      action.execute();
    }
    // If save failed, keep dialog open -- user sees toast error from save handler
  };

  const handleDiscardAndNavigate = () => {
    discardAllDirty();
    pendingAction.value = null;
    action.execute();
  };

  const handleCancel = () => {
    pendingAction.value = null;
  };

  return (
    <div class="modal-overlay" onClick={handleCancel}>
      <div class="modal-card" onClick={(e) => e.stopPropagation()}>
        <div class="modal-header">Unsaved Changes</div>
        <div class="modal-body">
          <p>You have unsaved changes. What would you like to do?</p>
        </div>
        <div class="modal-footer unsaved-dialog-footer">
          <Button variant="secondary" onClick={handleCancel} disabled={dialogSaving.value}>
            Cancel
          </Button>
          <Button variant="ghost" onClick={handleDiscardAndNavigate} disabled={dialogSaving.value}>
            Discard & Navigate
          </Button>
          <Button variant="primary" onClick={handleSaveAndNavigate} loading={dialogSaving.value}>
            Save & Navigate
          </Button>
        </div>
      </div>
    </div>
  );
}
