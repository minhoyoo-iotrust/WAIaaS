# HMAC/RSA-PSS Capability + SignerCapabilityRegistry 상세 설계

> Phase 382, Plan 02 — HmacSignerCapability, RsaPssSignerCapability, SignerCapabilityRegistry, daemon 부팅 등록, connect-info 확장

---

## 1. 개요

### HMAC/RSA-PSS의 필요성

External Action 프레임워크가 CEX(중앙화 거래소)와 금융 API를 통합하려면 다음 인증 방식이 필수이다:

| 프로토콜 | 서명 방식 | 대상 거래소/API |
|----------|----------|----------------|
| HMAC-SHA256 | 대칭 키 기반 | Binance, OKX, Bybit, Coinbase Pro, Kraken |
| RSA-PSS | 비대칭 키 기반 | 일부 금융 API, 레거시 결제 게이트웨이, 기관 거래 플랫폼 |

두 방식 모두 `node:crypto` 내장 모듈로 구현 가능하여 외부 라이브러리 의존 없이 추가된다.

### CEX API 인증 패턴 예시

```
Binance:
  signature = HMAC-SHA256(queryString, apiSecret)
  Header: X-MBX-APIKEY: {apiKey}

OKX:
  prehash = timestamp + method + requestPath + body
  signature = Base64(HMAC-SHA256(prehash, apiSecret))
  Header: OK-ACCESS-KEY, OK-ACCESS-SIGN, OK-ACCESS-TIMESTAMP, OK-ACCESS-PASSPHRASE

Bybit:
  prehash = timestamp + apiKey + recvWindow + queryString
  signature = HMAC-SHA256(prehash, apiSecret)
```

**핵심 설계 원칙**: signing target 조합(timestamp + method + path + body 등)은 각 CEX ActionProvider의 책임이다. HmacSignerCapability는 순수 서명 연산만 수행한다.

---

## 2. HmacSignerCapability 상세 설계

| 항목 | 내용 |
|------|------|
| **scheme** | `'hmac-sha256'` |
| **구현 기반** | `node:crypto`의 `createHmac('sha256', secret).update(data).digest('hex')` |
| **외부 의존** | 없음 (Node.js 22 내장) |
| **키 출처** | CredentialVault — credential type `'hmac-secret'` |

### 2.1 canSign() 로직

```typescript
canSign(params: SigningParams): boolean {
  if (params.scheme !== 'hmac-sha256') return false;
  const p = params as HmacSigningParams;
  return (
    p.data !== undefined &&
    p.data.length > 0 &&
    p.secret !== undefined &&
    p.secret.length > 0
  );
}
```

검사 항목:
- `params.scheme === 'hmac-sha256'` (discriminant check)
- `data` (signing target string) 존재 및 비어있지 않음
- `secret` (HMAC secret) 존재 및 비어있지 않음

### 2.2 sign() 흐름

```typescript
import { createHmac } from 'node:crypto';

async sign(params: SigningParams): Promise<SigningResult> {
  if (params.scheme !== 'hmac-sha256') {
    throw new SigningError('Scheme mismatch', 'hmac-sha256', 'INVALID_PARAMS');
  }
  const p = params as HmacSigningParams;

  try {
    // 1. HMAC-SHA256 계산
    const hmac = createHmac('sha256', p.secret);
    hmac.update(p.data);
    const hexDigest = hmac.digest('hex');

    // 2. secret 메모리 클리어 시도
    //    (string은 immutable이므로 Buffer 변환 후 fill — 제한적 효과)
    const secretBuf = Buffer.from(p.secret);
    secretBuf.fill(0);

    // 3. 결과 반환
    return {
      signature: hexDigest,
      metadata: {
        algorithm: 'hmac-sha256',
        encoding: 'hex',        // 기본 인코딩
      },
    };
  } catch (err) {
    throw new SigningError(
      `HMAC-SHA256 signing failed: ${(err as Error).message}`,
      'hmac-sha256',
      'SIGNING_FAILED',
      err as Error,
    );
  }
}
```

### 2.3 Base64 인코딩 지원

