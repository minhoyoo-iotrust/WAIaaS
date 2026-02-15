import { DynamicRowList } from '../dynamic-row-list';
import { FormField } from '../form';
import type { PolicyFormProps } from './index';

interface ContractRow {
  address: string;
  name: string;
  chain: string;
}

const CHAIN_OPTIONS = [
  { label: 'All Chains', value: '' },
  { label: 'Solana', value: 'solana' },
  { label: 'Ethereum', value: 'ethereum' },
];

export function ContractWhitelistForm({ rules, onChange, errors }: PolicyFormProps) {
  const contracts = (rules.contracts as ContractRow[]) || [];

  return (
    <div class="policy-form-fields">
      <DynamicRowList<ContractRow>
        items={contracts}
        onAdd={() =>
          onChange({ ...rules, contracts: [...contracts, { address: '', name: '', chain: '' }] })
        }
        onRemove={(i) =>
          onChange({ ...rules, contracts: contracts.filter((_, idx) => idx !== i) })
        }
        onChange={(i, val) => {
          const next = [...contracts];
          next[i] = val;
          onChange({ ...rules, contracts: next });
        }}
        renderRow={(contract, i, onRowChange) => (
          <div class="dynamic-row-fields" style={{ display: 'flex', gap: '0.5rem', flex: 1 }}>
            <FormField
              label={`Address ${i + 1}`}
              name={`contract-addr-${i}`}
              value={contract.address}
              onChange={(v) => onRowChange(i, { ...contract, address: v as string })}
              placeholder="Contract address"
              error={errors[`contracts.${i}.address`]}
              required
            />
            <FormField
              label="Name"
              name={`contract-name-${i}`}
              value={contract.name}
              onChange={(v) => onRowChange(i, { ...contract, name: v as string })}
              placeholder="e.g. Uniswap Router"
            />
            <FormField
              label="Chain"
              name={`contract-chain-${i}`}
              type="select"
              value={contract.chain}
              onChange={(v) => {
                const row: ContractRow = { ...contract, chain: v as string };
                if (!v) delete (row as Record<string, unknown>).chain;
                onRowChange(i, row);
              }}
              options={CHAIN_OPTIONS}
            />
          </div>
        )}
        addLabel="+ Add Contract"
        error={errors.contracts}
      />
    </div>
  );
}
