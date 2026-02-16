/**
 * WcSigningBridge unit tests: signing request / response / rejection / timeout.
 *
 * Tests every branch of requestSignature() without real WC relay connection.
 * Mocks: wcSessionService, approvalWorkflow, signClient, verifySIWE, address-validation.
 *
 * sodium-native is loaded via createRequire() (CJS interop), so vi.mock cannot
 * intercept it. Instead, we mock address-validation.js (decodeBase58) to return
 * properly-sized buffers, and accept that the real sodium-native is used.
 * For Solana verification tests we provide real Ed25519 keypair + signature.
 *
 * Uses in-memory SQLite with pushSchema for a fresh DB per test.
 */

import { createRequire } from 'node:module';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Database as DatabaseType } from 'better-sqlite3';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import type * as schema from '../infrastructure/database/schema.js';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { WcSigningBridge, type WcSigningBridgeDeps } from '../services/wc-signing-bridge.js';

// ---------------------------------------------------------------------------
// Mock verifySIWE -- must be before WcSigningBridge import is resolved
// ---------------------------------------------------------------------------

const mockVerifySIWE = vi.fn();

vi.mock('../api/middleware/siwe-verify.js', () => ({
  verifySIWE: (...args: unknown[]) => mockVerifySIWE(...args),
}));

// ---------------------------------------------------------------------------
// Generate real Ed25519 keypair for Solana tests
// (sodium-native is loaded via createRequire, so we use the real one)
// ---------------------------------------------------------------------------

const require_ = createRequire(import.meta.url);
const sodium = require_('sodium-native') as typeof import('sodium-native');

const solPublicKey = Buffer.alloc(32);
const solSecretKey = Buffer.alloc(64);
sodium.crypto_sign_keypair(solPublicKey, solSecretKey);

/**
 * Sign a message with the test Ed25519 secret key and return the raw 64-byte signature.
 */
function signEd25519(message: string): Buffer {
  const msg = Buffer.from(message, 'utf8');
  const signed = Buffer.alloc(64 + msg.length);
  sodium.crypto_sign(signed, msg, solSecretKey);
  return Buffer.from(signed.subarray(0, 64)); // 64-byte detached signature
}

