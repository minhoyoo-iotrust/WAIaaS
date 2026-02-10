/**
 * JWT Secret Manager: generates, stores, rotates JWT secrets with dual-key window.
 *
 * Secrets are stored in the key_value_store SQLite table via Drizzle ORM.
 * Dual-key rotation: after rotation, old key remains valid for 5 minutes.
 *
 * Storage keys:
 *   - jwt_secret_current:  JSON { secret: hex, createdAt: epoch_seconds }
 *   - jwt_secret_previous: JSON { secret: hex, createdAt: epoch_seconds }
 *
 * Token format: wai_sess_<JWT> (HS256)
 *
 * @see docs/52-auth-redesign.md
 */

import { randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { WAIaaSError } from '@waiaas/core';
import type * as schema from '../database/schema.js';
import { keyValueStore } from '../database/schema.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JwtPayload {
  sub: string; // sessionId
  agt: string; // agentId
  iat: number; // issued at (epoch seconds)
  exp: number; // expires at (epoch seconds)
}

interface StoredSecret {
  secret: string; // hex
  createdAt: number; // epoch seconds
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOKEN_PREFIX = 'wai_sess_';
const KEY_CURRENT = 'jwt_secret_current';
const KEY_PREVIOUS = 'jwt_secret_previous';
const ROTATION_WINDOW_SECONDS = 5 * 60; // 5 minutes
const SECRET_BYTES = 32; // 256-bit

// ---------------------------------------------------------------------------
// JwtSecretManager
// ---------------------------------------------------------------------------

export class JwtSecretManager {
  private db: BetterSQLite3Database<typeof schema>;
  private _currentSecret: StoredSecret | null = null;
  private _previousSecret: StoredSecret | null = null;

  constructor(db: BetterSQLite3Database<typeof schema>) {
    this.db = db;
  }

  /**
   * Initialize: generate new secret on first run, or load existing from DB.
   */
  async initialize(): Promise<void> {
    const existing = this.db
      .select()
      .from(keyValueStore)
      .where(eq(keyValueStore.key, KEY_CURRENT))
      .get();

    if (existing) {
      this._currentSecret = JSON.parse(existing.value) as StoredSecret;
    } else {
      const secret = randomBytes(SECRET_BYTES).toString('hex');
      const nowSec = Math.floor(Date.now() / 1000);
      const stored: StoredSecret = { secret, createdAt: nowSec };

      this.db
        .insert(keyValueStore)
        .values({
          key: KEY_CURRENT,
          value: JSON.stringify(stored),
          updatedAt: new Date(nowSec * 1000),
        })
        .onConflictDoNothing()
        .run();

      this._currentSecret = stored;
    }

    // Load previous secret if exists
    const prev = this.db
      .select()
      .from(keyValueStore)
      .where(eq(keyValueStore.key, KEY_PREVIOUS))
      .get();

    if (prev) {
      this._previousSecret = JSON.parse(prev.value) as StoredSecret;
    }
  }

  /**
   * Return the current hex secret string.
   */
  async getCurrentSecret(): Promise<string> {
    if (!this._currentSecret) {
      throw new Error('JwtSecretManager not initialized. Call initialize() first.');
    }
    return this._currentSecret.secret;
  }

  /**
   * Return array of valid secrets. Normally just [current].
   * During rotation window (previous exists and rotation was < 5 minutes ago),
   * returns [current, previous].
   */
  async getValidSecrets(): Promise<string[]> {
    if (!this._currentSecret) {
      throw new Error('JwtSecretManager not initialized. Call initialize() first.');
    }

    const secrets = [this._currentSecret.secret];

    if (this._previousSecret) {
      const nowSec = Math.floor(Date.now() / 1000);
      const elapsed = nowSec - this._currentSecret.createdAt;
      if (elapsed < ROTATION_WINDOW_SECONDS) {
        secrets.push(this._previousSecret.secret);
      }
    }

    return secrets;
  }

