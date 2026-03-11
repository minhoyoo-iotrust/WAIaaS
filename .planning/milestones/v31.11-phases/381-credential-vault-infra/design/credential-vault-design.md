# CredentialVault 인프라 설계

> Phase 381, Plan 01 — ICredentialVault 인터페이스 + DB 스키마 + 암호화 + 스코프 + 라이프사이클 + 인증 모델 설계

---

## 1. 개요

### 목표

per-wallet CEX API 키, HMAC secret, RSA private key 등 off-chain 자격증명을 안전하게 암호화 저장하고 관리하는 `CredentialVault`를 설계한다.

### Phase 380 연결점

Phase 380에서 설계한 `SignedDataAction.credentialRef`와 `SignedHttpAction.credentialRef`는 CredentialVault의 UUID 또는 `{walletId}:{name}` 형태의 간접 참조이다. 파이프라인에서 `sign()` 직전에 `CredentialVault.get(ref, walletId)`를 호출하여 복호화된 credential 값을 `SigningParams`에 주입한다.

```
ActionProvider.resolve()
    --> SignedDataAction { credentialRef: 'wallet-abc:binance-api-key' }
    --> Pipeline Router
        --> CredentialVault.get('wallet-abc:binance-api-key', walletId)
        --> 복호화된 secret을 HmacSigningParams.secret에 주입
        --> ISignerCapability.sign(params)
        --> 서명 완료 후 credential 값 메모리 클리어
```

---

## 2. ICredentialVault 인터페이스 (CRED-01)

CRUD + rotate 5개 메서드를 제공하는 TypeScript 인터페이스.

```typescript
import { z } from 'zod';

// ── Credential 타입 enum (CRED-03) ──

export const CredentialTypeEnum = z.enum([
  'api-key',          // CEX API key (Binance, OKX 등)
  'hmac-secret',      // HMAC symmetric key (CEX API signing)
  'rsa-private-key',  // RSA private key PEM (금융 API)
  'session-token',    // 외부 서비스 세션 토큰 (임시)
  'custom',           // 사용자 정의
]);
export type CredentialType = z.infer<typeof CredentialTypeEnum>;

// ── 생성 파라미터 ──

export interface CreateCredentialParams {
  type: CredentialType;
  name: string;                          // human-readable 이름 (wallet 내 unique)
  value: string;                         // 평문 credential 값 (암호화 전)
  metadata?: Record<string, unknown>;    // 부가 정보 (예: { exchange: 'binance', permissions: ['read', 'trade'] })
  expiresAt?: number;                    // 만료 시각 (Unix seconds, nullable)
}

// ── 반환 타입: 메타데이터만 (원문 비노출) ──

export interface CredentialMetadata {
  id: string;                            // UUID v7
  walletId: string | null;               // null이면 글로벌
  type: CredentialType;
  name: string;
  metadata: Record<string, unknown>;
  expiresAt: number | null;
  createdAt: number;                     // Unix seconds
  updatedAt: number;                     // Unix seconds
}

// ── 반환 타입: 복호화된 값 포함 (내부 전용) ──

export interface DecryptedCredential extends CredentialMetadata {
  value: string;                         // 복호화된 평문 credential 값
}

// ── ICredentialVault 인터페이스 ──

export interface ICredentialVault {
  /**
   * 새 credential을 생성한다.
   *
   * - walletId가 null이면 글로벌 credential (masterAuth 필수)
   * - walletId가 있으면 per-wallet credential
   * - value는 AES-256-GCM으로 암호화되어 저장됨
   * - 동일 walletId+name 조합이 이미 존재하면 에러
   *
   * @param walletId - 대상 지갑 ID (null이면 글로벌)
   * @param params - 생성 파라미터
   * @returns 생성된 credential 메타데이터 (원문 비포함)
   */
  create(walletId: string | null, params: CreateCredentialParams): Promise<CredentialMetadata>;

  /**
   * credential을 조회하고 복호화하여 반환한다.
   *
   * - ref는 UUID 또는 {walletId}:{name} 형태
   * - walletId로 접근 권한 검사 (다른 지갑의 credential 접근 방지)
   * - 만료된 credential은 에러 반환
   * - 내부 전용: REST API 응답에서는 절대 반환하지 않음
   *
   * @param ref - credential 참조 (UUID 또는 {walletId}:{name})
   * @param walletId - 요청 컨텍스트의 지갑 ID (권한 검사용, optional)
   * @returns 복호화된 credential
   * @throws CREDENTIAL_NOT_FOUND - 존재하지 않음
   * @throws CREDENTIAL_EXPIRED - 만료됨
   * @throws CREDENTIAL_ACCESS_DENIED - 다른 지갑의 credential
   */
  get(ref: string, walletId?: string): Promise<DecryptedCredential>;

  /**
   * credential 목록을 조회한다 (메타데이터만, 원문 비노출).
   *
   * - walletId가 있으면 해당 지갑의 per-wallet credential만
   * - walletId가 없으면 글로벌 credential만
   *
   * @param walletId - 대상 지갑 ID (없으면 글로벌)
   * @returns credential 메타데이터 배열
   */
  list(walletId?: string): Promise<CredentialMetadata[]>;

  /**
   * credential을 삭제한다.
   *
   * - hard delete (복구 불가)
   * - credentialRef로 참조 중인 SignedDataAction은 런타임 에러 발생
   * - cascade 없음 (참조 무결성은 런타임에서 처리)
   *
   * @param ref - credential 참조 (UUID)
   * @throws CREDENTIAL_NOT_FOUND - 존재하지 않음
   */
  delete(ref: string): Promise<void>;

  /**
   * credential 값을 새 값으로 교체한다 (로테이션).
   *
   * - 기존 encrypted_value/iv를 새 값으로 교체
   * - updated_at 갱신
   * - 이전 값 이력 보존은 선택적 (기본: 덮어쓰기)
   * - IV는 반드시 재생성 (GCM 보안 요구사항)
   *
   * @param ref - credential 참조 (UUID)
   * @param newValue - 새 평문 credential 값
   * @returns 갱신된 credential 메타데이터
   * @throws CREDENTIAL_NOT_FOUND - 존재하지 않음
   */
  rotate(ref: string, newValue: string): Promise<CredentialMetadata>;
}
```