OKX 등 일부 거래소는 HMAC 결과를 Base64로 인코딩하여 전송해야 한다. 이를 위해 ActionProvider가 metadata.encoding을 확인하여 후처리하거나, HmacSigningParams를 확장하여 encoding 옵션을 지원한다:

```typescript
export interface HmacSigningParams extends BaseSigningParams {
  scheme: 'hmac-sha256';
  data: string;
  secret: string;
  encoding?: 'hex' | 'base64';  // default: 'hex'
}
```

encoding이 `'base64'`인 경우:

```typescript
const digest = hmac.digest(p.encoding ?? 'hex');
return {
  signature: digest,  // base64 string
  metadata: { algorithm: 'hmac-sha256', encoding: p.encoding ?? 'hex' },
};
```

### 2.4 에러 매핑

| node:crypto 에러 | SigningErrorCode | 설명 |
|------------------|-----------------|------|
| `TypeError: secret must be...` | `INVALID_KEY` | secret 형식 오류 |
| HMAC 계산 실패 | `SIGNING_FAILED` | 내부 연산 실패 (극히 드묾) |

### 2.5 보안 고려

- **secret 주입 경로**: CredentialVault.get(credentialRef) → sign() 직전에 주입
- **메모리 관리**: sign() 완료 후 즉시 Buffer.fill(0) (string 원본은 GC 의존)
- **로깅 금지**: secret 값을 로그에 절대 출력하지 않음
- **타임스탬프 포함 권장**: CEX API의 replay attack 방지를 위해 signing target에 timestamp 포함 (ActionProvider 책임)

---

## 3. RsaPssSignerCapability 상세 설계

| 항목 | 내용 |
|------|------|
| **scheme** | `'rsa-pss'` |
| **구현 기반** | `node:crypto`의 `sign('RSA-SHA256', data, { key, padding, saltLength })` |
| **외부 의존** | 없음 (Node.js 22 내장) |
| **키 출처** | CredentialVault — credential type `'rsa-private-key'` |

### 3.1 canSign() 로직

```typescript
canSign(params: SigningParams): boolean {
  if (params.scheme !== 'rsa-pss') return false;
  const p = params as RsaPssSigningParams;
  return (
    p.data !== undefined &&
    p.data.length > 0 &&
    p.privateKey !== undefined &&
    isValidPemKey(p.privateKey)
  );
}
```

검사 항목:
- `params.scheme === 'rsa-pss'`
- `data` (signing target string) 존재 및 비어있지 않음
- `privateKey` (PEM 문자열) 존재 및 형식 검증

### 3.2 PEM 키 형식 검증

```typescript
function isValidPemKey(key: string): boolean {
  return (
    key.startsWith('-----BEGIN RSA PRIVATE KEY-----') ||  // PKCS#1
    key.startsWith('-----BEGIN PRIVATE KEY-----')          // PKCS#8
  );
}
```

두 가지 PEM 형식을 모두 지원한다:
- **PKCS#1**: `-----BEGIN RSA PRIVATE KEY-----` (OpenSSL 전통 형식)
- **PKCS#8**: `-----BEGIN PRIVATE KEY-----` (PKCS#8 범용 형식)

### 3.3 sign() 흐름

