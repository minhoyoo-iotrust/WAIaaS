import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { apiGet } from '../../api/client';

interface Market {
  conditionId: string;
  question: string;
  volume: string;
  liquidity: string;
  endDate: string;
  category?: string;
}

export function PolymarketMarkets() {
  const markets = useSignal<Market[]>([]);
  const loading = useSignal(true);
  const keyword = useSignal('');
  const category = useSignal('');
  const searchTimeout = useSignal<ReturnType<typeof setTimeout> | null>(null);

  const fetchMarkets = (kw?: string, cat?: string) => {
    loading.value = true;
    const params = new URLSearchParams();
    if (kw) params.set('keyword', kw);
    if (cat) params.set('category', cat);
    const qs = params.toString();
    const url = `/v1/polymarket/markets${qs ? `?${qs}` : ''}`;
    apiGet(url)
      .then((res) => {
        const data = res as { markets?: Market[] };
        markets.value = data.markets ?? [];
      })
      .catch(() => {
        markets.value = [];
      })
      .finally(() => {
        loading.value = false;
      });
  };

  useEffect(() => {
    fetchMarkets();
  }, []);

  const handleSearch = (value: string) => {
    keyword.value = value;
    if (searchTimeout.value) clearTimeout(searchTimeout.value);
    searchTimeout.value = setTimeout(() => {
      fetchMarkets(value, category.value);
    }, 300);
  };

  const handleCategory = (value: string) => {
    category.value = value;
    fetchMarkets(keyword.value, value);
  };

  if (loading.value && markets.value.length === 0) return <p>Loading markets...</p>;

  return (
    <div>
      <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
        <input
          type="text"
          class="form-input"
          placeholder="Search markets..."
          value={keyword.value}
          onInput={(e) => handleSearch((e.target as HTMLInputElement).value)}
          style={{ flex: 1 }}
        />
        <select
          class="form-input"
          style={{ width: 'auto', minWidth: '150px' }}
          value={category.value}
          onChange={(e) => handleCategory((e.target as HTMLSelectElement).value)}
        >
          <option value="">All Categories</option>
          <option value="politics">Politics</option>
          <option value="crypto">Crypto</option>
          <option value="sports">Sports</option>
          <option value="science">Science</option>
          <option value="culture">Culture</option>
        </select>
      </div>

      {markets.value.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)' }}>No markets found.</p>
      ) : (
        <table class="table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Question</th>
              <th>Volume</th>
              <th>Liquidity</th>
              <th>End Date</th>
            </tr>
          </thead>
          <tbody>
            {markets.value.map((m) => (
              <tr key={m.conditionId}>
                <td style={{ maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.question}
                </td>
                <td>{m.volume}</td>
                <td>{m.liquidity}</td>
                <td>{m.endDate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