---

## 3. Credential 타입 (CRED-03)

5종의 credential 타입을 Zod enum으로 정의한다.

| 타입 | 용도 | 키 형태 | 예시 |
|------|------|---------|------|
| `api-key` | CEX API key | 문자열 | Binance API Key, OKX API Key |
| `hmac-secret` | HMAC symmetric key | 문자열 (hex/base64) | CEX API secret (서명용) |
| `rsa-private-key` | RSA private key | PEM 문자열 | 금융 API 인증 키 |
| `session-token` | 외부 서비스 세션 토큰 | 문자열 | 임시 토큰, OAuth access token |
| `custom` | 사용자 정의 | 문자열 | 임의 비밀 값 |

### 타입별 metadata 권장 구조

```typescript
// api-key metadata 예시
{
  exchange: 'binance',
  permissions: ['read', 'trade'],
  ipWhitelist: ['1.2.3.4'],
  label: 'Production Trading'
}

// hmac-secret metadata 예시
{
  exchange: 'binance',
  algorithm: 'sha256',
  pairedApiKeyRef: 'wallet-abc:binance-api-key'  // 대응하는 API key 참조
}

// rsa-private-key metadata 예시
{
  keySize: 2048,
  algorithm: 'RSA-SHA256',
  service: 'payment-gateway'
}

// session-token metadata 예시
{
  service: 'polymarket',
  issuedAt: 1700000000,
  refreshable: true
}

// custom metadata 예시
{
  description: 'Custom signing key for proprietary protocol',
  format: 'hex'
}
```

### signingScheme과의 매핑

| CredentialType | 대응 SigningScheme | 주입 대상 |
|---------------|-------------------|----------|
| `api-key` | _(서명에 직접 사용 안됨)_ | HTTP header에 직접 삽입 |
| `hmac-secret` | `hmac-sha256` | `HmacSigningParams.secret` |
| `rsa-private-key` | `rsa-pss` | `RsaPssSigningParams.privateKey` |
| `session-token` | _(서명에 직접 사용 안됨)_ | HTTP header에 직접 삽입 |
| `custom` | _(provider가 결정)_ | provider-specific |

---

## 4. credentialRef 간접 참조 모델 (CRED-04)

### 4.1 참조 형태

SignedDataAction/SignedHttpAction의 `credentialRef` 필드는 두 가지 형태를 지원한다:

| 형태 | 예시 | 해소 방법 |
|------|------|----------|
| UUID | `"550e8400-e29b-41d4-a716-446655440000"` | `wallet_credentials.id`로 직접 조회 |
| 이름 | `"{walletId}:{name}"` | walletId + name으로 조회 (UNIQUE 인덱스 활용) |

### 4.2 해소 로직