  /**
   * Rotate the JWT secret. Generate new, move current to previous.
   * Throws ROTATION_TOO_RECENT if last rotation was < 5 minutes ago.
   */
  async rotateSecret(): Promise<void> {
    if (!this._currentSecret) {
      throw new Error('JwtSecretManager not initialized. Call initialize() first.');
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const elapsed = nowSec - this._currentSecret.createdAt;

    if (elapsed < ROTATION_WINDOW_SECONDS) {
      throw new WAIaaSError('ROTATION_TOO_RECENT', {
        message: `Key rotation attempted too recently. Wait ${ROTATION_WINDOW_SECONDS - elapsed} seconds.`,
      });
    }

    const newSecret = randomBytes(SECRET_BYTES).toString('hex');
    const newStored: StoredSecret = { secret: newSecret, createdAt: nowSec };
    const oldStored = this._currentSecret;

    // Single DB transaction: move current -> previous, store new current
    this.db.transaction((tx) => {
      // Store old as previous
      tx.insert(keyValueStore)
        .values({
          key: KEY_PREVIOUS,
          value: JSON.stringify(oldStored),
          updatedAt: new Date(nowSec * 1000),
        })
        .onConflictDoUpdate({
          target: keyValueStore.key,
          set: {
            value: JSON.stringify(oldStored),
            updatedAt: new Date(nowSec * 1000),
          },
        })
        .run();

      // Store new as current
      tx.insert(keyValueStore)
        .values({
          key: KEY_CURRENT,
          value: JSON.stringify(newStored),
          updatedAt: new Date(nowSec * 1000),
        })
        .onConflictDoUpdate({
          target: keyValueStore.key,
          set: {
            value: JSON.stringify(newStored),
            updatedAt: new Date(nowSec * 1000),
          },
        })
        .run();
    });

    // Update in-memory cache
    this._previousSecret = oldStored;
    this._currentSecret = newStored;
  }

  /**
   * Sign a JWT payload. Returns wai_sess_ prefixed token.
   */
  async signToken(payload: JwtPayload): Promise<string> {
    if (!this._currentSecret) {
      throw new Error('JwtSecretManager not initialized. Call initialize() first.');
    }

    const secretKey = Buffer.from(this._currentSecret.secret, 'hex');

    const jwt = await new SignJWT({
      sub: payload.sub,
      agt: payload.agt,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(payload.iat)
      .setExpirationTime(payload.exp)
      .sign(secretKey);

    return TOKEN_PREFIX + jwt;
  }

  /**
   * Verify a wai_sess_ prefixed token against valid secrets.
   * Returns decoded JwtPayload on success.
   * Throws TOKEN_EXPIRED for expired tokens, INVALID_TOKEN for all other failures.
   */
  async verifyToken(token: string): Promise<JwtPayload> {
    if (!token.startsWith(TOKEN_PREFIX)) {
      throw new WAIaaSError('INVALID_TOKEN', {
        message: 'Token must start with wai_sess_ prefix',
      });
    }

    const jwt = token.slice(TOKEN_PREFIX.length);
    const validSecrets = await this.getValidSecrets();

    let lastError: unknown;
    for (const secret of validSecrets) {
      try {
        const secretKey = Buffer.from(secret, 'hex');
        const { payload } = await jwtVerify(jwt, secretKey, {
          algorithms: ['HS256'],
        });

        return {
          sub: payload.sub as string,
          agt: payload.agt as string,
          iat: payload.iat as number,
          exp: payload.exp as number,
        };
      } catch (err) {
        lastError = err;
        // If expired, throw immediately (no need to try other keys)
        if (err instanceof joseErrors.JWTExpired) {
          throw new WAIaaSError('TOKEN_EXPIRED', {
            message: 'Authentication token has expired',
            cause: err,
          });
        }
        // Try next secret
        continue;
      }
    }

    throw new WAIaaSError('INVALID_TOKEN', {
      message: 'Invalid authentication token',
      cause: lastError instanceof Error ? lastError : undefined,
    });
  }
}