// Base58 encode/decode for test fixture generation
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function encodeBase58(buf: Buffer): string {
  let zeroes = 0;
  for (let i = 0; i < buf.length && buf[i] === 0; i++) zeroes++;
  const size = Math.ceil((buf.length * 138) / 100) + 1;
  const b58 = new Uint8Array(size);
  let length = 0;
  for (let i = zeroes; i < buf.length; i++) {
    let carry = buf[i]!;
    let j = 0;
    for (let k = size - 1; k >= 0 && (carry !== 0 || j < length); k--, j++) {
      carry += 256 * (b58[k] ?? 0);
      b58[k] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    length = j;
  }
  let start = size - length;
  while (start < size && b58[start] === 0) start++;
  let result = '1'.repeat(zeroes);
  for (let i = start; i < size; i++) result += BASE58_ALPHABET[b58[i]!];
  return result;
}

// Pre-compute test fixtures
const SOL_PUBKEY_B58 = encodeBase58(solPublicKey);

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const WALLET_ID = 'test-wallet-001';
const TX_ID = 'test-tx-001';
const TOPIC = 'topic-abc123';
const EVM_OWNER = '0x1234567890abcdef1234567890abcdef12345678';
const EVM_CHAIN_ID = 'eip155:11155111';
const SOL_OWNER = SOL_PUBKEY_B58;
const SOL_CHAIN_ID = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1';

function createTestDb(): { sqlite: DatabaseType; db: BetterSQLite3Database<typeof schema> } {
  const conn = createDatabase(':memory:');
  pushSchema(conn.sqlite);
  return conn;
}

function nowEpoch(): number {
  return Math.floor(Date.now() / 1000);
}

function insertTestWallet(sqlite: DatabaseType, walletId: string, chain = 'ethereum'): void {
  const ts = nowEpoch();
  sqlite.prepare(
    `INSERT INTO wallets (id, name, chain, environment, default_network, public_key, status, owner_verified, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(walletId, `Wallet`, chain, 'testnet', chain === 'ethereum' ? 'ethereum-sepolia' : 'devnet', `pk-${walletId}`, 'ACTIVE', 0, ts, ts);
}

function insertTestTransaction(sqlite: DatabaseType, walletId: string, txId: string): void {
  const ts = nowEpoch();
  sqlite.prepare(
    `INSERT INTO transactions (id, wallet_id, chain, type, amount, to_address, status, tier, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(txId, walletId, 'ethereum', 'TRANSFER', '1000000000', '0xRecipient', 'PENDING', 'APPROVAL', ts);
}

function insertTestApproval(sqlite: DatabaseType, txId: string, expiresAt?: number): void {
  const ts = nowEpoch();
  const expiry = expiresAt ?? (ts + 300);
  sqlite.prepare(
    `INSERT INTO pending_approvals (id, tx_id, expires_at, approval_channel, required_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(`appr-${txId}`, txId, expiry, 'rest_api', expiry, ts);
}

function getApprovalChannel(sqlite: DatabaseType, txId: string): string | undefined {
  const row = sqlite.prepare(
    'SELECT approval_channel FROM pending_approvals WHERE tx_id = ?',
  ).get(txId) as { approval_channel: string } | undefined;
  return row?.approval_channel;
}

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockSignClient() {
  return {
    request: vi.fn(),
  };
}

function createMockWcSessionService(overrides: {
  signClient?: any;
  sessionTopic?: string | null;
  sessionInfo?: any;
} = {}) {
  return {
    getSignClient: vi.fn().mockReturnValue(overrides.signClient ?? null),
    getSessionTopic: vi.fn().mockReturnValue(overrides.sessionTopic ?? null),
    getSessionInfo: vi.fn().mockReturnValue(overrides.sessionInfo ?? null),
    hasActiveSession: vi.fn().mockReturnValue(false),
  };
}

function createMockApprovalWorkflow() {
  return {
    approve: vi.fn(),
    reject: vi.fn(),
    requestApproval: vi.fn(),
    processExpiredApprovals: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WcSigningBridge', () => {
  let sqlite: DatabaseType;
  let db: BetterSQLite3Database<typeof schema>;
  let bridge: WcSigningBridge;
  let mockSignClient: ReturnType<typeof createMockSignClient>;
  let mockWcSessionService: ReturnType<typeof createMockWcSessionService>;
  let mockApprovalWorkflow: ReturnType<typeof createMockApprovalWorkflow>;

  beforeEach(() => {
    vi.clearAllMocks();
    const conn = createTestDb();
    sqlite = conn.sqlite;
    db = conn.db;
    mockSignClient = createMockSignClient();
    mockApprovalWorkflow = createMockApprovalWorkflow();
  });

  afterEach(() => {
    try { sqlite.close(); } catch { /* already closed */ }
  });

  function createBridge(overrides: {
    signClient?: any;
    sessionTopic?: string | null;
    sessionInfo?: any;
    notificationService?: any;
    eventBus?: any;
  } = {}): WcSigningBridge {
    mockWcSessionService = createMockWcSessionService(overrides);
    const deps: WcSigningBridgeDeps = {
      wcServiceRef: { current: mockWcSessionService as any },
      approvalWorkflow: mockApprovalWorkflow as any,
      sqlite,
      notificationService: overrides.notificationService,
      eventBus: overrides.eventBus,
    };
    return new WcSigningBridge(deps);
  }

  // -------------------------------------------------------------------------
  // requestSignature - WC session not available
  // -------------------------------------------------------------------------

  describe('requestSignature - WC session not available', () => {
    it('should return silently when signClient is null', async () => {
      bridge = createBridge({ signClient: null });

      await bridge.requestSignature(WALLET_ID, TX_ID, 'ethereum');

      expect(mockWcSessionService.getSignClient).toHaveBeenCalled();
      expect(mockApprovalWorkflow.approve).not.toHaveBeenCalled();
      expect(mockApprovalWorkflow.reject).not.toHaveBeenCalled();
    });

    it('should return silently when no session topic for wallet', async () => {
      bridge = createBridge({ signClient: mockSignClient, sessionTopic: null });

      await bridge.requestSignature(WALLET_ID, TX_ID, 'ethereum');

      expect(mockWcSessionService.getSessionTopic).toHaveBeenCalledWith(WALLET_ID);
      expect(mockSignClient.request).not.toHaveBeenCalled();
    });

    it('should return silently when no session info for wallet', async () => {
      bridge = createBridge({
        signClient: mockSignClient,
        sessionTopic: TOPIC,
        sessionInfo: null,
      });

      await bridge.requestSignature(WALLET_ID, TX_ID, 'ethereum');

      expect(mockWcSessionService.getSessionInfo).toHaveBeenCalledWith(WALLET_ID);
      expect(mockSignClient.request).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // requestSignature - EVM (personal_sign / SIWE)
  // -------------------------------------------------------------------------

  describe('requestSignature - EVM (personal_sign)', () => {
    beforeEach(() => {
      insertTestWallet(sqlite, WALLET_ID, 'ethereum');
      insertTestTransaction(sqlite, WALLET_ID, TX_ID);
      insertTestApproval(sqlite, TX_ID);

      bridge = createBridge({
        signClient: mockSignClient,
        sessionTopic: TOPIC,
        sessionInfo: {
          walletId: WALLET_ID,
          topic: TOPIC,
          chainId: EVM_CHAIN_ID,
          ownerAddress: EVM_OWNER,
          peerName: 'TestWallet',
          peerUrl: 'https://test.example.com',
          expiry: nowEpoch() + 86400,
          createdAt: nowEpoch(),
        },
      });

      // Default: signClient.request resolves with a valid signature
      mockSignClient.request.mockResolvedValue('0xfakesig123');
    });

    it('should call signClient.request with personal_sign method', async () => {
      mockVerifySIWE.mockResolvedValue({ valid: true, address: EVM_OWNER });

      await bridge.requestSignature(WALLET_ID, TX_ID, 'ethereum');

      expect(mockSignClient.request).toHaveBeenCalledTimes(1);
      const callArgs = mockSignClient.request.mock.calls[0][0];
      expect(callArgs.topic).toBe(TOPIC);
      expect(callArgs.chainId).toBe(EVM_CHAIN_ID);
      expect(callArgs.request.method).toBe('personal_sign');
    });

    it('should use SIWE message format (hex-encoded, Approve transaction)', async () => {
      mockVerifySIWE.mockResolvedValue({ valid: true, address: EVM_OWNER });

      await bridge.requestSignature(WALLET_ID, TX_ID, 'ethereum');

      const callArgs = mockSignClient.request.mock.calls[0][0];
      const params = callArgs.request.params as string[];
      // First param: hex-encoded message starting with 0x
      expect(params[0]).toMatch(/^0x/);
      // Decode hex to check SIWE message content
      const decoded = Buffer.from(params[0].slice(2), 'hex').toString('utf8');
      expect(decoded).toContain('Approve transaction');
      expect(decoded).toContain(TX_ID);
      // Second param: owner address
      expect(params[1]).toBe(EVM_OWNER);
    });

    it('should call approvalWorkflow.approve on successful SIWE verification', async () => {
      mockVerifySIWE.mockResolvedValue({ valid: true, address: EVM_OWNER });

      await bridge.requestSignature(WALLET_ID, TX_ID, 'ethereum');

      expect(mockVerifySIWE).toHaveBeenCalledTimes(1);
      expect(mockApprovalWorkflow.approve).toHaveBeenCalledWith(TX_ID, '0xfakesig123');
    });

    it('should NOT approve when SIWE verification fails', async () => {
      mockVerifySIWE.mockResolvedValue({ valid: false, error: 'signature mismatch' });

      await bridge.requestSignature(WALLET_ID, TX_ID, 'ethereum');

      expect(mockVerifySIWE).toHaveBeenCalledTimes(1);
      expect(mockApprovalWorkflow.approve).not.toHaveBeenCalled();
      // Should NOT reject either (Owner may retry via REST)
      expect(mockApprovalWorkflow.reject).not.toHaveBeenCalled();
    });

    it('should update approval_channel to walletconnect', async () => {
      mockVerifySIWE.mockResolvedValue({ valid: true, address: EVM_OWNER });

      await bridge.requestSignature(WALLET_ID, TX_ID, 'ethereum');

      const channel = getApprovalChannel(sqlite, TX_ID);
      expect(channel).toBe('walletconnect');
    });
  });

  // -------------------------------------------------------------------------
  // requestSignature - Solana (solana_signMessage)
  // -------------------------------------------------------------------------

  describe('requestSignature - Solana (solana_signMessage)', () => {
    // The WC bridge constructs message: `WAIaaS: Approve transaction ${txId}`
    // We need a real Ed25519 signature for this exact message.
    const solMessage = `WAIaaS: Approve transaction ${TX_ID}`;
    let validSigBytes: Buffer;
    let validSigB58: string;

    beforeEach(() => {
      validSigBytes = signEd25519(solMessage);
      validSigB58 = encodeBase58(validSigBytes);

      insertTestWallet(sqlite, WALLET_ID, 'solana');
      insertTestTransaction(sqlite, WALLET_ID, TX_ID);
      insertTestApproval(sqlite, TX_ID);

      bridge = createBridge({
        signClient: mockSignClient,
        sessionTopic: TOPIC,
        sessionInfo: {
          walletId: WALLET_ID,
          topic: TOPIC,
          chainId: SOL_CHAIN_ID,
          ownerAddress: SOL_OWNER,
          peerName: 'Phantom',
          peerUrl: 'https://phantom.app',
          expiry: nowEpoch() + 86400,
          createdAt: nowEpoch(),
        },
      });
    });

    it('should call signClient.request with solana_signMessage method', async () => {
      mockSignClient.request.mockResolvedValue({ signature: validSigB58 });

      await bridge.requestSignature(WALLET_ID, TX_ID, 'solana');

      expect(mockSignClient.request).toHaveBeenCalledTimes(1);
      const callArgs = mockSignClient.request.mock.calls[0][0];
      expect(callArgs.request.method).toBe('solana_signMessage');
    });

    it('should send base58-encoded message with pubkey', async () => {
      mockSignClient.request.mockResolvedValue({ signature: validSigB58 });

      await bridge.requestSignature(WALLET_ID, TX_ID, 'solana');

      const callArgs = mockSignClient.request.mock.calls[0][0];
      const params = callArgs.request.params as { message: string; pubkey: string };
      // Message should be a non-empty base58-like string (no 0x prefix)
      expect(params.message).toBeTruthy();
      expect(params.message).not.toMatch(/^0x/);
      // pubkey matches owner address
      expect(params.pubkey).toBe(SOL_OWNER);
    });

    it('should call approvalWorkflow.approve on valid Ed25519 signature', async () => {
      mockSignClient.request.mockResolvedValue({ signature: validSigB58 });

      await bridge.requestSignature(WALLET_ID, TX_ID, 'solana');

      expect(mockApprovalWorkflow.approve).toHaveBeenCalledTimes(1);
      // approve is called with txId and base64-encoded signature
      expect(mockApprovalWorkflow.approve.mock.calls[0][0]).toBe(TX_ID);
      expect(typeof mockApprovalWorkflow.approve.mock.calls[0][1]).toBe('string');
      // Verify the base64 signature decodes to 64 bytes
      const base64Sig = mockApprovalWorkflow.approve.mock.calls[0][1] as string;
      expect(Buffer.from(base64Sig, 'base64').length).toBe(64);
    });

    it('should NOT approve when Ed25519 verification fails (wrong signature)', async () => {
      // Create a valid-length but wrong signature (sign a different message)
      const wrongSig = signEd25519('wrong message content');
      const wrongSigB58 = encodeBase58(wrongSig);
      mockSignClient.request.mockResolvedValue({ signature: wrongSigB58 });

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await bridge.requestSignature(WALLET_ID, TX_ID, 'solana');
      warnSpy.mockRestore();

      expect(mockApprovalWorkflow.approve).not.toHaveBeenCalled();
      // Should NOT reject either (Owner may retry via REST)
      expect(mockApprovalWorkflow.reject).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // requestSignature - Owner rejection
  // -------------------------------------------------------------------------

  describe('requestSignature - Owner rejection', () => {
    beforeEach(() => {
      insertTestWallet(sqlite, WALLET_ID, 'ethereum');
      insertTestTransaction(sqlite, WALLET_ID, TX_ID);
      insertTestApproval(sqlite, TX_ID);

      bridge = createBridge({
        signClient: mockSignClient,
        sessionTopic: TOPIC,
        sessionInfo: {
          walletId: WALLET_ID,
          topic: TOPIC,
          chainId: EVM_CHAIN_ID,
          ownerAddress: EVM_OWNER,
          peerName: 'TestWallet',
          peerUrl: 'https://test.example.com',
          expiry: nowEpoch() + 86400,
          createdAt: nowEpoch(),
        },
      });
    });

    it('should call approvalWorkflow.reject on user rejected (code 4001)', async () => {
      const wcError = Object.assign(new Error('User rejected'), { code: 4001 });
      mockSignClient.request.mockRejectedValue(wcError);

      await bridge.requestSignature(WALLET_ID, TX_ID, 'ethereum');

      expect(mockApprovalWorkflow.reject).toHaveBeenCalledWith(TX_ID);
      expect(mockApprovalWorkflow.approve).not.toHaveBeenCalled();
    });

    it('should call approvalWorkflow.reject on user rejected (code 5000)', async () => {
      const wcError = Object.assign(new Error('User rejected (legacy)'), { code: 5000 });
      mockSignClient.request.mockRejectedValue(wcError);

      await bridge.requestSignature(WALLET_ID, TX_ID, 'ethereum');

      expect(mockApprovalWorkflow.reject).toHaveBeenCalledWith(TX_ID);
      expect(mockApprovalWorkflow.approve).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // requestSignature - Timeout / network errors
  // -------------------------------------------------------------------------

  describe('requestSignature - Timeout / network errors', () => {
    beforeEach(() => {
      insertTestWallet(sqlite, WALLET_ID, 'ethereum');
      insertTestTransaction(sqlite, WALLET_ID, TX_ID);
      insertTestApproval(sqlite, TX_ID);

      bridge = createBridge({
        signClient: mockSignClient,
        sessionTopic: TOPIC,
        sessionInfo: {
          walletId: WALLET_ID,
          topic: TOPIC,
          chainId: EVM_CHAIN_ID,
          ownerAddress: EVM_OWNER,
          peerName: 'TestWallet',
          peerUrl: 'https://test.example.com',
          expiry: nowEpoch() + 86400,
          createdAt: nowEpoch(),
        },
      });
    });

    it('should NOT reject on request expired (code 8000)', async () => {
      const wcError = Object.assign(new Error('Request expired'), { code: 8000 });
      mockSignClient.request.mockRejectedValue(wcError);

      await bridge.requestSignature(WALLET_ID, TX_ID, 'ethereum');

      expect(mockApprovalWorkflow.reject).not.toHaveBeenCalled();
      expect(mockApprovalWorkflow.approve).not.toHaveBeenCalled();
    });

    it('should NOT reject on unknown network error', async () => {
      mockSignClient.request.mockRejectedValue(new Error('Connection reset'));

      await bridge.requestSignature(WALLET_ID, TX_ID, 'ethereum');

      expect(mockApprovalWorkflow.reject).not.toHaveBeenCalled();
      expect(mockApprovalWorkflow.approve).not.toHaveBeenCalled();
    });

    it('should log warning on errors', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockSignClient.request.mockRejectedValue(new Error('Network failure'));

      await bridge.requestSignature(WALLET_ID, TX_ID, 'ethereum');

      expect(warnSpy).toHaveBeenCalled();
      const warnMsg = warnSpy.mock.calls.find(
        call => typeof call[0] === 'string' && call[0].includes('WcSigningBridge'),
      );
      expect(warnMsg).toBeTruthy();
      warnSpy.mockRestore();
    });
  });

  // -------------------------------------------------------------------------
  // requestSignature - Timeout synchronization
  // -------------------------------------------------------------------------

  describe('requestSignature - Timeout synchronization', () => {
    it('should use expires_at from pending_approvals for WC expiry', async () => {
      const futureExpiry = nowEpoch() + 600; // 10 minutes from now
      insertTestWallet(sqlite, WALLET_ID, 'ethereum');
      insertTestTransaction(sqlite, WALLET_ID, TX_ID);
      insertTestApproval(sqlite, TX_ID, futureExpiry);

      bridge = createBridge({
        signClient: mockSignClient,
        sessionTopic: TOPIC,
        sessionInfo: {
          walletId: WALLET_ID,
          topic: TOPIC,
          chainId: EVM_CHAIN_ID,
          ownerAddress: EVM_OWNER,
          peerName: 'TestWallet',
          peerUrl: 'https://test.example.com',
          expiry: nowEpoch() + 86400,
          createdAt: nowEpoch(),
        },
      });

      mockVerifySIWE.mockResolvedValue({ valid: true, address: EVM_OWNER });
      mockSignClient.request.mockResolvedValue('0xsig');

      await bridge.requestSignature(WALLET_ID, TX_ID, 'ethereum');

      const callArgs = mockSignClient.request.mock.calls[0][0];
      // Expiry should be approximately (futureExpiry - now), within a few seconds tolerance
      const expectedRemaining = futureExpiry - nowEpoch();
      expect(callArgs.expiry).toBeGreaterThanOrEqual(expectedRemaining - 5);
      expect(callArgs.expiry).toBeLessThanOrEqual(expectedRemaining + 5);
    });

    it('should use minimum 60 seconds for WC expiry even if approval nearly expired', async () => {
      const nearExpiry = nowEpoch() + 10; // only 10 seconds left
      insertTestWallet(sqlite, WALLET_ID, 'ethereum');
      insertTestTransaction(sqlite, WALLET_ID, TX_ID);
      insertTestApproval(sqlite, TX_ID, nearExpiry);

      bridge = createBridge({
        signClient: mockSignClient,
        sessionTopic: TOPIC,
        sessionInfo: {
          walletId: WALLET_ID,
          topic: TOPIC,
          chainId: EVM_CHAIN_ID,
          ownerAddress: EVM_OWNER,
          peerName: 'TestWallet',
          peerUrl: 'https://test.example.com',
          expiry: nowEpoch() + 86400,
          createdAt: nowEpoch(),
        },
      });

      mockVerifySIWE.mockResolvedValue({ valid: true, address: EVM_OWNER });
      mockSignClient.request.mockResolvedValue('0xsig');

      await bridge.requestSignature(WALLET_ID, TX_ID, 'ethereum');

      const callArgs = mockSignClient.request.mock.calls[0][0];
      // Should be at least 60 (minimum clamp)
      expect(callArgs.expiry).toBeGreaterThanOrEqual(60);
    });

    it('should default to 300s when no pending_approval found', async () => {
      insertTestWallet(sqlite, WALLET_ID, 'ethereum');
      insertTestTransaction(sqlite, WALLET_ID, TX_ID);
      // Note: NOT inserting pending_approvals

      bridge = createBridge({
        signClient: mockSignClient,
        sessionTopic: TOPIC,
        sessionInfo: {
          walletId: WALLET_ID,
          topic: TOPIC,
          chainId: EVM_CHAIN_ID,
          ownerAddress: EVM_OWNER,
          peerName: 'TestWallet',
          peerUrl: 'https://test.example.com',
          expiry: nowEpoch() + 86400,
          createdAt: nowEpoch(),
        },
      });

      mockVerifySIWE.mockResolvedValue({ valid: true, address: EVM_OWNER });
      mockSignClient.request.mockResolvedValue('0xsig');

      await bridge.requestSignature(WALLET_ID, TX_ID, 'ethereum');

      const callArgs = mockSignClient.request.mock.calls[0][0];
      expect(callArgs.expiry).toBe(300);
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  describe('Edge cases', () => {
    it('should handle empty Solana signature gracefully', async () => {
      insertTestWallet(sqlite, WALLET_ID, 'solana');
      insertTestTransaction(sqlite, WALLET_ID, TX_ID);
      insertTestApproval(sqlite, TX_ID);

      bridge = createBridge({
        signClient: mockSignClient,
        sessionTopic: TOPIC,
        sessionInfo: {
          walletId: WALLET_ID,
          topic: TOPIC,
          chainId: SOL_CHAIN_ID,
          ownerAddress: SOL_OWNER,
          peerName: 'Phantom',
          peerUrl: 'https://phantom.app',
          expiry: nowEpoch() + 86400,
          createdAt: nowEpoch(),
        },
      });

      // Return empty signature
      mockSignClient.request.mockResolvedValue({ signature: '' });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await bridge.requestSignature(WALLET_ID, TX_ID, 'solana');

      expect(mockApprovalWorkflow.approve).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('should handle Solana raw string signature response (not object)', async () => {
      insertTestWallet(sqlite, WALLET_ID, 'solana');
      insertTestTransaction(sqlite, WALLET_ID, TX_ID);
      insertTestApproval(sqlite, TX_ID);

      // Generate a valid signature for the expected message
      const solMessage = `WAIaaS: Approve transaction ${TX_ID}`;
      const sigBytes = signEd25519(solMessage);
      const sigB58 = encodeBase58(sigBytes);

      bridge = createBridge({
        signClient: mockSignClient,
        sessionTopic: TOPIC,
        sessionInfo: {
          walletId: WALLET_ID,
          topic: TOPIC,
          chainId: SOL_CHAIN_ID,
          ownerAddress: SOL_OWNER,
          peerName: 'Phantom',
          peerUrl: 'https://phantom.app',
          expiry: nowEpoch() + 86400,
          createdAt: nowEpoch(),
        },
      });

      // Return raw string (some wallets return this format instead of { signature: ... })
      mockSignClient.request.mockResolvedValue(sigB58);

      await bridge.requestSignature(WALLET_ID, TX_ID, 'solana');

      // Should approve because the bridge handles both raw string and object format
      expect(mockApprovalWorkflow.approve).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Telegram fallback (Phase 149)
  // -------------------------------------------------------------------------

  describe('Telegram fallback (Phase 149)', () => {
    let mockEventBus: { emit: ReturnType<typeof vi.fn> };
    let mockNotificationService: { notify: ReturnType<typeof vi.fn> };

    beforeEach(() => {
      mockEventBus = { emit: vi.fn() };
      mockNotificationService = { notify: vi.fn().mockResolvedValue(undefined) };
    });

    it('signClient null -> fallback to telegram + approval_channel update', async () => {
      insertTestWallet(sqlite, WALLET_ID, 'ethereum');
      insertTestTransaction(sqlite, WALLET_ID, TX_ID);
      insertTestApproval(sqlite, TX_ID);

      bridge = createBridge({
        signClient: null,
        notificationService: mockNotificationService,
        eventBus: mockEventBus,
      });

      await bridge.requestSignature(WALLET_ID, TX_ID, 'ethereum');

      // approval_channel should be updated to 'telegram'
      expect(getApprovalChannel(sqlite, TX_ID)).toBe('telegram');

      // EventBus should emit 'approval:channel-switched'
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'approval:channel-switched',
        expect.objectContaining({
          walletId: WALLET_ID,
          txId: TX_ID,
          fromChannel: 'walletconnect',
          toChannel: 'telegram',
          reason: 'wc_not_initialized',
        }),
      );

      // NotificationService should notify
      expect(mockNotificationService.notify).toHaveBeenCalledWith(
        'APPROVAL_CHANNEL_SWITCHED',
        WALLET_ID,
        { from_channel: 'walletconnect', to_channel: 'telegram', reason: 'wc_not_initialized' },
        { txId: TX_ID },
      );
    });

    it('session topic null -> fallback to telegram', async () => {
      insertTestWallet(sqlite, WALLET_ID, 'ethereum');
      insertTestTransaction(sqlite, WALLET_ID, TX_ID);
      insertTestApproval(sqlite, TX_ID);

      bridge = createBridge({
        signClient: mockSignClient,
        sessionTopic: null,
        notificationService: mockNotificationService,
        eventBus: mockEventBus,
      });

      await bridge.requestSignature(WALLET_ID, TX_ID, 'ethereum');

      expect(getApprovalChannel(sqlite, TX_ID)).toBe('telegram');
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'approval:channel-switched',
        expect.objectContaining({
          reason: 'no_wc_session',
        }),
      );
    });

    it('session info null -> fallback to telegram', async () => {
      insertTestWallet(sqlite, WALLET_ID, 'ethereum');
      insertTestTransaction(sqlite, WALLET_ID, TX_ID);
      insertTestApproval(sqlite, TX_ID);

      bridge = createBridge({
        signClient: mockSignClient,
        sessionTopic: TOPIC,
        sessionInfo: null,
        notificationService: mockNotificationService,
        eventBus: mockEventBus,
      });

      await bridge.requestSignature(WALLET_ID, TX_ID, 'ethereum');

      expect(getApprovalChannel(sqlite, TX_ID)).toBe('telegram');
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'approval:channel-switched',
        expect.objectContaining({
          reason: 'no_session_info',
        }),
      );
    });

    it('WC timeout (8000) -> fallback to telegram', async () => {
      insertTestWallet(sqlite, WALLET_ID, 'ethereum');
      insertTestTransaction(sqlite, WALLET_ID, TX_ID);
      insertTestApproval(sqlite, TX_ID);

      bridge = createBridge({
        signClient: mockSignClient,
        sessionTopic: TOPIC,
        sessionInfo: {
          walletId: WALLET_ID,
          topic: TOPIC,
          chainId: EVM_CHAIN_ID,
          ownerAddress: EVM_OWNER,
          peerName: 'TestWallet',
          peerUrl: 'https://test.example.com',
          expiry: nowEpoch() + 86400,
          createdAt: nowEpoch(),
        },
        notificationService: mockNotificationService,
        eventBus: mockEventBus,
      });

      const wcError = Object.assign(new Error('Request expired'), { code: 8000 });
      mockSignClient.request.mockRejectedValue(wcError);

      await bridge.requestSignature(WALLET_ID, TX_ID, 'ethereum');

      // approval_channel should be updated to 'telegram' (fallback overwrites 'walletconnect')
      expect(getApprovalChannel(sqlite, TX_ID)).toBe('telegram');
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'approval:channel-switched',
        expect.objectContaining({
          reason: 'wc_timeout',
        }),
      );
      // Should NOT reject (timeout is fallback, not rejection)
      expect(mockApprovalWorkflow.reject).not.toHaveBeenCalled();
    });

    it('WC network error -> fallback to telegram', async () => {
      insertTestWallet(sqlite, WALLET_ID, 'ethereum');
      insertTestTransaction(sqlite, WALLET_ID, TX_ID);
      insertTestApproval(sqlite, TX_ID);

      bridge = createBridge({
        signClient: mockSignClient,
        sessionTopic: TOPIC,
        sessionInfo: {
          walletId: WALLET_ID,
          topic: TOPIC,
          chainId: EVM_CHAIN_ID,
          ownerAddress: EVM_OWNER,
          peerName: 'TestWallet',
          peerUrl: 'https://test.example.com',
          expiry: nowEpoch() + 86400,
          createdAt: nowEpoch(),
        },
        notificationService: mockNotificationService,
        eventBus: mockEventBus,
      });

      mockSignClient.request.mockRejectedValue(new Error('network failure'));

      await bridge.requestSignature(WALLET_ID, TX_ID, 'ethereum');

      expect(getApprovalChannel(sqlite, TX_ID)).toBe('telegram');
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'approval:channel-switched',
        expect.objectContaining({
          reason: 'wc_error',
        }),
      );
      expect(mockApprovalWorkflow.reject).not.toHaveBeenCalled();
    });

    it('user rejected (4001) -> reject, no fallback', async () => {
      insertTestWallet(sqlite, WALLET_ID, 'ethereum');
      insertTestTransaction(sqlite, WALLET_ID, TX_ID);
      insertTestApproval(sqlite, TX_ID);

      bridge = createBridge({
        signClient: mockSignClient,
        sessionTopic: TOPIC,
        sessionInfo: {
          walletId: WALLET_ID,
          topic: TOPIC,
          chainId: EVM_CHAIN_ID,
          ownerAddress: EVM_OWNER,
          peerName: 'TestWallet',
          peerUrl: 'https://test.example.com',
          expiry: nowEpoch() + 86400,
          createdAt: nowEpoch(),
        },
        notificationService: mockNotificationService,
        eventBus: mockEventBus,
      });

      const wcError = Object.assign(new Error('User rejected'), { code: 4001 });
      mockSignClient.request.mockRejectedValue(wcError);

      await bridge.requestSignature(WALLET_ID, TX_ID, 'ethereum');

      expect(mockApprovalWorkflow.reject).toHaveBeenCalledWith(TX_ID);
      // No fallback events
      expect(mockEventBus.emit).not.toHaveBeenCalled();
      expect(mockNotificationService.notify).not.toHaveBeenCalled();
    });

    it('user rejected (5000) -> reject, no fallback', async () => {
      insertTestWallet(sqlite, WALLET_ID, 'ethereum');
      insertTestTransaction(sqlite, WALLET_ID, TX_ID);
      insertTestApproval(sqlite, TX_ID);

      bridge = createBridge({
        signClient: mockSignClient,
        sessionTopic: TOPIC,
        sessionInfo: {
          walletId: WALLET_ID,
          topic: TOPIC,
          chainId: EVM_CHAIN_ID,
          ownerAddress: EVM_OWNER,
          peerName: 'TestWallet',
          peerUrl: 'https://test.example.com',
          expiry: nowEpoch() + 86400,
          createdAt: nowEpoch(),
        },
        notificationService: mockNotificationService,
        eventBus: mockEventBus,
      });

      const wcError = Object.assign(new Error('User rejected (legacy)'), { code: 5000 });
      mockSignClient.request.mockRejectedValue(wcError);

      await bridge.requestSignature(WALLET_ID, TX_ID, 'ethereum');

      expect(mockApprovalWorkflow.reject).toHaveBeenCalledWith(TX_ID);
      expect(mockEventBus.emit).not.toHaveBeenCalled();
      expect(mockNotificationService.notify).not.toHaveBeenCalled();
    });

    it('already processed approval -> no fallback', async () => {
      insertTestWallet(sqlite, WALLET_ID, 'ethereum');
      insertTestTransaction(sqlite, WALLET_ID, TX_ID);

      // Insert approval that is already approved
      const ts = nowEpoch();
      sqlite.prepare(
        `INSERT INTO pending_approvals (id, tx_id, expires_at, approval_channel, required_by, created_at, approved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(`appr-${TX_ID}`, TX_ID, ts + 300, 'rest_api', ts + 300, ts, ts);

      bridge = createBridge({
        signClient: null,
        notificationService: mockNotificationService,
        eventBus: mockEventBus,
      });

      await bridge.requestSignature(WALLET_ID, TX_ID, 'ethereum');

      // approval_channel should remain 'rest_api' (not changed to 'telegram')
      expect(getApprovalChannel(sqlite, TX_ID)).toBe('rest_api');
      expect(mockEventBus.emit).not.toHaveBeenCalled();
      expect(mockNotificationService.notify).not.toHaveBeenCalled();
    });

    it('eventBus undefined -> no throw', async () => {
      insertTestWallet(sqlite, WALLET_ID, 'ethereum');
      insertTestTransaction(sqlite, WALLET_ID, TX_ID);
      insertTestApproval(sqlite, TX_ID);

      bridge = createBridge({
        signClient: null,
        notificationService: mockNotificationService,
        eventBus: undefined,
      });

      // Should not throw
      await bridge.requestSignature(WALLET_ID, TX_ID, 'ethereum');

      // approval_channel should still be updated
      expect(getApprovalChannel(sqlite, TX_ID)).toBe('telegram');
      // notificationService should still be called
      expect(mockNotificationService.notify).toHaveBeenCalled();
    });

    it('notificationService undefined -> no throw', async () => {
      insertTestWallet(sqlite, WALLET_ID, 'ethereum');
      insertTestTransaction(sqlite, WALLET_ID, TX_ID);
      insertTestApproval(sqlite, TX_ID);

      bridge = createBridge({
        signClient: null,
        notificationService: undefined,
        eventBus: mockEventBus,
      });

      // Should not throw
      await bridge.requestSignature(WALLET_ID, TX_ID, 'ethereum');

      // approval_channel should still be updated
      expect(getApprovalChannel(sqlite, TX_ID)).toBe('telegram');
      // eventBus should still emit
      expect(mockEventBus.emit).toHaveBeenCalled();
    });
  });
});
