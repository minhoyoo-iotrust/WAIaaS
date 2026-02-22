import { describe, it, expect } from 'vitest';
import * as core from '../index.js';

describe('@waiaas/core package export verification', () => {
  it('12 enum as const arrays are exported', () => {
    expect(core.CHAIN_TYPES).toBeDefined();
    expect(core.NETWORK_TYPES).toBeDefined();
    expect(core.WALLET_STATUSES).toBeDefined();
    expect(core.TRANSACTION_STATUSES).toBeDefined();
    expect(core.TRANSACTION_TYPES).toBeDefined();
    expect(core.POLICY_TYPES).toBeDefined();
    expect(core.POLICY_TIERS).toBeDefined();
    expect(core.SESSION_STATUSES).toBeDefined();
    expect(core.NOTIFICATION_EVENT_TYPES).toBeDefined();
    expect(core.AUDIT_ACTIONS).toBeDefined();
    expect(core.KILL_SWITCH_STATES).toBeDefined();
    expect(core.OWNER_STATES).toBeDefined();
  });

  it('12 Zod enums are exported', () => {
    expect(core.ChainTypeEnum).toBeDefined();
    expect(core.NetworkTypeEnum).toBeDefined();
    expect(core.WalletStatusEnum).toBeDefined();
    expect(core.TransactionStatusEnum).toBeDefined();
    expect(core.TransactionTypeEnum).toBeDefined();
    expect(core.PolicyTypeEnum).toBeDefined();
    expect(core.PolicyTierEnum).toBeDefined();
    expect(core.SessionStatusEnum).toBeDefined();
    expect(core.NotificationEventTypeEnum).toBeDefined();
    expect(core.AuditActionEnum).toBeDefined();
    expect(core.KillSwitchStateEnum).toBeDefined();
    expect(core.OwnerStateEnum).toBeDefined();
  });

  it('Zod SSoT schemas are exported', () => {
    expect(core.WalletSchema).toBeDefined();
    expect(core.CreateWalletRequestSchema).toBeDefined();
    expect(core.SessionSchema).toBeDefined();
    expect(core.TransactionSchema).toBeDefined();
    expect(core.SendTransactionRequestSchema).toBeDefined();
    expect(core.PolicySchema).toBeDefined();
    expect(core.ConfigSchema).toBeDefined();
  });

  it('error codes and WAIaaSError are exported', () => {
    expect(core.ERROR_CODES).toBeDefined();
    expect(core.WAIaaSError).toBeDefined();
    expect(Object.keys(core.ERROR_CODES)).toHaveLength(104);
  });

  it('getMessages function is exported', () => {
    expect(core.getMessages).toBeDefined();
    expect(typeof core.getMessages).toBe('function');
  });

  it('getMessages returns messages with correct structure', () => {
    const msg = core.getMessages('en');
    expect(msg).toHaveProperty('errors');
    expect(msg).toHaveProperty('system');
    expect(msg).toHaveProperty('cli');
  });

  it('CAIP-2/19 module exports are available', () => {
    // Schemas
    expect(core.Caip2Schema).toBeDefined();
    expect(core.Caip19Schema).toBeDefined();
    expect(core.Caip19AssetTypeSchema).toBeDefined();
    // Parsers/formatters
    expect(core.parseCaip2).toBeDefined();
    expect(core.formatCaip2).toBeDefined();
    expect(core.parseCaip19).toBeDefined();
    expect(core.formatCaip19).toBeDefined();
    // Network map
    expect(core.CAIP2_TO_NETWORK).toBeDefined();
    expect(core.NETWORK_TO_CAIP2).toBeDefined();
    expect(core.networkToCaip2).toBeDefined();
    expect(core.caip2ToNetwork).toBeDefined();
    // Asset helpers
    expect(core.nativeAssetId).toBeDefined();
    expect(core.tokenAssetId).toBeDefined();
    expect(core.isNativeAsset).toBeDefined();
  });
});