```typescript
import { sign as cryptoSign, constants } from 'node:crypto';

async sign(params: SigningParams): Promise<SigningResult> {
  if (params.scheme !== 'rsa-pss') {
    throw new SigningError('Scheme mismatch', 'rsa-pss', 'INVALID_PARAMS');
  }
  const p = params as RsaPssSigningParams;

  try {
    // 1. PEM 키 형식 확인
    if (!isValidPemKey(p.privateKey)) {
      throw new SigningError(
        'Invalid PEM key format',
        'rsa-pss',
        'INVALID_KEY',
      );
    }

    // 2. signing target을 Buffer로 변환
    const dataBuffer = Buffer.from(p.data);

    // 3. RSA-PSS 서명
    const saltLength = p.saltLength ?? 32;  // SHA-256 해시 길이
    const signature = cryptoSign('RSA-SHA256', dataBuffer, {
      key: p.privateKey,
      padding: constants.RSA_PKCS1_PSS_PADDING,
      saltLength,
    });

    // 4. privateKey 메모리 클리어 시도
    const keyBuf = Buffer.from(p.privateKey);
    keyBuf.fill(0);

    // 5. Base64로 인코딩하여 반환
    return {
      signature: signature.toString('base64'),
      metadata: {
        algorithm: 'rsa-pss-sha256',
        saltLength,
        encoding: 'base64',
      },
    };
  } catch (err) {
    if (err instanceof SigningError) throw err;

    // PEM 파싱 실패 vs 서명 연산 실패 구분
    const message = (err as Error).message;
    const code: SigningErrorCode = message.includes('PEM') || message.includes('key')
      ? 'INVALID_KEY'
      : 'SIGNING_FAILED';

    throw new SigningError(
      `RSA-PSS signing failed: ${message}`,
      'rsa-pss',
      code,
      err as Error,
    );
  }
}
```

### 3.4 saltLength 기본값

- **기본값: 32** (SHA-256 해시 출력 길이와 동일)
- RSA-PSS 표준에서 saltLength = hashLength가 가장 일반적
- ActionProvider가 특정 API 요구사항에 따라 override 가능

### 3.5 에러 매핑

| node:crypto 에러 | SigningErrorCode | 설명 |
|------------------|-----------------|------|
| PEM 파싱 실패 | `INVALID_KEY` | 키 형식이 PKCS#1/PKCS#8가 아님 |
| 키 크기 불충분 | `INVALID_KEY` | RSA 키가 서명에 필요한 최소 크기 미달 |
| 서명 연산 실패 | `SIGNING_FAILED` | 내부 crypto 에러 |

---

## 4. SignerCapabilityRegistry 상세 설계

### 4.1 내부 저장소

```typescript
class SignerCapabilityRegistry implements ISignerCapabilityRegistry {
  private readonly capabilities = new Map<SigningScheme, ISignerCapability>();
}
```

### 4.2 register()

```typescript
register(capability: ISignerCapability): void {
  // 같은 scheme의 기존 등록을 덮어쓴다 (테스트 mock 주입 용이)
  this.capabilities.set(capability.scheme, capability);
}
```

- **덮어쓰기 허용 이유**: 테스트에서 mock capability를 주입하여 실제 서명 없이 검증 가능
- 프로덕션에서는 daemon 부팅 시 1회만 호출되므로 덮어쓰기가 발생하지 않음

### 4.3 get()

```typescript
get(scheme: SigningScheme): ISignerCapability | undefined {
  return this.capabilities.get(scheme);
}
```

- 단순 조회, undefined 반환 가능
- 호출자가 undefined 처리 책임

### 4.4 resolve() — 핵심 메서드

```typescript
resolve(action: SignedDataAction | SignedHttpAction): ISignerCapability {
  // 1. action에서 signingScheme 추출
  const scheme = action.signingScheme;

  // 2. registry에서 capability 조회
  const capability = this.capabilities.get(scheme);
  if (!capability) {
    throw new SigningError(
      `No signer capability registered for scheme: ${scheme}`,
      scheme,
      'CAPABILITY_NOT_FOUND',
    );
  }

  // 3. canSign() 사전 검사 (fail-fast)
  //    주의: resolve() 시점에는 아직 credential이 주입되지 않았으므로
  //    canSign()은 scheme 호환성과 payload 구조만 검사한다.
  //    privateKey/secret 존재 검사는 sign() 직전에 수행한다.

  return capability;
}
```

#### resolve() 흐름도

```
SignedDataAction { signingScheme: 'hmac-sha256', payload: {...}, credentialRef: 'uuid...' }
        │
        ▼
  SignerCapabilityRegistry.resolve(action)
        │
        ├── (1) scheme 추출: 'hmac-sha256'
        │
        ├── (2) Map.get('hmac-sha256')
        │       │
        │       ├── found → HmacSignerCapability
        │       └── not found → throw SigningError('CAPABILITY_NOT_FOUND')
        │
        └── (3) capability 반환
                │
                ▼
  [파이프라인에서 credential 주입 후]
        │
        ▼
  HmacSignerCapability.canSign(params)  ← secret 포함된 완전한 params
        │
        ├── true → sign(params)
        └── false → throw SigningError('INVALID_PARAMS')
```

