import { DynamicRowList } from '../dynamic-row-list';
import { FormField } from '../form';
import type { PolicyFormProps } from './index';

interface NetworkRow {
  network: string;
  name: string;
}

const NETWORK_OPTIONS = [
  { label: 'mainnet', value: 'mainnet' },
  { label: 'devnet', value: 'devnet' },
  { label: 'testnet', value: 'testnet' },
  { label: 'ethereum-mainnet', value: 'ethereum-mainnet' },
  { label: 'ethereum-sepolia', value: 'ethereum-sepolia' },
  { label: 'polygon-mainnet', value: 'polygon-mainnet' },
  { label: 'polygon-amoy', value: 'polygon-amoy' },
  { label: 'arbitrum-mainnet', value: 'arbitrum-mainnet' },
  { label: 'arbitrum-sepolia', value: 'arbitrum-sepolia' },
  { label: 'optimism-mainnet', value: 'optimism-mainnet' },
  { label: 'optimism-sepolia', value: 'optimism-sepolia' },
  { label: 'base-mainnet', value: 'base-mainnet' },
  { label: 'base-sepolia', value: 'base-sepolia' },
];

export function AllowedNetworksForm({ rules, onChange, errors }: PolicyFormProps) {
  const networks = (rules.networks as NetworkRow[]) || [];

  return (
    <div class="policy-form-fields">
      <DynamicRowList<NetworkRow>
        items={networks}
        onAdd={() =>
          onChange({ ...rules, networks: [...networks, { network: 'mainnet', name: '' }] })
        }
        onRemove={(i) =>
          onChange({ ...rules, networks: networks.filter((_, idx) => idx !== i) })
        }
        onChange={(i, val) => {
          const next = [...networks];
          next[i] = val;
          onChange({ ...rules, networks: next });
        }}
        renderRow={(net, i, onRowChange) => (
          <div class="dynamic-row-fields" style={{ display: 'flex', gap: '0.5rem', flex: 1 }}>
            <FormField
              label={`Network ${i + 1}`}
              name={`network-sel-${i}`}
              type="select"
              value={net.network}
              onChange={(v) => onRowChange(i, { ...net, network: v as string })}
              options={NETWORK_OPTIONS}
              error={errors[`networks.${i}.network`]}
              required
            />
            <FormField
              label="Label"
              name={`network-name-${i}`}
              value={net.name}
              onChange={(v) => onRowChange(i, { ...net, name: v as string })}
              placeholder="Optional label"
            />
          </div>
        )}
        addLabel="+ Add Network"
        error={errors.networks}
      />
    </div>
  );
}
