/**
 * External Action Pipeline -- signedData and signedHttp execution paths.
 *
 * Implements the off-chain signed action pipeline:
 *   credential decrypt -> policy evaluate -> DB insert -> signer sign -> tracking enroll -> audit log
 *
 * signedData: Signs arbitrary payloads (EIP-712, HMAC, personal_sign, etc.)
 * signedHttp: Signs HTTP requests (ERC-8128, HMAC-SHA256) and optionally delegates execution to provider.
 *
 * SSoT: doc-81 D4.1~D4.3 (External Action Framework design).
 *
 * @since v31.12
 */

import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Database as SQLiteDatabase } from 'better-sqlite3';
import type { SignedDataAction, SignedHttpAction, IPolicyEngine, EventBus, IActionProvider } from '@waiaas/core';
import { WAIaaSError } from '@waiaas/core';
import type { LocalKeyStore } from '../infrastructure/keystore/keystore.js';
import type { ICredentialVault } from '../infrastructure/credential/credential-vault.js';
import type { ISignerCapabilityRegistry } from '../signing/registry.js';
import type { SigningParams } from '../signing/types.js';
import type { SettingsService } from '../infrastructure/settings/settings-service.js';
import type { NotificationService } from '../notifications/notification-service.js';
import type * as schema from '../infrastructure/database/schema.js';
import { transactions } from '../infrastructure/database/schema.js';
import { generateId } from '../infrastructure/database/id.js';
import { insertAuditLog } from '../infrastructure/database/audit-helper.js';

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface ExternalActionPipelineDeps {
  db: BetterSQLite3Database<typeof schema>;
  sqlite?: SQLiteDatabase;
  keyStore: LocalKeyStore;
  credentialVault: ICredentialVault;
  signerRegistry: ISignerCapabilityRegistry;
  policyEngine: IPolicyEngine;
  masterPassword: string;
  walletId: string;
  wallet: { publicKey: string; chain: string; environment: string };
  sessionId?: string;
  settingsService: SettingsService;
  eventBus?: EventBus;
  notificationService?: NotificationService;
  actionProviderKey: string;
  actionName: string;
}

// ---------------------------------------------------------------------------
// executeSignedDataAction
// ---------------------------------------------------------------------------

/**
 * Execute a signedData action through the off-chain pipeline.
 *
 * Flow: credential decrypt -> policy evaluate -> DB insert -> signer sign
 *       -> key release -> tracking enroll -> audit log -> return
 */