**설계 결정**: `resolve()`에서는 `canSign()`을 호출하지 않는다. 이유: resolve() 시점에는 credential이 아직 주입되지 않았으므로 secret/privateKey 필드가 없어 canSign()이 false를 반환할 수 있다. canSign() 검사는 credential 주입 후 sign() 직전에 파이프라인이 수행한다.

### 4.5 listSchemes()

```typescript
listSchemes(): readonly SigningScheme[] {
  return Array.from(this.capabilities.keys());
}
```

- 등록된 모든 scheme 배열 반환
- connect-info API에서 서명 능력 노출에 사용

---

## 5. daemon 부팅 시 초기 등록

### 5.1 bootstrapSignerCapabilities() 함수

```typescript
function bootstrapSignerCapabilities(registry: ISignerCapabilityRegistry): void {
  // 기존 4종 어댑터 (Plan 382-01)
  registry.register(new Eip712SignerCapability());      // eip712
  registry.register(new PersonalSignCapability());       // personal
  registry.register(new Erc8128SignerCapability());      // erc8128
  // TransactionSignerCapability는 등록하지 않음 (기존 pipeline 사용)

  // 신규 HMAC/RSA-PSS (Plan 382-02)
  registry.register(new HmacSignerCapability());         // hmac-sha256
  registry.register(new RsaPssSignerCapability());       // rsa-pss

  // signBytes 계열 (Plan 382-01)
  registry.register(new EcdsaSignBytesCapability());     // ecdsa-secp256k1
  registry.register(new Ed25519SignBytesCapability());    // ed25519
}
```

### 5.2 등록 순서

| 순서 | capability | scheme | 출처 |
|------|-----------|--------|------|
| 1 | Eip712SignerCapability | `eip712` | Plan 382-01 |
| 2 | PersonalSignCapability | `personal` | Plan 382-01 |
| 3 | Erc8128SignerCapability | `erc8128` | Plan 382-01 |
| 4 | HmacSignerCapability | `hmac-sha256` | Plan 382-02 |
| 5 | RsaPssSignerCapability | `rsa-pss` | Plan 382-02 |
| 6 | EcdsaSignBytesCapability | `ecdsa-secp256k1` | Plan 382-01 |
| 7 | Ed25519SignBytesCapability | `ed25519` | Plan 382-01 |

총 7종이 registry에 등록된다. TransactionSignerCapability는 제외.

### 5.3 호출 시점

```typescript
// daemon/src/app.ts (의사 코드)
const signerRegistry = new SignerCapabilityRegistry();
bootstrapSignerCapabilities(signerRegistry);

// DI container에 등록
container.bind(ISignerCapabilityRegistry).toValue(signerRegistry);
```

- daemon 시작 시 1회 호출
- singleton으로 daemon 전역에서 공유
- DI container를 통해 ActionExecutor, Pipeline Router 등에 주입

---

## 6. connect-info 확장

### 6.1 signing capabilities 노출

기존 connect-info API 응답에 서명 능력 목록을 추가한다:

```typescript
// GET /v1/connect-info 응답 확장
{
  // ... 기존 필드 ...
  capabilities: {
    // ... 기존 capability 필드 ...
    signing: ['eip712', 'personal', 'erc8128', 'hmac-sha256', 'rsa-pss', 'ecdsa-secp256k1', 'ed25519'],
  }
}
```

### 6.2 구현 방법

```typescript
// connect-info handler (의사 코드)
const signingSchemes = signerRegistry.listSchemes();

return {
  capabilities: {
    ...existingCapabilities,
    signing: signingSchemes,
  },
};
```

### 6.3 에이전트 자기 발견