```typescript
/**
 * credentialRef를 해소하여 DecryptedCredential을 반환한다.
 *
 * 해소 순서:
 * 1. ref가 UUID 형태인지 검사 (UUID v7 정규식)
 * 2. UUID이면 id로 직접 조회
 * 3. 이름이면 ':' 기준 분리하여 walletId + name으로 조회
 * 4. per-wallet 먼저 → 글로벌 fallback
 *
 * @param ref - credentialRef 문자열
 * @param walletId - 현재 요청의 walletId (권한 검사 + per-wallet 조회)
 */
function resolveCredentialRef(ref: string, walletId: string): DecryptedCredential {
  // Step 1: UUID 형태 검사
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (UUID_REGEX.test(ref)) {
    // Step 2: UUID → id로 직접 조회
    const cred = vault.get(ref, walletId);
    return cred;
  }

  // Step 3: 이름 형태 → walletId:name 분리
  const colonIdx = ref.indexOf(':');
  if (colonIdx > 0) {
    const refWalletId = ref.substring(0, colonIdx);
    const refName = ref.substring(colonIdx + 1);

    // 권한 검사: ref의 walletId와 요청 walletId가 일치해야 함
    if (refWalletId !== walletId) {
      throw new CredentialError('CREDENTIAL_ACCESS_DENIED');
    }

    return vault.getByName(refWalletId, refName);
  }

  // Step 4: 이름만 (walletId 없음) → per-wallet 먼저, 글로벌 fallback
  try {
    return vault.getByName(walletId, ref);
  } catch {
    return vault.getByName(null, ref);  // 글로벌 fallback
  }
}
```

### 4.3 원문 노출 범위

| 시점 | 원문 노출 | 비고 |
|------|----------|------|
| create() | 입력만 → 즉시 암호화 | 저장 후 원문 폐기 |
| get() 내부 | 복호화된 값 반환 | **내부 전용**, REST API 응답 아님 |
| list() | 메타데이터만 | 원문 절대 포함 안함 |
| rotate() | 새 값 입력 → 즉시 암호화 | 저장 후 원문 폐기 |
| REST API 응답 | **절대 비노출** | CredentialMetadata만 반환 |
| sign() 주입 | SigningParams에 주입 → 서명 후 클리어 | 메모리 임시 |

---

## 5. 스코프 모델 (CRED-02)

### 5.1 두 가지 스코프

| 스코프 | wallet_id | 접근 범위 | 등록 권한 |
|--------|-----------|----------|----------|
| per-wallet | 지갑 ID | 해당 지갑 세션만 | masterAuth |
| 글로벌 | null | 모든 지갑에서 접근 가능 | masterAuth |

### 5.2 조회 우선순위

```
credentialRef 해소 시:
1. per-wallet credential 조회 (walletId + name)
2. 매칭 없음 → 글로벌 credential fallback (walletId=null + name)
3. 글로벌에도 없음 → CREDENTIAL_NOT_FOUND 에러
```

### 5.3 SettingsService와의 관계

| 저장소 | 용도 | 값 형태 | 접근 | 예시 |
|--------|------|---------|------|------|
| SettingsService | 글로벌 설정 (Admin Settings) | 키-값 쌍 | 모든 세션 | `defi.slippage`, `notification.webhook_url` |
| CredentialVault | per-wallet 비밀 값 | 암호화된 credential | 지갑별 제한 | CEX API key, HMAC secret |

**혼재 방지 규칙:**
- API key, secret, private key 등 비밀 값 → CredentialVault
- 설정 값, 임계치, URL 등 비비밀 값 → SettingsService
- CredentialVault에 비밀이 아닌 값을 저장하지 않음
- SettingsService에 비밀 값을 저장하지 않음 (기존 패턴 유지)

---

## 6. wallet_credentials DB 스키마 (CRED-05)

### 6.1 테이블 정의

