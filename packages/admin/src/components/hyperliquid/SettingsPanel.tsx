import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { api } from '../../api/typed-client';
import { type SettingsData } from '../../utils/settings-helpers';
import { FormField, Button } from '../form';
import { showToast } from '../toast';

const HL_KEYS = [
  { key: 'actions.hyperliquid_enabled', label: 'Enabled', type: 'toggle' },
  { key: 'actions.hyperliquid_network', label: 'Network', type: 'select', options: ['mainnet', 'testnet'] },
  { key: 'actions.hyperliquid_api_url', label: 'API URL Override', type: 'text', placeholder: 'Leave empty for default' },
  { key: 'actions.hyperliquid_rate_limit_weight_per_min', label: 'Rate Limit (weight/min)', type: 'number' },
  { key: 'actions.hyperliquid_default_leverage', label: 'Default Leverage', type: 'number' },
  { key: 'actions.hyperliquid_default_margin_mode', label: 'Default Margin Mode', type: 'select', options: ['CROSS', 'ISOLATED'] },
  { key: 'actions.hyperliquid_builder_address', label: 'Builder Address', type: 'text', placeholder: '0x...' },
  { key: 'actions.hyperliquid_builder_fee', label: 'Builder Fee (bps)', type: 'number' },
  { key: 'actions.hyperliquid_order_status_poll_interval_ms', label: 'Order Poll Interval (ms)', type: 'number' },
] as const;

export function SettingsPanel() {
  const settings = useSignal<SettingsData>({});
  const loading = useSignal(true);
  const saving = useSignal(false);

  useEffect(() => {
    api.GET('/v1/admin/settings')
      .then(({ data: res }) => {
        settings.value = (res as unknown as SettingsData) ?? {};
      })
      .catch(() => {
        showToast('Failed to load settings', 'error');
      })
      .finally(() => {
        loading.value = false;
      });
  }, []);

  const handleChange = (key: string, value: string) => {
    settings.value = { ...settings.value, [key]: value };
  };

  const handleSave = async () => {
    saving.value = true;
    try {
      const patch: SettingsData = {};
      for (const def of HL_KEYS) {
        if (settings.value[def.key] !== undefined) {
          patch[def.key] = settings.value[def.key];
        }
      }
      await api.PUT('/v1/admin/settings', { body: { settings: Object.entries(patch).map(([key, value]) => ({ key, value: String(value) })) } });
      showToast('Hyperliquid settings saved', 'success');
    } catch {
      showToast('Failed to save settings', 'error');
    } finally {
      saving.value = false;
    }
  };

  if (loading.value) return <p>Loading settings...</p>;

  return (
    <div>
      {HL_KEYS.map((def) => {
        const value = settings.value[def.key] ?? '';

        if (def.type === 'toggle') {
          return (
            <FormField key={def.key} label={def.label}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={value === 'true'}
                  onChange={(e) => handleChange(def.key, (e.target as HTMLInputElement).checked ? 'true' : 'false')}
                />
                {value === 'true' ? 'Enabled' : 'Disabled'}
              </label>
            </FormField>
          );
        }

        if (def.type === 'select' && 'options' in def) {
          return (
            <FormField key={def.key} label={def.label}>
              <select
                class="form-input"
                value={value}
                onChange={(e) => handleChange(def.key, (e.target as HTMLSelectElement).value)}
              >
                {def.options.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </FormField>
          );
        }

        return (
          <FormField key={def.key} label={def.label}>
            <input
              type={def.type === 'number' ? 'number' : 'text'}
              class="form-input"
              value={value}
              placeholder={'placeholder' in def ? def.placeholder : ''}
              onInput={(e) => handleChange(def.key, (e.target as HTMLInputElement).value)}
            />
          </FormField>
        );
      })}

      <div style={{ marginTop: 'var(--space-4)' }}>
        <Button onClick={handleSave} disabled={saving.value}>
          {saving.value ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>
    </div>
  );
}
