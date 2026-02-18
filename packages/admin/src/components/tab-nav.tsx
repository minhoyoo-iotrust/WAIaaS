import { hasDirty } from '../utils/dirty-guard';
import { showUnsavedDialog } from './unsaved-dialog';

export interface TabItem {
  key: string;
  label: string;
}

export interface TabNavProps {
  tabs: TabItem[];
  activeTab: string;
  onTabChange: (key: string) => void;
}

export function TabNav({ tabs, activeTab, onTabChange }: TabNavProps) {
  return (
    <div class="tab-nav">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          class={`tab-btn ${activeTab === tab.key ? 'active' : ''}`}
          onClick={() => {
            if (tab.key === activeTab) return;
            if (hasDirty.value) {
              showUnsavedDialog({
                type: 'tab',
                execute: () => onTabChange(tab.key),
              });
            } else {
              onTabChange(tab.key);
            }
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
