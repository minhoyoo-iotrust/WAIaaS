/**
 * Tests for all tool handler branches.
 * Covers every uncovered branch in wallet.ts, transfer.ts, defi.ts, nft.ts, utility.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { register } from '../src/index.js';
import type { PluginApi, PluginToolConfig } from '../src/config.js';

function setup(fetchImpl: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetchImpl);
  const tools: PluginToolConfig[] = [];
  const api: PluginApi = {
    config: { sessionToken: 'test-tok', daemonUrl: 'http://localhost:3100' },
    registerTool(tool: PluginToolConfig) { tools.push(tool); },
  };
  register(api);
  const tool = (name: string) => tools.find((t) => t.name === name)!;
  return { tools, tool };
}

function okFetch(data: unknown = {}) {
  return vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(data) });
}

function errFetch(status: number, message: string) {
  return vi.fn().mockResolvedValue({ ok: false, status, json: () => Promise.resolve({ message }) });
}

function parsedBody(mockFetch: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
  return JSON.parse(opts.body as string) as Record<string, unknown>;
}

function calledUrl(mockFetch: ReturnType<typeof vi.fn>): string {
  return mockFetch.mock.calls[0][0] as string;
}

describe('wallet tools', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('get_wallet_info with wallet_id appends query string', async () => {
    const f = okFetch({ address: '0xabc' });
    const { tool } = setup(f);
    await tool('get_wallet_info').handler({ wallet_id: 'w1' });
    expect(calledUrl(f)).toContain('/v1/wallet/address?walletId=w1');
  });

  it('get_wallet_info without wallet_id has no query string', async () => {
    const f = okFetch();
    const { tool } = setup(f);
    await tool('get_wallet_info').handler({});
    expect(calledUrl(f)).toBe('http://localhost:3100/v1/wallet/address');
  });

  it('get_balance with all optional params', async () => {
    const f = okFetch({ balance: '100' });
    const { tool } = setup(f);
    await tool('get_balance').handler({ network: 'ethereum-mainnet', display_currency: 'KRW', wallet_id: 'w2' });
    const url = calledUrl(f);
    expect(url).toContain('network=ethereum-mainnet');
    expect(url).toContain('display_currency=KRW');
    expect(url).toContain('walletId=w2');
  });

  it('get_balance without params has no query string', async () => {
    const f = okFetch();
    const { tool } = setup(f);
    await tool('get_balance').handler({});
    expect(calledUrl(f)).toBe('http://localhost:3100/v1/wallet/balance');
  });

  it('connect_info calls GET /v1/connect-info', async () => {
    const f = okFetch({ wallets: [] });
    const { tool } = setup(f);
    const result = await tool('connect_info').handler({});
    expect(calledUrl(f)).toContain('/v1/connect-info');
    expect(result).toEqual({ wallets: [] });
  });
});

describe('transfer tools', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('send_token with all optional fields including gas_condition', async () => {
    const f = okFetch({ txId: 'tx1' });
    const { tool } = setup(f);
    await tool('send_token').handler({
      to: '0xdest', amount: '100', type: 'TOKEN_TRANSFER',
      token: { address: '0xtok', decimals: 6, symbol: 'USDC' },
      network: 'polygon-mainnet', memo: 'test memo', wallet_id: 'w1',
      gas_condition: { max_gas_price: '1000', max_priority_fee: '100', timeout: 300 },
    });
    const body = parsedBody(f);
    expect(body['type']).toBe('TOKEN_TRANSFER');
    expect(body['token']).toEqual({ address: '0xtok', decimals: 6, symbol: 'USDC' });
    expect(body['network']).toBe('polygon-mainnet');
    expect(body['memo']).toBe('test memo');
    expect(body['walletId']).toBe('w1');
    expect(body['gasCondition']).toEqual({ maxGasPrice: '1000', maxPriorityFee: '100', timeout: 300 });
  });

  it('get_transaction with display_currency and wallet_id', async () => {
    const f = okFetch({ txId: 'abc' });
    const { tool } = setup(f);
    await tool('get_transaction').handler({ transaction_id: 'tx123', display_currency: 'EUR', wallet_id: 'w2' });
    const url = calledUrl(f);
    expect(url).toContain('/v1/transactions/tx123');
    expect(url).toContain('display_currency=EUR');
    expect(url).toContain('walletId=w2');
  });

  it('get_transaction without optional params', async () => {
    const f = okFetch({});
    const { tool } = setup(f);
    await tool('get_transaction').handler({ transaction_id: 'tx456' });
    expect(calledUrl(f)).toBe('http://localhost:3100/v1/transactions/tx456');
  });

  it('list_transactions with all params', async () => {
    const f = okFetch({ transactions: [] });
    const { tool } = setup(f);
    await tool('list_transactions').handler({ limit: 10, cursor: 'c1', display_currency: 'KRW', wallet_id: 'w3' });
    const url = calledUrl(f);
    expect(url).toContain('limit=10');
    expect(url).toContain('cursor=c1');
    expect(url).toContain('display_currency=KRW');
    expect(url).toContain('walletId=w3');
  });

  it('list_transactions without params', async () => {
    const f = okFetch({});
    const { tool } = setup(f);
    await tool('list_transactions').handler({});
    expect(calledUrl(f)).toBe('http://localhost:3100/v1/transactions');
  });
});

describe('defi tools', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('execute_action with wallet_id and network', async () => {
    const f = okFetch({ result: 'ok' });
    const { tool } = setup(f);
    await tool('execute_action').handler({
      action: 'swap', provider: 'jupiter', params: { from: 'SOL' },
      wallet_id: 'w1', network: 'solana-mainnet',
    });
    const body = parsedBody(f);
    expect(body['walletId']).toBe('w1');
    expect(body['network']).toBe('solana-mainnet');
  });

  it('execute_action without optional wallet_id/network', async () => {
    const f = okFetch({});
    const { tool } = setup(f);
    await tool('execute_action').handler({ action: 'stake', provider: 'lido', params: {} });
    const body = parsedBody(f);
    expect(body['walletId']).toBeUndefined();
    expect(body['network']).toBeUndefined();
  });

  it('get_defi_positions with wallet_id', async () => {
    const f = okFetch({ positions: [] });
    const { tool } = setup(f);
    await tool('get_defi_positions').handler({ wallet_id: 'w2' });
    expect(calledUrl(f)).toContain('wallet_id=w2');
  });

  it('get_defi_positions without wallet_id', async () => {
    const f = okFetch({});
    const { tool } = setup(f);
    await tool('get_defi_positions').handler({});
    expect(calledUrl(f)).toBe('http://localhost:3100/v1/wallet/positions');
  });

  it('get_provider_status calls GET /v1/actions/providers', async () => {
    const f = okFetch({ providers: [] });
    const { tool } = setup(f);
    const result = await tool('get_provider_status').handler({});
    expect(calledUrl(f)).toContain('/v1/actions/providers');
    expect(result).toEqual({ providers: [] });
  });
});

describe('nft tools', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('list_nfts with all optional params', async () => {
    const f = okFetch({ nfts: [] });
    const { tool } = setup(f);
    await tool('list_nfts').handler({
      network: 'ethereum-mainnet', cursor: 'c1', limit: 50, group_by: 'collection', wallet_id: 'w1',
    });
    const url = calledUrl(f);
    expect(url).toContain('network=ethereum-mainnet');
    expect(url).toContain('cursor=c1');
    expect(url).toContain('limit=50');
    expect(url).toContain('groupBy=collection');
    expect(url).toContain('walletId=w1');
  });

  it('list_nfts with only required params', async () => {
    const f = okFetch({});
    const { tool } = setup(f);
    await tool('list_nfts').handler({ network: 'solana-mainnet' });
    const url = calledUrl(f);
    expect(url).toContain('network=solana-mainnet');
    expect(url).not.toContain('cursor');
    expect(url).not.toContain('groupBy');
  });

  it('transfer_nft with optional amount and wallet_id', async () => {
    const f = okFetch({ txId: 'nft-tx' });
    const { tool } = setup(f);
    await tool('transfer_nft').handler({
      to: '0xrecip', token_address: '0xnft', token_id: '42',
      standard: 'erc1155', network: 'ethereum-mainnet',
      amount: '5', wallet_id: 'w2',
    });
    const body = parsedBody(f);
    expect(body['type']).toBe('NFT_TRANSFER');
    expect(body['to']).toBe('0xrecip');
    expect(body['token']).toEqual({ address: '0xnft', tokenId: '42', standard: 'erc1155' });
    expect(body['network']).toBe('ethereum-mainnet');
    expect(body['amount']).toBe('5');
    expect(body['walletId']).toBe('w2');
  });

  it('transfer_nft without optional fields', async () => {
    const f = okFetch({});
    const { tool } = setup(f);
    await tool('transfer_nft').handler({
      to: '0xrecip', token_address: '0xnft', token_id: '1',
      standard: 'erc721', network: 'ethereum-mainnet',
    });
    const body = parsedBody(f);
    expect(body['amount']).toBeUndefined();
    expect(body['walletId']).toBeUndefined();
  });
});

describe('utility tools', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sign_message with all optional fields', async () => {
    const f = okFetch({ signature: '0xsig' });
    const { tool } = setup(f);
    await tool('sign_message').handler({
      message: 'hello', sign_type: 'personal', network: 'ethereum-mainnet', wallet_id: 'w1',
    });
    const body = parsedBody(f);
    expect(body['message']).toBe('hello');
    expect(body['signType']).toBe('personal');
    expect(body['network']).toBe('ethereum-mainnet');
    expect(body['walletId']).toBe('w1');
  });

  it('sign_message with typedData', async () => {
    const f = okFetch({ signature: '0xsig' });
    const { tool } = setup(f);
    const typedData = { domain: {}, types: {}, primaryType: 'Test', message: {} };
    await tool('sign_message').handler({ sign_type: 'typedData', typed_data: typedData });
    const body = parsedBody(f);
    expect(body['typedData']).toEqual(typedData);
  });

  it('resolve_asset with slip44 native token', async () => {
    const f = okFetch();
    const { tool } = setup(f);
    const result = await tool('resolve_asset').handler({ asset_id: 'eip155:1/slip44:60' });
    expect(result).toEqual(expect.objectContaining({ isNative: true, chainId: 'eip155:1' }));
    expect(f).not.toHaveBeenCalled(); // no HTTP call for slip44
  });

  it('resolve_asset with invalid format (no slash)', async () => {
    const f = okFetch();
    const { tool } = setup(f);
    const result = await tool('resolve_asset').handler({ asset_id: 'invalid' }) as Record<string, unknown>;
    expect(result['error']).toBe('INVALID_CAIP19');
  });

  it('resolve_asset with invalid format (no colon in asset part)', async () => {
    const f = okFetch();
    const { tool } = setup(f);
    const result = await tool('resolve_asset').handler({ asset_id: 'eip155:1/badformat' }) as Record<string, unknown>;
    expect(result['error']).toBe('INVALID_CAIP19');
  });

  it('resolve_asset finds matching token from registry', async () => {
    const f = okFetch({ tokens: [{ address: '0xA0b8', decimals: 6, symbol: 'USDC', name: 'USD Coin' }] });
    const { tool } = setup(f);
    const result = await tool('resolve_asset').handler({ asset_id: 'eip155:1/erc20:0xa0b8' }) as Record<string, unknown>;
    expect(result['isRegistered']).toBe(true);
    expect(result['symbol']).toBe('USDC');
    expect(result['decimals']).toBe(6);
  });

  it('resolve_asset returns unregistered when no token matches', async () => {
    const f = okFetch({ tokens: [{ address: '0xother', decimals: 18, symbol: 'OTH', name: 'Other' }] });
    const { tool } = setup(f);
    const result = await tool('resolve_asset').handler({ asset_id: 'eip155:1/erc20:0xunknown' }) as Record<string, unknown>;
    expect(result['isRegistered']).toBe(false);
    expect(result['address']).toBe('0xunknown');
  });

  it('resolve_asset returns unregistered when API fails', async () => {
    const f = errFetch(500, 'Internal');
    const { tool } = setup(f);
    const result = await tool('resolve_asset').handler({ asset_id: 'eip155:1/erc20:0xaddr' }) as Record<string, unknown>;
    expect(result['isRegistered']).toBe(false);
    expect(result['address']).toBe('0xaddr');
  });

  it('resolve_asset handles empty tokens array', async () => {
    const f = okFetch({});
    const { tool } = setup(f);
    const result = await tool('resolve_asset').handler({ asset_id: 'eip155:1/erc20:0xaddr' }) as Record<string, unknown>;
    expect(result['isRegistered']).toBe(false);
  });

  it('call_contract with all optional fields including gas_condition', async () => {
    const f = okFetch({ txId: 'cc1' });
    const { tool } = setup(f);
    await tool('call_contract').handler({
      to: '0xcontract', calldata: '0xabcd', value: '1000',
      programId: 'prog1', instructionData: 'base64data',
      accounts: [{ pubkey: 'pk1', isSigner: true, isWritable: true }],
      network: 'ethereum-mainnet', wallet_id: 'w1',
      gas_condition: { max_gas_price: '500', max_priority_fee: '50', timeout: 600 },
    });
    const body = parsedBody(f);
    expect(body['type']).toBe('CONTRACT_CALL');
    expect(body['calldata']).toBe('0xabcd');
    expect(body['value']).toBe('1000');
    expect(body['programId']).toBe('prog1');
    expect(body['instructionData']).toBe('base64data');
    expect(body['accounts']).toEqual([{ pubkey: 'pk1', isSigner: true, isWritable: true }]);
    expect(body['walletId']).toBe('w1');
    expect(body['gasCondition']).toEqual({ maxGasPrice: '500', maxPriorityFee: '50', timeout: 600 });
  });

  it('call_contract with only required fields', async () => {
    const f = okFetch({});
    const { tool } = setup(f);
    await tool('call_contract').handler({ to: '0xcontract' });
    const body = parsedBody(f);
    expect(body['type']).toBe('CONTRACT_CALL');
    expect(body['calldata']).toBeUndefined();
    expect(body['gasCondition']).toBeUndefined();
  });

  it('approve_token with gas_condition', async () => {
    const f = okFetch({ txId: 'ap1' });
    const { tool } = setup(f);
    await tool('approve_token').handler({
      spender: '0xspender', token: { address: '0xtok' }, amount: '1000000',
      network: 'ethereum-mainnet', wallet_id: 'w1',
      gas_condition: { max_gas_price: '200', max_priority_fee: '20', timeout: 120 },
    });
    const body = parsedBody(f);
    expect(body['type']).toBe('APPROVE');
    expect(body['spender']).toBe('0xspender');
    expect(body['network']).toBe('ethereum-mainnet');
    expect(body['walletId']).toBe('w1');
    expect(body['gasCondition']).toEqual({ maxGasPrice: '200', maxPriorityFee: '20', timeout: 120 });
  });

  it('approve_token without optional fields', async () => {
    const f = okFetch({});
    const { tool } = setup(f);
    await tool('approve_token').handler({
      spender: '0xspender', token: { address: '0xtok' }, amount: '500',
    });
    const body = parsedBody(f);
    expect(body['network']).toBeUndefined();
    expect(body['walletId']).toBeUndefined();
    expect(body['gasCondition']).toBeUndefined();
  });

  it('send_batch with all optional fields', async () => {
    const f = okFetch({ txId: 'batch1' });
    const { tool } = setup(f);
    await tool('send_batch').handler({
      instructions: [{ to: '0xa', amount: '1' }, { to: '0xb', amount: '2' }],
      network: 'solana-mainnet', wallet_id: 'w1',
      gas_condition: { max_gas_price: '100', max_priority_fee: '10', timeout: 60 },
    });
    const body = parsedBody(f);
    expect(body['type']).toBe('BATCH');
    expect(body['instructions']).toHaveLength(2);
    expect(body['network']).toBe('solana-mainnet');
    expect(body['walletId']).toBe('w1');
    expect(body['gasCondition']).toEqual({ maxGasPrice: '100', maxPriorityFee: '10', timeout: 60 });
  });

  it('send_batch with only required fields', async () => {
    const f = okFetch({});
    const { tool } = setup(f);
    await tool('send_batch').handler({ instructions: [{ to: '0xa', amount: '1' }] });
    const body = parsedBody(f);
    expect(body['type']).toBe('BATCH');
    expect(body['network']).toBeUndefined();
    expect(body['gasCondition']).toBeUndefined();
  });

  it('get_policies with all optional fields', async () => {
    const f = okFetch({ data: [], total: 0 });
    const { tool } = setup(f);
    await tool('get_policies').handler({ wallet_id: 'w1', limit: 10, offset: 5 });
    const url = calledUrl(f);
    expect(url).toContain('walletId=w1');
    expect(url).toContain('limit=10');
    expect(url).toContain('offset=5');
  });

  it('get_policies without params', async () => {
    const f = okFetch({});
    const { tool } = setup(f);
    await tool('get_policies').handler({});
    expect(calledUrl(f)).toBe('http://localhost:3100/v1/policies');
  });
});
