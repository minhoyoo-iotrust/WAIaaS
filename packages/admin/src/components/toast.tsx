import { signal } from '@preact/signals';

export interface Toast {
  id: number;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
}

const toasts = signal<Toast[]>([]);
let nextId = 0;

export function showToast(type: Toast['type'], message: string): void {
  const id = nextId++;
  toasts.value = [...toasts.value, { id, type, message }];
  setTimeout(() => {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }, 5000);
}

function dismissToast(id: number): void {
  toasts.value = toasts.value.filter((t) => t.id !== id);
}

export function ToastContainer() {
  if (toasts.value.length === 0) return null;
  return (
    <div class="toast-container">
      {toasts.value.map((t) => (
        <div
          key={t.id}
          class={`toast toast-${t.type}`}
          onClick={() => dismissToast(t.id)}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