```sql
-- DB migration v55: wallet_credentials 테이블 추가

CREATE TABLE wallet_credentials (
  id             TEXT    NOT NULL PRIMARY KEY,  -- UUID v7
  wallet_id      TEXT,                          -- FK → wallets.id (NULL이면 글로벌)
  type           TEXT    NOT NULL,              -- credential type enum
  name           TEXT    NOT NULL,              -- human-readable 이름
  encrypted_value BLOB   NOT NULL,              -- AES-256-GCM ciphertext
  iv             BLOB    NOT NULL,              -- 12 bytes, per-record unique nonce
  auth_tag       BLOB    NOT NULL,              -- 16 bytes, GCM authentication tag
  metadata       TEXT    NOT NULL DEFAULT '{}', -- JSON, 부가 정보
  expires_at     INTEGER,                       -- 만료 시각 (Unix seconds, nullable)
  created_at     INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at     INTEGER NOT NULL DEFAULT (unixepoch()),

  -- 제약조건
  FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE,
  CHECK (type IN ('api-key', 'hmac-secret', 'rsa-private-key', 'session-token', 'custom'))
);

-- 인덱스
CREATE UNIQUE INDEX idx_wallet_credentials_wallet_name
  ON wallet_credentials(wallet_id, name)
  WHERE wallet_id IS NOT NULL;

CREATE UNIQUE INDEX idx_wallet_credentials_global_name
  ON wallet_credentials(name)
  WHERE wallet_id IS NULL;

CREATE INDEX idx_wallet_credentials_wallet_id
  ON wallet_credentials(wallet_id);

CREATE INDEX idx_wallet_credentials_expires_at
  ON wallet_credentials(expires_at)
  WHERE expires_at IS NOT NULL;
```

### 6.2 Drizzle 스키마 (초안)

```typescript
import { sqliteTable, text, blob, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const walletCredentials = sqliteTable('wallet_credentials', {
  id: text('id').primaryKey(),
  walletId: text('wallet_id').references(() => wallets.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  name: text('name').notNull(),
  encryptedValue: blob('encrypted_value', { mode: 'buffer' }).notNull(),
  iv: blob('iv', { mode: 'buffer' }).notNull(),
  authTag: blob('auth_tag', { mode: 'buffer' }).notNull(),
  metadata: text('metadata').notNull().default('{}'),
  expiresAt: integer('expires_at'),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at').notNull().default(sql`(unixepoch())`),
}, (table) => ({
  walletNameIdx: uniqueIndex('idx_wallet_credentials_wallet_name')
    .on(table.walletId, table.name)
    .where(sql`wallet_id IS NOT NULL`),
  globalNameIdx: uniqueIndex('idx_wallet_credentials_global_name')
    .on(table.name)
    .where(sql`wallet_id IS NULL`),
  walletIdIdx: index('idx_wallet_credentials_wallet_id')
    .on(table.walletId),
  expiresAtIdx: index('idx_wallet_credentials_expires_at')
    .on(table.expiresAt)
    .where(sql`expires_at IS NOT NULL`),
}));
```

### 6.3 스키마 노트

- `encrypted_value`는 **blob**으로 저장 (text가 아님) — 바이너리 ciphertext
- `iv`는 12 bytes (AES-256-GCM 표준 nonce 크기)
- `auth_tag`는 별도 컬럼으로 분리 — Node.js `crypto.createCipheriv` GCM 모드에서 `getAuthTag()` 반환값
- `metadata`는 JSON text — 구조가 credential 타입별로 다르므로 schemaless
- `expires_at`은 nullable — 만료 없는 credential도 존재
- UNIQUE 인덱스가 두 개인 이유: SQLite에서 NULL은 UNIQUE 비교에서 항상 다른 값으로 취급됨. per-wallet과 글로벌 이름 충돌을 별도로 방지해야 함
- ON DELETE CASCADE: 지갑 삭제 시 per-wallet credential도 함께 삭제

---

## 7. 암호화 전략

### 7.1 AES-256-GCM Authenticated Encryption

각 credential 값을 개별 암호화한다. GCM 모드는 기밀성과 무결성을 동시에 보장한다.

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// 암호화
function encryptCredential(
  plaintext: string,
  subkey: Buffer,
  aad: Buffer,
): { ciphertext: Buffer; iv: Buffer; authTag: Buffer } {
  const iv = randomBytes(12);  // 96-bit nonce (GCM 표준)
  const cipher = createCipheriv('aes-256-gcm', subkey, iv);
  cipher.setAAD(aad);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();  // 128-bit tag

  return { ciphertext: encrypted, iv, authTag };
}

// 복호화
function decryptCredential(
  ciphertext: Buffer,
  iv: Buffer,
  authTag: Buffer,
  subkey: Buffer,
  aad: Buffer,
): string {
  const decipher = createDecipheriv('aes-256-gcm', subkey, iv);
  decipher.setAAD(aad);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}
```

### 7.2 HKDF 도메인 분리

master key에서 credential 전용 서브키를 파생한다. 기존 지갑 키 암호화와 도메인을 분리하여 서브키 재사용을 방지한다.

```typescript
import { hkdf } from 'node:crypto';

