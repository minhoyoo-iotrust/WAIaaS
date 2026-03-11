import { describe, it, expect } from 'vitest';
import { getMessages, ERROR_CODES } from '../index.js';

describe('i18n message system', () => {
  it('getMessages("en") returns English messages', () => {
    const msg = getMessages('en');
    expect(msg.errors.WALLET_NOT_FOUND).toBe('Wallet not found');
    expect(msg.system.daemon_started).toBe('WAIaaS daemon started');
    expect(msg.cli.prompt_master_password).toBe('Enter master password:');
  });

  it('getMessages("ko") returns Korean messages', () => {
    const msg = getMessages('ko');
    expect(msg.errors.WALLET_NOT_FOUND).toBe('지갑을 찾을 수 없습니다');
    expect(msg.system.daemon_started).toBe('WAIaaS 데몬이 시작되었습니다');
    expect(msg.cli.prompt_master_password).toBe('마스터 패스워드를 입력하세요:');
  });

  it('default locale is "en"', () => {
    const msg = getMessages();
    expect(msg.errors.WALLET_NOT_FOUND).toBe('Wallet not found');
  });

  it('en and ko error message keys are identical', () => {
    const en = getMessages('en');
    const ko = getMessages('ko');
    const enKeys = Object.keys(en.errors).sort();
    const koKeys = Object.keys(ko.errors).sort();
    expect(enKeys).toEqual(koKeys);
  });

  it('en and ko system message keys are identical', () => {
    const en = getMessages('en');
    const ko = getMessages('ko');
    expect(Object.keys(en.system).sort()).toEqual(Object.keys(ko.system).sort());
  });

  it('en and ko cli message keys are identical', () => {
    const en = getMessages('en');
    const ko = getMessages('ko');
    expect(Object.keys(en.cli).sort()).toEqual(Object.keys(ko.cli).sort());
  });

  it('all 121 error codes have corresponding messages', () => {
    // v29.3: +WALLET_ID_REQUIRED, +NETWORK_REQUIRED, -CANNOT_REMOVE_DEFAULT_WALLET (net +1)
    // v29.7: +SIGNING_DISABLED, +WALLET_APP_DUPLICATE, +WALLET_APP_NOT_FOUND (+3)
    // v29.9: +RENEWAL_NOT_REQUIRED (+1)
    // v30.2: +SIMULATION_TIMEOUT, +INVALID_BACKUP_FORMAT, +UNSUPPORTED_BACKUP_VERSION, +BACKUP_CORRUPTED, +BACKUP_NOT_FOUND, +WEBHOOK_NOT_FOUND, +RULE_NOT_FOUND (+7)
    // v30.6: +PAYMASTER_REJECTED, +TRANSACTION_TIMEOUT, +TRANSACTION_REVERTED (+3)
    // v30.10: +UNSUPPORTED_CHAIN, +ERC8128_DISABLED, +ERC8128_DOMAIN_NOT_ALLOWED, +ERC8128_RATE_LIMITED (+4)
    // v31.0: +NFT_NOT_FOUND, +INDEXER_NOT_CONFIGURED, +UNSUPPORTED_NFT_STANDARD, +INDEXER_API_ERROR, +NFT_METADATA_FETCH_FAILED (+5)
    // v31.2: +EXPIRED_BUILD, +BUILD_NOT_FOUND, +BUILD_ALREADY_USED, +CALLDATA_MISMATCH, +SENDER_MISMATCH (+5)
    const en = getMessages('en');
    // v31.3: +DEPRECATED_SMART_ACCOUNT (+1)
    // v31.9: +WALLET_NOT_TERMINATED (+1)
    // v31.10: +INVALID_TOKEN_IDENTIFIER, +STATS_NOT_CONFIGURED (+2)
    expect(Object.keys(en.errors).length).toBe(137);
  });

  it('error code keys match ERROR_CODES keys', () => {
    const en = getMessages('en');
    const errorCodeKeys = Object.keys(ERROR_CODES).sort();
    const messageKeys = Object.keys(en.errors).sort();
    expect(messageKeys).toEqual(errorCodeKeys);
  });
});
