import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { api } from '../../api/typed-client';
import { type SettingsData } from '../../utils/settings-helpers';
import { FormField, Button } from '../form';
import { showToast } from '../toast';

const PM_KEYS = [
  { key: 'actions.polymarket_enabled', label: 'Enabled', type: 'toggle' },
  { key: 'actions.polymarket_default_fee_bps', label: 'Default Fee (bps)', type: 'number' },
  { key: 'actions.polymarket_order_expiry_seconds', label: 'Order Expiry (seconds)', type: 'number' },
  { key: 'actions.polymarket_max_position_usdc', label: 'Max Position (USDC)', type: 'number' },
  { key: 'actions.polymarket_proxy_wallet', label: 'Proxy Wallet', type: 'toggle' },
  { key: 'actions.polymarket_neg_risk_enabled', label: 'Neg Risk Enabled', type: 'toggle' },
  { key: 'actions.polymarket_auto_approve_ctf', label: 'Auto Approve CTF', type: 'toggle' },
] as const;

export function PolymarketSettings() {
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
      for (const def of PM_KEYS) {
        if (settings.value[def.key] !== undefined) {
          patch[def.key] = settings.value[def.key];
        }
      }
      await api.PUT('/v1/admin/settings', { body: { settings: Object.entries(patch).map(([key, value]) => ({ key, value: String(value) })) } });
      showToast('Polymarket settings saved', 'success');
    } catch {
      showToast('Failed to save settings', 'error');
    } finally {
      saving.value = false;
    }
  };

  if (loading.value) return <p>Loading settings...</p>;

  return (
    <div>
      {PM_KEYS.map((def) => {
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

        return (
          <FormField key={def.key} label={def.label}>
            <input
              type="number"
              class="form-input"
              value={value}
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
