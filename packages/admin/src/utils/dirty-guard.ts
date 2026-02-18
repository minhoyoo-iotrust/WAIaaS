import { signal, computed } from '@preact/signals';

export interface DirtyRegistration {
  id: string;                    // unique id, e.g. "wallets-rpc", "sessions-settings"
  isDirty: () => boolean;        // returns true if this tab has unsaved changes
  save: () => Promise<void>;     // the tab's save handler
  discard: () => void;           // the tab's discard handler (clears dirty)
}

const registry = signal<DirtyRegistration[]>([]);

/** True if ANY registered tab has dirty state */
export const hasDirty = computed(() => registry.value.some(r => r.isDirty()));

/** Register a tab's dirty state handlers. Call on mount. */
export function registerDirty(reg: DirtyRegistration): void {
  // Avoid duplicates
  registry.value = [...registry.value.filter(r => r.id !== reg.id), reg];
}

/** Unregister a tab's dirty state handlers. Call on unmount/cleanup. */
export function unregisterDirty(id: string): void {
  registry.value = registry.value.filter(r => r.id !== id);
}

/** Save all dirty tabs, returns true if all succeeded */
export async function saveAllDirty(): Promise<boolean> {
  const dirtyRegs = registry.value.filter(r => r.isDirty());
  try {
    for (const reg of dirtyRegs) {
      await reg.save();
    }
    return true;
  } catch {
    return false;
  }
}

/** Discard all dirty tabs */
export function discardAllDirty(): void {
  const dirtyRegs = registry.value.filter(r => r.isDirty());
  for (const reg of dirtyRegs) {
    reg.discard();
  }
}