export async function executeSignedDataAction(
  deps: ExternalActionPipelineDeps,
  action: SignedDataAction,
): Promise<{ id: string; status: string }> {
  const txId = generateId();
  let privateKeyRef: Uint8Array | null = null;

  try {
    // 1. Credential decrypt (optional)
    let credentialValue: string | undefined;
    if (action.credentialRef) {
      const decrypted = await deps.credentialVault.get(action.credentialRef, deps.walletId);
      credentialValue = decrypted.value;
    }

    // 2. Policy evaluate (optional)
    if (action.policyContext) {
      const policyResult = await deps.policyEngine.evaluate(deps.walletId, {
        type: 'TRANSFER', // Use TRANSFER to avoid CONTRACT_WHITELIST default-deny
        amount: '0',
        toAddress: `external:${action.venue}`,
        chain: deps.wallet.chain,
        venue: action.venue,
        actionCategory: action.policyContext.actionCategory,
        notionalUsd: action.policyContext.notionalUsd,
      } as any);

      if (!policyResult.allowed) {
        throw new WAIaaSError('POLICY_DENIED', {
          message: policyResult.reason ?? 'Policy denied external action',
          details: { venue: action.venue, operation: action.operation },
        });
      }
    }

    // 3. DB INSERT
    const now = new Date();
    deps.db
      .insert(transactions)
      .values({
        id: txId,
        walletId: deps.walletId,
        sessionId: deps.sessionId ?? null,
        chain: deps.wallet.chain,
        type: 'CONTRACT_CALL',
        toAddress: `external:${action.venue}`,
        amount: '0',
        status: 'PENDING',
        createdAt: now,
        network: null,
        actionKind: 'signedData',
        venue: action.venue,
        operation: action.operation,
        metadata: JSON.stringify({
          provider: deps.actionProviderKey,
          action: deps.actionName,
          signingScheme: action.signingScheme,
          payloadKeys: Object.keys(action.payload),
        }),
      })
      .run();

    // 4. Get private key
    privateKeyRef = await deps.keyStore.decryptPrivateKey(deps.walletId, deps.masterPassword);
    const privateKeyHex = `0x${Buffer.from(privateKeyRef as unknown as ArrayBuffer).toString('hex')}` as `0x${string}`;

    // 5. Build signing params
    const signingParams = buildSignedDataParams(action, privateKeyHex, credentialValue);

    // 6. Sign
    const signer = deps.signerRegistry.resolve(action);
    const signingResult = await signer.sign(signingParams);

    // 7. Update DB: CONFIRMED
    const sigHex = typeof signingResult.signature === 'string'
      ? signingResult.signature.slice(0, 66)
      : `0x${Buffer.from(signingResult.signature).toString('hex').slice(0, 64)}`;

    deps.db
      .update(transactions)
      .set({
        status: 'CONFIRMED',
        txHash: `sig:${sigHex}`,
        executedAt: new Date(),
      })
      .where(eq(transactions.id, txId))
      .run();

    // 8. Tracking enrollment (optional)
    if (action.tracking) {
      deps.db
        .update(transactions)
        .set({
          bridgeStatus: 'PENDING',
          bridgeMetadata: JSON.stringify({
            trackerName: action.tracking.trackerName,
            ...(action.tracking.metadata ?? {}),
            enrolledAt: Date.now(),
          }),
        })
        .where(eq(transactions.id, txId))
        .run();
    }

    // 9. Audit log
    if (deps.sqlite) {
      insertAuditLog(deps.sqlite, {
        eventType: 'ACTION_SIGNED',
        actor: deps.sessionId ?? 'system',
        walletId: deps.walletId,
        txId,
        details: {
          venue: action.venue,
          operation: action.operation,
          signingScheme: action.signingScheme,
          provider: deps.actionProviderKey,
        },
        severity: 'info',
      });
    }

    return { id: txId, status: 'CONFIRMED' };
  } catch (error) {
    // On error: mark DB as FAILED (best-effort)
    try {
      deps.db
        .update(transactions)
        .set({
          status: 'FAILED',
          error: error instanceof Error ? error.message : 'Unknown error',
        })
        .where(eq(transactions.id, txId))
        .run();
    } catch {
      // Best-effort DB update
    }
    throw error;
  } finally {
    // Always release key
    if (privateKeyRef) {
      deps.keyStore.releaseKey(privateKeyRef);
    }
  }
}

// ---------------------------------------------------------------------------
// executeSignedHttpAction
// ---------------------------------------------------------------------------

/**
 * Execute a signedHttp action through the off-chain pipeline.
 *
 * Flow: credential decrypt -> policy evaluate -> DB insert -> signer sign
 *       -> key release -> provider.execute() callback -> tracking enroll -> audit log -> return
 */