/**
 * HKDF-SHA256으로 credential 전용 서브키를 파생한다.
 *
 * - salt: "credential-vault" (고정, 도메인 분리)
 * - info: "waiaas-credential-encryption" (고정, 용도 구분)
 * - 기존 지갑 키 암호화: info가 다르므로 서브키 충돌 없음
 */
async function deriveCredentialSubkey(masterKey: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    hkdf(
      'sha256',
      masterKey,
      Buffer.from('credential-vault'),             // salt
      Buffer.from('waiaas-credential-encryption'),  // info
      32,                                           // 256-bit output
      (err, derivedKey) => {
        if (err) reject(err);
        else resolve(Buffer.from(derivedKey));
      }
    );
  });
}
```

### 7.3 AAD (Additional Authenticated Data)

컨텍스트 바인딩을 위해 AAD를 사용한다. AAD는 암호화되지 않지만 인증에 포함되어 cipher text 재배치 공격을 방지한다.

```typescript
/**
 * AAD 생성: {credentialId}:{walletId}:{type}
 *
 * 예시: "550e8400-...:wallet-abc:api-key"
 * 글로벌: "550e8400-...:global:api-key"
 */
function buildAAD(credentialId: string, walletId: string | null, type: CredentialType): Buffer {
  const aadString = `${credentialId}:${walletId ?? 'global'}:${type}`;
  return Buffer.from(aadString, 'utf8');
}
```

### 7.4 기존 지갑 키 암호화와의 비교

| 항목 | 지갑 키 암호화 | CredentialVault |
|------|-------------|----------------|
| 알고리즘 | AES-256-GCM (sodium-native) | AES-256-GCM (node:crypto) |
| 키 파생 | HKDF (master → wallet subkey) | HKDF (master → credential subkey) |
| HKDF salt | wallet-specific | `"credential-vault"` (고정) |
| HKDF info | wallet-encryption 관련 | `"waiaas-credential-encryption"` |
| IV | per-record 12 bytes | per-record 12 bytes |
| AAD | 없음 | `{credentialId}:{walletId}:{type}` |
| 서브키 충돌 | 없음 (info가 다름) | 없음 (info가 다름) |

---

## 8. re-encrypt / backup 통합 (CRED-05)

### 8.1 Master Password 변경 시 re-encrypt

기존 `backup.ts`의 re-encrypt 루프에 `wallet_credentials` 테이블을 추가한다.

```typescript
/**
 * Master password 변경 시 re-encrypt 흐름:
 *
 * 1. 기존 master key로 old subkey 파생: HKDF(oldMasterKey, salt, info) → oldSubkey
 * 2. 새 master key로 new subkey 파생: HKDF(newMasterKey, salt, info) → newSubkey
 * 3. wallet_credentials 전 레코드 순회:
 *    a. oldSubkey + iv + authTag로 복호화
 *    b. 새 IV 생성 (randomBytes(12))
 *    c. newSubkey + 새 IV + AAD로 재암호화
 *    d. encrypted_value, iv, auth_tag 업데이트
 * 4. 트랜잭션 내에서 일괄 수행 (원자성 보장)
 */
async function reEncryptCredentials(
  db: Database,
  oldMasterKey: Buffer,
  newMasterKey: Buffer,
): Promise<void> {
  const oldSubkey = await deriveCredentialSubkey(oldMasterKey);
  const newSubkey = await deriveCredentialSubkey(newMasterKey);

  const credentials = db.select().from(walletCredentials).all();

  await db.transaction(async (tx) => {
    for (const cred of credentials) {
      // 복호화
      const aad = buildAAD(cred.id, cred.walletId, cred.type);
      const plaintext = decryptCredential(
        cred.encryptedValue, cred.iv, cred.authTag, oldSubkey, aad
      );

      // 재암호화 (새 IV)
      const { ciphertext, iv, authTag } = encryptCredential(plaintext, newSubkey, aad);

      // 업데이트
      tx.update(walletCredentials)
        .set({
          encryptedValue: ciphertext,
          iv: iv,
          authTag: authTag,
          updatedAt: Math.floor(Date.now() / 1000),
        })
        .where(eq(walletCredentials.id, cred.id))
        .run();
    }
  });
}
```

### 8.2 Backup 통합

기존 encrypted-backup JSON에 `wallet_credentials` 테이블을 포함한다.

```typescript
// backup export 시
const backupData = {
  // ... 기존 테이블 ...
  walletCredentials: db.select().from(walletCredentials).all(),
  // encrypted_value는 이미 암호화 상태로 저장됨
  // 동일 master key로 복원 시 복호화 가능
};