AI 에이전트가 connect-info를 호출하면 daemon이 지원하는 모든 서명 방식을 알 수 있다. 이를 통해:
- HMAC 서명이 필요한 CEX ActionProvider가 사용 가능한지 사전 확인
- 지원되지 않는 scheme을 요구하는 action을 사전에 거부

---

## 7. SigningErrorCode 확장

### 7.1 기존 5종 + 신규 1종

```typescript
export type SigningErrorCode =
  | 'INVALID_KEY'           // 키 타입/형식 불일치
  | 'INVALID_PARAMS'        // 파라미터 구조 오류
  | 'CREDENTIAL_MISSING'    // credential 없음
  | 'SIGNING_FAILED'        // 서명 연산 실패
  | 'KEY_NOT_SUPPORTED'     // 해당 체인에서 지원하지 않는 키 타입
  | 'CAPABILITY_NOT_FOUND'; // 미등록 scheme 요청 (신규)
```

### 7.2 CAPABILITY_NOT_FOUND 사용 시점

```typescript
// SignerCapabilityRegistry.resolve() 내부
const capability = this.capabilities.get(scheme);
if (!capability) {
  throw new SigningError(
    `No signer capability registered for scheme: ${scheme}`,
    scheme,
    'CAPABILITY_NOT_FOUND',
  );
}
```

- `resolve()`에서 미등록 scheme 요청 시 발생
- HTTP 응답: 400 Bad Request (클라이언트가 지원되지 않는 scheme을 요청)
- 에이전트에게 connect-info에서 지원 scheme 확인을 안내

---

## 8. 설계 결정 테이블

| # | 결정 | 근거 |
|---|------|------|
| D1 | node:crypto 사용 (외부 라이브러리 불필요) | Node.js 22에 createHmac, sign 내장. 추가 의존성 없이 HMAC-SHA256, RSA-PSS 모두 구현 가능. sodium-native는 이 용도에는 과도 |
| D2 | HMAC signing target 조합은 ActionProvider 책임 | 거래소마다 prehash 구성이 다름(timestamp+method+path+body vs queryString 등). HmacSignerCapability는 순수 서명만 수행하여 단일 책임 유지 |
| D3 | Base64 인코딩은 encoding 옵션으로 지원 | OKX 등 일부 거래소가 Base64 인코딩 요구. HmacSigningParams.encoding?: 'hex' \| 'base64'로 지원 (기본값 hex) |
| D4 | SignerCapabilityRegistry는 singleton | daemon 전역에서 1개 인스턴스 공유. DI container에 등록하여 필요한 곳에 주입 |
| D5 | resolve()에서 canSign() 검사 미포함 | resolve() 시점에는 credential이 아직 주입되지 않아 canSign()이 false를 반환할 수 있음. canSign()은 credential 주입 후 sign() 직전에 파이프라인이 수행 |
| D6 | CAPABILITY_NOT_FOUND 에러 코드 추가 | 기존 5종에 1종 추가. resolve()에서 미등록 scheme 요청을 명확히 구분하여 클라이언트에게 정확한 에러 정보 제공 |

---

## 9. 전체 아키텍처 요약

```
daemon bootstrap
        │
        ▼
bootstrapSignerCapabilities(registry)
        │
        ├── register(Eip712SignerCapability)
        ├── register(PersonalSignCapability)
        ├── register(Erc8128SignerCapability)
        ├── register(HmacSignerCapability)         ← NEW
        ├── register(RsaPssSignerCapability)        ← NEW
        ├── register(EcdsaSignBytesCapability)
        └── register(Ed25519SignBytesCapability)
                │
                ▼
        SignerCapabilityRegistry (7종 등록)
                │
                ├── connect-info API → listSchemes() → ['eip712', ..., 'ed25519']
                │
                └── Pipeline Router (Phase 383)
                        │
                        ▼
                    resolve(action) → ISignerCapability
                        │
                        ▼
                    [credential 주입]
                        │
                        ▼
                    canSign(params) → sign(params) → SigningResult
```

---

*Phase: 382-signer-capabilities, Plan: 02*
*작성일: 2026-03-11*
