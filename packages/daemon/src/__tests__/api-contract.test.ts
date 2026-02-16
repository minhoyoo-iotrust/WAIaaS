/**
 * API Contract Tests -- 서버 스키마 필드명과 클라이언트 참조 필드명의 일치를 검증.
 *
 * 서버(Zod 스키마)와 클라이언트(Admin/CLI/SDK/MCP) 간 필드명 불일치가
 * 반복 발생(#006, #033)하여, 주요 응답 스키마의 필드명을 빌드 타임에
 * 검증하는 Contract Test를 추가한다.
 *
 * @see objectives/issues/v1.5-034-openapi-client-type-generation.md
 */

import { describe, it, expect } from 'vitest';
import {
  WalletNetworksResponseSchema,
  WalletListResponseSchema,
  WalletDetailResponseSchema,
  WalletAssetsResponseSchema,
  WalletBalanceResponseSchema,
  SessionCreateResponseSchema,
  TxListResponseSchema,
  TxDetailResponseSchema,
  PolicyResponseSchema,
  SettingsResponseSchema,
} from '../api/routes/openapi-schemas.js';

describe('API response schema field names — contract tests', () => {
  it('WalletNetworksResponse: availableNetworks (not networks)', () => {
    const keys = Object.keys(WalletNetworksResponseSchema.shape);
    expect(keys).toContain('availableNetworks');
    expect(keys).not.toContain('networks');
  });

  it('WalletListResponse: items (not wallets/agents)', () => {
    const keys = Object.keys(WalletListResponseSchema.shape);
    expect(keys).toContain('items');
    expect(keys).not.toContain('wallets');
    expect(keys).not.toContain('agents');
  });

  it('WalletDetailResponse contains expected fields', () => {
    const keys = Object.keys(WalletDetailResponseSchema.shape);
    expect(keys).toContain('id');
    expect(keys).toContain('name');
    expect(keys).toContain('chain');
  });

  it('WalletAssetsResponse: assets (not tokens/balances)', () => {
    const keys = Object.keys(WalletAssetsResponseSchema.shape);
    expect(keys).toContain('assets');
    expect(keys).not.toContain('tokens');
    expect(keys).not.toContain('balances');
  });

  it('WalletBalanceResponse: balance (not amount)', () => {
    const keys = Object.keys(WalletBalanceResponseSchema.shape);
    expect(keys).toContain('balance');
    expect(keys).not.toContain('amount');
  });

  it('TxListResponse: items (not transactions)', () => {
    const keys = Object.keys(TxListResponseSchema.shape);
    expect(keys).toContain('items');
    expect(keys).not.toContain('transactions');
  });

  it('TxDetailResponse: id and status fields exist', () => {
    const keys = Object.keys(TxDetailResponseSchema.shape);
    expect(keys).toContain('id');
    expect(keys).toContain('status');
  });

  it('SessionCreateResponse: token field exists', () => {
    const keys = Object.keys(SessionCreateResponseSchema.shape);
    expect(keys).toContain('token');
  });

  it('PolicyResponse: id and type fields exist', () => {
    const keys = Object.keys(PolicyResponseSchema.shape);
    expect(keys).toContain('id');
    expect(keys).toContain('type');
  });

  it('SettingsResponse contains expected top-level fields', () => {
    const keys = Object.keys(SettingsResponseSchema.shape);
    expect(keys.length).toBeGreaterThan(0);
  });
});