// backup restore 시
// 1. backup JSON에서 walletCredentials 추출
// 2. wallet_credentials 테이블에 INSERT
// 3. 동일 master key이므로 encrypted_value 그대로 사용 가능
// 4. master key가 다르면 re-encrypt 필요
```

### 8.3 주의사항

- HKDF salt/info가 동일하므로 master key만 바뀌면 subkey도 자동 변경됨
- re-encrypt는 모든 credential을 순회하므로 대량 credential 시 성능 고려 필요
- 트랜잭션 내에서 수행하여 부분 re-encrypt 방지 (원자성)
- backup restore 후 master key가 다르면 별도 re-encrypt 단계가 필요함

---

## 9. Credential Lifecycle (CRED-06)

### 9.1 생성 (create)

```
Owner/Admin → POST /v1/wallets/:walletId/credentials (masterAuth)
    │
    ├── 입력 검증: type, name, value, metadata, expiresAt
    ├── UNIQUE(walletId, name) 중복 검사
    ├── UUID v7 할당
    ├── HKDF subkey 파생
    ├── AES-256-GCM 암호화 (value → ciphertext + IV + authTag)
    ├── AAD 생성 및 바인딩
    ├── DB INSERT
    └── 반환: CredentialMetadata (원문 비포함)
```

### 9.2 로테이션 (rotate)

```
Owner/Admin → PUT /v1/wallets/:walletId/credentials/:ref/rotate (masterAuth)
    │
    ├── 기존 credential 존재 확인
    ├── 새 IV 생성 (crypto.randomBytes(12)) ← GCM 보안 필수
    ├── 새 값 AES-256-GCM 암호화 (동일 subkey, 새 IV)
    ├── encrypted_value, iv, auth_tag 업데이트
    ├── updated_at 갱신
    └── 반환: CredentialMetadata (원문 비포함)

이전 값 이력 보존:
- 기본: 덮어쓰기 (이전 값 즉시 폐기)
- 선택적: credential_history 테이블 활성화 시 이전 값 보존 (감사 추적용)
  - 이력 테이블은 v1 구현에서는 생략, 필요 시 마이그레이션으로 추가
```

### 9.3 만료 (expiration)

```
get() 호출 시점에서 만료 체크:

if (credential.expiresAt != null && credential.expiresAt < nowSeconds()) {
  throw new CredentialError('CREDENTIAL_EXPIRED', {
    credentialId: credential.id,
    expiredAt: credential.expiresAt,
  });
}

정기 정리 (cleanup):
- 별도 정리 job에서 만료된 credential을 hard delete
- 정리 주기: 1시간 (설정 가능)
- 만료 후 grace period: 없음 (만료 즉시 get() 에러)
- idx_wallet_credentials_expires_at 인덱스 활용
```

### 9.4 삭제 (delete)

```
Owner/Admin → DELETE /v1/wallets/:walletId/credentials/:ref (masterAuth)
    │
    ├── 존재 확인
    ├── hard delete (DB에서 완전 삭제)
    ├── cascade 없음
    └── credentialRef가 참조하는 action은 런타임 에러:
        → "Credential not found: {ref}" (CREDENTIAL_NOT_FOUND)
        → ActionProvider는 credential 부재 시 graceful 에러 반환 권장
```

### 9.5 상태 다이어그램

```
[없음] ──create()──→ [활성]
                       │
                 ┌─────┼──────┐
                 │     │      │
            rotate()  만료  delete()
                 │     │      │
                 ▼     ▼      ▼
             [활성]  [만료]  [삭제됨]
                       │
                  cleanup job
                       │
                       ▼
                   [삭제됨]
```

---

## 10. 인증 모델 (CRED-07)

### 10.1 권한 매트릭스

| 작업 | per-wallet credential | 글로벌 credential |
|------|----------------------|------------------|
| list (메타데이터) | sessionAuth (해당 지갑) | masterAuth |
| get (복호화, 내부 전용) | sessionAuth (해당 지갑) | 어떤 세션에서든 (파이프라인 내부) |
| create | masterAuth | masterAuth |
| delete | masterAuth | masterAuth |
| rotate | masterAuth | masterAuth |

### 10.2 근거

- **list/get은 sessionAuth**: per-wallet credential은 해당 지갑 세션이 읽기 가능해야 파이프라인에서 서명에 사용 가능
- **create/delete/rotate는 masterAuth**: credential의 생명주기 변경은 보안 민감 작업이므로 master password 확인 필수
- **글로벌 credential get()**: 파이프라인 내부에서 fallback 조회 시 세션 지갑 무관하게 접근 가능해야 함 (API 응답이 아닌 내부 호출이므로 안전)

### 10.3 REST API 매핑

```
Per-wallet credential endpoints:

