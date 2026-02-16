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

  it('all 86 error codes have corresponding messages', () => {
    const en = getMessages('en');
    expect(Object.keys(en.errors).length).toBe(86);
  });

  it('error code keys match ERROR_CODES keys', () => {
    const en = getMessages('en');
    const errorCodeKeys = Object.keys(ERROR_CODES).sort();
    const messageKeys = Object.keys(en.errors).sort();
    expect(messageKeys).toEqual(errorCodeKeys);
  });
});
