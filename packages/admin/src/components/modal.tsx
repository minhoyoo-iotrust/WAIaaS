import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
import { Button } from './form';

export interface ModalProps {
  open: boolean;
  title: string;
  children: ComponentChildren;
  onConfirm?: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: 'primary' | 'danger';
  confirmDisabled?: boolean;
  loading?: boolean;
}

export function Modal({
  open,
  title,
  children,
  onConfirm,
  onCancel,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmVariant = 'primary',
  confirmDisabled = false,
  loading = false,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div class="modal-overlay" onClick={onCancel}>
      <div class="modal-card" onClick={(e) => e.stopPropagation()}>
        <div class="modal-header">{title}</div>
        <div class="modal-body">{children}</div>
        <div class="modal-footer">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            {cancelText}
          </Button>
          {onConfirm && (
            <Button
              variant={confirmVariant}
              onClick={onConfirm}
              loading={loading}
              disabled={confirmDisabled}
            >
              {confirmText}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