export async function executeSignedHttpAction(
  deps: ExternalActionPipelineDeps,
  action: SignedHttpAction,
  provider?: IActionProvider,
): Promise<{ id: string; status: string }> {
  const txId = generateId();
  let privateKeyRef: Uint8Array | null = null;

  try {
    // 1. Credential decrypt (optional)
    let credentialValue: string | undefined;
    if (action.credentialRef) {
      const decrypted = await deps.credentialVault.get(action.credentialRef, deps.walletId);
      credentialValue = decrypted.value;
    }

    // 2. Policy evaluate (optional)
    if (action.policyContext) {
      const policyResult = await deps.policyEngine.evaluate(deps.walletId, {
        type: 'TRANSFER',
        amount: '0',
        toAddress: `external:${action.venue}`,
        chain: deps.wallet.chain,
        venue: action.venue,
        actionCategory: action.policyContext.actionCategory,
        notionalUsd: action.policyContext.notionalUsd,
      } as any);

      if (!policyResult.allowed) {
        throw new WAIaaSError('POLICY_DENIED', {
          message: policyResult.reason ?? 'Policy denied external action',
          details: { venue: action.venue, operation: action.operation },
        });
      }
    }

    // 3. DB INSERT
    const now = new Date();
    deps.db
      .insert(transactions)
      .values({
        id: txId,
        walletId: deps.walletId,
        sessionId: deps.sessionId ?? null,
        chain: deps.wallet.chain,
        type: 'CONTRACT_CALL',
        toAddress: `external:${action.venue}`,
        amount: '0',
        status: 'PENDING',
        createdAt: now,
        network: null,
        actionKind: 'signedHttp',
        venue: action.venue,
        operation: action.operation,
        metadata: JSON.stringify({
          provider: deps.actionProviderKey,
          action: deps.actionName,
          signingScheme: action.signingScheme,
          method: action.method,
          url: action.url,
        }),
      })
      .run();

    // 4. Get private key
    privateKeyRef = await deps.keyStore.decryptPrivateKey(deps.walletId, deps.masterPassword);
    const privateKeyHex = `0x${Buffer.from(privateKeyRef as unknown as ArrayBuffer).toString('hex')}` as `0x${string}`;

    // 5. Build signing params
    const signingParams = buildSignedHttpParams(action, privateKeyHex, credentialValue);

    // 6. Sign
    const signer = deps.signerRegistry.resolve(action);
    const signingResult = await signer.sign(signingParams);

    // 7. Build signed request
    const signedHeaders = {
      ...action.headers,
      ...(signingResult.metadata as Record<string, string> | undefined ?? {}),
    };

    // 8. Provider execute callback (optional)
    let externalId: string | undefined;
    if (provider?.execute) {
      const executeResult = await provider.execute(
        action.actionName ?? deps.actionName,
        {
          ...action,
          headers: signedHeaders,
        },
        {
          walletAddress: deps.wallet.publicKey,
          chain: deps.wallet.chain as any,
          walletId: deps.walletId,
          sessionId: deps.sessionId,
        },
      );
      if (executeResult && typeof executeResult === 'object' && 'externalId' in executeResult) {
        externalId = (executeResult as any).externalId;
      }
    }

    // 9. Update DB: CONFIRMED
    const sigHex = typeof signingResult.signature === 'string'
      ? signingResult.signature.slice(0, 66)
      : `0x${Buffer.from(signingResult.signature).toString('hex').slice(0, 64)}`;

    deps.db
      .update(transactions)
      .set({
        status: 'CONFIRMED',
        txHash: `sig:${sigHex}`,
        executedAt: new Date(),
        ...(externalId ? { externalId } : {}),
      })
      .where(eq(transactions.id, txId))
      .run();

    // 10. Tracking enrollment (optional)
    if (action.tracking) {
      deps.db
        .update(transactions)
        .set({
          bridgeStatus: 'PENDING',
          bridgeMetadata: JSON.stringify({
            trackerName: action.tracking.trackerName,
            ...(action.tracking.metadata ?? {}),
            enrolledAt: Date.now(),
          }),
        })
        .where(eq(transactions.id, txId))
        .run();
    }

    // 11. Audit log
    if (deps.sqlite) {
      insertAuditLog(deps.sqlite, {
        eventType: 'ACTION_HTTP_SIGNED',
        actor: deps.sessionId ?? 'system',
        walletId: deps.walletId,
        txId,
        details: {
          venue: action.venue,
          operation: action.operation,
          signingScheme: action.signingScheme,
          method: action.method,
          url: action.url,
          provider: deps.actionProviderKey,
        },
        severity: 'info',
      });
    }

    return { id: txId, status: 'CONFIRMED' };
  } catch (error) {
    // On error: mark DB as FAILED (best-effort)
    try {
      deps.db
        .update(transactions)
        .set({
          status: 'FAILED',
          error: error instanceof Error ? error.message : 'Unknown error',
        })
        .where(eq(transactions.id, txId))
        .run();
    } catch {
      // Best-effort DB update
    }
    throw error;
  } finally {
    // Always release key
    if (privateKeyRef) {
      deps.keyStore.releaseKey(privateKeyRef);
    }
  }
}

