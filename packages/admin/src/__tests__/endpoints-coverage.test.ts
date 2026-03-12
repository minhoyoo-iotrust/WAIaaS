/**
 * Coverage test for API endpoint helper functions in endpoints.ts.
 * Ensures all URL builder functions are exercised.
 */
import { describe, it, expect } from 'vitest';
import { API } from '../api/endpoints';

describe('API endpoint URL builders', () => {
  it('WALLET returns correct URL', () => {
    expect(API.WALLET('w1')).toBe('/v1/wallets/w1');
  });

  it('SESSION returns correct URL', () => {
    expect(API.SESSION('s1')).toBe('/v1/sessions/s1');
  });

  it('POLICY returns correct URL', () => {
    expect(API.POLICY('p1')).toBe('/v1/policies/p1');
  });

  it('WALLET_NETWORKS returns correct URL', () => {
    expect(API.WALLET_NETWORKS('w1')).toBe('/v1/wallets/w1/networks');
  });

  it('ADMIN_WALLET_BALANCE returns correct URL', () => {
    expect(API.ADMIN_WALLET_BALANCE('w1')).toBe('/v1/admin/wallets/w1/balance');
  });

  it('ADMIN_WALLET_TRANSACTIONS returns correct URL', () => {
    expect(API.ADMIN_WALLET_TRANSACTIONS('w1')).toBe('/v1/admin/wallets/w1/transactions');
  });

  it('ADMIN_API_KEY returns correct URL', () => {
    expect(API.ADMIN_API_KEY('openai')).toBe('/v1/admin/api-keys/openai');
  });

  it('ADMIN_TELEGRAM_USER returns correct URL', () => {
    expect(API.ADMIN_TELEGRAM_USER(123)).toBe('/v1/admin/telegram-users/123');
  });

  it('WALLET_OWNER returns correct URL', () => {
    expect(API.WALLET_OWNER('w1')).toBe('/v1/wallets/w1/owner');
  });

  it('WALLET_WITHDRAW returns correct URL', () => {
    expect(API.WALLET_WITHDRAW('w1')).toBe('/v1/wallets/w1/withdraw');
  });

  it('WALLET_WC_PAIR returns correct URL', () => {
    expect(API.WALLET_WC_PAIR('w1')).toBe('/v1/wallets/w1/wc/pair');
  });

  it('WALLET_WC_SESSION returns correct URL', () => {
    expect(API.WALLET_WC_SESSION('w1')).toBe('/v1/wallets/w1/wc/session');
  });

  it('WALLET_WC_PAIR_STATUS returns correct URL', () => {
    expect(API.WALLET_WC_PAIR_STATUS('w1')).toBe('/v1/wallets/w1/wc/pair/status');
  });

  it('WALLET_OWNER_VERIFY returns correct URL', () => {
    expect(API.WALLET_OWNER_VERIFY('w1')).toBe('/v1/wallets/w1/owner/verify');
  });

  it('WALLET_SUSPEND returns correct URL', () => {
    expect(API.WALLET_SUSPEND('w1')).toBe('/v1/wallets/w1/suspend');
  });

  it('WALLET_RESUME returns correct URL', () => {
    expect(API.WALLET_RESUME('w1')).toBe('/v1/wallets/w1/resume');
  });

  it('WALLET_PURGE returns correct URL', () => {
    expect(API.WALLET_PURGE('w1')).toBe('/v1/wallets/w1/purge');
  });

  it('ADMIN_SESSION_REISSUE returns correct URL', () => {
    expect(API.ADMIN_SESSION_REISSUE('s1')).toBe('/v1/admin/sessions/s1/reissue');
  });

  it('ADMIN_TX_CANCEL returns correct URL', () => {
    expect(API.ADMIN_TX_CANCEL('tx1')).toBe('/v1/admin/transactions/tx1/cancel');
  });

  it('ADMIN_TX_REJECT returns correct URL', () => {
    expect(API.ADMIN_TX_REJECT('tx1')).toBe('/v1/admin/transactions/tx1/reject');
  });

  it('WALLET_PATCH returns correct URL', () => {
    expect(API.WALLET_PATCH('w1')).toBe('/v1/wallets/w1');
  });

  it('ADMIN_WALLET_STAKING returns correct URL', () => {
    expect(API.ADMIN_WALLET_STAKING('w1')).toBe('/v1/admin/wallets/w1/staking');
  });

  it('ADMIN_WALLET_APP returns correct URL', () => {
    expect(API.ADMIN_WALLET_APP('app1')).toBe('/v1/admin/wallet-apps/app1');
  });

  it('ADMIN_WALLET_APP_TEST_NOTIFICATION returns correct URL', () => {
    expect(API.ADMIN_WALLET_APP_TEST_NOTIFICATION('app1')).toBe('/v1/admin/wallet-apps/app1/test-notification');
  });

  it('ERC8004_AGENT returns correct URL', () => {
    expect(API.ERC8004_AGENT('a1')).toBe('/v1/erc8004/agent/a1');
  });

  it('ERC8004_REPUTATION returns correct URL', () => {
    expect(API.ERC8004_REPUTATION('a1')).toBe('/v1/erc8004/agent/a1/reputation');
  });

  it('ERC8004_REGISTRATION_FILE returns correct URL', () => {
    expect(API.ERC8004_REGISTRATION_FILE('w1')).toBe('/v1/erc8004/registration-file/w1');
  });

  it('ERC8004_VALIDATION returns correct URL', () => {
    expect(API.ERC8004_VALIDATION('h1')).toBe('/v1/erc8004/validation/h1');
  });

  it('WALLET_PROVIDER returns correct URL', () => {
    expect(API.WALLET_PROVIDER('w1')).toBe('/v1/wallets/w1/provider');
  });

  it('ADMIN_WALLET_NFTS returns correct URL', () => {
    expect(API.ADMIN_WALLET_NFTS('w1')).toBe('/v1/wallets/w1/nfts');
  });

  it('ADMIN_WALLET_NFT_METADATA returns correct URL', () => {
    expect(API.ADMIN_WALLET_NFT_METADATA('w1', 'nft1')).toBe('/v1/wallets/w1/nfts/nft1');
  });

  it('ADMIN_CREDENTIAL_DELETE returns correct URL', () => {
    expect(API.ADMIN_CREDENTIAL_DELETE('ref1')).toBe('/v1/admin/credentials/ref1');
  });

  it('ADMIN_CREDENTIAL_ROTATE returns correct URL', () => {
    expect(API.ADMIN_CREDENTIAL_ROTATE('ref1')).toBe('/v1/admin/credentials/ref1/rotate');
  });

  it('WALLET_CREDENTIALS returns correct URL', () => {
    expect(API.WALLET_CREDENTIALS('w1')).toBe('/v1/wallets/w1/credentials');
  });

  it('WALLET_CREDENTIAL_DELETE returns correct URL', () => {
    expect(API.WALLET_CREDENTIAL_DELETE('w1', 'ref1')).toBe('/v1/wallets/w1/credentials/ref1');
  });

  it('WALLET_CREDENTIAL_ROTATE returns correct URL', () => {
    expect(API.WALLET_CREDENTIAL_ROTATE('w1', 'ref1')).toBe('/v1/wallets/w1/credentials/ref1/rotate');
  });

  it('WALLET_ACTIONS returns correct URL', () => {
    expect(API.WALLET_ACTIONS('w1')).toBe('/v1/wallets/w1/actions');
  });

  it('WALLET_ACTION_DETAIL returns correct URL', () => {
    expect(API.WALLET_ACTION_DETAIL('w1', 'act1')).toBe('/v1/wallets/w1/actions/act1');
  });
});
