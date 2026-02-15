import { DynamicRowList } from '../dynamic-row-list';
import { FormField } from '../form';
import type { PolicyFormProps } from './index';

interface TokenRow {
  address: string;
  symbol: string;
  chain: string;
}

const CHAIN_OPTIONS = [
  { label: 'All Chains', value: '' },
  { label: 'Solana', value: 'solana' },
  { label: 'Ethereum', value: 'ethereum' },
];

export function AllowedTokensForm({ rules, onChange, errors }: PolicyFormProps) {
  const tokens = (rules.tokens as TokenRow[]) || [];

  return (
    <div class="policy-form-fields">
      <DynamicRowList<TokenRow>
        items={tokens}
        onAdd={() =>
          onChange({ ...rules, tokens: [...tokens, { address: '', symbol: '', chain: '' }] })
        }
        onRemove={(i) =>
          onChange({ ...rules, tokens: tokens.filter((_, idx) => idx !== i) })
        }
        onChange={(i, val) => {
          const next = [...tokens];
          next[i] = val;
          onChange({ ...rules, tokens: next });
        }}
        renderRow={(token, i, onRowChange) => (
          <div class="dynamic-row-fields" style={{ display: 'flex', gap: '0.5rem', flex: 1 }}>
            <FormField
              label={`Address ${i + 1}`}
              name={`token-addr-${i}`}
              value={token.address}
              onChange={(v) => onRowChange(i, { ...token, address: v as string })}
              placeholder="Token mint/contract address"
              error={errors[`tokens.${i}.address`]}
              required
            />
            <FormField
              label="Symbol"
              name={`token-symbol-${i}`}
              value={token.symbol}
              onChange={(v) => onRowChange(i, { ...token, symbol: v as string })}
              placeholder="e.g. USDC"
            />
            <FormField
              label="Chain"
              name={`token-chain-${i}`}
              type="select"
              value={token.chain}
              onChange={(v) => {
                const row: TokenRow = { ...token, chain: v as string };
                // Remove chain from object if empty (Zod optional)
                if (!v) delete (row as Record<string, unknown>).chain;
                onRowChange(i, row);
              }}
              options={CHAIN_OPTIONS}
            />
          </div>
        )}
        addLabel="+ Add Token"
        error={errors.tokens}
      />
    </div>
  );
}