// ---------------------------------------------------------------------------
// Signing params builders
// ---------------------------------------------------------------------------

/**
 * Build SigningParams for a signedData action based on signingScheme.
 */
function buildSignedDataParams(
  action: SignedDataAction,
  privateKeyHex: `0x${string}`,
  credentialValue?: string,
): SigningParams {
  const { signingScheme, payload } = action;

  switch (signingScheme) {
    case 'eip712':
      return {
        scheme: 'eip712',
        privateKey: privateKeyHex,
        domain: (payload.domain as Record<string, unknown>) ?? {},
        types: (payload.types as Record<string, Array<{ name: string; type: string }>>) ?? {},
        primaryType: (payload.primaryType as string) ?? 'Message',
        value: (payload.value as Record<string, unknown>) ?? payload,
      };
    case 'personal':
      return {
        scheme: 'personal',
        privateKey: privateKeyHex,
        message: typeof payload === 'string' ? payload : JSON.stringify(payload),
      };
    case 'hmac-sha256':
      return {
        scheme: 'hmac-sha256',
        secret: credentialValue ?? '',
        data: typeof payload === 'string' ? payload : JSON.stringify(payload),
      };
    case 'rsa-pss':
      return {
        scheme: 'rsa-pss',
        privateKey: credentialValue ?? '',
        data: typeof payload === 'string' ? payload : JSON.stringify(payload),
      };
    case 'ecdsa-secp256k1':
      return {
        scheme: 'ecdsa-secp256k1',
        privateKey: privateKeyHex,
        data: typeof payload === 'string' ? payload : JSON.stringify(payload),
      };
    case 'ed25519':
      return {
        scheme: 'ed25519',
        privateKey: Buffer.from(privateKeyHex.slice(2), 'hex') as unknown as Uint8Array,
        data: Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload)) as unknown as Uint8Array,
      };
    case 'erc8128':
      // erc8128 is HTTP-specific, but can appear in signedData if payload includes request info
      return {
        scheme: 'erc8128',
        privateKey: privateKeyHex,
        chainId: (payload.chainId as number) ?? 1,
        address: (payload.address as string) ?? '',
        method: (payload.method as string) ?? 'GET',
        url: (payload.url as string) ?? '',
        headers: (payload.headers as Record<string, string>) ?? {},
        body: payload.body as string | undefined,
      };
    default:
      throw new WAIaaSError('SIGNING_SCHEME_UNSUPPORTED', {
        message: `Unsupported signing scheme: ${signingScheme}`,
        details: { signingScheme },
      });
  }
}

/**
 * Build SigningParams for a signedHttp action based on signingScheme.
 */
function buildSignedHttpParams(
  action: SignedHttpAction,
  privateKeyHex: `0x${string}`,
  credentialValue?: string,
): SigningParams {
  const { signingScheme } = action;

  switch (signingScheme) {
    case 'erc8128':
      return {
        scheme: 'erc8128',
        privateKey: privateKeyHex,
        chainId: 1, // Default chainId; can be overridden by action metadata
        address: '', // Filled by the capability from the wallet
        method: action.method,
        url: action.url,
        headers: action.headers ?? {},
        body: action.body,
        coveredComponents: action.coveredComponents,
        preset: action.preset as 'minimal' | 'standard' | 'strict' | undefined,
        ttlSec: action.ttlSec,
        nonce: action.nonce,
      };
    case 'hmac-sha256':
      return {
        scheme: 'hmac-sha256',
        secret: credentialValue ?? '',
        data: `${action.method} ${action.url}\n${action.body ?? ''}`,
      };
    default:
      throw new WAIaaSError('SIGNING_SCHEME_UNSUPPORTED', {
        message: `Unsupported HTTP signing scheme: ${signingScheme}`,
        details: { signingScheme },
      });
  }
}
