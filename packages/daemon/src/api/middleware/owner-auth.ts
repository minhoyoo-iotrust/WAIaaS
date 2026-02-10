/**
 * Owner auth middleware: verifies Ed25519 signature from owner wallet.
 *
 * Protects owner-only actions (transaction approval, KS recovery).
 * The owner signs a message with their wallet, and this middleware verifies
 * the signature against the registered owner_address on the agent.
 *
 * Headers required:
 *   - X-Owner-Signature: base64-encoded Ed25519 detached signature
 *   - X-Owner-Message: the signed message (UTF-8)
 *   - X-Owner-Address: the owner's wallet address (base58 for Solana)
 *
 * v1.2: Solana Ed25519 only. EVM (SIWE) deferred to v1.4+.
 *
 * Factory pattern: createOwnerAuth(deps) returns middleware.
 *
 * @see docs/52-auth-redesign.md
 */

import { createMiddleware } from 'hono/factory';
import { createRequire } from 'node:module';
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { WAIaaSError } from '@waiaas/core';
import type * as schema from '../../infrastructure/database/schema.js';
import { agents } from '../../infrastructure/database/schema.js';

type SodiumNative = typeof import('sodium-native');

const require = createRequire(import.meta.url);

function loadSodium(): SodiumNative {
  return require('sodium-native') as SodiumNative;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OwnerAuthDeps {
  db: BetterSQLite3Database<typeof schema>;
}

// ---------------------------------------------------------------------------
// Base58 decode (Bitcoin alphabet) -- inverse of keystore.ts encodeBase58
// ---------------------------------------------------------------------------

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function decodeBase58(str: string): Buffer {
  // Count leading '1's (zero bytes)
  let zeroes = 0;
  for (let i = 0; i < str.length && str[i] === '1'; i++) {
    zeroes++;
  }

  // Allocate enough space in base256 representation
  const size = Math.ceil((str.length * 733) / 1000) + 1;
  const b256 = new Uint8Array(size);
  let length = 0;

  for (let i = zeroes; i < str.length; i++) {
    const charIndex = BASE58_ALPHABET.indexOf(str[i]!);
    if (charIndex === -1) {
      throw new Error(`Invalid Base58 character: ${str[i]}`);
    }

    let carry = charIndex;
    let j = 0;
    for (let k = size - 1; k >= 0 && (carry !== 0 || j < length); k--, j++) {
      carry += 58 * (b256[k] ?? 0);
      b256[k] = carry % 256;
      carry = Math.floor(carry / 256);
    }
    length = j;
  }

  // Skip leading zeros in b256
  let start = 0;
  while (start < size && b256[start] === 0) {
    start++;
  }

  // Build result with leading zero bytes
  const result = Buffer.alloc(zeroes + (size - start));
  for (let i = start; i < size; i++) {
    result[zeroes + (i - start)] = b256[i]!;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Middleware factory
// ---------------------------------------------------------------------------

export function createOwnerAuth(deps: OwnerAuthDeps) {
  return createMiddleware(async (c, next) => {
    const signature = c.req.header('X-Owner-Signature');
    const message = c.req.header('X-Owner-Message');
    const ownerAddress = c.req.header('X-Owner-Address');

    if (!signature || !message || !ownerAddress) {
      throw new WAIaaSError('INVALID_SIGNATURE', {
        message: 'X-Owner-Signature, X-Owner-Message, and X-Owner-Address headers are required',
      });
    }

    // Look up agent to verify owner_address match
    const agentId = c.req.param('id') || (c.get('agentId' as never) as string | undefined);
    if (!agentId) {
      throw new WAIaaSError('AGENT_NOT_FOUND', {
        message: 'Agent ID required for owner authentication',
      });
    }

    const agent = deps.db
      .select()
      .from(agents)
      .where(eq(agents.id, agentId))
      .get();

    if (!agent) {
      throw new WAIaaSError('AGENT_NOT_FOUND');
    }
    if (!agent.ownerAddress) {
      throw new WAIaaSError('OWNER_NOT_CONNECTED', {
        message: 'No owner address registered for this agent',
      });
    }
    if (agent.ownerAddress !== ownerAddress) {
      throw new WAIaaSError('INVALID_SIGNATURE', {
        message: 'Owner address does not match agent owner',
      });
    }

    // Verify the Ed25519 signature (Solana only for v1.2)
    try {
      const sodium = loadSodium();

      const signatureBytes = Buffer.from(signature, 'base64');
      const messageBytes = Buffer.from(message, 'utf8');
      const publicKeyBytes = decodeBase58(ownerAddress);

      // Validate key length
      if (publicKeyBytes.length !== sodium.crypto_sign_PUBLICKEYBYTES) {
        throw new WAIaaSError('INVALID_SIGNATURE', {
          message: `Invalid public key length: expected ${String(sodium.crypto_sign_PUBLICKEYBYTES)}, got ${String(publicKeyBytes.length)}`,
        });
      }

      // Validate signature length
      if (signatureBytes.length !== sodium.crypto_sign_BYTES) {
        throw new WAIaaSError('INVALID_SIGNATURE', {
          message: `Invalid signature length: expected ${String(sodium.crypto_sign_BYTES)}, got ${String(signatureBytes.length)}`,
        });
      }

      const valid = sodium.crypto_sign_verify_detached(signatureBytes, messageBytes, publicKeyBytes);
      if (!valid) {
        throw new WAIaaSError('INVALID_SIGNATURE', {
          message: 'Ed25519 signature verification failed',
        });
      }
    } catch (err) {
      if (err instanceof WAIaaSError) throw err;
      throw new WAIaaSError('INVALID_SIGNATURE', {
        message: 'Signature verification failed',
        cause: err instanceof Error ? err : undefined,
      });
    }

    c.set('ownerAddress', ownerAddress);
    await next();
  });
}