GET    /v1/wallets/:walletId/credentials
  → sessionAuth
  → list() — 메타데이터만 반환
  → 200: { credentials: CredentialMetadata[] }

POST   /v1/wallets/:walletId/credentials
  → masterAuth
  → create(walletId, params)
  → 201: { credential: CredentialMetadata }

DELETE /v1/wallets/:walletId/credentials/:ref
  → masterAuth
  → delete(ref)
  → 204: No Content

PUT    /v1/wallets/:walletId/credentials/:ref/rotate
  → masterAuth
  → rotate(ref, newValue)
  → 200: { credential: CredentialMetadata }

Global credential endpoints:

POST   /v1/admin/credentials
  → masterAuth
  → create(null, params)
  → 201: { credential: CredentialMetadata }

GET    /v1/admin/credentials
  → masterAuth
  → list() — 글로벌 credential 목록
  → 200: { credentials: CredentialMetadata[] }

DELETE /v1/admin/credentials/:ref
  → masterAuth
  → delete(ref)
  → 204: No Content

PUT    /v1/admin/credentials/:ref/rotate
  → masterAuth
  → rotate(ref, newValue)
  → 200: { credential: CredentialMetadata }
```

### 10.4 에러 응답

```typescript
// Credential 관련 에러 코드
type CredentialErrorCode =
  | 'CREDENTIAL_NOT_FOUND'      // 404 — 존재하지 않음
  | 'CREDENTIAL_EXPIRED'        // 410 — 만료됨
  | 'CREDENTIAL_ACCESS_DENIED'  // 403 — 다른 지갑의 credential
  | 'CREDENTIAL_DUPLICATE_NAME' // 409 — 동일 walletId+name 중복
  | 'CREDENTIAL_DECRYPT_FAILED' // 500 — 복호화 실패 (master key 불일치 등)
  ;
```

---

## 11. SignedDataAction/SignedHttpAction 연결 흐름

Phase 383 파이프라인 라우팅에서 구체화되지만, CredentialVault와의 연결 흐름을 여기에서 설계한다.

### 11.1 전체 흐름

```
ActionProvider.resolve()
    │
    ▼
SignedDataAction {
  kind: 'signedData',
  signingScheme: 'hmac-sha256',
  payload: { data: '...', timestamp: '...', method: 'POST', path: '/api/v1/order' },
  venue: 'binance',
  operation: 'place-order',
  credentialRef: 'wallet-abc:binance-hmac-secret',
}
    │
    ▼
Pipeline Router (kind === 'signedData')
    │
    ▼
Step 1: credentialRef 해소
    CredentialVault.get('wallet-abc:binance-hmac-secret', walletId)
    → DecryptedCredential { value: 'actual-hmac-secret-value', type: 'hmac-secret' }
    │
    ▼
Step 2: SigningParams 조립
    HmacSigningParams {
      scheme: 'hmac-sha256',
      data: action.payload.data,
      secret: decryptedCredential.value,   // ← CredentialVault에서 주입
    }
    │
    ▼
Step 3: 서명
    SignerCapabilityRegistry.resolve(action)  → HmacSignerCapability
    HmacSignerCapability.sign(params)
    → SigningResult { signature: 'hmac-hex-signature' }
    │
    ▼
Step 4: 메모리 클리어
    params.secret = '';
    // credential 값을 담은 변수 참조 해제
    │
    ▼
Step 5: 결과 반환
    { signature, venue, operation, tracking?, ... }
```

### 11.2 API key + HMAC secret 조합 예시 (Binance)

Binance API는 api-key (header)와 hmac-secret (서명)을 동시에 필요로 한다.

```
ActionProvider.resolve() 내부:
1. CredentialVault.get('wallet-abc:binance-api-key', walletId) → API key (header 삽입용)
2. SignedDataAction 반환 시 credentialRef: 'wallet-abc:binance-hmac-secret' (서명용)

Pipeline Router:
1. credentialRef 해소 → HMAC secret 획득
2. API key는 ActionProvider가 payload.headers에 이미 포함 (또는 별도 credentialRef로 분리)
```

**설계 결정**: ActionProvider.resolve() 시점에서 비밀이 아닌 부가 정보 (API key 헤더 등)를 payload에 포함하되, 서명에 필요한 비밀 (HMAC secret)만 credentialRef로 분리한다. 이 결정은 Phase 383 파이프라인에서 상세화한다.

### 11.3 SignedHttpAction 연결

```
SignedHttpAction {
  kind: 'signedHttp',
  signingScheme: 'erc8128',
  method: 'POST',
  url: 'https://api.example.com/v1/orders',
  headers: { 'Content-Type': 'application/json' },
  body: '{"amount": 100}',
  venue: 'example-api',
  operation: 'create-order',
  credentialRef: undefined,  // ERC-8128은 wallet key 사용, 별도 credential 불필요
}
    │
    ▼
Pipeline Router (kind === 'signedHttp')
    │
    ▼
credentialRef === undefined → 스킵 (wallet key는 ActionContext에서 주입)
    │
    ▼
Erc8128SignerCapability.sign({
  scheme: 'erc8128',
  method, url, headers, body,
  privateKey: context.privateKey,  // ActionContext에서
  chainId: context.chainId,
  address: context.address,
})
```

---

## 12. 설계 결정 요약 테이블

| # | 결정 | 근거 |
|---|------|------|
| D1 | auth_tag을 별도 컬럼으로 분리 | Node.js crypto GCM 모드에서 getAuthTag()가 별도 반환. concat 저장도 가능하나 디버깅 용이성을 위해 분리 |
| D2 | per-wallet/글로벌 UNIQUE 인덱스 분리 | SQLite에서 NULL은 UNIQUE 비교에서 항상 != NULL이므로 두 개의 부분 인덱스로 처리 |
| D3 | node:crypto 사용 (sodium-native 아님) | credential 암호화는 sodium-native의 특수 기능 (sealed box 등) 불필요. 표준 AES-256-GCM은 node:crypto로 충분. sodium-native 의존성 범위 확대 방지 |
| D4 | AAD에 credentialId 포함 | cipher text를 다른 credential의 encrypted_value로 이식하는 재배치 공격 방지 |
| D5 | credentialRef 해소를 파이프라인 내부에서 수행 | ActionProvider.resolve()는 credential 값을 알 필요 없음 (ref만 설정). 실제 값은 sign() 직전에만 노출 |
| D6 | 이력 보존은 v1에서 생략 | 초기 구현 복잡도 감소. 필요 시 credential_history 테이블 마이그레이션으로 추가 |
| D7 | 만료 체크를 get() 시점에서 수행 | lazy evaluation — 만료된 credential을 주기적으로 스캔하지 않아도 실제 사용 시점에서 차단 |
| D8 | ON DELETE CASCADE for wallet FK | 지갑 삭제 시 per-wallet credential도 함께 삭제. orphan credential 방지 |
| D9 | create/delete/rotate에 masterAuth 필수 | credential 생명주기 변경은 보안 민감 작업. 기존 패턴 (정책 변경도 masterAuth) 일관성 |
| D10 | REST API 응답에서 복호화된 값 절대 비반환 | 원문 노출 최소화. 내부 파이프라인에서만 복호화 사용 |

---

## 13. Pitfall 방지 체크리스트

- [ ] `wallet_credentials.encrypted_value`는 blob으로 저장 (text가 아님) — 바이너리 ciphertext는 UTF-8로 인코딩 불가할 수 있음
- [ ] HKDF info를 `"waiaas-credential-encryption"`으로 설정하여 기존 지갑 키 암호화 (`"waiaas-wallet-encryption"` 등)와 충돌 방지
- [ ] credentialRef 해소 시 walletId 권한 검사 필수 — 다른 지갑의 per-wallet credential에 접근하면 CREDENTIAL_ACCESS_DENIED
- [ ] `expires_at` 체크는 get() 시점에서 수행 — stale credential 사용 방지. cleanup job은 별도
- [ ] `rotate()` 시 IV를 반드시 재생성 — 같은 IV + 같은 key 조합으로 다른 plaintext를 암호화하면 GCM 보안 붕괴
- [ ] REST API 응답에서 복호화된 credential 값을 절대 반환하지 않음 — CredentialMetadata만 반환
- [ ] AAD에 credentialId를 포함하여 cipher text 재배치 공격 방지
- [ ] 글로벌 credential의 wallet_id IS NULL 조건을 인덱스 WHERE 절에 정확히 반영
- [ ] create() 시 동일 walletId+name 중복을 DB UNIQUE 인덱스로 강제 — 애플리케이션 레벨 체크만으로 불충분 (race condition)
- [ ] backup restore 시 master key가 다르면 re-encrypt 단계가 필수 — 그대로 INSERT하면 복호화 불가

---

*Phase: 381-credential-vault-infra, Plan: 01*
*작성일: 2026-03-11*
